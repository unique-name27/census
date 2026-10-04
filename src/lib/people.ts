/**
 * Workforce definitions shared by every view, so "attrition" means the same thing on the HRBP,
 * Talent and Compensation tabs. Pure functions over the schema types.
 *
 * Conventions (see ARCHITECTURE.md):
 *  - only `employmentType === 'Employee'` counts (contractors and interns are reported separately);
 *  - active on d: hireDate <= d and (no terminationDate or terminationDate > d);
 *  - average headcount = mean of month-end snapshots, starting the day before the window opens
 *    (13 points for a 12-month window);
 *  - turnover rates are annualized by 12 / window.months.
 */

import type { Employee, ISODate, Review } from '@/data/schema'
import type { Window } from '@/data/scope'
import { isActiveAt, isEmployee } from '@/data/scope'
import { addDays, addMonths, daysBetween, monthEnd, ms } from './dates'

export { isActiveAt, isEmployee }

const YEAR = 365.25

/* ───────── headcount ───────── */

export function activeAt(employees: readonly Employee[], d: ISODate): Employee[] {
  return employees.filter((e) => isEmployee(e) && isActiveAt(e, d))
}

export function headcountAt(employees: readonly Employee[], d: ISODate): number {
  let n = 0
  for (const e of employees) if (isEmployee(e) && isActiveAt(e, d)) n++
  return n
}

/** Snapshot dates for a window: the day before it opens, each month end inside it, and its last day. */
export function snapshotDates(w: Pick<Window, 'start' | 'end'>): ISODate[] {
  const pts: ISODate[] = [addDays(w.start, -1)]
  let me = monthEnd(w.start)
  while (me < w.end) {
    if (me > pts[pts.length - 1]) pts.push(me)
    me = monthEnd(addMonths(`${me.slice(0, 7)}-01`, 1))
  }
  if (w.end > pts[pts.length - 1]) pts.push(w.end)
  return pts
}

export function avgHeadcount(employees: readonly Employee[], w: Pick<Window, 'start' | 'end'>): number {
  const pts = snapshotDates(w)
  let total = 0
  for (const d of pts) total += headcountAt(employees, d)
  return pts.length ? total / pts.length : 0
}

/* ───────── events ───────── */

export const inWindow = (d: string | null | undefined, w: Pick<Window, 'start' | 'end'>): boolean =>
  !!d && d.slice(0, 10) >= w.start && d.slice(0, 10) <= w.end

export function hiresIn(employees: readonly Employee[], w: Pick<Window, 'start' | 'end'>): Employee[] {
  return employees.filter((e) => isEmployee(e) && inWindow(e.hireDate, w))
}

export function exitsIn(employees: readonly Employee[], w: Pick<Window, 'start' | 'end'>): Employee[] {
  return employees.filter((e) => isEmployee(e) && inWindow(e.terminationDate, w))
}

export type ExitKind = 'all' | 'voluntary' | 'involuntary' | 'regretted'

export interface RateResult {
  /** Annualized rate as a fraction (0.12 = 12%), or null when it can't be computed honestly. */
  rate: number | null
  events: number
  avgHeadcount: number
  /** Why the rate is null, in plain words. */
  reason?: string
}

/**
 * Annualized attrition for a population over a window. Voluntary, involuntary and regretted
 * rates are null when no exit in the window carries a termination type (a missing column must
 * never read as 0%).
 */
export function attrition(employees: readonly Employee[], w: Window, kind: ExitKind = 'all'): RateResult {
  const avg = avgHeadcount(employees, w)
  const exits = exitsIn(employees, w)
  if (kind !== 'all' && exits.length > 0 && !exits.some((e) => e.terminationType)) {
    return { rate: null, events: 0, avgHeadcount: avg, reason: 'Termination type is missing' }
  }
  const events = exits.filter((e) =>
    kind === 'all'
      ? true
      : kind === 'voluntary'
        ? e.terminationType === 'Voluntary'
        : kind === 'involuntary'
          ? e.terminationType === 'Involuntary'
          : e.terminationType === 'Voluntary' && e.regrettable === true,
  ).length
  if (avg <= 0) return { rate: null, events, avgHeadcount: 0, reason: 'No headcount in this period' }
  return { rate: (events / avg) * (12 / w.months), events, avgHeadcount: avg }
}

/**
 * First-year attrition: of employees hired 12-24 months before asOf, the share who left within
 * 365 days of starting. Null when the cohort is empty.
 */
