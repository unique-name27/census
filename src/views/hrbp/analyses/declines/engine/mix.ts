/**
 * The decline rate a group's mix would predict (docs/ANALYSES.md, 1.6 and 3.2): each offer takes
 * the company decline rate of the finest cell it sits in that has at least `minCell` company
 * offers (location × level band, then location, then the company), and the group's expected rate
 * is the mean over its offers. A cut by location leaves location out of the cells and a cut by
 * level leaves the level band out, so a location is measured against its level mix alone. The
 * cells count company offers in the window, so a filter never moves the benchmark. Pure.
 */
import type { Offer } from './offers'

/** The cell dimension a cut leaves out (its own). */
export type MixDrop = 'location' | 'band' | null

interface Tally {
  n: number
  declined: number
}

export interface MixBenchmark {
  /** The company decline rate in the offer's finest cell with enough offers; null with no company offers. */
  cellRate: (o: Offer, drop?: MixDrop) => number | null
  /** The mean of `cellRate` over the offers; null for none. */
  expected: (offers: readonly Offer[], drop?: MixDrop) => number | null
  /** Company offers in the window. */
  companyOffers: number
}

export function mixBenchmark(company: readonly Offer[], minCell: number): MixBenchmark {
  const cells = new Map<string, Tally>()
  const add = (key: string, declined: boolean) => {
    const t = cells.get(key) ?? { n: 0, declined: 0 }
    t.n++
    if (declined) t.declined++
    cells.set(key, t)
  }
  for (const o of company) {
    add('*', o.declined)
    if (o.location) add(`l:${o.location}`, o.declined)
    if (o.band) add(`b:${o.band}`, o.declined)
    if (o.location && o.band) add(`lb:${o.location}|${o.band}`, o.declined)
  }
  const rateAt = (key: string | null, min: number): number | null => {
    if (!key) return null
    const t = cells.get(key)
    return t && t.n >= min ? t.declined / t.n : null
  }
  const cellRate = (o: Offer, drop: MixDrop = null): number | null => {
    const keys =
      drop === 'location'
        ? [o.band ? `b:${o.band}` : null]
        : drop === 'band'
          ? [o.location ? `l:${o.location}` : null]
          : [
              o.location && o.band ? `lb:${o.location}|${o.band}` : null,
              o.location ? `l:${o.location}` : null,
            ]
    for (const k of keys) {
      const r = rateAt(k, minCell)
      if (r != null) return r
    }
    return rateAt('*', 1)
  }
  return {
    cellRate,
    expected: (offers, drop = null) => {
      let sum = 0
      let n = 0
      for (const o of offers) {
        const r = cellRate(o, drop)
        if (r == null) continue
        sum += r
        n++
      }
      return n ? sum / n : null
    },
    companyOffers: company.length,
  }
}

/** z for the 90% interval the group table shows. */
export const Z90 = 1.645

/** Wilson score interval of a rate k ÷ n; null for n = 0. */
export function wilson(k: number, n: number, z = Z90): { low: number; high: number } | null {
  if (n <= 0) return null
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}
