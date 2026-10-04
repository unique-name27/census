/**
 * Group-level exit rates in one pass, using the shared definitions from `@/lib/people`:
 * events in the window ÷ mean month-end headcount (snapshotDates), annualized by
 * 12 ÷ window.months, suppressed below the anonymity minimum. The population, the annualizing
 * and what counts as regretted follow the People stats settings (`./settings`).
 */
import type { Employee } from '@/data/schema'
import type { Window } from '@/data/scope'
import { inWindow, isActiveAt, isEmployee, snapshotDates } from '@/lib/people'
import { type Counts, leftWithin, regrettedBy, turnover } from './population'
import { defaultSettings, type HrbpSettings } from './settings'

export interface GroupExits {
  key: string
  avgHeadcount: number
  exits: number
  voluntary: number
  involuntary: number
  regretted: number
  /** The employees behind `exits`, in roster order (voluntary and regretted are subsets). */
  leavers: Employee[]
}

/**
 * Annualized rate (or not, when the setting is off), or null below the anonymity minimum or with
 * no headcount.
 */
export function annualRate(
  events: number,
  avgHeadcount: number,
  w: Pick<Window, 'months'>,
  s: Pick<HrbpSettings, 'minGroup' | 'annualize'> = defaultSettings(),
): number | null {
  if (!(avgHeadcount >= s.minGroup) || !(w.months > 0)) return null
  return turnover(events, avgHeadcount, w, s.annualize)
}

export interface GroupOptions {
  /** Who counts (default employees only). */
  counts?: Counts
  /** What counts as regretted (default voluntary and flagged regrettable). */
  isRegretted?: (e: Employee) => boolean
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
  opts: GroupOptions = {},
): Map<string, GroupExits> {
  const counts = opts.counts ?? isEmployee
  const isRegretted = opts.isRegretted ?? regrettedBy('voluntaryFlagged')
  const pts = snapshotDates(w)
  const out = new Map<string, GroupExits>()
  const get = (k: string) => {
    let g = out.get(k)
    if (!g) {
      g = { key: k, avgHeadcount: 0, exits: 0, voluntary: 0, involuntary: 0, regretted: 0, leavers: [] }
      out.set(k, g)
    }
    return g
  }
  for (const e of employees) {
    if (!counts(e)) continue
    const k = key(e)
    for (const d of pts) {
      if (!isActiveAt(e, d)) continue
      const kd = keyAt ? keyAt(e, d) : k
      if (kd != null) get(kd).avgHeadcount += 1
    }
    if (k != null && inWindow(e.terminationDate, w)) {
      const g = get(k)
      g.exits++
      g.leavers.push(e)
      if (e.terminationType === 'Voluntary') g.voluntary++
      else if (e.terminationType === 'Involuntary') g.involuntary++
      if (isRegretted(e)) g.regretted++
    }
  }
  for (const g of out.values()) g.avgHeadcount /= pts.length
  return out
}

/**
 * Left within the first-year window of their hire date (365 days by default), matching
 * `firstYearAttrition`. Inside the engine use `Prep.leftFirstYear`, which follows the setting.
 */
export function leftInFirstYear(e: Employee): boolean {
  return leftWithin(defaultSettings().firstYearDays)(e)
}
