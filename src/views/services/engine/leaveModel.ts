/**
 * The Leave & return tab's model: the measures from engine/leave.ts, its KPI strip and its
 * readout. Every threshold comes from the metric dictionary (`settings.leave`, read in
 * engine/settings.ts), every KPI and finding names its metric and its fields, and every number
 * carries the records behind it (engine/leaveDrills.ts).
 *
 * Findings:
 *  - retention after parental leave (or after any leave, without reasons) under target;
 *  - upcoming returns without systems ready (LV-03), critical when one is within the urgent window;
 *  - exits soon after a return concentrated in one department, as a count only. This one is
 *    HR-only (`HR_ONLY_FINDINGS`): the scorecard summary leaves it out.
 */
import type { Finding, Kpi, Severity } from '@/components/types'
import type { Employee, HrTransaction, ISODate } from '@/data/schema'
import type { Window } from '@/data/scope'
import type { LeaveGroupRow } from '@/drill/types'
import { daysBetween, formatDate, monthEndPoints } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { isMaterialChange, median } from '@/lib/stats'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { asOfSub, type DrillScope } from './drills'
import { tagFindings, tagKpis } from './drillUses'
import { rateMaterial } from './kpis'
import {
  type ExitsAround,
  exitCluster,
  exitsAround,
  groupCount,
  type LeaveFact,
  type LengthRow,
  type LengthStat,
  leaveFacts,
  lengthByReason,
  lengthStat,
  type OnLeaveRow,
  onePerPerson,
  onLeaveAt,
  onLeaveByReason,
  onLeaveByUnit,
  onLeaveSeries,
  type QuarterRow,
  type RateGroup,
  type ReasonRow,
  type Retention,
  reasonSeries,
  retention,
  returnRate,
  returnRateByQuarter,
  returnsIn,
  showable,
  type UpcomingReturn,
  upcomingReturns,
} from './leave'
import { groupRow, leaveDrill, leaveGroupsDrill, upcomingDrill } from './leaveDrills'
import { LEAVE, type Refs, union, when } from './lineage'
import { pctWords, type ServicesSettings } from './settings'

/** Findings shown on the Leave & return tab only (never in the scorecard or a leader export). */
export const HR_ONLY_FINDINGS: ReadonlySet<string> = new Set(['services-leave-exit-cluster'])

export interface LeaveModel {
  /** Some leave start in scope. */
  hasLeave: boolean
  /** Some leave start in the file carries a reason (column presence is a dataset property). */
  hasReasons: boolean
  /** Some leave start in the file carries a planned return date. */
  hasExpected: boolean
  min: number
  facts: LeaveFact[]
  /** On leave at the as-of date. */
  now: LeaveFact[]
  /** The on-leave count can be shown (at least the anonymity minimum of people). */
  nowShown: boolean
  onLeave: OnLeaveRow[]
  /** On leave now by reason across the scope (empty without reasons). */
  byReason: ReasonRow[]
  series: string[]
  returns: LeaveFact[]
  length: LengthStat
  lengthByReason: LengthRow[]
  upcoming: UpcomingReturn[]
  /** The upcoming returns can be listed (at least the anonymity minimum of people). */
  upcomingShown: boolean
  returnRate: RateGroup
  quarters: QuarterRow[]
  retention: Retention
  exits: ExitsAround
  kpis: Kpi[]
  findings: Finding[]
  /** The fields behind each measure, for the UI. */
  uses: { retention: Refs }
}

export interface LeaveInputs {
  transactions: readonly HrTransaction[]
  /** Every leave start in the unscoped file, to decide which optional columns exist. */
  allTransactions: readonly HrTransaction[]
  people: ReadonlyMap<string, Employee>
  asOf: ISODate
  window: Window
  prior: Window
  settings: ServicesSettings
  scope: DrillScope
  metrics: Pick<MetricsApi, 'def'>
}

