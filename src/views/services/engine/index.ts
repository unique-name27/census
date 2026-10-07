/**
 * HR ops engine: one pure function of the analytics context that returns everything
 * the view draws. The UI calls it inside useMemo keyed on the context.
 *
 * Every target and threshold comes from the metric dictionary (`ctx.metrics`), read once into
 * `settings` (engine/settings.ts), so an edited setting recomputes the whole view.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { CASE_OPEN_STATUSES } from '@/data/schema'
import type { Window } from '@/data/scope'
import { dateOf, monthsBetween } from '@/lib/dates'
import { monthPoints } from '@/lib/people'
import type { Headline } from '@/views/types'
import { M } from '../metrics'
import {
  type AgedCaseRow,
  type AgedPrivateRow,
  type ArrivalRow,
  agedCases,
  agedPrivate,
  arrivals,
  type BacklogRow,
  backlogByAge,
  byCategory,
  byChannel,
  type CategoryRow,
  type ChannelRow,
  type MonthCategoryRow,
  type MonthSlaRow,
  openedByMonth,
  type ReopenRow,
  type ResolveRow,
  reopenEscalate,
  slaByMonth,
  type TeamRow,
  teamWorkload,
  timeToResolve,
} from './cases'
import { type DrillScope, drillScope } from './drills'
import { tagFindings } from './drillUses'
import {
  type CaseColumns,
  type CaseFact,
  caseColumns,
  caseFacts,
  type TxColumns,
  type TxFact,
  txColumns,
  txFacts,
} from './facts'
import { buildFindings } from './findings'
import { buildKpis, type CaseSummary, caseSummary, openAt } from './kpis'
import { computeLeave, type LeaveModel } from './leaveModel'
import { type LevelRow, type ProcessRow, processCoverage, scorecard } from './levels'
import { figureUses, leaveFigureUses, lineage, type Refs, type ServicesFigureId } from './lineage'
import { type CasesPer100, casesPer100 } from './rates'
import { type ServicesSettings, servicesSettings } from './settings'
import {
  type FinalPayRow,
  finalPayByJurisdiction,
  newHireByRegion,
  newHireBySite,
  onTimeByMonth,
  onTimeByType,
  type RetroMonthRow,
  retroByMonth,
  retroShare,
  type SiteRow,
  type TimingRow,
  type TxMonthRow,
  type TypeRow,
  timingBins,
} from './transactions'
import {
  type BacklogPoint,
  backlogByMonth,
  type LeaveCoverage,
  lastQuarters,
  leaveCoverage,
  type OnLeavePoint,
  onLeaveByMonth,
  onTimeByTypeQuarter,
  type Quarter,
  type TypeQuarterCell,
} from './trends'
import { peopleIn, trailingMonths } from './util'

export interface ServicesModel {
  asOf: string
  window: Window
  hasCases: boolean
  hasTx: boolean
  /** Distinct people behind the scoped cases and transactions. */
  people: number
  /** The targets and thresholds in force, from the metric dictionary. */
  settings: ServicesSettings
  /**
   * Fewer people in scope than the anonymity minimum: row-level lists and detail exports are withheld and
   * every rate is hidden (each rate also checks its own people), so a small team or a handful of
   * executives can't be read case by case.
   */
  small: boolean
  /** What the drill-downs need (off in a small scope); see engine/drills.ts. */
  scope: DrillScope
  caseCols: CaseColumns
  txCols: TxColumns
  cases: CaseFact[]
  tx: TxFact[]
  summary: CaseSummary
  kpis: Kpi[]
  findings: Finding[]
  /** The 24 months ending with the as-of month. */
  months: string[]
  windowMonths: string[]
  opened: { rows: MonthCategoryRow[]; series: string[] }
  slaMonths: MonthSlaRow[]
  categories: CategoryRow[]
  backlog: BacklogRow[]
  backlogTotal: number
  /** Open cases, and those past the age limit, at the 24 month ends to the as-of date. */
  backlogTrend: BacklogPoint[]
  /** Cases per 100 employees a year, by the requesters' business unit, in the window. */
  per100: CasesPer100
  aged: AgedCaseRow[]
  /** Aged employee relations cases: counted, never listed. */
  agedPrivate: AgedPrivateRow[]
  resolve: ResolveRow[]
  arrivals: ArrivalRow[]
  channels: ChannelRow[]
  reopen: ReopenRow[]
  teams: TeamRow[]
  types: TypeRow[]
  finalPay: FinalPayRow[]
  newHireSites: SiteRow[]
  newHireRegions: SiteRow[]
  timing: TimingRow[]
  /** Transactions on time by due month, 24 months. */
  txMonths: TxMonthRow[]
  /** The last 8 calendar quarters, the last one ending at the as-of date. */
  quarters: Quarter[]
  /** Transactions on time by type and due quarter, over `quarters`. */
  txQuarters: TypeQuarterCell[]
  retro: RetroMonthRow[]
  /** Retro share over the window (DS-01); the count is hidden with the share. */
  retroSummary: { rate: number | null; retro: number | null; n: number }
  levels: LevelRow[]
  processes: ProcessRow[]
  /** Leave & return: its measures, KPI strip and readout (engine/leaveModel.ts). */
  leave: LeaveModel
  /** People on leave at the 24 month ends to the as-of date. */
  leaveTrend: OnLeavePoint[]
  /** How far back the leave history reaches (the trend starts once it covers a whole leave). */
  leaveCoverage: LeaveCoverage
  /** The fields behind each figure, for its `uses` (engine/lineage.ts). */
  uses: Record<ServicesFigureId, Refs>
}

