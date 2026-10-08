/**
 * The two methods Quality of hire compares groups with (docs/ANALYSES.md, 1.6): the interval of a
 * group's mean score, with the "clearly above or below" test against the company, and the score a
 * group's mix of cells would predict, with fallback to coarser cells. Pure and generic, so another
 * analysis can reuse them.
 */

/** Where a group sits against the company once the interval is taken into account. */
export type Clearly = 'above' | 'below' | 'unclear'

export interface MeanInterval {
  n: number
  mean: number | null
  /** Sample standard deviation (n − 1); 0 for a single value. */
  sd: number
  low: number | null
  high: number | null
}

/** Mean ± z × sd ÷ √n, or nulls under `min` values (the anonymity minimum). */
export function meanInterval(values: readonly number[], z: number, min: number): MeanInterval {
  const n = values.length
  if (n === 0 || n < min) return { n, mean: null, sd: 0, low: null, high: null }
  let total = 0
  for (const v of values) total += v
  const mean = total / n
  let ss = 0
  for (const v of values) ss += (v - mean) ** 2
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0
  const half = (z * sd) / Math.sqrt(n)
  return { n, mean, sd, low: mean - half, high: mean + half }
}

/** Clearly above when the low end clears the company, clearly below when the high end is under it. */
export function clearly(i: Pick<MeanInterval, 'low' | 'high'>, company: number | null): Clearly {
  if (company == null || i.low == null || i.high == null) return 'unclear'
  if (i.low > company) return 'above'
  if (i.high < company) return 'below'
  return 'unclear'
}

/** The word a status reads as in tables and exports. */
export const CLEARLY_LABEL: Record<Clearly, string> = {
  above: 'Above',
  below: 'Below',
  unclear: 'Not clearly different',
}

/**
 * Company means per cell, finest first: `cellsOf(member)` lists a member's cells from the finest
 * to the coarsest (site and level band, then site, then ''), and the first with at least `minCell`
 * members company-wide gives its expected value.
 */
export interface MixBenchmark<T> {
  /** The company mean of the first cell of `x` that is large enough, or null when none is. */
  cellMean(x: T): number | null
  /** Mean over the members of their cell means; null when no member has one. */
  expected(members: readonly T[]): number | null
}

export function mixBenchmark<T>(
  company: readonly T[],
  value: (x: T) => number | null,
  cellsOf: (x: T) => readonly string[],
  minCell: number,
): MixBenchmark<T> {
  const sums = new Map<string, { n: number; total: number }>()
  for (const x of company) {
    const v = value(x)
    if (v == null) continue
    for (const k of cellsOf(x)) {
      const s = sums.get(k)
      if (s) {
        s.n++
        s.total += v
      } else sums.set(k, { n: 1, total: v })
    }
  }
  const cellMean = (x: T): number | null => {
    for (const k of cellsOf(x)) {
      const s = sums.get(k)
      if (s && s.n >= minCell) return s.total / s.n
    }
    return null
  }
  return {
    cellMean,
    expected(members) {
      let n = 0
      let total = 0
      for (const m of members) {
        const v = cellMean(m)
        if (v == null) continue
        n++
        total += v
      }
      return n ? total / n : null
    },
  }
}
