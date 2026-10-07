/**
 * Ranked horizontal bars for one series: category labels on the left, the value at each bar's
 * tip (with an optional muted secondary text), the tail folded into "Other (k)", an optional
 * reference rule, and status tones that add a glyph beside the value. A value label never sits
 * on the reference rule: it starts past the rule when the rule would run through it.
 *
 * Status color (docs/DESIGN-REFRESH.md 2.1): `tone` fills the whole bar, so use it only when
 * status is the figure's subject (due state, readiness status). Elsewhere flag rows with
 * `glyphTone`: the bar keeps its series color and the status glyph sits beside the value.
 *
 *   <BarList data={depts} label="department" value="open" glyphTone={(d) => (d.oldest > 90 ? 'warning' : 'default')} />
 *
 * A long ranked list of counts folds past 12 rows into "Other (k)" by default when the folded
 * rows can still be drilled (`onSelectOther`, or no `onSelect`); `top` overrides, and rates need
 * an explicit `other` (they never fold by sum). Up to
 * two `notes` annotate a row past its value. The chart is one tab stop (arrow keys walk the rows).
 */
import { DASH, type Format, fmt, isNum } from '@/lib/format'
import { isStatusTone, toneColor } from '../core/color'
import {
  bandLabel,
  bandLabelLines,
  glyphForTone,
  hoverBand,
  labelsMark,
  noteMark,
  refRule,
  roundedBarsX,
  scalePos,
} from '../core/marks'
import { maxTextWidth, textWidth, truncateText, wrapText } from '../core/measure'
import type { ChartNote } from '../core/notes'
import type { TipContent } from '../core/tooltip'
import { baseline, housePlot, type PlotBuildContext, PlotChart, type PlotElement, plotPos } from '../plot'
import { clearOfRules } from './hit'
import { type BarRow, barListRows, type FoldRule } from './prepare'
import {
  barInset,
  type ChartBaseProps,
  gateOf,
  HIDDEN_NOTE,
  type Key,
  type RefLine,
  type Tone,
} from './shared'

export interface BarListProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  label: Key<T>
  value: Key<T>
  format?: Format
  /** Keep the top N rows and fold the rest into "Other (k)". */
  top?: number
  /** How folded rows combine: 'sum' (counts, default), 'mean', or a function (e.g. a weighted rate). */
  other?: FoldRule<T>
  /** 'desc' (default) ranks largest first; 'none' keeps the input order (ordered categories). */
  sort?: 'desc' | 'asc' | 'none'
  /** Muted text after the value, e.g. "n = 42". */
  secondary?: Key<T> | ((d: T) => string | null | undefined)
  /**
   * The printed value (bar label and tooltip) instead of `format`, e.g. a signed "+0.8%". Used
   * for rows with a value; missing values still print "—" and "Other" uses `format`.
   */
  valueText?: (d: T) => string
  /** Reference rule, e.g. the company rate. */
  ref?: RefLine
  /** Per-row tone; status tones also add a glyph beside the value. */
  tone?: (d: T) => Tone
  /**
   * Per-row status shown only as the glyph (shape + status color) beside the value; the bar keeps
   * its own color (from `tone`, or slot 1). Takes precedence over `tone` for the glyph.
   */
  glyphTone?: (d: T) => Tone
  /** Fixed value domain, e.g. [0, 1] for rates. */
  domain?: [number, number]
  /** Row pitch in px (default 28; bars are half of it, at most 24). */
  rowHeight?: number
  /** Tooltip note for rows without a value (default: hidden for anonymity). */
  nullNote?: string
  /** Click-to-drill on the folded "Other (k)" row, with the rows folded into it. */
  onSelectOther?: (rows: readonly T[]) => void
  /** Up to two annotations tied to a row: `at` is its label. */
  notes?: readonly ChartNote[]
  /**
   * What the values count, for the keyboard's spoken line: "items" reads "Shreya Ramesh: 7 items,
   * 3 overdue, 3 critical" (the value first, then the secondary text).
   */
  unit?: string
}

/** Formats a folded "Other" row can sum safely (counts and amounts); rates need an explicit `other`. */
const SUMMABLE = new Set<Format>(['int', 'compact', 'money', 'moneyFull'])
/** Rows a ranked list shows before folding the rest into "Other" (when `top` is not given). */
export const BAR_LIST_FOLD = 12

