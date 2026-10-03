/**
 * The Overview KPI strip. Deltas compare with the prior window; a delta is colored only when it
 * clears a materiality gate (2 pts on a rate with at least 30 cases on both sides, 0.1 on CSAT,
 * 15% on counts and durations).
 */
import type { Kpi } from '@/components/types'
import type { Window } from '@/data/scope'
import { fmt } from '@/lib/format'
import { isMaterialChange } from '@/lib/stats'
import { csat, medianHours, openedIn, resolutionSla, resolvedIn, responseSla } from './cases'
import { RESOLUTION_SLA_TARGET, TRANSACTION_ON_TIME_TARGET } from './catalog'
import { type CaseColumns, type CaseFact, dueIn, onTimeRate, type TxColumns, type TxFact } from './facts'
import { duration, type Share } from './util'

export interface CaseSummary {
  opened: number
  resolution: Share
  response: Share
  medianHours: { hours: number | null; n: number }
  csat: { mean: number | null; n: number }
}

export function caseSummary(facts: readonly CaseFact[], w: Window): CaseSummary {
  const opened = openedIn(facts, w)
  const resolved = resolvedIn(facts, w)
  return {
    opened: opened.length,
    resolution: resolutionSla(opened),
    response: responseSla(opened),
    medianHours: medianHours(resolved),
    csat: csat(resolved),
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
}

export function buildKpis(x: KpiInputs): Kpi[] {
  const cur = caseSummary(x.facts, x.window)
  const prev = caseSummary(x.facts, x.prior)
  const backlog = openAt(x.facts, x.asOf)
  const backlogPrev = openAt(x.facts, x.prior.end)
  const over14 = backlog.filter((f) => f.ageDays != null && f.ageDays > 14).length
  const vs = 'vs prior period'
  const noCases = 'Upload HR cases to see this'
  const kpis: Kpi[] = []

  kpis.push({
    id: 'cases-opened',
    label: 'Cases opened',
    value: x.hasCases ? cur.opened : null,
    format: 'int',
    delta: x.hasCases ? cur.opened - prev.opened : null,
    deltaLabel: vs,
    goodDirection: null,
    spark: x.sparkOpened,
    note: x.hasCases ? `About ${fmt(cur.opened / x.window.months, 'int')} a month` : noCases,
    tab: 'cases',
    definition: 'Cases opened in the period, every category and channel.',
  })

  kpis.push({
    id: 'open-backlog',
    label: 'Open backlog',
    value: x.hasCases ? backlog.length : null,
    format: 'int',
    delta: x.hasCases ? backlog.length - backlogPrev.length : null,
    deltaLabel: 'vs end of prior period',
    goodDirection: 'down',
    deltaMaterial: isMaterialChange(backlog.length, backlogPrev.length, backlog.length, backlogPrev.length),
    note: x.hasCases
      ? backlog.length
        ? `${fmt(over14 / backlog.length, 'pct0')} older than 14 d`
        : 'No open cases'
      : noCases,
    tab: 'cases',
    definition:
      'Cases still open at the end of the as-of date, in any open status. Age runs from the opened date.',
  })

  const resolutionOk = x.hasCases && x.cols.resolvedAt
  kpis.push({
    id: 'resolution-sla',
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
        : `Target ${fmt(RESOLUTION_SLA_TARGET, 'pct0')} · ${fmt(cur.resolution.n, 'int')} cases`,
    tab: 'cases',
    definition:
      "Share of cases opened in the period resolved within their category's resolution target (calendar hours). Open cases already past their target count as missed; open cases still inside it are left out.",
  })

  const responseOk = x.hasCases && x.cols.firstResponseAt
  kpis.push({
    id: 'response-sla',
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
    definition:
      "Share of cases opened in the period with a first reply within their category's response target (calendar hours).",
  })

  const dur = duration(cur.medianHours.hours)
  const durPrev =
    prev.medianHours.hours == null ? null : prev.medianHours.hours / (dur.format === 'days' ? 24 : 1)
  kpis.push({
    id: 'time-to-resolve',
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
    definition:
      'Median calendar time from opened to resolved, for cases resolved in the period. Shown in hours below 48 h and in days above.',
  })

  kpis.push({
    id: 'csat',
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
    definition: 'Mean satisfaction score (1 to 5) on cases resolved in the period. Hidden below 5 responses.',
  })

  const due = dueIn(x.tx, x.window)
  const dueP = dueIn(x.tx, x.prior)
  const t = onTimeRate(due)
  const tp = onTimeRate(dueP)
  const txOk = x.hasTx && x.txCols.dueDate
  kpis.push({
    id: 'tx-on-time',
    label: 'Transactions on time',
    value: txOk && t.n >= 5 ? (t.n - t.late) / t.n : null,
    format: 'pct',
    delta: txOk && t.n >= 5 && tp.n >= 5 ? (t.n - t.late) / t.n - (tp.n - tp.late) / tp.n : null,
    deltaLabel: vs,
    goodDirection: 'up',
    deltaMaterial: rateMaterial(t, tp),
    suppressed: txOk && t.n > 0 && t.n < 5,
    note: !x.hasTx
      ? 'Upload HR transactions to see this'
      : !x.txCols.dueDate
        ? 'Due date column missing'
        : `Target ${fmt(TRANSACTION_ON_TIME_TARGET, 'pct0')} · ${fmt(t.n, 'int')} due`,
    tab: 'transactions',
    definition:
      'Share of HR transactions due in the period that were completed on or before their due date. Open transactions past due count as late.',
  })

  return kpis
}
