/**
 * Pure layout for Pyramid (a centered bar per row, the bottom row first in the data): where each
 * bar, segment and outline sits, the gutters on both sides, the track brackets and the points the
 * keyboard steps through. No DOM, unit-tested; the component draws what these return.
 *
 * Geometry (docs/ANALYSES.md, 5.5.1): bars 16px tall with 6px between rows, centered on one
 * vertical axis, half of each bar on either side. One scale for bars and outlines: the larger of
 * every value and every outline fills the bar area. Segments are laid left to right inside the
 * bar with 2px gaps (the sheet shows through); the two outer ends are rounded 4px, inner edges
 * are square. An outline is 4px taller than its bar (2px above and below).
 */
import type { KeyPoint } from '../core/keyboard'

export const PYRAMID_BAR = 16
export const PYRAMID_GAP = 6
export const PYRAMID_PITCH = PYRAMID_BAR + PYRAMID_GAP
/** An outline extends this far above and below its bar. */
export const PYRAMID_OUTLINE_PAD = 2
/** Space between segments inside a bar. */
export const PYRAMID_SEGMENT_GAP = 2
/** Radius of the bar's two outer ends. */
export const PYRAMID_RADIUS = 4

export interface PyramidSegmentIn {
  key: string
  value: number
}

export interface PyramidRowIn<T> {
  key: string
  value: number
  outline: number | null
  segments: readonly PyramidSegmentIn[]
  datum: T
}

export interface PyramidSegmentBox {
  key: string
  value: number
  x0: number
  x1: number
  /** The bar's left end (rounded). */
  first: boolean
  /** The bar's right end (rounded). */
  last: boolean
}

export interface PyramidRowBox<T> {
  key: string
  /** Position in the data (0 = the bottom row). */
  index: number
  /** Top of the bar in px. */
  y: number
  /** Center line of the row in px. */
  cy: number
  value: number
  outline: number | null
  /** The bar's extent, or null for a row with nothing in it. */
  bar: { x0: number; x1: number } | null
  /** The outline's extent, or null when there is none (or it is zero). */
  ring: { x0: number; x1: number; y0: number; y1: number } | null
  /** Segments with a width, left to right; one segment for an unsplit bar. */
  segments: PyramidSegmentBox[]
  datum: T
}

export interface PyramidLayout<T> {
  width: number
  height: number
  /** The vertical axis the bars are centered on. */
  cx: number
  /** The bar area: the widest bar spans x0 to x1. */
  x0: number
  x1: number
  /** Pixels per unit of value (a value v spans v × unit, half on each side of cx). */
  unit: number
  /** Rows top first (the reading order), so the last data row is drawn first. */
  rows: PyramidRowBox<T>[]
}

