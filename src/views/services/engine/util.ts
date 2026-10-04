/** Small helpers shared by the employee services engines. Pure. */
import { MIN_GROUP } from '@/data/schema'
import { addMonths, monthStart, monthsBetween } from '@/lib/dates'

/**
 * Anything counted per person: a case (its requester) or a transaction (its employee). Rates and
 * breakdowns are suppressed by the number of distinct people behind them, not the number of rows,
 * so nine cases from four executives never yield a rate.
 */
export interface Personal {
  person: string
}

/** Distinct people behind the rows. */
export function peopleIn(rows: readonly Personal[]): number {
  const seen = new Set<string>()
  for (const r of rows) seen.add(r.person)
  return seen.size
}

/** True when a group is large enough to show a rate: at least MIN_GROUP rows and MIN_GROUP people. */
export const isShowable = (n: number, people: number, min = MIN_GROUP): boolean =>
  n > 0 && n >= min && people >= min

/** A share with its numerator, denominator and people; the share is null below MIN_GROUP. */
export interface Share {
  rate: number | null
  hits: number
  n: number
  people: number
}

export function share(hits: number, n: number, people: number, min = MIN_GROUP): Share {
  return { rate: isShowable(n, people, min) ? hits / n : null, hits, n, people }
}

/** Share of `true` among the non-null outcomes; people counted among the judged rows. */
export function shareOf<T extends Personal>(
  rows: readonly T[],
  get: (r: T) => boolean | null,
  min = MIN_GROUP,
): Share {
  let hits = 0
  let n = 0
  const people = new Set<string>()
  for (const r of rows) {
    const v = get(r)
    if (v == null) continue
    n++
    people.add(r.person)
    if (v) hits++
  }
  return share(hits, n, people.size, min)
}

/** Month keys (YYYY-MM) for the n months ending with the as-of month. */
export function trailingMonths(asOf: string, n: number): string[] {
  return monthsBetween(addMonths(monthStart(asOf), -(n - 1)), asOf)
}

/** A duration in hours shown as hours below 48 h and as days from 48 h. */
export function duration(hours: number | null): { value: number | null; format: 'hours' | 'days' } {
  if (hours == null) return { value: null, format: 'hours' }
  return hours >= 48 ? { value: hours / 24, format: 'days' } : { value: hours, format: 'hours' }
}

/** A group of rows behind one line of a breakdown. */
export interface Group<T> {
  key: string
  rows: T[]
  /** Number of small groups folded into this one ("Other (k)"); 0 for a real group. */
  folded: number
}

/**
 * Keep groups behind at least `min` people and fold the rest into one "Other (k)" group appended
 * last, so no breakdown shows a group small enough to point at a person. The folded group's own
 * rates still go through `share`, so an "Other" smaller than `min` people shows no rate either.
 */
export function foldGroups<T extends Personal>(
  groups: Iterable<readonly [string, readonly T[]]>,
  min = MIN_GROUP,
): Group<T>[] {
  const keep: Group<T>[] = []
  const rest: T[] = []
  let folded = 0
  for (const [key, rows] of groups) {
    if (peopleIn(rows) >= min) keep.push({ key, rows: rows.slice(), folded: 0 })
    else {
      folded++
      rest.push(...rows)
    }
  }
  if (folded) keep.push({ key: `Other (${folded})`, rows: rest, folded })
  return keep
}

export const isOther = (label: string): boolean => /^Other \(\d+\)$/.test(label)

/**
 * A count that is the numerator of a rate: hidden with the rate, so "1 of 3 late" never sits
 * beside a hidden on-time rate and gives it away.
 */
export const hitsOf = (rate: number | null, hits: number): number | null => (rate == null ? null : hits)

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
