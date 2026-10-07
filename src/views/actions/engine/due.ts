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

/**
 * Finer due-date bands for the due timeline, stalest first: weeks overdue, the weeks ahead, then
 * later and no due date. Days count from the as-of date (negative is overdue).
 */
export type DueBand =
  | 'over8w'
  | 'over4w'
  | 'over2w'
  | 'over1w'
  | 'overDays'
  | 'next7'
  | 'next14'
  | 'next28'
  | 'later'
  | 'none'

export const DUE_BANDS: readonly DueBand[] = [
  'over8w',
  'over4w',
  'over2w',
  'over1w',
  'overDays',
  'next7',
  'next14',
  'next28',
  'later',
  'none',
]

export const DUE_BAND_LABEL: Readonly<Record<DueBand, string>> = {
  over8w: '8+ wk overdue',
  over4w: '4 to 8 wk overdue',
  over2w: '2 to 4 wk overdue',
  over1w: '1 to 2 wk overdue',
  overDays: '1 to 6 d overdue',
  next7: 'Due in 0 to 6 d',
  next14: 'Due in 7 to 13 d',
  next28: 'Due in 2 to 4 wk',
  later: 'Due in 4+ wk',
  none: 'No due date',
}

/** The band a due date falls in, against the as-of date. */
export function dueBand(due: ISODate | null | undefined, asOf: ISODate): DueBand {
  const d = daysToDue(due, asOf)
  if (d == null) return 'none'
  if (d < 0) {
    const late = -d
    return late >= 56
      ? 'over8w'
      : late >= 28
        ? 'over4w'
        : late >= 14
          ? 'over2w'
          : late >= 7
            ? 'over1w'
            : 'overDays'
  }
  return d <= 6 ? 'next7' : d <= 13 ? 'next14' : d <= 27 ? 'next28' : 'later'
}
