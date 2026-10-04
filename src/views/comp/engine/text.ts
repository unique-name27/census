/** Small copy helpers for findings and notes. Pure. */

import { LEVELS } from '@/data/schema'
import type { PeriodPreset } from '@/data/scope'
import { DASH, fmt, isNum, MINUS } from '@/lib/format'
import { formatParamNumber } from '@/metrics/params'

/**
 * "+0.81 pts": a gap between two percentages at two decimals, for merit spend against a budget
 * where a few hundredths of a point matter. No sign when it rounds to zero; true minus for negatives.
 */
export function pts2(v: number | null | undefined): string {
  if (!isNum(v)) return DASH
  const s = (Math.abs(v) * 100).toFixed(2)
  const sign = !/[1-9]/.test(s) ? '' : v > 0 ? '+' : MINUS
  return `${sign}${s} pts`
}

/** A share as `fmt(v, 'pct2')` shows it, in percent at two decimals: 3.54 for 0.035449. */
const shownPct2 = (v: number): number => Number((v * 100).toFixed(2))

/**
 * a − b between two shares, worked out from the values a reader sees (both at two decimals, as
 * pct2 shows them), so "3.54%, 0.10 pts above the 3.44%" always adds up. A fraction, for pts2.
 */
export function shownGap(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!isNum(a) || !isNum(b)) return null
  return Math.round((shownPct2(a) - shownPct2(b)) * 100) / 10_000
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

/** A setting's share as the dictionary shows it, trimmed: "2%", "2.5%", "0.25%". */
export const settingPct = (v: number): string => formatParamNumber(v, { type: 'percent' })

/** A setting's points, trimmed: "3 pts", "0.2 pts". */
export const settingPts = (v: number): string => formatParamNumber(v, { type: 'percent', format: 'pts' })

/** A finding headline as a sentence: ends with a period, like every other practice's readout. */
export const sentence = (t: string): string => (/[.?!]$/.test(t) ? t : `${t}.`)