const pct = (v: number | null) => fmt(v, 'pct')
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** "Returns in the next 30 days". */
export const returnsLabel = (days: number): string => `Returns in the next ${plural(days, 'day')}`
/** "Retention 12 months after return". */
export const retentionLabel = (months: number): string => `Retention ${plural(months, 'month')} after return`

export function computeLeave(x: LeaveInputs): LeaveModel {
  const cfg = x.settings.leave
  const min = x.settings.minGroup
  const starts = x.allTransactions.filter((t) => t.type === 'Leave start')
  const hasReasons = starts.some((t) => !!t.leaveReason)
  const hasExpected = starts.some((t) => !!t.expectedReturnDate)
  const facts = leaveFacts(x.transactions, x.asOf, x.people)
  const now = onLeaveAt(facts, x.asOf)
  const nowShown = showable(now, min)
  const returns = returnsIn(facts, x.window)
  const upcoming = upcomingReturns(facts, x.asOf, cfg.aheadDays, cfg.urgentDays)
  const ret = retention(facts, x.asOf, cfg.retentionMonths, hasReasons, min)
  const exits = exitsAround(facts, x.window, cfg.soonMonths)
  const model: LeaveModel = {
    hasLeave: facts.length > 0,
    hasReasons,
    hasExpected,
    min,
    facts,
    now,
    nowShown,
    onLeave: nowShown ? onLeaveByUnit(now, hasReasons, min) : [],
    byReason: nowShown && hasReasons ? onLeaveByReason(now, min) : [],
    series: [],
    returns,
    length: lengthStat(returns, min),
    lengthByReason: hasReasons ? lengthByReason(returns, min) : [],
    upcoming,
    upcomingShown: showable(
      upcoming.map((u) => u.fact),
      min,
    ),
    returnRate: returnRate(facts, x.window, min),
    quarters: returnRateByQuarter(facts, x.asOf, 8, min),
    retention: ret,
    exits,
    kpis: [],
    findings: [],
    uses: { retention: union(LEAVE.retention, when(hasReasons && ret.parental?.rate != null, LEAVE.reason)) },
  }
  model.series = reasonSeries(model.onLeave)
  model.kpis = tagKpis(leaveKpis(model, x))
  model.findings = tagFindings(leaveFindings(model, x))
  return model
}

/* ───────────── KPIs ───────────── */

