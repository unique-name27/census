/**
 * Pure layout for BulletList (one row per measure, each on its own scale) and StatusSplit (one
 * 100% bar of status counts). No DOM, unit-tested; the components draw what these return.
 */
import type { Tone } from '../core/color'

/* ───────── BulletList ───────── */

/** A row's state, drawn as the status glyph and its word after the value. */
export interface BulletStatus {
  tone: Exclude<Tone, 'default' | 'deemph'> | 'none'
  /** The word beside the glyph: "Met", "Missed", "Watch", "Stale". */
  label: string
}

export interface BulletRow<T> {
  key: string
  label: string
  group: string | null
  value: number | null
  target: number | null
  /** The row's scale end: 1.15 x the larger of value and target (of every row's, on a shared scale; 1 when missing or zero). */
  max: number
  /** Value and target as shares of the row's scale (0 to 1), null when missing; negatives clamp to 0. */
  valueAt: number | null
  targetAt: number | null
  status: BulletStatus | null
  /** Top of the row in px, from the top of the chart. */
  y: number
  datum: T
}

export interface BulletGroup {
  label: string
  /** Top of the header line in px. */
  y: number
}

export interface BulletLayout<T> {
  rows: BulletRow<T>[]
  groups: BulletGroup[]
  height: number
}

/** Headroom past the larger of value and target, so the bar and the tick never touch the end. */
export const BULLET_HEADROOM = 1.15

export interface BulletAccessors<T> {
  label: (d: T) => string
  value: (d: T) => number | null
  target: (d: T) => number | null
  status?: (d: T) => BulletStatus | null
  group?: (d: T) => string | null
}

/**
 * Rows in input order, grouped under a header each time the group changes (keep a group's rows
 * together). Every row gets its own scale from 0 to 1.15 x max(value, target), or with
 * `scale: 'shared'` (measures in one unit, such as ratios of heads) one scale for every row, from
 * 0 to 1.15 x the largest value or target, so bar lengths compare across rows.
 */
export function bulletLayout<T>(
  data: readonly T[],
  acc: BulletAccessors<T>,
  opts: { rowHeight?: number; groupHeight?: number; top?: number; scale?: 'row' | 'shared' } = {},
): BulletLayout<T> {
  const rowH = opts.rowHeight ?? 28
  const groupH = opts.groupHeight ?? 28
  let y = opts.top ?? 0
  let last: string | null | undefined
  const rows: BulletRow<T>[] = []
  const groups: BulletGroup[] = []
  const shared =
    opts.scale === 'shared'
      ? Math.max(0, ...data.map((d) => Math.max(finite(acc.value(d)) ?? 0, finite(acc.target(d)) ?? 0)))
      : null
  data.forEach((d, i) => {
    const group = acc.group?.(d) ?? null
    if (group != null && group !== last) {
      groups.push({ label: group, y })
      y += groupH
    }
    last = group
    const value = finite(acc.value(d))
    const target = finite(acc.target(d))
    const top = shared ?? Math.max(value ?? 0, target ?? 0)
    const max = top > 0 ? top * BULLET_HEADROOM : 1
    rows.push({
      key: `${i}`,
      label: acc.label(d),
      group,
      value,
      target,
      max,
      valueAt: value == null ? null : Math.max(0, value) / max,
      targetAt: target == null ? null : Math.max(0, target) / max,
      status: acc.status?.(d) ?? null,
      y,
      datum: d,
    })
    y += rowH
  })
  return { rows, groups, height: y }
}

function finite(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/* ───────── StatusSplit ───────── */

/** Segments in their fixed order: met, on watch, missed, no target, not shown. */
export const SPLIT_ORDER = ['met', 'watch', 'missed', 'none', 'hidden'] as const
export type SplitKey = (typeof SPLIT_ORDER)[number]

export const SPLIT_WORD: Record<SplitKey, string> = {
  met: 'Met',
  watch: 'Watch',
  missed: 'Missed',
  none: 'No target',
  hidden: 'Not shown',
}

export interface SplitSegment {
  key: SplitKey
  label: string
  count: number
  share: number
  /** Left edge and width in px along the bar (gaps of `gap` px between segments). */
  x: number
  w: number
}

/**
 * The segments of a status split for a bar `width` px wide: zero counts are left out, the rest
 * keep the fixed order and share the width (less a `gap` between neighbours) by count. The
 * shares always add up to 1 and the counts to the total.
 */
export function splitSegments(
  counts: Partial<Record<SplitKey, number>>,
  width: number,
  opts: { gap?: number; labels?: Partial<Record<SplitKey, string>> } = {},
): { segments: SplitSegment[]; total: number } {
  const gap = opts.gap ?? 2
  const present = SPLIT_ORDER.filter((k) => (counts[k] ?? 0) > 0)
  const total = present.reduce((s, k) => s + (counts[k] ?? 0), 0)
  if (!total) return { segments: [], total: 0 }
  const room = Math.max(0, width - gap * (present.length - 1))
  let x = 0
  const segments = present.map((k) => {
    const count = counts[k] ?? 0
    const share = count / total
    const w = room * share
    const seg = { key: k, label: opts.labels?.[k] ?? SPLIT_WORD[k], count, share, x, w }
    x += w + gap
    return seg
  })
  return { segments, total }
}

/** The states judged against a target. */
const JUDGED: readonly SplitKey[] = ['met', 'watch', 'missed']

/**
 * A judged state's share of the measures judged (met, watch and missed: the "4 of 21 targets
 * met" a split sits under), or null for no target and not shown, which are counts only.
 */
export function splitShare(
  counts: Partial<Record<SplitKey, number>>,
  key: SplitKey,
): { share: number; judged: number } | null {
  if (!JUDGED.includes(key)) return null
  const judged = JUDGED.reduce((s, k) => s + (counts[k] ?? 0), 0)
  return judged > 0 ? { share: (counts[key] ?? 0) / judged, judged } : null
}

/**
 * Where each segment's count and word go under the bar: centered under a wide segment, else
 * pushed right so labels never overlap (each needs `widthOf(segment)` px plus a 12px gap), and
 * pulled back inside the chart at the right edge.
 */
export function splitLabelPositions(
  segments: readonly SplitSegment[],
  widthOf: (s: SplitSegment) => number,
  chartWidth: number,
): number[] {
  const xs: number[] = []
  let next = 0
  for (const s of segments) {
    const w = widthOf(s)
    const x = Math.max(next, s.x)
    xs.push(x)
    next = x + w + 12
  }
  // Pull the run back from the right edge, keeping the order and gaps.
  let limit = chartWidth
  for (let i = xs.length - 1; i >= 0; i--) {
    xs[i] = Math.min(xs[i], limit - widthOf(segments[i]))
    limit = xs[i] - 12
  }
  return xs.map((x) => Math.max(0, x))
}
