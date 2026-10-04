/**
 * Ranked horizontal bars for one series: category labels on the left, the value at each bar's
 * tip (with an optional muted secondary text), the tail folded into "Other (k)", an optional
 * reference rule, and status tones that add a glyph beside the value. A value label never sits
 * on the reference rule: it starts past the rule when the rule would run through it.
 */
import { DASH, type Format, fmt, isNum } from '@/lib/format'
import { isStatusTone, toneColor } from '../core/color'
import { glyphForTone, hoverBand, labelsMark, refRule, roundedBarsX, scalePos } from '../core/marks'
import { maxTextWidth, textWidth, truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { baseline, housePlot, type PlotBuildContext, PlotChart } from '../plot'
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
}

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
  ariaLabel,
}: BarListProps<T>) {
  const rows = barListRows(data, {
    label,
    value,
    top,
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
    const shown = rows.map((r) => truncateText(r.label, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const headWidth = (r: BarRow<T>) => textWidth(valueText(r), 12, 500) + (glyphOf(r) ? 12 : 0)
    // The tail (value, glyph and secondary text) gets at most 40% of the width; on a narrow chart
    // a long secondary text is shortened to fit (the tooltip keeps it whole), or dropped.
    const tailMax = width * 0.4 - 10
    const tails = rows.map((r) => {
      if (!r.secondary) return null
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
    const { inset } = barInset(rowHeight, 24, 0.5)
    const color = (r: BarRow<T>) => (r.folded ? t.deemph : toneColor(t, r.tone))
    const origin = Math.min(Math.max(0, lo), hi)
    return housePlot(
      { width, theme: t },
      {
        height,
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
              rows.map((r, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', r.key),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: r.folded ? t.muted : t.ink2, size: 12 }],
                title: shown[i] === r.label ? undefined : r.label,
              })),
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
    note:
      r.value == null
        ? nullNote
        : r.folded
          ? `Combines ${r.folded} smaller groups${canDrill(r) ? '. Click to see the records' : ''}`
          : r.datum && onSelect && !canDrill(r)
            ? (lockedNote?.(r.datum) ?? undefined)
            : undefined,
  })

  return (
    <PlotChart<BarRow<T>>
      build={build}
      height={height}
      tip={tip}
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