function leaveKpis(m: LeaveModel, x: LeaveInputs): Kpi[] {
  const s = x.scope
  const cfg = x.settings.leave
  const min = m.min
  const text = (id: string) => x.metrics.def(id)?.definition
  const none = 'Upload HR transactions with leave starts to see this'
  const has = m.hasLeave
  const hidden = `Hidden to protect anonymity (n < ${min})`
  const per = s.per
  const priorSub = `${x.prior.label} · ${s.scope}`

  /* on leave now */
  const nowCount = groupCount(m.now, min)
  // The tile counts people; its lists show one leave per person (latest start).
  const before = onePerPerson(onLeaveAt(m.facts, x.prior.end))
  const beforeCount = groupCount(before, min)
  const soFar = median(m.now.map((f) => daysBetween(f.start, x.asOf)))
  const sparkDates = monthEndPoints(x.asOf, 12)

  /* length */
  const prevReturns = returnsIn(m.facts, x.prior)
  const prevLength = lengthStat(prevReturns, min)
  const quarterLength = m.quarters.map((q) => lengthStat(returnsIn(m.facts, q), min).median)

  /* upcoming */
  const notReady = m.upcoming.filter((u) => !u.ready)
  const upcomingCount = m.upcoming.length ? (m.upcomingShown ? m.upcoming.length : null) : 0

  /* return rate */
  const rr = m.returnRate
  const rrPrev = returnRate(m.facts, x.prior, min)

  /* retention */
  const r = m.retention
  const parental = r.parental
  const cohortWords = `returns ${formatDate(r.from)} to ${formatDate(r.to)}`

  const kpis: Kpi[] = [
    {
      id: 'leave-on-leave',
      metricId: M.onLeave,
      label: 'On leave now',
      value: has ? nowCount : null,
      format: 'int',
      delta: has && nowCount != null && beforeCount != null ? nowCount - beforeCount : null,
      deltaLabel: `vs ${formatDate(x.prior.end)}`,
      goodDirection: null,
      spark: has ? onLeaveSeries(m.facts, sparkDates, min) : undefined,
      suppressed: has && nowCount == null,
      note: !has
        ? none
        : nowCount == null
          ? hidden
          : soFar == null || !m.now.length
            ? `As of ${formatDate(x.asOf)}`
            : `Median ${fmt(soFar, 'days')} so far`,
      tab: 'leave',
      definition: text(M.onLeave),
      uses: LEAVE.onLeave,
      drill: nowCount
        ? () =>
            leaveDrill(s, onePerPerson(m.now), {
              title: 'On leave now',
              subtitle: asOfSub(s),
              columns: ['expected', 'days'],
              order: (a, b) => a.start.localeCompare(b.start),
            })
        : undefined,
      deltaDrill: beforeCount
        ? () =>
            leaveDrill(s, before, {
              title: `On leave on ${formatDate(x.prior.end)}`,
              subtitle: `As of ${formatDate(x.prior.end)} · ${s.scope}`,
              columns: ['expected', 'returned'],
            })
        : undefined,
      noteDrill:
        nowCount && soFar != null
          ? () =>
              leaveDrill(s, m.now, {
                title: 'On leave now, days so far',
                subtitle: asOfSub(s),
                columns: ['expected', 'days'],
                order: (a, b) => a.start.localeCompare(b.start),
                note: `Median of ${plural(m.now.length, 'leave')}: ${fmt(soFar, 'days')} on leave so far.`,
              })
          : undefined,
    },
    {
      id: 'leave-length',
      metricId: M.leaveLength,
      label: 'Median leave length',
      value: has ? m.length.median : null,
      format: 'days',
      delta:
        m.length.median != null && prevLength.median != null ? m.length.median - prevLength.median : null,
      deltaLabel: 'vs prior period',
      goodDirection: null,
      deltaMaterial:
        m.length.median != null && prevLength.median != null
          ? isMaterialChange(m.length.median, prevLength.median, m.length.n, prevLength.n, 30)
          : false,
      spark: has ? quarterLength : undefined,
      suppressed: has && m.length.median == null && m.length.n > 0,
      note: !has
        ? none
        : m.length.median == null && m.length.n > 0
          ? hidden
          : `${plural(m.length.n, 'return')}`,
      tab: 'leave',
      definition: text(M.leaveLength),
      uses: LEAVE.length,
      drill:
        m.length.median != null
          ? () =>
              leaveDrill(s, m.returns, {
                title: `Returns from leave, ${per}`,
                subtitle: `${x.window.label} · ${s.scope}`,
                columns: ['returned', 'days'],
                order: (a, b) => (b.days ?? 0) - (a.days ?? 0),
                note: `Median of ${plural(m.length.n, 'return')}: ${fmt(m.length.median, 'days')}.`,
              })
          : undefined,
      deltaDrill:
        prevLength.median != null
          ? () =>
              leaveDrill(s, prevReturns, {
                title: 'Returns from leave, prior period',
                subtitle: priorSub,
                columns: ['returned', 'days'],
                order: (a, b) => (b.days ?? 0) - (a.days ?? 0),
                note: `Median of ${plural(prevLength.n, 'return')}: ${fmt(prevLength.median, 'days')}.`,
              })
          : undefined,
    },
    {
      id: 'leave-returns-soon',
      metricId: M.returnsSoon,
      label: returnsLabel(cfg.aheadDays),
      value: has ? upcomingCount : null,
      format: 'int',
      goodDirection: null,
      suppressed: has && upcomingCount == null,
      note: !has
        ? none
        : !m.hasExpected
          ? 'No planned return dates loaded'
          : upcomingCount == null
            ? hidden
            : !m.upcoming.length
              ? 'None planned'
              : notReady.length
                ? `${fmt(notReady.length, 'int')} without systems ready (LV-03)`
                : 'Systems ready for all (LV-03)',
      tab: 'leave',
      definition: text(M.returnsSoon),
      uses: LEAVE.systemsReady,
      drill: upcomingCount ? () => upcomingDrill(s, m.upcoming, returnsLabel(cfg.aheadDays)) : undefined,
      noteDrill:
        upcomingCount && notReady.length
          ? () =>
              upcomingDrill(s, notReady, `${returnsLabel(cfg.aheadDays)}, systems not ready`, {
                gate: m.upcoming.map((u) => u.fact),
                note: `Out of ${plural(m.upcoming.length, 'upcoming return')}.`,
              })
          : undefined,
    },
    {
      id: 'leave-return-rate',
      metricId: M.returnRate,
      label: 'Return rate',
      value: has ? rr.rate : null,
      format: 'pct',
      delta: rr.rate != null && rrPrev.rate != null ? rr.rate - rrPrev.rate : null,
      deltaLabel: 'vs prior period',
      goodDirection: 'up',
      deltaMaterial: rateMaterial(rr, rrPrev),
      spark: has ? m.quarters.map((q) => q.rate) : undefined,
      suppressed: has && rr.rate == null && rr.n > 0,
      note: !has ? none : rr.rate == null && rr.n > 0 ? hidden : `${plural(rr.n, 'leave')} ended`,
      tab: 'leave',
      definition: text(M.returnRate),
      uses: LEAVE.returnRate,
      drill:
        rr.rate != null
          ? () =>
              leaveDrill(s, rr.records, {
                title: `Leaves that ended, ${per}`,
                subtitle: `${x.window.label} · ${s.scope}`,
                columns: ['returned', 'ended', 'exit'],
                note: `Rate = ${fmt(rr.hits, 'int')} returned ÷ ${plural(rr.n, 'leave')} that ended (a return, or leaving the company during the leave).`,
              })
          : undefined,
      deltaDrill:
        rrPrev.rate != null
          ? () =>
              leaveDrill(s, rrPrev.records, {
                title: 'Leaves that ended, prior period',
                subtitle: priorSub,
                columns: ['returned', 'ended', 'exit'],
              })
          : undefined,
    },
    {
      id: 'leave-retention',
      metricId: M.retention,
      label: retentionLabel(r.months),
      value: has ? r.overall.rate : null,
      format: 'pct',
      delta: r.overall.rate != null && r.prior.rate != null ? r.overall.rate - r.prior.rate : null,
      deltaLabel: `vs returns ${plural(r.months, 'month')} earlier`,
      goodDirection: 'up',
      deltaMaterial: rateMaterial(r.overall, r.prior),
      suppressed: has && r.overall.rate == null && r.overall.n > 0,
      note: !has
        ? none
        : r.overall.rate == null && r.overall.n > 0
          ? hidden
          : parental?.rate != null
            ? `Parental ${pct(parental.rate)} (${fmt(parental.retained, 'int')} of ${fmt(parental.returners, 'int')})`
            : `${plural(r.overall.returners, 'returner')}, ${cohortWords}`,
      tab: 'leave',
      definition: text(M.retention),
      uses: m.uses.retention,
      drill:
        r.overall.rate != null
          ? () =>
              leaveDrill(s, r.overall.records, {
                title: `Returners ${formatDate(r.from)} to ${formatDate(r.to)}`,
                subtitle: `Returns ${formatDate(r.from)} to ${formatDate(r.to)} · ${s.scope}`,
                columns: ['returned', 'retained', 'exit'],
                months: r.months,
                order: (a, b) =>
                  Number(!!a.exit) - Number(!!b.exit) || (a.returned ?? '').localeCompare(b.returned ?? ''),
                note: `Rate = ${fmt(r.overall.retained, 'int')} still employed ${plural(r.months, 'month')} after returning ÷ ${plural(r.overall.returners, 'returner')}.`,
              })
          : undefined,
      deltaDrill:
        r.prior.rate != null
          ? () =>
              leaveDrill(s, r.prior.records, {
                title: `Returners ${plural(r.months, 'month')} earlier`,
                subtitle: s.scope,
                columns: ['returned', 'retained', 'exit'],
                months: r.months,
              })
          : undefined,
      noteDrill: parental?.rate != null ? () => retentionGroupsDrill(m, x) : undefined,
    },
  ]
  return kpis
}

