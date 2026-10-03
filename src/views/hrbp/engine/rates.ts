/**
 * Group-level exit rates in one pass, using the shared definitions from `@/lib/people`:
 * events in the window ÷ mean month-end headcount (snapshotDates), annualized by
 * 12 ÷ window.months, suppressed below MIN_GROUP average headcount.
 */
import { type Employee, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { daysBetween } from '@/lib/dates'
import { inWindow, isActiveAt, isEmployee, snapshotDates } from '@/lib/people'

export interface GroupExits {
  key: string
  avgHeadcount: number
  exits: number
  voluntary: number
  involuntary: number
  regretted: number
}

/** Annualized rate, or null below the anonymity floor or with no headcount. */
export function annualRate(events: number, avgHeadcount: number, w: Pick<Window, 'months'>): number | null {
  if (!(avgHeadcount >= MIN_GROUP) || !(w.months > 0)) return null
  return (events / avgHeadcount) * (12 / w.months)
}

/**
 * Exits and average headcount per group. `key` returns the group of an employee (null skips
 * them); `keyAt` optionally gives the group on a snapshot date (e.g. level at that date).
 */
export function exitsByGroup(
  employees: readonly Employee[],
  w: Window,
  key: (e: Employee) => string | null,
  keyAt?: (e: Employee, d: string) => string | null,
): Map<string, GroupExits> {
  const pts = snapshotDates(w)
  const out = new Map<string, GroupExits>()
  const get = (k: string) => {
    let g = out.get(k)
    if (!g) {
      g = { key: k, avgHeadcount: 0, exits: 0, voluntary: 0, involuntary: 0, regretted: 0 }
      out.set(k, g)
    }
    return g
  }
  for (const e of employees) {
    if (!isEmployee(e)) continue
    const k = key(e)
    for (const d of pts) {
      if (!isActiveAt(e, d)) continue
      const kd = keyAt ? keyAt(e, d) : k
      if (kd != null) get(kd).avgHeadcount += 1
    }
    if (k != null && inWindow(e.terminationDate, w)) {
      const g = get(k)
      g.exits++
      if (e.terminationType === 'Voluntary') {
        g.voluntary++
        if (e.regrettable === true) g.regretted++
      } else if (e.terminationType === 'Involuntary') g.involuntary++
    }
  }
  for (const g of out.values()) g.avgHeadcount /= pts.length
  return out
}

/** First-year attrition for a cohort list (hired 12-24 months before asOf), matching `firstYearAttrition`. */
export function leftInFirstYear(e: Employee): boolean {
  return !!e.terminationDate && daysBetween(e.hireDate, e.terminationDate) < 365
}
