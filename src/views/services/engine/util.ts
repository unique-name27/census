/** Small helpers shared by the employee services engines. Pure. */
import { MIN_GROUP } from '@/data/schema'
import { addMonths, monthStart, monthsBetween } from '@/lib/dates'

/** A share with its numerator and denominator; the share is null below MIN_GROUP. */
export interface Share {
  rate: number | null
  hits: number
  n: number
}

export function share(hits: number, n: number, min = MIN_GROUP): Share {
  return { rate: n >= min && n > 0 ? hits / n : null, hits, n }
}

/** Share of `true` among the non-null outcomes. */
export function shareOf<T>(rows: readonly T[], get: (r: T) => boolean | null, min = MIN_GROUP): Share {
  let hits = 0
  let n = 0
  for (const r of rows) {
    const v = get(r)
    if (v == null) continue
    n++
    if (v) hits++
  }
  return share(hits, n, min)
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

/**
 * Keep groups with at least `min` members and fold the rest into one "Other (k)" row, so no
 * breakdown shows a group small enough to point at a person.
 */
export function foldSmall<T>(
  rows: readonly T[],
  size: (r: T) => number,
  merge: (rest: T[], label: string) => T,
  min = MIN_GROUP,
): T[] {
  const keep = rows.filter((r) => size(r) >= min)
  const rest = rows.filter((r) => size(r) < min)
  if (!rest.length) return keep.slice()
  return [...keep, merge(rest, `Other (${rest.length})`)]
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
