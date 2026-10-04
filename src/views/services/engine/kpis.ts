/**
 * The Overview KPI strip. Deltas compare with the prior window; a delta is colored only when it
 * clears a materiality gate (2 pts on a rate with at least 30 cases on both sides, 0.1 on CSAT,
 * 15% on counts and durations).
 *
 * Each tile names its metric dictionary entry (`metricId`) and takes its info-popover definition
 * from the registry with your wording; targets and the age limit are settings.
 */
import type { Kpi } from '@/components/types'
import { MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { isMaterialChange } from '@/lib/stats'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import { csat, medianHours, openedIn, resolutionSla, resolvedIn, responseSla } from './cases'
import {
  caseDrill,
  csatDrill,
  type DrillScope,
  drillWhen,
  onTimeDrill,
  openDrill,
  resolutionDrill,
  resolveTimeDrill,
  responseDrill,
} from './drills'
import { tagKpis } from './drillUses'
import { type CaseColumns, type CaseFact, dueIn, onTimeRate, type TxColumns, type TxFact } from './facts'
import type { Lineage } from './lineage'
import type { ServicesSettings } from './settings'
import { duration, type Share } from './util'

export interface CaseSummary {
  opened: number
  resolution: Share
  response: Share
  medianHours: { hours: number | null; n: number }
  csat: { mean: number | null; n: number }
  /** The cases behind the numbers: opened and resolved in the window. */
  rows: { opened: CaseFact[]; resolved: CaseFact[] }
}

export function caseSummary(facts: readonly CaseFact[], w: Window, min = MIN_GROUP): CaseSummary {
  const opened = openedIn(facts, w)
  const resolved = resolvedIn(facts, w)
  return {
    opened: opened.length,
    resolution: resolutionSla(opened, min),
    response: responseSla(opened, min),
    medianHours: medianHours(resolved, min),
    csat: csat(resolved, min),
    rows: { opened, resolved },
  }
}

/** Open at the end of day d: opened by then and not resolved by then. */
export function openAt(facts: readonly CaseFact[], d: string): CaseFact[] {
  return facts.filter((f) => f.opened <= d && (f.resolved ? f.resolved > d : f.open))
}

const RATE_MIN_N = 30
const RATE_MIN_PTS = 0.02

type RateLike = Pick<Share, 'rate' | 'n'>

export function rateMaterial(cur: RateLike, prev: RateLike): boolean {
  if (cur.rate == null || prev.rate == null) return false
  return cur.n >= RATE_MIN_N && prev.n >= RATE_MIN_N && Math.abs(cur.rate - prev.rate) >= RATE_MIN_PTS
}

const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b)

export interface KpiInputs {
  facts: readonly CaseFact[]
  tx: readonly TxFact[]
  window: Window
  prior: Window
  asOf: string
  cols: CaseColumns
  txCols: TxColumns
  hasCases: boolean
  hasTx: boolean
  /** Monthly opened counts and SLA rates, oldest first (for sparklines). */
  sparkOpened: number[]
  sparkSla: (number | null)[]
  sparkResponse: (number | null)[]
  /** Monthly transactions on time, oldest first. */
  sparkTx?: (number | null)[]
  /** Scope for the drill-downs behind each tile. */
  scope: DrillScope
  /** The fields behind each measure (engine/lineage.ts). */
  lineage: Lineage
  /** Targets, the age limit and the anonymity minimum in force. */
  settings: ServicesSettings
  /** The metric dictionary: each tile's definition comes from its entry. */
  metrics: Pick<MetricsApi, 'def'>
}