export function compute(ctx: AnalyticsContext): ServicesModel {
  const { asOf, window, prior } = ctx
  const settings = servicesSettings(ctx.metrics)
  const min = settings.minGroup
  // Column presence is a property of the dataset, not of the scope.
  const caseCols = caseColumns(ctx.all.cases)
  const txCols = txColumns(ctx.all.transactions)
  const cases = caseFacts(ctx.data.cases, asOf, caseCols, settings.caseTargets)
  const tx = txFacts(ctx.data.transactions, asOf, ctx.org.byId)
  const hasCases = cases.length > 0
  const hasTx = tx.length > 0
  const people = peopleIn([...cases, ...tx])
  const small = (hasCases || hasTx) && people < min
  const scope = drillScope(ctx, caseCols, small, min)
  const months = trailingMonths(asOf, 24)
  const slaMonths = slaByMonth(cases, months, min)
  const last12 = slaMonths.slice(-12)
  const categories = byCategory(cases, window, min)
  const channels = byChannel(cases, window, min)
  const reopen = reopenEscalate(cases, window, min)
  const finalPay = finalPayByJurisdiction(tx, window, min)
  const newHireSites = newHireBySite(tx, window, min)
  const newHireRegions = newHireByRegion(tx, window, min)
  const windowMonths = monthsBetween(window.start, window.end)
  const backlogFacts = openAt(cases, asOf)
  const txMonths = onTimeByMonth(tx, months, min)
  const monthEnds = monthPoints(asOf, 24)
  const quarters = lastQuarters(asOf, 8)
  const L = lineage(caseCols)

  const kpis = buildKpis({
    facts: cases,
    tx,
    window,
    prior,
    asOf,
    cols: caseCols,
    txCols,
    hasCases,
    hasTx,
    sparkOpened: last12.map((m) => m.opened),
    sparkSla: last12.map((m) => m.slaRate),
    sparkResponse: last12.map((m) => m.responseRate),
    sparkTx: txMonths.slice(-12).map((m) => m.rate),
    scope,
    lineage: L,
    settings,
    metrics: ctx.metrics,
  })

  const findings = tagFindings(
    buildFindings({
      facts: cases,
      tx,
      window,
      asOf,
      people: ctx.org.byId,
      categories,
      channels,
      reopen,
      finalPay,
      newHireSites,
      newHireRegions,
      small,
      scope,
      lineage: L,
      settings,
    }),
  )

  const aged = small ? [] : agedCases(cases, settings.agedDays)
  const levels = scorecard({
    cases,
    tx,
    window,
    asOf,
    hasResolved: caseCols.resolvedAt,
    hasResponse: caseCols.firstResponseAt,
    hasDue: txCols.dueDate,
    settings,
  })
  const processes = processCoverage(cases, tx, window, min)
  const leave = computeLeave({
    transactions: ctx.data.transactions,
    allTransactions: ctx.all.transactions,
    people: ctx.org.byId,
    asOf,
    window,
    prior,
    settings,
    scope,
    metrics: ctx.metrics,
  })
  // The leave history of the whole file (not the scope) says how far back a count can reach.
  const coverage = leaveCoverage(
    ctx.all.transactions.flatMap((t) =>
      t.type === 'Leave start' && t.effectiveDate ? [t.effectiveDate.slice(0, 10)] : [],
    ),
    leave.facts,
  )

  return {
    asOf,
    window,
    hasCases,
    hasTx,
    people,
    settings,
    small,
    scope,
    caseCols,
    txCols,
    cases,
    tx,
    summary: caseSummary(cases, window, min),
    kpis,
    findings,
    months,
    windowMonths,
    opened: openedByMonth(cases, months, 5, min),
    slaMonths,
    categories,
    backlog: backlogByAge(cases),
    backlogTotal: backlogFacts.length,
    backlogTrend: backlogByMonth(cases, monthEnds, settings.agedDays),
    per100: casesPer100({
      facts: cases,
      employees: ctx.data.employees,
      people: ctx.org.byId,
      window,
      company: {
        cases: ctx.all.cases.filter((c) => {
          const d = dateOf(c.openedAt)
          return d >= window.start && d <= window.end && d <= asOf
        }).length,
        employees: ctx.all.employees,
      },
      min,
    }),
    aged,
    agedPrivate: agedPrivate(cases, settings.agedDays, min),
    resolve: caseCols.resolvedAt ? timeToResolve(cases, window, min, settings.caseTargets.resolution) : [],
    arrivals: arrivals(cases, window, min),
    channels,
    reopen,
    teams: teamWorkload(cases, window, caseCols.tier, min),
    types: onTimeByType(tx, window, min),
    finalPay,
    newHireSites,
    newHireRegions,
    timing: timingBins(tx, window, min),
    txMonths,
    quarters,
    txQuarters: onTimeByTypeQuarter(tx, quarters, min, settings.onTimeTarget),
    retro: retroByMonth(tx, windowMonths, min),
    retroSummary: retroSummary(tx, window, min),
    levels,
    processes,
    leave,
    leaveTrend: onLeaveByMonth(leave.facts, monthEnds, min, coverage.from),
    leaveCoverage: coverage,
    uses: {
      ...figureUses(L, {
        caseCols,
        levels,
        processes,
        assignee: aged.some((r) => r.assignee),
        exitTypes: finalPay.some((r) => r.records.some((f) => f.exitType != null)),
      }),
      ...leaveFigureUses({ hasReasons: leave.hasReasons }),
    },
  }
}

