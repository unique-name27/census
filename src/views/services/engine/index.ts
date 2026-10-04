/**
 * HR ops engine: one pure function of the analytics context that returns everything
 * the view draws. The UI calls it inside useMemo keyed on the context.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { CASE_OPEN_STATUSES, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { dateOf, monthsBetween } from '@/lib/dates'
import type { Headline } from '@/views/types'
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
import { type LevelRow, type ProcessRow, processCoverage, scorecard } from './levels'
import { figureUses, lineage, type Refs, type ServicesFigureId } from './lineage'
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
import { peopleIn, trailingMonths } from './util'

export interface ServicesModel {
  asOf: string
  window: Window
  hasCases: boolean
  hasTx: boolean
  /** Distinct people behind the scoped cases and transactions. */
  people: number
  /**
   * Fewer than MIN_GROUP people in scope: row-level lists and detail exports are withheld and
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
  retro: RetroMonthRow[]
  /** Retro share over the window (DS-01); the count is hidden with the share. */
  retroSummary: { rate: number | null; retro: number | null; n: number }
  levels: LevelRow[]
  processes: ProcessRow[]
  /** The fields behind each figure, for its `uses` (engine/lineage.ts). */
  uses: Record<ServicesFigureId, Refs>
}

export function compute(ctx: AnalyticsContext): ServicesModel {
  const { asOf, window, prior } = ctx
  // Column presence is a property of the dataset, not of the scope.
  const caseCols = caseColumns(ctx.all.cases)
  const txCols = txColumns(ctx.all.transactions)
  const cases = caseFacts(ctx.data.cases, asOf, caseCols)
  const tx = txFacts(ctx.data.transactions, asOf, ctx.org.byId)
  const hasCases = cases.length > 0
  const hasTx = tx.length > 0
  const people = peopleIn([...cases, ...tx])
  const small = (hasCases || hasTx) && people < MIN_GROUP
  const scope = drillScope(ctx, caseCols, small)
  const months = trailingMonths(asOf, 24)
  const slaMonths = slaByMonth(cases, months)
  const last12 = slaMonths.slice(-12)
  const categories = byCategory(cases, window)
  const channels = byChannel(cases, window)
  const reopen = reopenEscalate(cases, window)
  const finalPay = finalPayByJurisdiction(tx, window)
  const newHireSites = newHireBySite(tx, window)
  const newHireRegions = newHireByRegion(tx, window)
  const windowMonths = monthsBetween(window.start, window.end)
  const backlogFacts = openAt(cases, asOf)
  const txMonths = onTimeByMonth(tx, months)
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
  })

  const findings = buildFindings({
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
  })

  const aged = small ? [] : agedCases(cases, 14)
  const levels = scorecard({
    cases,
    tx,
    window,
    asOf,
    hasResolved: caseCols.resolvedAt,
    hasResponse: caseCols.firstResponseAt,
    hasDue: txCols.dueDate,
  })
  const processes = processCoverage(cases, tx, window)

  return {
    asOf,
    window,
    hasCases,
    hasTx,
    people,
    small,
    scope,
    caseCols,
    txCols,
    cases,
    tx,
    summary: caseSummary(cases, window),
    kpis,
    findings,
    months,
    windowMonths,
    opened: openedByMonth(cases, months),
    slaMonths,
    categories,
    backlog: backlogByAge(cases),
    backlogTotal: backlogFacts.length,
    aged,
    agedPrivate: agedPrivate(cases, 14),
    resolve: caseCols.resolvedAt ? timeToResolve(cases, window) : [],
    arrivals: arrivals(cases, window),
    channels,
    reopen,
    teams: teamWorkload(cases, window, caseCols.tier),
    types: onTimeByType(tx, window),
    finalPay,
    newHireSites,
    newHireRegions,
    timing: timingBins(tx, window),
    txMonths,
    retro: retroByMonth(tx, windowMonths),
    retroSummary: retroSummary(tx, window),
    levels,
    processes,
    uses: figureUses(L, {
      caseCols,
      levels,
      processes,
      assignee: aged.some((r) => r.assignee),
      exitTypes: finalPay.some((r) => r.records.some((f) => f.exitType != null)),
    }),
  }
}

function retroSummary(tx: readonly TxFact[], window: Window): ServicesModel['retroSummary'] {
  const r = retroShare(tx, window)
  return { rate: r.rate, retro: r.rate == null ? null : r.retro, n: r.n }
}

const OPEN = new Set<string>(CASE_OPEN_STATUSES)

/** Folder-tab headline: open cases at the as-of date and cases opened per month (last 8). Cheap. */
export function headline(ctx: AnalyticsContext): Headline {
  const cases = ctx.data.cases
  // The same fields as the Open backlog tile: by resolved time, or by status without one.
  const uses = lineage({ resolvedAt: cases.some((c) => !!c.resolvedAt) }).open
  if (!cases.length) return { value: '—', label: 'open cases', uses }
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
  }
}
