/**
 * Grouping helpers with the anonymity floor built in: any statistic over fewer than MIN_GROUP
 * people is null, and breakdowns fold groups under MIN_GROUP into one "Other (k)" group. Pure.
 */
import { MIN_GROUP } from '@/data/schema'
import { isNum } from '@/lib/format'
import { mean, quantile } from '@/lib/stats'

export interface Group<T> {
  label: string
  rows: T[]
  /** Number of small groups folded into this one (0 for a real group). */
  folded: number
}

/**
 * Group rows by a key. Groups under `min` are folded into "Other (k)" (or kept as-is when only one
 * is small, since folding one group hides nothing). Rows with no key are left out. `order` fixes
 * the order of known keys; otherwise groups come largest first. Other always sorts last.
 */
export function groupRows<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  opts: { min?: number; order?: readonly string[] } = {},
): Group<T>[] {
  const { min = MIN_GROUP, order } = opts
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (k == null || k === '') continue
    const arr = map.get(k)
    if (arr) arr.push(r)
    else map.set(k, [r])
  }
  const keys = [...map.keys()]
  if (order) {
    const rank = new Map(order.map((k, i) => [k, i]))
    keys.sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b))
  } else keys.sort((a, b) => map.get(b)!.length - map.get(a)!.length || a.localeCompare(b))
  const small = keys.filter((k) => map.get(k)!.length < min)
  const fold = small.length > 1
  const out: Group<T>[] = keys
    .filter((k) => !fold || map.get(k)!.length >= min)
    .map((k) => ({ label: k, rows: map.get(k)!, folded: 0 }))
  if (fold)
    out.push({
      label: `Other (${small.length})`,
      rows: small.flatMap((k) => map.get(k)!),
      folded: small.length,
    })
  return out
}

/** Finite values of a field. */
export function values<T>(rows: readonly T[], f: (r: T) => number | null | undefined): number[] {
  const out: number[] = []
  for (const r of rows) {
    const v = f(r)
    if (isNum(v)) out.push(v)
  }
  return out
}

/** Median over at least `min` values, else null. */
export function safeMedian(xs: readonly number[], min = MIN_GROUP): number | null {
  return xs.length < min ? null : quantile(xs, 0.5)
}

export function safeQuantile(xs: readonly number[], q: number, min = MIN_GROUP): number | null {
  return xs.length < min ? null : quantile(xs, q)
}

export function safeMean(xs: readonly number[], min = MIN_GROUP): number | null {
  return xs.length < min ? null : mean(xs)
}

/** count ÷ n over at least `min` people, else null. */
export function safeShare(count: number, n: number, min = MIN_GROUP): number | null {
  return n < min || n === 0 ? null : count / n
}

/** Weighted sum ratio Σ(w·x) ÷ Σw over rows where both exist; null when the weight total is 0. */
export function weightedMean<T>(
  rows: readonly T[],
  weight: (r: T) => number | null | undefined,
  value: (r: T) => number | null | undefined,
): { value: number | null; n: number; weight: number } {
  let num = 0
  let den = 0
  let n = 0
  for (const r of rows) {
    const w = weight(r)
    const v = value(r)
    if (!isNum(w) || !isNum(v)) continue
    num += w * v
    den += w
    n++
  }
  return { value: den > 0 ? num / den : null, n, weight: den }
}
