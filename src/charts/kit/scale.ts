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

/** A nice domain covering [lo, hi] with about `count` ticks, labeled in `format`. */
export function numericAxis(
  lo: number,
  hi: number,
  format: Format,
  count = 5,
  fixed?: [number, number],
): NumericAxis {
  let a = fixed?.[0] ?? lo
  let b = fixed?.[1] ?? hi
  if (!Number.isFinite(a) || !Number.isFinite(b)) [a, b] = [0, 1]
  if (a === b) {
    const pad = Math.abs(a) * 0.1 || 1
    a -= a === 0 ? 0 : pad
    b += pad
  }
  const domain = (fixed ? [a, b] : nice(a, b, count)) as [number, number]
  const tv = ticks(domain[0], domain[1], count)
  const f = tickFormat(format)
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
