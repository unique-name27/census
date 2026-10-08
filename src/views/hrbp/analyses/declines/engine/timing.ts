/**
 * Speed (docs/ANALYSES.md, 3.2 and 3.6.4-5): the decline rate by days from the final interview to
 * the offer (0-7, 8-14, 15-21, 22+) and by days from the offer to the decision (0-3, 4-7, 8-14,
 * 15+), and the median days to decide for declined and accepted offers. A bucket under the
 * anonymity minimum of offers shows the dash. Pure.
 */
import { median } from '@/lib/stats'
import { declineCount, type Offer } from './offers'

export interface Bucket {
  key: string
  /** Inclusive day bounds; `hi` null for the open last bucket. */
  lo: number
  hi: number | null
}

export const OFFER_BUCKETS: readonly Bucket[] = [
  { key: '0-7 d', lo: 0, hi: 7 },
  { key: '8-14 d', lo: 8, hi: 14 },
  { key: '15-21 d', lo: 15, hi: 21 },
  { key: '22+ d', lo: 22, hi: null },
]

export const DECIDE_BUCKETS: readonly Bucket[] = [
  { key: '0-3 d', lo: 0, hi: 3 },
  { key: '4-7 d', lo: 4, hi: 7 },
  { key: '8-14 d', lo: 8, hi: 14 },
  { key: '15+ d', lo: 15, hi: null },
]

export const inBucket = (b: Bucket, days: number): boolean => days >= b.lo && (b.hi == null || days <= b.hi)

export type TimingKind = 'toOffer' | 'toDecide'

export interface BucketRow {
  kind: TimingKind
  bucket: string
  resolved: number
  /** Null with the rate under the minimum. */
  declined: number | null
  rate: number | null
  /** The offers behind the bar; empty when hidden. */
  offers: Offer[]
}

export const daysOf = (kind: TimingKind) => (o: Offer) =>
  kind === 'toOffer' ? o.daysToOffer : o.daysToDecide

export function bucketRows(
  offers: readonly Offer[],
  kind: TimingKind,
  min: number,
): { rows: BucketRow[]; measured: Offer[] } {
  const days = daysOf(kind)
  const measured = offers.filter((o) => days(o) != null)
  const buckets = kind === 'toOffer' ? OFFER_BUCKETS : DECIDE_BUCKETS
  const rows = buckets.map((b) => {
    const list = measured.filter((o) => inBucket(b, days(o) as number))
    const c = declineCount(list)
    const show = c.resolved >= min
    return {
      kind,
      bucket: b.key,
      resolved: c.resolved,
      declined: show ? c.declined : null,
      rate: show ? c.rate : null,
      offers: show ? list : [],
    }
  })
  return { rows, measured }
}

/**
 * Whether the buckets show no clear link: no shown bucket is `gap` or more away from the rate over
 * all the measured offers (the chart's note says so).
 */
export function isFlat(rows: readonly BucketRow[], overall: number | null, gap: number): boolean {
  if (overall == null) return false
  const shown = rows.filter((r) => r.rate != null)
  return shown.length >= 2 && shown.every((r) => Math.abs((r.rate as number) - overall) < gap)
}

export interface DecideSplit {
  /** Decided within the slow window (days ≤ slowDays) and after it. */
  quick: Offer[]
  slow: Offer[]
}

export const decideSplit = (offers: readonly Offer[], slowDays: number): DecideSplit => {
  const measured = offers.filter((o) => o.daysToDecide != null)
  return {
    quick: measured.filter((o) => (o.daysToDecide as number) <= slowDays),
    slow: measured.filter((o) => (o.daysToDecide as number) > slowDays),
  }
}

/** Median days to decide over offers with an offer date; null under the minimum. */
export function medianDaysToDecide(
  offers: readonly Offer[],
  min: number,
): { days: number | null; n: number } {
  const xs = offers.map((o) => o.daysToDecide).filter((d): d is number => d != null)
  return { days: xs.length >= min ? median(xs) : null, n: xs.length }
}
