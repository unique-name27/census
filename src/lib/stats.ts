/** Small, typed aggregation helpers. Pure; no DOM. */
import { MIN_GROUP } from '@/data/schema'

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

export function mean(xs: readonly number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null
}

/** Linear-interpolated quantile (same convention as d3.quantile / Excel PERCENTILE.INC). */
export function quantile(xs: readonly number[], q: number): number | null {
  const v = xs.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!v.length) return null
  const pos = (v.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}
export const median = (xs: readonly number[]): number | null => quantile(xs, 0.5)

/** a / b, or null when the denominator is 0 or either side is missing. */
export function ratio(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null
  return a / b
}

/** Hide a rate computed over fewer than `min` people. */
export function suppress<T>(value: T | null, n: number, min = MIN_GROUP): T | null {
  return n < min ? null : value
}

export function groupBy<T, K>(xs: readonly T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const x of xs) {
    const k = key(x)
    const arr = m.get(k)
    if (arr) arr.push(x)
    else m.set(k, [x])
  }
  return m
}

export function countBy<T, K>(xs: readonly T[], key: (x: T) => K): Map<K, number> {
  const m = new Map<K, number>()
  for (const x of xs) {
    const k = key(x)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/**
 * Keep the `n` largest groups by `value` and fold the rest into one "Other (k)" row.
 * `merge` combines the folded rows into the Other row.
 */
export function topN<T extends { label: string }>(
  rows: T[],
  n: number,
  value: (r: T) => number,
  merge: (rest: T[], label: string) => T,
): T[] {
  const sorted = rows.slice().sort((a, b) => value(b) - value(a))
  if (sorted.length <= n + 1) return sorted
  const rest = sorted.slice(n)
  return [...sorted.slice(0, n), merge(rest, `Other (${rest.length})`)]
}

/** Equal-width bins between lo and hi (inclusive edges on the last bin). */
export function bins(xs: readonly number[], edges: number[]): { x0: number; x1: number; n: number }[] {
  const out = edges.slice(0, -1).map((x0, i) => ({ x0, x1: edges[i + 1], n: 0 }))
  for (const x of xs) {
    if (!Number.isFinite(x)) continue
    for (let i = 0; i < out.length; i++) {
      const last = i === out.length - 1
      if (x >= out[i].x0 && (x < out[i].x1 || (last && x <= out[i].x1))) {
        out[i].n++
        break
      }
    }
  }
  return out
}

/** Deterministic 32-bit FNV-1a hash, used for stable jitter and ids. */
export function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Significance gate for "vs prior period" call-outs: at least `minN` events on both sides and a
 * relative change of at least `minRel` (15% by default). Silence over noise.
 */
export function isMaterialChange(cur: number, prev: number, nCur: number, nPrev: number, minN = 5, minRel = 0.15): boolean {
  if (nCur < minN || nPrev < minN) return false
  const base = Math.max(Math.abs(cur), Math.abs(prev))
  return base > 0 && Math.abs(cur - prev) / base >= minRel
}