/** Retention after return by reason (or parental against the rest): grouped, never named. */
export function retentionGroupsDrill(m: LeaveModel, x: Pick<LeaveInputs, 'scope'>) {
  const r = m.retention
  const rows: LeaveGroupRow[] = []
  const measure = `Still employed ${plural(r.months, 'month')} after return`
  for (const g of [r.parental, r.others, ...r.byReason]) {
    if (!g) continue
    rows.push(
      groupRow({
        groupBy: g === r.parental || g === r.others ? 'Parental and other leaves' : 'Leave reason',
        group: g.group,
        reason: g === r.others ? null : g.group,
        measure,
        value: g.rate,
        format: 'pct',
        rows: g.records,
        min: m.min,
      }),
    )
  }
  return leaveGroupsDrill(x.scope, rows, retentionLabel(r.months), {
    subtitle: `Returns ${formatDate(r.from)} to ${formatDate(r.to)} · ${x.scope.scope}`,
    note: 'Grouped by leave reason, never by person.',
  })
}

/* ───────────── findings ───────────── */

interface Ranked extends Finding {
  rank: number
}

function leaveFindings(m: LeaveModel, x: LeaveInputs): Finding[] {
  if (!x.scope.on || !m.hasLeave) return []
  const out: Ranked[] = [...retentionFinding(m, x), ...returnsFinding(m, x), ...clusterFinding(m, x)]
  return out
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rank - b.rank)
    .map(({ rank: _rank, ...f }) => f)
}

