/**
 * Due dates in words and buckets, against the as-of date (the data's "today"). Pure.
 */
import type { ISODate } from '@/data/schema'
import { daysBetween, isValidDate } from '@/lib/dates'

/** Where an item's due date falls: before the as-of date, within the look-ahead, later, or none. */
export type DueBucket = 'overdue' | 'soon' | 'later' | 'none'

export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'soon', 'later', 'none']

/** Labels for the Due filter and the due-date chart; `soonDays` is the look-ahead setting. */
export function dueBucketLabel(b: DueBucket, soonDays: number): string {
  switch (b) {
    case 'overdue':
      return 'Overdue'
    case 'soon':
      return `Due within ${soonDays} d`
    case 'later':
      return 'Due later'
    default:
      return 'No due date'
  }
}

/** Days from the as-of date to the due date: negative when overdue, null without a valid date. */
export function daysToDue(due: ISODate | null | undefined, asOf: ISODate): number | null {
  return due && isValidDate(due) ? daysBetween(asOf, due) : null
}

export function dueBucket(due: ISODate | null | undefined, asOf: ISODate, soonDays: number): DueBucket {
  const d = daysToDue(due, asOf)
  if (d == null) return 'none'
  if (d < 0) return 'overdue'
  return d <= soonDays ? 'soon' : 'later'
}

/** "4 d overdue", "Due today", "Due in 3 d", "No due date". */
export function dueText(due: ISODate | null | undefined, asOf: ISODate): string {
  const d = daysToDue(due, asOf)
  if (d == null) return 'No due date'
  if (d < 0) return `${-d} d overdue`
  return d === 0 ? 'Due today' : `Due in ${d} d`
}
