/**
 * The service level scorecard: one row per measurable Atlas KPI, with the actual for the window,
 * the gap to target and a status.
 *
 * Business-day clocks use Monday to Friday with no holiday calendar (businessDaysBetween). A case
 * still open past its clock counts as missed. Status: Met; At risk when within 5 pts of a
 * percentage target (or within 10% of a day target); otherwise Missed. Fewer than 5 cases or
 * transactions give no actual.
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
import { openedIn, resolvedIn } from './cases'
import {
  AT_RISK_DAYS_SHARE,
  AT_RISK_PTS,
  ATLAS_PROCESSES,
  SERVICE_LEVELS,
  type ServiceLevelDef,
  type ServiceLevelId,
} from './catalog'
import { type CaseFact, dueIn, onTimeRate, type TxFact } from './facts'
import { retroShare } from './transactions'

export type LevelStatus = 'Met' | 'At risk' | 'Missed'

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
  n: number
  window: string
  /** Rows behind the actual that missed (case or transaction IDs). */
  misses: string[]
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
  misses: string[]
}

const none: Measured = { actual: null, n: 0, misses: [] }

/** Share of cases opened in the window whose clock (in business days) stopped in time. */
function businessDayShare(
  rows: readonly CaseFact[],
  days: number,
  stop: (f: CaseFact) => string | null,
  asOf: string,
): Measured {
  let hits = 0
  let n = 0
  const misses: string[] = []
  for (const f of rows) {
    const end = stop(f)
    if (end) {
      n++
      if (businessDaysBetween(f.opened, end) <= days) hits++
      else misses.push(f.caseId)
    } else if (f.open && businessDaysBetween(f.opened, asOf) > days) {
      n++
      misses.push(f.caseId)
    }
  }
  return { actual: n >= MIN_GROUP ? hits / n : null, n, misses }
}

function txShare(rows: readonly TxFact[]): Measured {
  const r = onTimeRate(rows)
  const misses = rows
    .filter((f) => f.outcome === 'late' || f.outcome === 'overdue')
    .map((f) => f.transactionId)
  return { actual: r.n >= MIN_GROUP ? (r.n - r.late) / r.n : null, n: r.n, misses }
}

function measure(def: ServiceLevelDef, x: LevelInputs): Measured {
  const opened = openedIn(x.cases, x.window)
  const cat = (name: string) => opened.filter((f) => f.category === name)
  const resolvedBy = (f: CaseFact) => f.resolved
  const respondedBy = (f: CaseFact) => f.responded
  const due = dueIn(x.tx, x.window)
  const txOf = (type: string) => due.filter((f) => f.type === type)
  switch (def.id) {
    case 'py05-payroll-2bd':
      return x.hasResolved ? businessDayShare(cat('Payroll'), 2, resolvedBy, x.asOf) : none
    case 'ds07-verification-2bd':
      return x.hasResolved ? businessDayShare(cat('Employment verification'), 2, resolvedBy, x.asOf) : none
    case 'ds04-access-2bd':
      return x.hasResolved ? businessDayShare(cat('Systems access'), 2, resolvedBy, x.asOf) : none
    case 'bn03-benefits-5bd':
      return x.hasResolved ? businessDayShare(cat('Benefits'), 5, resolvedBy, x.asOf) : none
    case 'lv01-leave-response-1bd':
      return x.hasResponse ? businessDayShare(cat('Leave & accommodation'), 1, respondedBy, x.asOf) : none
    case 'mv06-immigration-response-1bd':
      return x.hasResponse ? businessDayShare(cat('Immigration & mobility'), 1, respondedBy, x.asOf) : none
    case 'er02-median-days': {
      if (!x.hasResolved) return none
      const closed = resolvedIn(x.cases, x.window).filter(
        (f) => f.category === 'Employee relations' && f.resolutionHours != null,
      )
      const days = closed.map((f) => (f.resolutionHours as number) / 24)
      const misses = closed
        .filter((f) => (f.resolutionHours as number) / 24 > def.target)
        .map((f) => f.caseId)
      return { actual: days.length >= MIN_GROUP ? median(days) : null, n: days.length, misses }
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
      const misses = due.filter((f) => f.retro === true).map((f) => f.transactionId)
      return { actual: r.n >= MIN_GROUP ? r.rate : null, n: r.n, misses }
    }
  }
}

/** Status of an actual against its target. */
export function levelStatus(def: ServiceLevelDef, actual: number | null): LevelStatus | null {
  if (actual == null) return null
  const band = def.unit === 'days' ? def.target * AT_RISK_DAYS_SHARE : AT_RISK_PTS
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

export function scorecard(x: LevelInputs): LevelRow[] {
  return SERVICE_LEVELS.map((def) => {
    const m = measure(def, x)
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
      n: m.n,
      window: x.window.label,
      misses: m.misses,
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
  cases: number
  transactions: number
}

/**
 * Every Atlas process that governs a case category or a transaction type, with the volume it
 * carried in the window: cases opened and transactions due.
 */
export function processCoverage(cases: readonly CaseFact[], tx: readonly TxFact[], w: Window): ProcessRow[] {
  const covers = new Map<string, string[]>()
  const add = (id: string, what: string) => covers.set(id, [...(covers.get(id) ?? []), what])
  for (const c of CASE_CATEGORIES) add(c.processId, `${c.category} cases`)
  for (const t of TRANSACTION_TYPES) add(TRANSACTION_PROCESS[t], `${t} transactions`)
  const caseCount = new Map<string, number>()
  for (const f of openedIn(cases, w))
    if (f.processId) caseCount.set(f.processId, (caseCount.get(f.processId) ?? 0) + 1)
  const txCount = new Map<string, number>()
  for (const f of dueIn(tx, w)) {
    const id = f.processId ?? TRANSACTION_PROCESS[f.type as TransactionType]
    if (id) txCount.set(id, (txCount.get(id) ?? 0) + 1)
  }
  return [...covers]
    .map(([id, what]) => {
      const p = ATLAS_PROCESSES.get(id)
      return {
        processId: id,
        process: p?.name ?? id,
        owner: p?.owner ?? '—',
        sla: p?.sla ?? '—',
        covers: what.join(', '),
        cases: caseCount.get(id) ?? 0,
        transactions: txCount.get(id) ?? 0,
      }
    })
    .sort((a, b) => (a.processId < b.processId ? -1 : 1))
}