function retentionFinding(m: LeaveModel, x: LeaveInputs): Ranked[] {
  const cfg = x.settings.leave
  const r = m.retention
  const target = cfg.retentionTarget
  const group = m.hasReasons ? r.parental : r.overall
  if (!group || group.rate == null) return []
  if (group.returners < Math.max(cfg.minReturners, m.min) || group.rate >= target) return []
  const months = plural(r.months, 'month')
  const parental = m.hasReasons
  const others = parental && r.others?.rate != null ? r.others : null
  const gap = (target - group.rate) * 100
  return [
    {
      id: parental ? 'services-leave-retention-parental' : 'services-leave-retention',
      metricId: M.retentionLow,
      severity: gap >= 10 ? 'critical' : 'warning',
      title: parental
        ? `Retention ${months} after parental leave is ${pct(group.rate)}, under the ${pctWords(target)} target.`
        : `Retention ${months} after a return from leave is ${pct(group.rate)}, under the ${pctWords(target)} target.`,
      detail: `${fmt(group.retained, 'int')} of ${fmt(group.returners, 'int')} people who came back${
        parental ? ' from parental leave' : ''
      } between ${formatDate(r.from)} and ${formatDate(r.to)} were still employed ${months} later${
        others ? `, against ${pct(others.rate)} after other leaves.` : '.'
      }`,
      action: parental
        ? 'Review the LV-03 30-day check-in and manager support for parents returning from leave with the HRBPs.'
        : 'Review the LV-03 30-day check-in and manager support after a return with the HRBPs.',
      tab: 'leave',
      drill: () => retentionGroupsDrill(m, x),
      uses: parental ? union(LEAVE.retention, LEAVE.reason) : LEAVE.retention,
      rank: 1,
    },
  ]
}

const STATUS_WORDS = {
  'Not entered': 'no return from leave entered',
  'Entered, not processed': 'a return entered but not processed',
} as const

