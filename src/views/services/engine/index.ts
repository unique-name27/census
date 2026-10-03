/**
 * Employee services engine: one pure function of the analytics context that returns everything
 * the view draws. The UI calls it inside useMemo keyed on the context.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { CASE_OPEN_STATUSES } from '@/data/schema'
import type { Window } from '@/data/scope'
import { dateOf, monthsBetween } from '@/lib/dates'
import {
  type AgedCaseRow,
  type ArrivalRow,
  agedCases,
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
import {
  type FinalPayRow,
  finalPayByJurisdiction,
  newHireByRegion,
  newHireBySite,
  onTimeByType,
  type RetroMonthRow,
  retroByMonth,
  type SiteRow,
  type TimingRow,
  type TypeRow,
  timingBins,
} from './transactions'
import { trailingMonths } from './util'

export interface ServicesModel {
  asOf: string
  window: Window
  hasCases: boolean
  hasTx: boolean
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
  retro: RetroMonthRow[]
  levels: LevelRow[]
  processes: ProcessRow[]
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
  })

  return {
    asOf,
    window,
    hasCases,
    hasTx,
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
    aged: agedCases(cases, 14),
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
    retro: retroByMonth(tx, windowMonths),
    levels: scorecard({
      cases,
      tx,
      window,
      asOf,
      hasResolved: caseCols.resolvedAt,
      hasResponse: caseCols.firstResponseAt,
      hasDue: txCols.dueDate,
    }),
    processes: processCoverage(cases, tx, window),
  }
}

const OPEN = new Set<string>(CASE_OPEN_STATUSES)

/** Folder-tab headline: open cases at the as-of date and cases opened per month (last 8). Cheap. */
export function headline(ctx: AnalyticsContext): { value: string; label: string; spark?: (number | null)[] } {
  const cases = ctx.data.cases
  if (!cases.length) return { value: '—', label: 'open cases' }
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
  }
}