const cache = new WeakMap<AnalyticsContext, ServicesModel>()

/**
 * The model for a context, computed once: the view, its scorecard summary and its Action center
 * items share it, so opening HR ops after the scorecard costs nothing.
 */
export function computeCached(ctx: AnalyticsContext): ServicesModel {
  let m = cache.get(ctx)
  if (!m) {
    m = compute(ctx)
    cache.set(ctx, m)
  }
  return m
}

function retroSummary(tx: readonly TxFact[], window: Window, min: number): ServicesModel['retroSummary'] {
  const r = retroShare(tx, window, min)
  return { rate: r.rate, retro: r.rate == null ? null : r.retro, n: r.n }
}

const OPEN = new Set<string>(CASE_OPEN_STATUSES)

/** Folder-tab headline: open cases at the as-of date and cases opened per month (last 8). Cheap. */
export function headline(ctx: AnalyticsContext): Headline {
  const cases = ctx.data.cases
  // The same fields as the Open backlog tile: by resolved time, or by status without one.
  const uses = lineage({ resolvedAt: cases.some((c) => !!c.resolvedAt) }).open
  const metricId = M.backlog
  if (!cases.length) return { value: '—', label: 'open cases', uses, metricId }
  const months = trailingMonths(ctx.asOf, 8)
  const index = new Map(months.map((m, i) => [m, i]))
  const counts = months.map(() => 0)
  let open = 0
  for (const c of cases) {
    const opened = dateOf(c.openedAt)
    if (opened > ctx.asOf) continue
    const i = index.get(opened.slice(0, 7))
    if (i !== undefined) counts[i]++
    const resolved = c.resolvedAt ? dateOf(c.resolvedAt) : null
    if (resolved ? resolved > ctx.asOf : OPEN.has(c.status)) open++
  }
  return {
    value: open.toLocaleString('en-US'),
    label: open === 1 ? 'open case' : 'open cases',
    spark: counts,
    uses,
    metricId,
  }
}
