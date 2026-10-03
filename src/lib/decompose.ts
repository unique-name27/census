/**
 * Root-cause decomposition: where does a problem concentrate?
 *
 * Ported from the user's recruiting tool and generalized. For each dimension (department,
 * location, level, ...) and each value of it, compare the segment against everything else:
 *
 *  - rate mode: segRate = affected in segment / segment population, compRate = the same for the
 *    complement. A segment qualifies when segRate - compRate > minDev (2 pts by default).
 *    impact = (segment share of all affected) × deviation.
 *  - median mode: the segment's median value vs the complement's; qualifies when the relative
 *    deviation exceeds minDev (10% by default). impact = share × relative deviation.
 *
 * Segments with fewer than `minAffected` affected rows are damped ×0.2 and flagged small.
 */
import { median } from './stats'

export interface Dimension<T> {
  key: string
  label: string
  get: (row: T) => string | null | undefined
}

export interface Segment {
  dim: string
  dimLabel: string
  value: string
  /** Affected rows in the segment (rate mode) or rows with a value (median mode). */
  affected: number
  population: number
  /** Segment rate (rate mode) or median (median mode). */
  segValue: number
  /** Complement rate or median. */
  compValue: number
  /** Share of all affected rows that sit in this segment. */
  share: number
  impact: number
  small: boolean
}

export function decomposeRate<T>(
  rows: readonly T[],
  dims: Dimension<T>[],
  isAffected: (row: T) => boolean,
  opts: { minDev?: number; minAffected?: number; minPopulation?: number; top?: number } = {},
): Segment[] {
  const { minDev = 0.02, minAffected = 3, minPopulation = 5, top = 5 } = opts
  const totalPop = rows.length
  const totalAff = rows.filter(isAffected).length
  if (!totalAff || !totalPop) return []
  const out: Segment[] = []
  for (const dim of dims) {
    const groups = new Map<string, { pop: number; aff: number }>()
    for (const r of rows) {
      const v = dim.get(r)
      if (v == null || v === '') continue
      const g = groups.get(v) ?? { pop: 0, aff: 0 }
      g.pop++
      if (isAffected(r)) g.aff++
      groups.set(v, g)
    }
    if (groups.size < 2) continue
    for (const [value, g] of groups) {
      if (g.pop < minPopulation) continue
      const compPop = totalPop - g.pop
      if (compPop <= 0) continue
      const segRate = g.aff / g.pop
      const compRate = (totalAff - g.aff) / compPop
      const dev = segRate - compRate
      if (dev <= minDev) continue
      const share = g.aff / totalAff
      const small = g.aff < minAffected
      out.push({
        dim: dim.key,
        dimLabel: dim.label,
        value,
        affected: g.aff,
        population: g.pop,
        segValue: segRate,
        compValue: compRate,
        share,
        impact: share * dev * (small ? 0.2 : 1),
        small,
      })
    }
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, top)
}

export function decomposeMedian<T>(
  rows: readonly T[],
  dims: Dimension<T>[],
  value: (row: T) => number | null | undefined,
  opts: { minDev?: number; minAffected?: number; top?: number; higherIsWorse?: boolean } = {},
): Segment[] {
  const { minDev = 0.1, minAffected = 3, top = 5, higherIsWorse = true } = opts
  const valued = rows.filter((r) => {
    const v = value(r)
    return v != null && Number.isFinite(v)
  })
  if (valued.length < 2) return []
  const overall = median(valued.map((r) => value(r)!)) ?? 0
  const out: Segment[] = []
  for (const dim of dims) {
    const groups = new Map<string, number[]>()
    const all = new Map<string, number[]>()
    for (const r of valued) {
      const k = dim.get(r)
      if (k == null || k === '') continue
      const arr = groups.get(k) ?? []
      arr.push(value(r)!)
      groups.set(k, arr)
    }
    if (groups.size < 2) continue
    for (const [k, vals] of groups) all.set(k, vals)
    for (const [k, vals] of groups) {
      const comp: number[] = []
      for (const [k2, v2] of all) if (k2 !== k) comp.push(...v2)
      if (!comp.length) continue
      const seg = median(vals)!
      const cmp = median(comp)!
      const base = Math.max(Math.abs(cmp), Math.abs(overall) * 0.5, 1e-9)
      const dev = ((seg - cmp) / base) * (higherIsWorse ? 1 : -1)
      if (dev <= minDev) continue
      const share = vals.length / valued.length
      const small = vals.length < minAffected
      out.push({
        dim: dim.key,
        dimLabel: dim.label,
        value: k,
        affected: vals.length,
        population: vals.length,
        segValue: seg,
        compValue: cmp,
        share,
        impact: share * dev * (small ? 0.2 : 1),
        small,
      })
    }
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, top)
}
