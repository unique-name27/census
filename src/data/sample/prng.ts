/**
 * Seeded randomness. Every generator module draws from its own named stream so that tuning one
 * module never reshuffles another, and two runs always produce identical data.
 */

const SEED = 20_260_930

/** FNV-1a, used to derive stream seeds from names. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed | 0
  }

  /** Uniform in [0, 1). mulberry32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  float(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  /** Integer in [lo, hi], both inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0
    for (const w of weights) total += w
    let r = this.next() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r < 0) return items[i]
    }
    return items[items.length - 1]
  }

  /** Pick from `[value, weight]` pairs. */
  pickPair<T>(pairs: readonly (readonly [T, number])[]): T {
    let total = 0
    for (const p of pairs) total += p[1]
    let r = this.next() * total
    for (const p of pairs) {
      r -= p[1]
      if (r < 0) return p[0]
    }
    return pairs[pairs.length - 1][0]
  }

  normal(mean = 0, sd = 1): number {
    let u = 0
    while (u === 0) u = this.next()
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  lognormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma))
  }

  /** In-place Fisher-Yates shuffle; returns the same array. */
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const t = xs[i]
      xs[i] = xs[j]
      xs[j] = t
    }
    return xs
  }

  /** k distinct items in random order (all of them when k >= length). */
  sample<T>(xs: readonly T[], k: number): T[] {
    return this.shuffle(xs.slice()).slice(0, Math.max(0, k))
  }
}

export const rngFor = (stream: string): Rng => new Rng((SEED ^ hash(stream)) | 0)
