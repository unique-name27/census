/**
 * Who counts, and the headcount and turnover definitions of `@/lib/people` with the People
 * stats settings applied: the population (employees, or employees and contractors), whether
 * rates are annualized and what counts as a regretted exit. At the defaults every function
 * returns exactly what its `@/lib/people` namesake returns (same arithmetic, same order), so a
 * number means the same thing here as on every other tab until someone changes a setting.
 */
import type { Employee, ISODate } from '@/data/schema'
import type { Window } from '@/data/scope'
import { daysBetween } from '@/lib/dates'
import { inWindow, isActiveAt, isEmployee, NO_EXIT_DATA, type RateResult, snapshotDates } from '@/lib/people'
import type { RegrettedRule } from '../metrics'

/** Whether a roster row counts in headcount (and so in every flow and rate). */
export type Counts = (e: Employee) => boolean

const withContractors: Counts = (e) => e.employmentType === 'Employee' || e.employmentType === 'Contractor'

/** Employees only, or employees and contractors. Interns never count. */
export const countsFor = (contractors: boolean): Counts => (contractors ? withContractors : isEmployee)

/** A regretted exit under a rule: flagged regrettable, and voluntary unless any exit type counts. */
export function regrettedBy(rule: RegrettedRule): (e: Employee) => boolean {
  return rule === 'anyFlagged'
    ? (e) => e.regrettable === true
    : (e) => e.terminationType === 'Voluntary' && e.regrettable === true
}

/** Left within `days` days of their hire date (first-year attrition's numerator). */
export const leftWithin =
  (days: number) =>
  (e: Employee): boolean =>
    !!e.terminationDate && daysBetween(e.hireDate, e.terminationDate) < days

/* ───────── headcount ───────── */

export function activeAt(
  employees: readonly Employee[],
  d: ISODate,
  counts: Counts = isEmployee,
): Employee[] {
  return employees.filter((e) => counts(e) && isActiveAt(e, d))
}

export function headcountAt(employees: readonly Employee[], d: ISODate, counts: Counts = isEmployee): number {
  let n = 0
  for (const e of employees) if (counts(e) && isActiveAt(e, d)) n++
  return n
}

/** Mean of the month-end headcounts (`snapshotDates`), as `@/lib/people` computes it. */
export function avgHeadcount(
  employees: readonly Employee[],
  w: Pick<Window, 'start' | 'end'>,
  counts: Counts = isEmployee,
): number {
  const pts = snapshotDates(w)
  let total = 0
  for (const d of pts) total += headcountAt(employees, d, counts)
  return pts.length ? total / pts.length : 0
}

/* ───────── events ───────── */

export function hiresIn(
  employees: readonly Employee[],
  w: Pick<Window, 'start' | 'end'>,
  counts: Counts = isEmployee,
): Employee[] {
  return employees.filter((e) => counts(e) && inWindow(e.hireDate, w))
}

export function exitsIn(
  employees: readonly Employee[],
  w: Pick<Window, 'start' | 'end'>,
  counts: Counts = isEmployee,
): Employee[] {
  return employees.filter((e) => counts(e) && inWindow(e.terminationDate, w))
}

export type ExitKind = 'all' | 'voluntary' | 'involuntary' | 'regretted'

export interface RateOptions {
  counts?: Counts
  /** Scale by 12 ÷ window months (default on). */
  annualize?: boolean
  /** What counts as regretted (default voluntary and flagged regrettable). */
  regretted?: RegrettedRule
  /** False for an active-only roster: every rate is null with `NO_EXIT_DATA`. */
  exitDataPresent?: boolean
}

/** The events of one exit kind. */
export function exitMatcher(
  kind: ExitKind,
  rule: RegrettedRule = 'voluntaryFlagged',
): (e: Employee) => boolean {
  switch (kind) {
    case 'all':
      return () => true
    case 'voluntary':
      return (e) => e.terminationType === 'Voluntary'
    case 'involuntary':
      return (e) => e.terminationType === 'Involuntary'
    default:
      return regrettedBy(rule)
  }
}

/** Turnover per window: events ÷ average headcount, annualized unless the setting is off. */
export function turnover(events: number, avg: number, w: Pick<Window, 'months'>, annualize = true): number {
  return annualize ? (events / avg) * (12 / w.months) : events / avg
}

/**
 * Attrition for a population over a window, as `@/lib/people` `attrition` defines it: null (never
 * 0) when no exit carries the termination type a kind needs, and for an active-only roster.
 */
export function attrition(
  employees: readonly Employee[],
  w: Window,
  kind: ExitKind = 'all',
  opts: RateOptions = {},
): RateResult {
  const counts = opts.counts ?? isEmployee
  const rule = opts.regretted ?? 'voluntaryFlagged'
  const avg = avgHeadcount(employees, w, counts)
  if (opts.exitDataPresent === false)
    return { rate: null, events: 0, avgHeadcount: avg, reason: NO_EXIT_DATA }
  const exits = exitsIn(employees, w, counts)
  const needsType = kind !== 'all' && !(kind === 'regretted' && rule === 'anyFlagged')
  if (needsType && exits.length > 0 && !exits.some((e) => e.terminationType)) {
    return { rate: null, events: 0, avgHeadcount: avg, reason: 'Termination type is missing' }
  }
  const events = exits.filter(exitMatcher(kind, rule)).length
  if (avg <= 0) return { rate: null, events, avgHeadcount: 0, reason: 'No headcount in this period' }
  return { rate: turnover(events, avg, w, opts.annualize ?? true), events, avgHeadcount: avg }
}