export interface PyramidLayoutOptions {
  width: number
  /** Space left of the bar area (labels and brackets). */
  left: number
  /** Space right of the bar area (numbers and notes). */
  right: number
  /** Space above the first row. */
  top?: number
  /** Space below the last row. */
  bottom?: number
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** The segments of a bar from `x0` to `x1`, proportional to their values, with 2px gaps between them. */
export function layoutSegments(
  segments: readonly PyramidSegmentIn[],
  x0: number,
  x1: number,
  gap = PYRAMID_SEGMENT_GAP,
): PyramidSegmentBox[] {
  const shown = segments.filter((s) => finite(s.value) && s.value > 0)
  const total = shown.reduce((a, s) => a + s.value, 0)
  const width = x1 - x0
  if (!shown.length || total <= 0 || width <= 0) return []
  // Gaps only when every segment keeps at least a pixel; a thin bar is drawn whole.
  const g = width - gap * (shown.length - 1) >= shown.length ? gap : 0
  const room = width - g * (shown.length - 1)
  const out: PyramidSegmentBox[] = []
  let x = x0
  shown.forEach((s, i) => {
    const w = (s.value / total) * room
    const end = i === shown.length - 1 ? x1 : x + w
    out.push({ key: s.key, value: s.value, x0: x, x1: end, first: i === 0, last: i === shown.length - 1 })
    x = end + g
  })
  return out
}

/** Lay out the rows: bars and outlines on one scale, centered on the bar area, the top row first. */
export function pyramidLayout<T>(
  rows: readonly PyramidRowIn<T>[],
  opts: PyramidLayoutOptions,
): PyramidLayout<T> {
  const top = opts.top ?? PYRAMID_OUTLINE_PAD + 1
  const bottom = opts.bottom ?? PYRAMID_OUTLINE_PAD + 1
  const x0 = Math.max(0, opts.left)
  const x1 = Math.max(x0, opts.width - opts.right)
  const cx = (x0 + x1) / 2
  const max = Math.max(
    0,
    ...rows.flatMap((r) => [finite(r.value) ? r.value : 0, finite(r.outline) ? r.outline : 0]),
  )
  // Leave a pixel each side so an outline's stroke stays inside the bar area.
  const unit = max > 0 ? Math.max(0, x1 - x0 - 2) / max : 0
  const n = rows.length
  const boxes: PyramidRowBox<T>[] = []
  for (let k = 0; k < n; k++) {
    const index = n - 1 - k
    const r = rows[index]
    const y = top + k * PYRAMID_PITCH
    const v = finite(r.value) ? Math.max(0, r.value) : 0
    const half = (v * unit) / 2
    const bar = half > 0 ? { x0: cx - half, x1: cx + half } : null
    const o = finite(r.outline) ? Math.max(0, r.outline) : 0
    const oh = (o * unit) / 2
    const ring =
      oh > 0
        ? { x0: cx - oh, x1: cx + oh, y0: y - PYRAMID_OUTLINE_PAD, y1: y + PYRAMID_BAR + PYRAMID_OUTLINE_PAD }
        : null
    const segs = r.segments.length ? r.segments : [{ key: '', value: v }]
    boxes.push({
      key: r.key,
      index,
      y,
      cy: y + PYRAMID_BAR / 2,
      value: v,
      outline: finite(r.outline) ? r.outline : null,
      bar,
      ring,
      segments: bar ? layoutSegments(segs, bar.x0, bar.x1) : [],
      datum: r.datum,
    })
  }
  const height = top + Math.max(0, n * PYRAMID_PITCH - PYRAMID_GAP) + bottom
  return { width: opts.width, height, cx, x0, x1, unit, rows: boxes }
}

/**
 * A bar or segment as an SVG path from `x0` to `x1` and `y` to `y + h`, with the left and/or
 * right end rounded (at most half the height or width) and the other edges square.
 */
export function barPath(
  x0: number,
  x1: number,
  y: number,
  h: number,
  roundLeft: boolean,
  roundRight: boolean,
  radius = PYRAMID_RADIUS,
): string {
  const w = Math.max(0, x1 - x0)
  const ends = (roundLeft ? 1 : 0) + (roundRight ? 1 : 0)
  const r = ends ? Math.max(0, Math.min(radius, h / 2, w / ends)) : 0
  const rl = roundLeft ? r : 0
  const rr = roundRight ? r : 0
  const f = (v: number) => Math.round(v * 100) / 100
  const b = y + h
  return [
    `M${f(x0 + rl)},${f(y)}`,
    `H${f(x1 - rr)}`,
    rr
      ? `A${f(rr)},${f(rr)} 0 0 1 ${f(x1)},${f(y + rr)}V${f(b - rr)}A${f(rr)},${f(rr)} 0 0 1 ${f(x1 - rr)},${f(b)}`
      : `V${f(b)}`,
    `H${f(x0 + rl)}`,
    rl
      ? `A${f(rl)},${f(rl)} 0 0 1 ${f(x0)},${f(b - rl)}V${f(y + rl)}A${f(rl)},${f(rl)} 0 0 1 ${f(x0 + rl)},${f(y)}`
      : `V${f(y)}`,
    'Z',
  ].join('')
}

/** The row whose band (its bar plus half the gap on each side) holds `y`, or null. */
export function rowAt<T>(layout: PyramidLayout<T>, y: number): PyramidRowBox<T> | null {
  if (!Number.isFinite(y)) return null
  for (const r of layout.rows)
    if (y >= r.y - PYRAMID_GAP / 2 && y < r.y + PYRAMID_BAR + PYRAMID_GAP / 2) return r
  return null
}

/**
 * The segment of a row under `x`: the one that holds it, the nearer one when `x` falls in a gap,
 * or null when `x` is off the bar by more than `slack` px (the label gutters, the empty sides).
 */
export function segmentAtX<T>(row: PyramidRowBox<T>, x: number, slack = 2): PyramidSegmentBox | null {
  if (!row.bar || !Number.isFinite(x)) return null
  if (x < row.bar.x0 - slack || x > row.bar.x1 + slack) return null
  let best: PyramidSegmentBox | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const s of row.segments) {
    if (x >= s.x0 && x <= s.x1) return s
    const d = Math.min(Math.abs(x - s.x0), Math.abs(x - s.x1))
    if (d < bestD) {
      best = s
      bestD = d
    }
  }
  return best
}

