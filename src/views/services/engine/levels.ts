/**
 * The service level scorecard: one row per measurable Atlas KPI, with the actual for the window,
 * the gap to target and a status.
 *
 * Business-day clocks use Monday to Friday with no holiday calendar (businessDaysBetween), counted
 * between dates (not hours). A case still open past its clock counts as missed. Case rows also
 * carry the help desk's own resolution SLA for the category (calendar hours, as on the Cases tab
 * and in the readout), so a row can be read against both clocks.
 *
 * Status: Met; At risk when within 5 pts below a percentage target, within 25% above a ceiling
 * share ("under 2%") or within 10% above a day target; otherwise Missed. This departs from the
 * literal "within 5 pts" for ceilings, where 5 pts would be several times the target itself.
 * Fewer than 5 cases or transactions, or fewer than 5 people behind them, give no actual.
 */

import {
  CASE_CATEGORIES,
  MIN_GROUP,
  TRANSACTION_PROCESS,
  TRANSACTION_TYPES,
  type TransactionType,
} from '@/data/schema'
import type { Window } from '@/data/scope'
import { businessDaysBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { openedIn, resolutionSla, resolvedIn } from './cases'
import {
  AT_RISK_CEILING_SHARE,
  AT_RISK_DAYS_SHARE,
  AT_RISK_PTS,
  ATLAS_PROCESSES,
  SERVICE_LEVELS,
  type ServiceLevelDef,
  type ServiceLevelId,
} from './catalog'
import { type CaseFact, dueIn, onTimeRate, type TxFact } from './facts'
import { retroCandidates, retroShare } from './transactions'
import { isShowable, type Personal, peopleIn } from './util'

export type LevelStatus = 'Met' | 'At risk' | 'Missed'

/** The rows a measure judged: cases or transactions. */
export type LevelRecords = { kind: 'cases'; rows: CaseFact[] } | { kind: 'transactions'; rows: TxFact[] }

/** A business-day clock on cases: the clock stops at resolution or at the first response. */
export interface LevelClock {
  category: string
  days: number
  stop: 'resolved' | 'responded'
}

/** The case measures timed on a business-day clock. */
export const LEVEL_CLOCKS: Partial<Record<ServiceLevelId, LevelClock>> = {
  'py05-payroll-2bd': { category: 'Payroll', days: 2, stop: 'resolved' },
  'ds07-verification-2bd': { category: 'Employment verification', days: 2, stop: 'resolved' },
  'ds04-access-2bd': { category: 'Systems access', days: 2, stop: 'resolved' },
  'bn03-benefits-5bd': { category: 'Benefits', days: 5, stop: 'resolved' },
  'lv01-leave-response-1bd': { category: 'Leave & accommodation', days: 1, stop: 'responded' },
  'lv01-leave-designation-5bd': { category: 'Leave & accommodation', days: 5, stop: 'resolved' },
  'mv06-immigration-response-1bd': { category: 'Immigration & mobility', days: 1, stop: 'responded' },
}

/** The date a clock stops for a case, or null while it runs. */
export const clockStop = (f: CaseFact, c: Pick<LevelClock, 'stop'>): string | null =>
  c.stop === 'resolved' ? f.resolved : f.responded

/**
 * A case against a business-day clock: true when it stopped in time, false when it stopped late
 * or is still open past the clock, null while still inside it.
 */
export function clockMet(f: CaseFact, c: Pick<LevelClock, 'days' | 'stop'>, asOf: string): boolean | null {
  const end = clockStop(f, c)
  if (end) return businessDaysBetween(f.opened, end) <= c.days
  return f.open && businessDaysBetween(f.opened, asOf) > c.days ? false : null
}

export interface LevelRow {
  id: ServiceLevelId
  processId: string
  process: string
  measure: string
  target: string
  atlas: string
  basis: string
  adaptation: string | null
  team: string
  unit: 'share' | 'days'
  /** Share (0-1) or days, per `unit`. */
  actual: number | null
  /** Positive = better than target: points for shares, days for day targets. */
  gap: number | null
  status: LevelStatus | null
  /**
   * Cases or transactions judged. Null (hidden) when behind fewer than 5 people, so a small scope
   * can't show that one of its members had, say, an immigration case.
   */
  n: number | null
  window: string
  /** Rows behind the actual that missed (case or transaction IDs). */
  misses: string[]
  /** Case rows: the category's resolution SLA met on the calendar-hour clock (Cases tab). */
  caseSla: number | null
  /** Case rows: that clock's target, e.g. "48 h" or "7 d". */
  caseSlaTarget: string | null
  /** The cases or transactions judged (the drill's rows); null when the measure has no data. */
  records: LevelRecords | null
  /** The business-day clock of a case measure, or null. */
  clock: LevelClock | null
  /** Case rows: the category's cases opened in the window (behind the case SLA). */
  caseRecords: CaseFact[]
}

export interface LevelInputs {
  cases: readonly CaseFact[]
  tx: readonly TxFact[]
  window: Window
  asOf: string
  /** False when the cases dataset is empty or lacks the timestamps a measure needs. */
  hasResolved: boolean
  hasResponse: boolean
  hasDue: boolean
}

interface Measured {
  actual: number | null
  n: number
  /** Distinct people behind the judged rows. */
  people: number
  misses: string[]
  records: LevelRecords | null
}

const none: Measured = { actual: null, n: 0, people: 0, misses: [], records: null }

/** A share of the judged rows; null below MIN_GROUP rows or people. */
function measured(hits: number, judged: CaseFact[], misses: string[]): Measured {
  const people = peopleIn(judged)
  return {
    actual: isShowable(judged.length, people) ? hits / judged.length : null,
    n: judged.length,
    people,
    misses,
    records: { kind: 'cases', rows: judged },
  }
}

/** Share of cases opened in the window whose clock (in business days) stopped in time. */
function businessDayShare(rows: readonly CaseFact[], clock: LevelClock, asOf: string): Measured {
  let hits = 0
  const judged: CaseFact[] = []
  const misses: string[] = []
  for (const f of rows) {
    const met = clockMet(f, clock, asOf)
    if (met == null) continue
    judged.push(f)
    if (met) hits++
    else misses.push(f.caseId)
  }
  return measured(hits, judged, misses)
}

const isJudgedTx = (f: TxFact) => f.outcome === 'on-time' || f.outcome === 'late' || f.outcome === 'overdue'

function txShare(rows: readonly TxFact[]): Measured {
  const r = onTimeRate(rows)
  const misses = rows
    .filter((f) => f.outcome === 'late' || f.outcome === 'overdue')
    .map((f) => f.transactionId)
  return {
    actual: r.rate,
    n: r.n,
    people: r.people,
    misses,
    records: { kind: 'transactions', rows: rows.filter(isJudgedTx) },
  }
}

function measure(def: ServiceLevelDef, x: LevelInputs): Measured {
  const due = dueIn(x.tx, x.window)
  const txOf = (type: string) => due.filter((f) => f.type === type)
  const clock = LEVEL_CLOCKS[def.id]
  if (clock) {
    const ok = clock.stop === 'resolved' ? x.hasResolved : x.hasResponse
    if (!ok) return none
    const opened = openedIn(x.cases, x.window).filter((f) => f.category === clock.category)
    return businessDayShare(opened, clock, x.asOf)
  }
  switch (def.id) {
    case 'er02-median-days': {
      if (!x.hasResolved) return none
      const closed = resolvedIn(x.cases, x.window).filter(
        (f) => f.category === 'Employee relations' && f.resolutionHours != null,
      )
      const days = closed.map((f) => (f.resolutionHours as number) / 24)
      const misses = closed
        .filter((f) => (f.resolutionHours as number) / 24 > def.target)
        .map((f) => f.caseId)
      const people = peopleIn(closed)
      return {
        actual: isShowable(days.length, people) ? median(days) : null,
        n: days.length,
        people,
        misses,
        records: { kind: 'cases', rows: closed },
      }
    }
    case 'on03-hire-day-minus-3':
      return x.hasDue ? txShare(txOf('New hire')) : none
    case 'of05-final-pay':
      return x.hasDue ? txShare(txOf('Termination')) : none
    case 'mv04-location-cutoff':
      return x.hasDue ? txShare(txOf('Location change')) : none
    case 'mv05-job-change-cutoff':
      return x.hasDue ? txShare(txOf('Job change')) : none
    case 'lv03-return-ready':
      return x.hasDue ? txShare(txOf('Return from leave')) : none
    case 'ds01-retro-share': {
      const r = retroShare(x.tx, x.window)
      const judged = retroCandidates(due)
      const misses = judged.filter((f) => f.retro === true).map((f) => f.transactionId)
      return {
        actual: r.rate,
        n: r.n,
        people: r.people,
        misses,
        records: { kind: 'transactions', rows: judged },
      }
    }
    default:
      return none
  }
}

/** Status of an actual against its target. */
export function levelStatus(def: ServiceLevelDef, actual: number | null): LevelStatus | null {
  if (actual == null) return null
  const band =
    def.unit === 'days'
      ? def.target * AT_RISK_DAYS_SHARE
      : def.direction === 'max'
        ? def.target * AT_RISK_CEILING_SHARE
        : AT_RISK_PTS
  if (def.direction === 'min') {
    if (actual >= def.target) return 'Met'
    return actual >= def.target - band ? 'At risk' : 'Missed'
  }
  const met = def.strict ? actual < def.target : actual <= def.target
  if (met) return 'Met'
  return actual <= def.target + band ? 'At risk' : 'Missed'
}

/** Signed gap, positive when better than target. */
export function levelGap(def: ServiceLevelDef, actual: number | null): number | null {
  if (actual == null) return null
  return def.direction === 'min' ? actual - def.target : def.target - actual
}

/** "48 h" up to 48 hours (the case targets are written that way), "7 d" above. */
const hoursText = (h: number) => (h <= 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} d`)

export function scorecard(x: LevelInputs): LevelRow[] {
  const opened = openedIn(x.cases, x.window)
  return SERVICE_LEVELS.map((def) => {
    const m = measure(def, x)
    const inCat = def.caseCategory ? opened.filter((f) => f.category === def.caseCategory) : []
    const target = inCat.find((f) => f.resolutionTarget != null)?.resolutionTarget ?? null
    return {
      id: def.id,
      processId: def.processId,
      process: ATLAS_PROCESSES.get(def.processId)?.name ?? def.processId,
      measure: def.measure,
      target: def.targetText,
      atlas: def.atlas,
      basis: def.basis,
      adaptation: def.adaptation ?? null,
      team: def.team,
      unit: def.unit,
      actual: m.actual,
      gap: levelGap(def, m.actual),
      status: levelStatus(def, m.actual),
      n: m.n && m.people < MIN_GROUP ? null : m.n,
      window: x.window.label,
      misses: m.misses,
      caseSla: def.caseCategory && x.hasResolved ? resolutionSla(inCat).rate : null,
      caseSlaTarget: def.caseCategory && target != null ? hoursText(target) : null,
      records: m.records,
      clock: LEVEL_CLOCKS[def.id] ?? null,
      caseRecords: inCat,
    }
  })
}

/* ───────────── Atlas processes behind the view ───────────── */

export interface ProcessRow {
  processId: string
  process: string
  owner: string
  sla: string
  covers: string
  /** Cases opened in the window; null when behind fewer than 5 people (hidden). */
  cases: number | null
  /** Transactions due in the window; null when behind fewer than 5 people (hidden). */
  transactions: number | null
  /** The cases and transactions behind the counts. */
  caseRecords: CaseFact[]
  txRecords: TxFact[]
}

/** A count shown when it is zero or behind at least MIN_GROUP people; otherwise hidden (null). */
function countOf(rows: readonly Personal[] | undefined): number | null {
  if (!rows?.length) return 0
  return peopleIn(rows) >= MIN_GROUP ? rows.length : null
}

function push<T>(map: Map<string, T[]>, key: string, row: T) {
  const list = map.get(key)
  if (list) list.push(row)
  else map.set(key, [row])
}

/**
 * Every Atlas process that governs a case category or a transaction type, with the volume it
 * carried in the window: cases opened and transactions due. A count behind fewer than 5 people is
 * hidden, so a small scope can't show that one of its members had, say, an immigration case.
 */
export function processCoverage(cases: readonly CaseFact[], tx: readonly TxFact[], w: Window): ProcessRow[] {
  const covers = new Map<string, string[]>()
  for (const c of CASE_CATEGORIES) push(covers, c.processId, `${c.category} cases`)
  for (const t of TRANSACTION_TYPES) push(covers, TRANSACTION_PROCESS[t], `${t} transactions`)
  const caseRows = new Map<string, CaseFact[]>()
  for (const f of openedIn(cases, w)) if (f.processId) push(caseRows, f.processId, f)
  const txRows = new Map<string, TxFact[]>()
  for (const f of dueIn(tx, w)) {
    const id = f.processId ?? TRANSACTION_PROCESS[f.type as TransactionType]
    if (id) push(txRows, id, f)
  }
  return [...covers]
    .map(([id, what]) => {
      const p = ATLAS_PROCESSES.get(id)
      const caseRecords = caseRows.get(id) ?? []
      const txRecords = txRows.get(id) ?? []
      return {
        processId: id,
        process: p?.name ?? id,
        owner: p?.owner ?? '—',
        sla: p?.sla ?? '—',
        covers: what.join(', '),
        cases: countOf(caseRecords),
        transactions: countOf(txRecords),
        caseRecords,
        txRecords,
      }
    })
    .sort((a, b) => (a.processId < b.processId ? -1 : 1))
}