function returnsFinding(m: LeaveModel, x: LeaveInputs): Ranked[] {
  const cfg = x.settings.leave
  if (!m.upcomingShown) return []
  const notReady = m.upcoming.filter((u) => !u.ready)
  if (!notReady.length) return []
  const urgent = notReady.filter((u) => u.urgent)
  const missing = notReady.filter((u) => u.status === 'Not entered').length
  const open = notReady.length - missing
  const parts = [
    missing
      ? `${fmt(missing, 'int')} ${missing === 1 ? 'has' : 'have'} ${STATUS_WORDS['Not entered']}`
      : null,
    open
      ? `${fmt(open, 'int')} ${open === 1 ? 'has' : 'have'} ${STATUS_WORDS['Entered, not processed']}`
      : null,
  ].filter(Boolean)
  const first = urgent[0]
  const n = notReady.length
  return [
    {
      id: 'services-leave-returns-not-ready',
      metricId: M.returnsNotReady,
      severity: urgent.length ? 'critical' : 'warning',
      title: `${fmt(n, 'int')} of the ${fmt(m.upcoming.length, 'int')} people due back from leave in the next ${plural(cfg.aheadDays, 'day')} ${n === 1 ? 'does' : 'do'} not have systems ready.`,
      detail: `${parts.join(' and ')}, so pay and access may not be active on the day (Atlas LV-03).${
        first
          ? ` ${fmt(urgent.length, 'int')} ${urgent.length === 1 ? 'is' : 'are'} due back within ${plural(cfg.urgentDays, 'day')}, the first on ${formatDate(first.expected)}.`
          : ''
      }`,
      action: 'Ask People operations and IT to confirm pay, access and equipment before each return date.',
      people: notReady.map((u) => ({
        id: u.fact.employeeId,
        name: u.fact.name ?? u.fact.employeeId,
        note: `Due back ${formatDate(u.expected)}, ${u.status.toLowerCase()}`,
      })),
      tab: 'leave',
      drill: () =>
        upcomingDrill(x.scope, notReady, `${returnsLabel(cfg.aheadDays)}, systems not ready`, {
          gate: m.upcoming.map((u) => u.fact),
          note: `Out of ${plural(m.upcoming.length, 'upcoming return')}.`,
        }),
      uses: LEAVE.systemsReady,
      rank: 0,
    },
  ]
}

function clusterFinding(m: LeaveModel, x: LeaveInputs): Ranked[] {
  const cfg = x.settings.leave
  if (!showable(m.exits.soonBase, m.min)) return []
  const c = exitCluster(m.exits.soon, cfg.cluster, m.min)
  if (!c) return []
  const months = plural(m.exits.months, 'month')
  const byDept = new Map<string, LeaveFact[]>()
  for (const l of m.exits.soon) {
    const d = l.fact.department ?? 'Unknown department'
    byDept.set(d, [...(byDept.get(d) ?? []), l.fact])
  }
  const rows = [...byDept].map(([d, facts]) =>
    groupRow({
      groupBy: 'Department',
      group: d,
      reason: null,
      measure: `Left within ${months} of returning`,
      value: facts.length,
      rows: facts,
      min: m.min,
    }),
  )
  return [
    {
      id: 'services-leave-exit-cluster',
      metricId: M.exitCluster,
      severity: 'warning',
      title: `${fmt(c.count, 'int')} of the ${fmt(c.total, 'int')} people who left within ${months} of returning from leave were in ${c.department}.`,
      detail:
        'This is a count only. The exits are listed for HR on the Leave & return tab, never by name in a finding.',
      action: `Review return-to-work support in ${c.department} with its HRBP.`,
      tab: 'leave',
      drill: () =>
        leaveGroupsDrill(x.scope, rows, `Left within ${months} of returning, by department`, {
          note: 'Counts by department, never by person.',
        }),
      uses: union(LEAVE.exits, LEAVE.department),
      rank: 2,
    },
  ]
}