export function BarList<T extends object>({
  data,
  label,
  value,
  format = 'int',
  top,
  other,
  sort,
  secondary,
  valueText: printed,
  ref: refLine,
  tone,
  glyphTone,
  domain,
  rowHeight = 28,
  nullNote = HIDDEN_NOTE,
  onSelect,
  onSelectOther,
  selectable,
  lockedNote,
  notes,
  unit,
  ariaLabel,
}: BarListProps<T>) {
  // A long ranked list folds past 12 rows (11 named and "Other"), unless the order is meaningful
  // (sort 'none'), the values cannot be summed and no fold rule was given, or the rows drill one
  // by one and nothing drills the folded rows (every bar keeps opening its records).
  const foldTop =
    top ??
    (data.length > BAR_LIST_FOLD &&
    sort !== 'none' &&
    (other !== undefined || SUMMABLE.has(format)) &&
    (onSelectOther !== undefined || onSelect === undefined)
      ? BAR_LIST_FOLD - 1
      : undefined)
  const rows = barListRows(data, {
    label,
    value,
    top: foldTop,
    other,
    sort,
    secondary,
    tone,
    glyphTone,
    valueText: printed,
  })
  const marginTop = refLine ? 22 : 2
  const height = marginTop + rows.length * rowHeight + 4
  const valueText = (r: BarRow<T>) => (r.value == null ? DASH : (r.text ?? fmt(r.value, format)))
  /** The status glyph beside the value: from `glyphTone` when given, else from a status `tone`. */
  const glyphOf = (r: BarRow<T>) => {
    const g = r.glyph !== undefined && r.glyph !== 'default' ? r.glyph : r.tone
    return isStatusTone(g) ? g : null
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(64, width * 0.38)
    const headWidth = (r: BarRow<T>) => textWidth(valueText(r), 12, 500) + (glyphOf(r) ? 12 : 0)
    // The tail (value, glyph and secondary text) gets at most 40% of the width. On a chart under
    // 640px where a secondary text would be cut, every secondary moves under its row's label
    // instead ("21 overdue · 21 critical" stays whole); wider, a long one is shortened to fit.
    const tailMax = width * 0.4 - 10
    const fitsTail = (r: BarRow<T>) =>
      !r.secondary || textWidth(r.secondary, 11) <= tailMax - headWidth(r) - 5
    const under = width < 640 && rowHeight >= 26 && rows.some((r) => !fitsTail(r))
    // With the secondaries under the labels the tail holds only the value, so the labels may take
    // the room it frees (keeping 80px of bar), wrap to two lines, and the rows grow a line to fit.
    const headMax = Math.max(...rows.map(headWidth))
    const labelRoom = under ? Math.max(labelMax, width - headMax - 104) : labelMax
    const subs = rows.map((r) => (under && r.secondary ? truncateText(r.secondary, labelRoom, 11) : null))
    const band = under
      ? (() => {
          const lines = rows.map((r) => wrapText(r.label, labelRoom, 12, 400, 2))
          return {
            lines,
            width: Math.max(
              maxTextWidth(lines.flat(), 12),
              maxTextWidth(
                subs.filter((x): x is string => !!x),
                11,
              ),
            ),
          }
        })()
      : bandLabelLines(
          rows.map((r) => r.label),
          labelMax,
          rowHeight,
        )
    const pitch = under && band.lines.some((l) => l.length > 1) ? rowHeight + 13 : rowHeight
    const plotHeight = marginTop + rows.length * pitch + 4
    const marginLeft = Math.ceil(band.width) + 14
    const tails = rows.map((r) => {
      if (!r.secondary || under) return null
      const room = tailMax - headWidth(r) - 5
      if (textWidth(r.secondary, 11) <= room) return r.secondary
      return room >= 28 ? truncateText(r.secondary, room, 11) : null
    })
    const tailWidth = (r: BarRow<T>, i: number) => {
      const tail = tails[i]
      return headWidth(r) + (tail ? 5 + textWidth(tail, 11) : 0)
    }
    const marginRight = Math.ceil(Math.min(Math.max(...rows.map(tailWidth)) + 10, width * 0.4))
    const vals = rows.map((r) => r.value).filter(isNum)
    const lo = domain?.[0] ?? Math.min(0, ...vals, refLine?.value ?? 0)
    let hi = domain?.[1] ?? Math.max(0, ...vals, refLine?.value ?? 0)
    if (hi === lo) hi = lo + 1
    const inset = (pitch - barInset(rowHeight, 24, 0.5).thickness) / 2
    const color = (r: BarRow<T>) => (r.folded ? t.deemph : toneColor(t, r.tone))
    const origin = Math.min(Math.max(0, lo), hi)
    return housePlot(
      { width, theme: t },
      {
        height: plotHeight,
        marginTop,
        marginBottom: 4,
        marginLeft,
        marginRight,
        x: { domain: [lo, hi], axis: null },
        y: { type: 'band', domain: rows.map((r) => r.key), padding: 0, round: false, axis: null },
        marks: [
          hoverBand(rows, { axis: 'y', value: (r) => r.key, color: t.ink }),
          ...roundedBarsX(
            rows.filter((r) => r.value != null),
            (r) => (r.value == null ? null : r.value - origin),
            {
              x1: origin,
              x2: (r: BarRow<T>) => r.value,
              y: (r: BarRow<T>) => r.key,
              fill: color,
              insetTop: inset,
              insetBottom: inset,
            },
          ),
          baseline(t, 'x', origin),
          ...(refLine ? refRule(refLine, 'x', t) : []),
          labelsMark(
            (scales, dims) =>
              rows.flatMap((r, i) => {
                const y = scalePos(scales, 'y', r.key)
                const x = dims.marginLeft - 10
                const color = r.folded ? t.muted : t.ink2
                const sub = subs[i]
                if (!sub) return bandLabel(r.label, band.lines[i], x, y, color)
                // The label's lines, then the secondary, centered on the row together.
                const n = band.lines[i].length + 1
                const at = (k: number) => y + (k - (n - 1) / 2) * 13
                return [
                  ...band.lines[i].map((line, k) => ({
                    x,
                    y: at(k),
                    anchor: 'end' as const,
                    parts: [{ text: line, color, size: 12 }],
                    title: band.lines[i].join(' ') === r.label ? undefined : r.label,
                  })),
                  {
                    x,
                    y: at(n - 1),
                    anchor: 'end' as const,
                    parts: [{ text: sub, color: t.muted, size: 11 }],
                  },
                ]
              }),
            'category labels',
          ),
          labelsMark(
            (scales) =>
              rows.map((r, i) => {
                const end = r.value != null && r.value > origin ? r.value : origin
                const g = glyphOf(r)
                const tail = tails[i]
                // Start past the reference rule when it would run through the label.
                const refPx = refLine ? [scalePos(scales, 'x', refLine.value)] : []
                return {
                  x: clearOfRules(scalePos(scales, 'x', end) + 6, tailWidth(r, i), refPx, 3),
                  y: scalePos(scales, 'y', r.key),
                  halo: t.sheet,
                  glyph: g ? { shape: glyphForTone(g), color: toneColor(t, g) } : undefined,
                  parts: [
                    { text: valueText(r), color: r.value == null ? t.muted : t.ink, size: 12, weight: 500 },
                    ...(tail ? [{ text: tail, color: t.muted, size: 11 }] : []),
                  ],
                }
              }),
            'values',
          ),
          ...(notes?.length
            ? [
                noteMark(t, (scales) => {
                  const end = (r: BarRow<T>) => (r.value != null && r.value > origin ? r.value : origin)
                  const tailEnd = (r: BarRow<T>, i: number) =>
                    scalePos(scales, 'x', end(r)) + 6 + tailWidth(r, i)
                  const obstacles = rows.map((r, i) => {
                    const yc = scalePos(scales, 'y', r.key)
                    const x0 = scalePos(scales, 'x', origin)
                    return { x: x0, y: yc - pitch / 2 + 3, w: tailEnd(r, i) - x0, h: pitch - 6 }
                  })
                  const anchors = notes.flatMap((n) => {
                    const i = rows.findIndex((r) => r.label === String(n.at))
                    if (i < 0) return []
                    return [
                      { x: tailEnd(rows[i], i) + 2, y: scalePos(scales, 'y', rows[i].key), text: n.text },
                    ]
                  })
                  return { anchors, obstacles }
                }),
              ]
            : []),
        ],
      },
    )
  }

  const open = gateOf<T>(() => true, selectable)
  const canDrill = (r: BarRow<T>) =>
    r.datum
      ? !!onSelect && r.value != null && open(r.datum)
      : !!(onSelectOther && r.foldedRows && r.foldedRows.length > 0)
  const tip = (r: BarRow<T>): TipContent => ({
    title: r.label,
    rows: [{ value: valueText(r), label: r.secondary || undefined }],
    // Spoken value first, then the secondary text as its own phrases.
    spoken: `${r.label}: ${valueText(r)}${unit && r.value != null ? ` ${unit}` : ''}${
      r.secondary ? `, ${r.secondary.split(' · ').join(', ')}` : ''
    }`,
    note:
      r.value == null
        ? nullNote
        : r.folded
          ? `Combines ${r.folded} smaller groups${canDrill(r) ? '. Click to see the records' : ''}`
          : r.datum && onSelect && !canDrill(r)
            ? (lockedNote?.(r.datum) ?? undefined)
            : undefined,
  })

  // Keyboard: one stop per row, top to bottom; the outline wraps the bar.
  const keyPoints = (plot: PlotElement) => {
    const { thickness } = barInset(rowHeight, 24, 0.5)
    return rows.map((r) => {
      const x0 = plotPos(plot, 'x', Math.min(Math.max(0, domain?.[0] ?? 0), r.value ?? 0))
      const x1 = plotPos(plot, 'x', r.value ?? 0)
      const lo = Math.min(x0, x1)
      const w = Math.abs(x1 - x0)
      return { datum: r, x: lo + w / 2, y: plotPos(plot, 'y', r.key), w: Math.max(w, 4), h: thickness }
    })
  }

  return (
    <PlotChart<BarRow<T>>
      build={build}
      height={height}
      tip={tip}
      keyPoints={keyPoints}
      selectable={canDrill}
      onSelect={
        onSelect || onSelectOther
          ? (r) => {
              if (r.datum) onSelect?.(r.datum)
              else if (r.foldedRows) onSelectOther?.(r.foldedRows)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}