export function buildKpis(x: KpiInputs): Kpi[] {
  const cfg = x.settings
  const min = cfg.minGroup
  const text = (id: string) => x.metrics.def(id)?.definition
  const cur = caseSummary(x.facts, x.window, min)
  const prev = caseSummary(x.facts, x.prior, min)
  const backlog = openAt(x.facts, x.asOf)
  const backlogPrev = openAt(x.facts, x.prior.end)
  const agedDays = cfg.agedDays
  const older = backlog.filter((f) => f.ageDays != null && f.ageDays > agedDays)
  const overLimit = older.length
  const vs = 'vs prior period'
  // The comparison drills: the same measure over the prior window, in this scope.
  const priorSub = `${x.prior.label} · ${x.scope.scope}`
  const priorPer = 'prior period'
  const noCases = 'Upload HR cases to see this'
  const kpis: Kpi[] = []
  const s = x.scope
  const per = s.per
  const L = x.lineage

  kpis.push({
    id: 'cases-opened',
    metricId: M.opened,
    label: 'Cases opened',
    value: x.hasCases ? cur.opened : null,
    format: 'int',
    delta: x.hasCases ? cur.opened - prev.opened : null,
    deltaLabel: vs,
    goodDirection: null,
    spark: x.sparkOpened,
    note: x.hasCases ? `About ${fmt(cur.opened / x.window.months, 'int')} a month` : noCases,
    tab: 'cases',
    definition: text(M.opened),
    uses: L.opened,
    drill: drillWhen(s, cur.rows.opened, () =>
      caseDrill(s, cur.rows.opened, {
        title: `Cases opened, ${per}`,
        order: (a, b) => (a.openedAt < b.openedAt ? 1 : -1),
      }),
    ),
    deltaDrill: drillWhen(s, prev.rows.opened, () =>
      caseDrill(s, prev.rows.opened, {
        title: `Cases opened, ${priorPer}`,
        subtitle: priorSub,
        order: (a, b) => (a.openedAt < b.openedAt ? 1 : -1),
      }),
    ),
    // "About 553 a month": the cases opened, spread over the months of the period.
    noteDrill: drillWhen(s, cur.rows.opened, () =>
      caseDrill(s, cur.rows.opened, {
        title: `Cases opened, ${per}`,
        order: (a, b) => (a.openedAt < b.openedAt ? 1 : -1),
        note: `${fmt(cur.opened, 'int')} cases over ${fmt(x.window.months, 'int')} months.`,
      }),
    ),
  })

  kpis.push({
    id: 'open-backlog',
    metricId: M.backlog,
    label: 'Open backlog',
    value: x.hasCases ? backlog.length : null,
    format: 'int',
    delta: x.hasCases ? backlog.length - backlogPrev.length : null,
    deltaLabel: `vs ${formatDate(x.prior.end)}`,
    goodDirection: 'down',
    deltaMaterial: isMaterialChange(backlog.length, backlogPrev.length, backlog.length, backlogPrev.length),
    note: x.hasCases
      ? backlog.length
        ? `${fmt(overLimit / backlog.length, 'pct0')} older than ${fmt(agedDays, 'days')}`
        : 'No open cases'
      : noCases,
    tab: 'cases',
    definition: text(M.backlog),
    uses: L.open,
    drill: drillWhen(s, backlog, () => openDrill(s, backlog, `Open cases at ${formatDate(x.asOf)}`)),
    deltaDrill: drillWhen(s, backlogPrev, () =>
      caseDrill(s, backlogPrev, {
        title: `Open cases at ${formatDate(x.prior.end)}`,
        subtitle: `As of ${formatDate(x.prior.end)} · ${s.scope}`,
        note: 'Cases open at the end of that day, shown with their current status.',
      }),
    ),
    // "46% older than 14 d": the open cases past the age limit.
    noteDrill: drillWhen(s, older, () =>
      caseDrill(s, older, {
        title: `Open cases older than ${agedDays} days at ${formatDate(x.asOf)}`,
        subtitle: `As of ${formatDate(x.asOf)} · ${s.scope}`,
        age: true,
        order: (a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0),
        gate: backlog,
        note: `Share = ${fmt(overLimit, 'int')} ÷ ${fmt(backlog.length, 'int')} open cases.`,
      }),
    ),
  })

  const resolutionOk = x.hasCases && x.cols.resolvedAt
  kpis.push({
    id: 'resolution-sla',
    metricId: M.resolutionSla,
    label: 'Resolution SLA met',
    value: resolutionOk ? cur.resolution.rate : null,
    format: 'pct',
    delta: resolutionOk ? diff(cur.resolution.rate, prev.resolution.rate) : null,
    deltaLabel: vs,
    goodDirection: 'up',
    deltaMaterial: rateMaterial(cur.resolution, prev.resolution),
    spark: x.sparkSla,
    suppressed: resolutionOk && cur.resolution.rate == null && cur.resolution.n > 0,
    note: !x.hasCases
      ? noCases
      : !x.cols.resolvedAt
        ? 'Resolved column missing'
        : // The tile shows the target and whether it is met (the metric's own target).
          `${fmt(cur.resolution.n, 'int')} cases`,
    tab: 'cases',
    definition: text(M.resolutionSla),
    uses: L.resolutionSla,
    drill: drillWhen(s, cur.rows.opened, () =>
      resolutionDrill(s, cur.rows.opened, `Cases judged on resolution SLA, ${per}`),
    ),
    deltaDrill: drillWhen(s, prev.rows.opened, () =>
      resolutionDrill(s, prev.rows.opened, `Cases judged on resolution SLA, ${priorPer}`, priorSub),
    ),
    noteDrill: drillWhen(s, cur.rows.opened, () =>
      resolutionDrill(s, cur.rows.opened, `Cases judged on resolution SLA, ${per}`),
    ),
  })

  const responseOk = x.hasCases && x.cols.firstResponseAt
  kpis.push({
    id: 'response-sla',
    metricId: M.responseSla,
    label: 'First response SLA met',
    value: responseOk ? cur.response.rate : null,
    format: 'pct',
    delta: responseOk ? diff(cur.response.rate, prev.response.rate) : null,
    deltaLabel: vs,
    goodDirection: 'up',
    deltaMaterial: rateMaterial(cur.response, prev.response),
    spark: x.sparkResponse,
    suppressed: responseOk && cur.response.rate == null && cur.response.n > 0,
    note: !x.hasCases
      ? noCases
      : !x.cols.firstResponseAt
        ? 'First response column missing'
        : `${fmt(cur.response.n, 'int')} cases`,
    tab: 'levels',
    definition: text(M.responseSla),
    uses: L.responseSla,
    drill: drillWhen(s, cur.rows.opened, () =>
      responseDrill(s, cur.rows.opened, `Cases judged on first response SLA, ${per}`),
    ),
    deltaDrill: drillWhen(s, prev.rows.opened, () =>
      responseDrill(s, prev.rows.opened, `Cases judged on first response SLA, ${priorPer}`, priorSub),
    ),
    noteDrill: drillWhen(s, cur.rows.opened, () =>
      responseDrill(s, cur.rows.opened, `Cases judged on first response SLA, ${per}`),
    ),
  })

  const dur = duration(cur.medianHours.hours)
  const durPrev =
    prev.medianHours.hours == null ? null : prev.medianHours.hours / (dur.format === 'days' ? 24 : 1)
  kpis.push({
    id: 'time-to-resolve',
    metricId: M.timeToResolve,
    label: 'Median time to resolve',
    value: x.cols.resolvedAt ? dur.value : null,
    format: dur.format,
    delta: x.cols.resolvedAt ? diff(dur.value, durPrev) : null,
    deltaLabel: vs,
    goodDirection: 'down',
    deltaMaterial:
      cur.medianHours.hours != null &&
      prev.medianHours.hours != null &&
      isMaterialChange(cur.medianHours.hours, prev.medianHours.hours, cur.medianHours.n, prev.medianHours.n),
    suppressed: x.cols.resolvedAt && cur.medianHours.hours == null && cur.medianHours.n > 0,
    note: !x.hasCases
      ? noCases
      : !x.cols.resolvedAt
        ? 'Resolved column missing'
        : `${fmt(cur.medianHours.n, 'int')} cases resolved`,
    tab: 'cases',
    definition: text(M.timeToResolve),
    uses: L.resolved,
    drill: drillWhen(s, cur.rows.resolved, () =>
      resolveTimeDrill(s, cur.rows.resolved, `Cases resolved, ${per}`),
    ),
    deltaDrill: drillWhen(s, prev.rows.resolved, () =>
      resolveTimeDrill(s, prev.rows.resolved, `Cases resolved, ${priorPer}`, priorSub),
    ),
    noteDrill: drillWhen(s, cur.rows.resolved, () =>
      resolveTimeDrill(s, cur.rows.resolved, `Cases resolved, ${per}`),
    ),
  })

  kpis.push({
    id: 'csat',
    metricId: M.csat,
    label: 'Satisfaction',
    value: x.cols.csat ? cur.csat.mean : null,
    format: 'num1',
    delta: x.cols.csat ? diff(cur.csat.mean, prev.csat.mean) : null,
    deltaLabel: vs,
    goodDirection: 'up',
    deltaMaterial:
      cur.csat.mean != null &&
      prev.csat.mean != null &&
      cur.csat.n >= RATE_MIN_N &&
      prev.csat.n >= RATE_MIN_N &&
      Math.abs(cur.csat.mean - prev.csat.mean) >= 0.1,
    suppressed: x.cols.csat && cur.csat.mean == null && cur.csat.n > 0,
    note: !x.hasCases
      ? noCases
      : !x.cols.csat
        ? 'Satisfaction column missing'
        : `Out of 5 · ${fmt(cur.csat.n, 'int')} responses`,
    tab: 'cases',
    definition: text(M.csat),
    uses: L.csat,
    drill: drillWhen(s, cur.rows.resolved, () =>
      csatDrill(s, cur.rows.resolved, `Cases behind the satisfaction score, ${per}`),
    ),
    deltaDrill: drillWhen(s, prev.rows.resolved, () =>
      csatDrill(s, prev.rows.resolved, `Cases behind the satisfaction score, ${priorPer}`, priorSub),
    ),
    noteDrill: drillWhen(s, cur.rows.resolved, () =>
      csatDrill(s, cur.rows.resolved, `Cases behind the satisfaction score, ${per}`),
    ),
  })

  const due = dueIn(x.tx, x.window)
  const dueP = dueIn(x.tx, x.prior)
  const t = onTimeRate(due, min)
  const tp = onTimeRate(dueP, min)
  const txOk = x.hasTx && x.txCols.dueDate
  kpis.push({
    id: 'tx-on-time',
    metricId: M.onTime,
    label: 'Transactions on time',
    value: txOk ? t.rate : null,
    format: 'pct',
    delta: txOk ? diff(t.rate, tp.rate) : null,
    deltaLabel: vs,
    goodDirection: 'up',
    deltaMaterial: rateMaterial(t, tp),
    spark: x.sparkTx,
    suppressed: txOk && t.rate == null && t.n > 0,
    note: !x.hasTx
      ? 'Upload HR transactions to see this'
      : !x.txCols.dueDate
        ? 'Due date column missing'
        : `${fmt(t.n, 'int')} due`,
    tab: 'transactions',
    definition: text(M.onTime),
    uses: L.onTime,
    drill: drillWhen(s, due, () => onTimeDrill(s, due, `Transactions due, ${per}`)),
    deltaDrill: drillWhen(s, dueP, () =>
      onTimeDrill(s, dueP, `Transactions due, ${priorPer}`, { subtitle: priorSub }),
    ),
    noteDrill: drillWhen(s, due, () => onTimeDrill(s, due, `Transactions due, ${per}`)),
  })

  return tagKpis(kpis)
}