/**
 * The keyboard's points in reading order (the top row first). Unsplit, one point per row on its
 * bar, ungrouped, so every arrow steps between rows. Split, each row is a group: first the whole
 * row (part null, on its bar), then each segment (part = its key), so Left and Right step through
 * the segments and Up and Down move between rows, keeping to the same segment where the next row
 * has it. A row with nothing in it keeps a point at the axis, so its count still reads.
 */
export function pyramidKeyPoints<T>(layout: PyramidLayout<T>, split: boolean): KeyPoint<PyramidRowBox<T>>[] {
  const out: KeyPoint<PyramidRowBox<T>>[] = []
  for (const r of layout.rows) {
    const w = r.bar ? r.bar.x1 - r.bar.x0 : 0
    out.push({
      datum: r,
      part: null,
      x: layout.cx,
      y: r.cy,
      w: Math.max(4, w),
      h: PYRAMID_BAR,
      ...(split ? { group: r.key } : {}),
    })
    if (!split) continue
    for (const s of r.segments)
      out.push({
        datum: r,
        part: s.key,
        x: (s.x0 + s.x1) / 2,
        y: r.cy,
        w: Math.max(4, s.x1 - s.x0),
        h: PYRAMID_BAR,
        group: r.key,
      })
  }
  return out
}

/** A run of rows a bracket spans, by row key: "Individual contributor" over L1 to L6. */
export interface PyramidGroupIn {
  label: string
  keys: readonly string[]
}

export interface PyramidBracket {
  label: string
  /** Top and bottom of the bracket in px (the outer edges of its first and last rows). */
  y0: number
  y1: number
}

/**
 * Brackets for the groups whose rows are on the chart, top to bottom, and the hairlines between
 * neighbouring groups (y in px, halfway through the gap between their rows).
 */
export function pyramidBrackets<T>(
  layout: PyramidLayout<T>,
  groups: readonly PyramidGroupIn[],
): { brackets: PyramidBracket[]; dividers: number[] } {
  const brackets: PyramidBracket[] = []
  for (const g of groups) {
    const rows = layout.rows.filter((r) => g.keys.includes(r.key))
    if (!rows.length) continue
    const y0 = Math.min(...rows.map((r) => r.y))
    const y1 = Math.max(...rows.map((r) => r.y + PYRAMID_BAR))
    brackets.push({ label: g.label, y0, y1 })
  }
  brackets.sort((a, b) => a.y0 - b.y0)
  const dividers: number[] = []
  for (let i = 1; i < brackets.length; i++) dividers.push((brackets[i - 1].y1 + brackets[i].y0) / 2)
  return { brackets, dividers }
}