export function firstYearAttrition(
  employees: readonly Employee[],
  asOf: ISODate,
): { rate: number | null; cohort: number; leavers: number } {
  const from = addMonths(asOf, -24)
  const to = addMonths(asOf, -12)
  const cohort = employees.filter((e) => isEmployee(e) && e.hireDate > from && e.hireDate <= to)
  const leavers = cohort.filter(
    (e) => e.terminationDate && daysBetween(e.hireDate, e.terminationDate) < 365,
  ).length
  return { rate: cohort.length ? leavers / cohort.length : null, cohort: cohort.length, leavers }
}

/** Of employees active 12 months before asOf, the share still active at asOf. */
export function retention12(
  employees: readonly Employee[],
  asOf: ISODate,
): { rate: number | null; base: number } {
  const start = addMonths(asOf, -12)
  const base = activeAt(employees, start)
  const kept = base.filter((e) => isActiveAt(e, asOf)).length
  return { rate: base.length ? kept / base.length : null, base: base.length }
}

/* ───────── tenure ───────── */

export function tenureYears(e: Employee, d: ISODate): number {
  const end = e.terminationDate && e.terminationDate < d ? e.terminationDate : d
  return Math.max(0, (ms(end) - ms(e.hireDate)) / 86_400_000 / YEAR)
}

export const TENURE_BANDS = ['Under 1 yr', '1-2 yrs', '2-5 yrs', '5-10 yrs', '10+ yrs'] as const
export type TenureBand = (typeof TENURE_BANDS)[number]
export function tenureBand(years: number): TenureBand {
  if (years < 1) return 'Under 1 yr'
  if (years < 2) return '1-2 yrs'
  if (years < 5) return '2-5 yrs'
  if (years < 10) return '5-10 yrs'
  return '10+ yrs'
}

/* ───────── org structure ───────── */

/**
 * Active direct reports per manager at d (managers = anyone with >= 1 active direct). By default
 * only employees count; with `allWorkers`, contractors and interns count too, as in the sample
 * company's spans of control ("active direct reports, all worker types").
 */
export function directReports(
  employees: readonly Employee[],
  d: ISODate,
  opts: { allWorkers?: boolean } = {},
): Map<string, Employee[]> {
  const out = new Map<string, Employee[]>()
  for (const e of employees) {
    if (!opts.allWorkers && !isEmployee(e)) continue
    if (!isActiveAt(e, d) || !e.managerId || e.managerId === e.employeeId) continue
    const arr = out.get(e.managerId)
    if (arr) arr.push(e)
    else out.set(e.managerId, [e])
  }
  return out
}

/* ───────── reviews ───────── */

export interface ReviewIndex {
  /** Reviews per employee, oldest cycle first. */
  byEmployee: Map<string, Review[]>
  /** Distinct cycles, oldest first. */
  cycles: { cycle: string; cycleDate: ISODate }[]
}

export function buildReviewIndex(reviews: readonly Review[]): ReviewIndex {
  const byEmployee = new Map<string, Review[]>()
  const cycles = new Map<string, ISODate>()
  for (const r of reviews) {
    const arr = byEmployee.get(r.employeeId)
    if (arr) arr.push(r)
    else byEmployee.set(r.employeeId, [r])
    if (!cycles.has(r.cycle) || cycles.get(r.cycle)! < r.cycleDate) cycles.set(r.cycle, r.cycleDate)
  }
  for (const arr of byEmployee.values()) arr.sort((a, b) => (a.cycleDate < b.cycleDate ? -1 : 1))
  return {
    byEmployee,
    cycles: [...cycles.entries()]
      .map(([cycle, cycleDate]) => ({ cycle, cycleDate }))
      .sort((a, b) => (a.cycleDate < b.cycleDate ? -1 : 1)),
  }
}

/** Most recent review on or before d (any cycle). */
export function reviewAt(idx: ReviewIndex, employeeId: string, d: ISODate): Review | null {
  const arr = idx.byEmployee.get(employeeId)
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].cycleDate <= d) return arr[i]
  return null
}

/** Latest cycle that closed on or before d. */
export function latestCycle(idx: ReviewIndex, d: ISODate): { cycle: string; cycleDate: ISODate } | null {
  for (let i = idx.cycles.length - 1; i >= 0; i--) if (idx.cycles[i].cycleDate <= d) return idx.cycles[i]
  return null
}

/* ───────── series ───────── */

/** The last n quarter-end dates up to asOf (asOf itself is the final point). */
export function quarterPoints(asOf: ISODate, n: number): ISODate[] {
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 0; i--) pts.push(i === 0 ? asOf : addMonths(asOf, -3 * i))
  return pts
}

/** The last n month-end dates up to asOf (asOf itself is the final point). */
export function monthPoints(asOf: ISODate, n: number): ISODate[] {
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 1; i--) pts.push(monthEnd(addMonths(`${asOf.slice(0, 7)}-01`, -i)))
  pts.push(asOf)
  return pts
}
