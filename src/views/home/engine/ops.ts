/**
 * HR ops' home as data (docs/ROLES-V2.md 5.8; docs/ACTION-CENTER-AUDIT.md 5.6): the open cases by
 * where they stand against their resolution target (the hero's bar), and My list's other two
 * lists: transactions in flight with their due state, and returns from leave in the next 30 days
 * (never the leave reason). Employee relations cases are counted in the bar, never listed. Pure.
 */
import type { ISODate } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { isRowPrivate, SLA_STATES, type SlaState, slaStateOf } from '@/views/services/engine/cases'
import type { CaseFact, TxFact } from '@/views/services/engine/facts'
import type { UpcomingReturn } from '@/views/services/engine/leave'
import type { SplitPaint, SplitPart } from './split'

const SLA_PAINT: Record<SlaState, SplitPaint> = {
  'Past target': 'critical',
  'Due within 24 h': 'warning',
  'Within target': 'series',
  'No target': 'deemph',
}

export interface SlaPart extends SplitPart {
  [key: string]: unknown
  /** Open cases in the state (employee relations ones too: their drill lists the others). */
  facts: CaseFact[]
  /** Employee relations cases among them (counted, never listed). */
  private: number
}

/**
 * Open cases at the end of the as-of day by SLA state, within target first. With `countPrivate`
 * false (a scope under the anonymity minimum) employee relations cases are left out of the count.
 */
export function slaParts(cases: readonly CaseFact[], asOf: ISODate, countPrivate: boolean): SlaPart[] {
  const open = cases.filter((f) => f.open && (countPrivate || !isRowPrivate(f)))
  const order: SlaState[] = ['Within target', 'Due within 24 h', 'Past target', 'No target']
  return order
    .filter((s) => SLA_STATES.includes(s))
    .map((state) => {
      const facts = open.filter((f) => slaStateOf(f, asOf) === state)
      return {
        key: state,
        label: state,
        count: facts.length,
        paint: SLA_PAINT[state],
        facts,
        private: facts.filter(isRowPrivate).length,
      }
    })
}

export type DueState = 'Overdue' | 'Due within 7 d' | 'Due later' | 'No due date'

export interface TxRow {
  [key: string]: unknown
  transactionId: string
  type: string
  employee: string
  employeeId: string
  location: string | null
  submitted: ISODate
  effective: ISODate
  due: ISODate | null
  dueState: DueState
  /** Days past the due date (overdue only). */
  daysLate: number | null
  fact: TxFact
}

const DUE_RANK: Record<DueState, number> = {
  Overdue: 0,
  'Due within 7 d': 1,
  'Due later': 2,
  'No due date': 3,
}

/** Transactions not completed by the as-of date, the most overdue first. */
export function txInFlight(tx: readonly TxFact[], asOf: ISODate, soonDays = 7): TxRow[] {
  return tx
    .filter((f) => !f.completed && f.submitted <= asOf)
    .map((f) => {
      const days = f.due ? daysBetween(asOf, f.due) : null
      const dueState: DueState =
        days == null
          ? 'No due date'
          : days < 0
            ? 'Overdue'
            : days <= soonDays
              ? 'Due within 7 d'
              : 'Due later'
      return {
        transactionId: f.transactionId,
        type: f.type,
        employee: f.name ?? f.employeeId,
        employeeId: f.employeeId,
        location: f.location,
        submitted: f.submitted,
        effective: f.effective,
        due: f.due,
        dueState,
        daysLate: days != null && days < 0 ? -days : null,
        fact: f,
      }
    })
    .sort(
      (a, b) =>
        DUE_RANK[a.dueState] - DUE_RANK[b.dueState] ||
        (b.daysLate ?? 0) - (a.daysLate ?? 0) ||
        (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
        a.transactionId.localeCompare(b.transactionId),
    )
}

export interface ReturnRow {
  [key: string]: unknown
  employee: string
  employeeId: string
  department: string | null
  location: string | null
  expected: ISODate
  daysAway: number
  status: string
  ret: UpcomingReturn
}

/** Planned returns from leave in the next `days` days, soonest first; never the leave reason. */
export function returnsSoon(upcoming: readonly UpcomingReturn[], days = 30): ReturnRow[] {
  return upcoming
    .filter((r) => r.daysAway <= days)
    .map((r) => ({
      employee: r.fact.name ?? r.fact.employeeId,
      employeeId: r.fact.employeeId,
      department: r.fact.department,
      location: r.fact.location,
      expected: r.expected,
      daysAway: r.daysAway,
      status: r.status,
      ret: r,
    }))
    .sort((a, b) => a.daysAway - b.daysAway || a.employee.localeCompare(b.employee))
}