/** A right-gutter column: one text per row. */
export interface GutterColumn {
  /** The column's texts, one per row in layout order (null for none). */
  texts: readonly (string | null)[]
  /** Kept at narrow widths. */
  narrow: boolean
  /** Font weight of its text (600 for the headline number). */
  weight?: number
}

export interface PyramidGutters {
  /** Compact: short row labels, no bracket labels, only the narrow columns, no notes. */
  compact: boolean
  left: number
  /** Width of each right-gutter column, 0 for one dropped. */
  columns: number[]
  /** Where each column's text ends (right-aligned), measured from the bar area's right edge. */
  columnEnds: number[]
  /** Room for notes at the far right (0 when there is none or no room). */
  notes: number
  right: number
  /** Width of the bracket label column (0 when compact or none). */
  bracket: number
  /** Bracket labels broken onto at most two lines to fit the bracket column. */
  bracketLines: string[][]
  /** Width of the row label column. */
  label: number
}

export interface GutterInput {
  width: number
  labels: readonly string[]
  shortLabels: readonly string[]
  bracketLabels: readonly string[]
  columns: readonly GutterColumn[]
  notes: readonly string[]
  /** Measures text: (text, size, weight) → px. */
  measure: (text: string, size: number, weight: number) => number
}

/** The smallest bar area worth drawing before the chart drops notes, then its full labels. */
export const PYRAMID_MIN_BARS = 160
/** The widest a bracket label may run before it breaks onto two lines. */
export const BRACKET_LABEL_MAX = 84
const COLUMN_GAP = 10

/** `text` broken at spaces onto at most two lines of `max` px (the second takes the rest). */
export function twoLines(text: string, max: number, measure: (t: string) => number): string[] {
  if (measure(text) <= max || !text.includes(' ')) return [text]
  const words = text.split(' ')
  let first = words[0]
  let i = 1
  while (i < words.length && measure(`${first} ${words[i]}`) <= max) first = `${first} ${words[i++]}`
  return [first, words.slice(i).join(' ')]
}

/**
 * The gutters for a width. Full form: bracket labels, the row labels, every column and room for
 * notes. When that leaves the bars less than `PYRAMID_MIN_BARS` px (or 40% of the width) the
 * notes go first; when that is still too little, the compact form drops the bracket labels and
 * the wide columns and uses the short row labels.
 */
export function pyramidGutters(input: GutterInput): PyramidGutters {
  const { width, measure } = input
  const widest = (xs: readonly (string | null)[], size: number, weight = 400) =>
    Math.max(0, ...xs.filter((x): x is string => !!x).map((x) => measure(x, size, weight)))
  const bracketLines = input.bracketLabels.map((l) =>
    twoLines(l, BRACKET_LABEL_MAX, (t) => measure(t, 11, 400)),
  )
  const build = (compact: boolean, withNotes: boolean): PyramidGutters => {
    const label = Math.ceil(widest(compact ? input.shortLabels : input.labels, 12)) + 10
    const bracket = compact || !bracketLines.length ? 0 : Math.ceil(widest(bracketLines.flat(), 11)) + 16
    const columns = input.columns.map((c) =>
      compact && !c.narrow ? 0 : Math.ceil(widest(c.texts, 12, c.weight ?? 400)),
    )
    const columnEnds: number[] = []
    let x = 0
    for (const w of columns) {
      if (w > 0) x += COLUMN_GAP + w
      columnEnds.push(x)
    }
    const notes =
      !withNotes || !input.notes.length ? 0 : Math.ceil(widest(input.notes, 11, 500)) + COLUMN_GAP + 4
    return {
      compact,
      left: bracket + label,
      columns,
      columnEnds,
      notes,
      right: x + notes + 4,
      bracket,
      bracketLines: compact ? [] : bracketLines,
      label,
    }
  }
  const enough = (g: PyramidGutters) => width - g.left - g.right >= Math.max(PYRAMID_MIN_BARS, width * 0.4)
  const full = build(false, true)
  if (enough(full)) return full
  const quiet = build(false, false)
  if (enough(quiet)) return quiet
  return build(true, false)
}
