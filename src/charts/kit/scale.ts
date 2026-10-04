/**
 * Numeric axis planning done before Plot renders, so margins can fit the tick labels exactly
 * and gridlines land on the same clean values the axis prints.
 */
import { nice, ticks } from 'd3'
import type { Format } from '@/lib/format'
import { maxTextWidth, textWidth, truncateText } from '../core/measure'
import { tickFormat } from '../plot'

export interface NumericAxis {
  domain: [number, number]
  ticks: number[]
  format: (v: number) => string
  /** Widest tick label in px (11px text). */
  labelWidth: number
}

/** Count formats: their axes only tick whole numbers (no "0.5 people"). */
const isCountFormat = (format: Format) => format === 'int' || format === 'compact'

/** Integers from ceil(a) to floor(b), at most `max` of them (evenly thinned when there are more). */
function integerTicks(a: number, b: number, max: number): number[] {
  const lo = Math.ceil(a)
  const hi = Math.floor(b)
  if (hi < lo) return []
  const step = Math.max(1, Math.ceil((hi - lo) / Math.max(1, max - 1)))
  const out: number[] = []
  for (let v = lo; v <= hi; v += step) out.push(v)
  return out
}

/**
 * Ticks for a domain whose labels never repeat: when the format rounds neighbors to the same
 * text ("0%", "0%"), ask for fewer, coarser ticks; as a last resort drop a tick whose label
 * repeats the one before it.
 */
function distinctTicks(
  domain: [number, number],
  count: number,
  f: (v: number) => string,
  integer: boolean,
): number[] {
  const make = (n: number) => {
    const tv = ticks(domain[0], domain[1], n)
    return integer ? tv.filter((v) => Number.isInteger(v)) : tv
  }
  let tv = make(count)
  for (let n = count - 1; n >= 2 && new Set(tv.map(f)).size < tv.length; n--) tv = make(n)
  const out: number[] = []
  for (const v of tv) if (!out.length || f(out[out.length - 1]) !== f(v)) out.push(v)
  return out
}

/**
 * A nice domain covering [lo, hi] with about `count` ticks, labeled in `format`. Count formats
 * ('int', 'compact') only get whole-number ticks: a flat series [n, n] is padded to
 * [max(0, n - 1), n + 1], and a domain too narrow for two whole ticks widens to the integers
 * around it. No two ticks share a label.
 */
export function numericAxis(
  lo: number,
  hi: number,
  format: Format,
  count = 5,
  fixed?: [number, number],
): NumericAxis {
  const integer = isCountFormat(format)
  let a = fixed?.[0] ?? lo
  let b = fixed?.[1] ?? hi
  if (!Number.isFinite(a) || !Number.isFinite(b)) [a, b] = [0, 1]
  if (a === b) {
    if (integer) {
      a = a >= 0 ? Math.max(0, a - 1) : a - 1
      b += 1
    } else {
      const pad = Math.abs(a) * 0.1 || 1
      a -= a === 0 ? 0 : pad
      b += pad
    }
  }
  let domain = (fixed ? [a, b] : nice(a, b, count)) as [number, number]
  const f = tickFormat(format)
  let tv = distinctTicks(domain, count, f, integer)
  if (integer && tv.length < 2 && !fixed) {
    domain = [Math.floor(domain[0]), Math.ceil(domain[1])]
    if (domain[1] - domain[0] < 1) domain[1] = domain[0] + 1
    tv = integerTicks(domain[0], domain[1], Math.max(2, count))
  }
  return { domain, ticks: tv, format: f, labelWidth: maxTextWidth(tv.map(f), 11) }
}

/** Extent of finite numbers, or null. */
export function extent(values: Iterable<number | null | undefined>): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY
  let hi = Number.NEGATIVE_INFINITY
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return lo <= hi ? [lo, hi] : null
}

export interface BandLabelLayout {
  mode: 'flat' | 'wrap' | 'rotate'
  /** Tick text for a label: as is, on two lines ("\n"), or truncated for rotation. */
  text: (label: string) => string
  /** Degrees for Plot's tickRotate. */
  rotate: number
  /** Bottom margin that fits the labels. */
  margin: number
}

/** Best two-line split of a label at a word boundary (shortest longest line). */
function twoLines(label: string): [string, string] | null {
  const words = label.split(' ')
  if (words.length < 2) return null
  let best: [string, string] | null = null
  let bestW = Number.POSITIVE_INFINITY
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ')
    const b = words.slice(k).join(' ')
    const w = Math.max(textWidth(a, 11), textWidth(b, 11))
    if (w < bestW) {
      bestW = w
      best = [a, b]
    }
  }
  return best
}

/**
 * Category labels under columns, never thinned (every column keeps its name): flat when they
 * fit the band, wrapped onto two lines when that fits, otherwise rotated and truncated.
 */
export function bandLabelLayout(labels: readonly string[], step: number): BandLabelLayout {
  const room = step - 6
  if (labels.every((l) => textWidth(l, 11) <= room))
    return { mode: 'flat', text: (l) => l, rotate: 0, margin: 24 }
  const splits = new Map(labels.map((l) => [l, twoLines(l)]))
  const wraps = labels.every((l) => {
    const s = splits.get(l)
    return s ? textWidth(s[0], 11) <= room && textWidth(s[1], 11) <= room : textWidth(l, 11) <= room
  })
  if (wraps) {
    return {
      mode: 'wrap',
      text: (l) => {
        const s = splits.get(l)
        return s ? `${s[0]}\n${s[1]}` : l
      },
      rotate: 0,
      margin: 38,
    }
  }
  const angle = 35
  const maxW = Math.min(130, maxTextWidth(labels, 11))
  const rad = (angle * Math.PI) / 180
  return {
    mode: 'rotate',
    text: (l) => truncateText(l, maxW, 11),
    rotate: -angle,
    margin: Math.ceil(Math.sin(rad) * maxW + Math.cos(rad) * 11 + 14),
  }
}
