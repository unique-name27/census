/** Small copy helpers for findings and notes. Pure. */

import { LEVELS } from '@/data/schema'
import type { PeriodPreset } from '@/data/scope'
import { fmt } from '@/lib/format'

/** "3.54%": two decimals, for merit spend against a budget where 0.1 pts matters. */
export function pct2(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(2)}%`
}

/** "1.58×" */
export function times(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '—' : `${fmt(v, 'num2')}×`
}

/** "a", "a and b", "a, b and c" */
export function joinAnd(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** "L3-L4" for consecutive levels, else "L3 and L5". */
export function levelSpan(levels: readonly string[]): string {
  const sorted = [...new Set(levels)].sort(
    (a, b) => LEVELS.indexOf(a as never) - LEVELS.indexOf(b as never) || a.localeCompare(b),
  )
  if (sorted.length < 2) return sorted[0] ?? ''
  const idx = sorted.map((l) => LEVELS.indexOf(l as never))
  const consecutive = idx.every((v, i) => v >= 0 && (i === 0 || v === idx[i - 1] + 1))
  return consecutive ? `${sorted[0]}-${sorted[sorted.length - 1]}` : joinAnd(sorted)
}

/** The reporting window in words, for sentences ("over the last 12 months"). */
export function windowPhrase(period: PeriodPreset): string {
  switch (period) {
    case 't12m':
      return 'the last 12 months'
    case 't6m':
      return 'the last 6 months'
    case 't3m':
      return 'the last 3 months'
    case 'ytd':
      return 'the year to date'
    case 'lastQuarter':
      return 'the last full quarter'
    case 'custom':
      return 'the selected period'
  }
}

/** "1 person" / "12 people" without the count formatting surprises of plural(). */
export function people(n: number): string {
  return `${fmt(n, 'int')} ${n === 1 ? 'person' : 'people'}`
}

/** "is" / "are" agreement for counts. */
export const isAre = (n: number): string => (n === 1 ? 'is' : 'are')
