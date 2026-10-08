/**
 * Ranges with markers, one row per category. Range mode: a light track from min to max with an
 * ink tick at the midpoint and value dots (e.g. salary range, midpoint and median pay). Quartile
 * mode (q1 and q3 given): a thin whisker from min to max, a box from q1 to q3 and a median tick.
 *
 * Optional: a reference rule (`ref`, labelled above the plot), and a tail after each row with a
 * status glyph and its word (`glyphTone`, `glyphLabel`: "Above", "Below") and a muted secondary
 * text (`secondary`, left to the tooltip under 560px). The marks keep their colors; a status
 * never fills a range. `deemph` draws a row's marks in the de-emphasis color ("Not recorded").
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import { isStatusTone, toneColor } from '../core/color'
import type { LegendSpec } from '../core/legend'
import {
  bandLabel,
  bandLabelLines,
  glyphForTone,
  hoverBand,
  labelsMark,
  refRule,
  scalePos,
} from '../core/marks'
import { textWidth, truncateText } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import { axisX, gridX, housePlot, type PlotBuildContext, PlotChart, type PlotElement, plotPos } from '../plot'
import { seriesColor, useChartTheme } from '../theme'
import { extent, numericAxis } from './scale'
import { type ChartBaseProps, gateOf, type Key, numAt, type RefLine, type Tone, textAt } from './shared'

export interface RangeMarker<T> {
  key: Key<T>
  label: string
}

export interface RangeBarsProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  /** Category property (rows, in data order). */
  y: Key<T>
  min: Key<T>
  max: Key<T>
  /** Midpoint (range mode) or median (quartile mode) tick. */
  mid?: Key<T>
  /** One value dot; use `markers` for several (they get a legend). */
  value?: Key<T>
  markers?: readonly RangeMarker<T>[]
  q1?: Key<T>
  q3?: Key<T>
  format?: Format
  /**
   * Names used in the tooltip and legend. `range` names the bar in the legend (default 'Range',
   * or 'Middle 50%' in quartile mode); setting it also shows the legend for a single marker.
   */
  labels?: { min?: string; max?: string; mid?: string; value?: string; range?: string }
  xDomain?: [number, number]
  rowHeight?: number
  /** Reference rule, e.g. the company mean ("Company 66.9"), labelled above the plot. */
  ref?: RefLine
  /** Per-row status shown as a glyph in the row's tail; the marks keep their colors. */
  glyphTone?: (d: T) => Tone
  /** The word after the glyph ("Above", "Below"). */
  glyphLabel?: (d: T) => string | null | undefined
  /** Muted text in the row's tail, e.g. "38 hires · expected 65.8"; tooltip only under 560px. */
  secondary?: (d: T) => string | null | undefined
  /** Draw the row's dots and range in the de-emphasis color ("Not recorded"). */
  deemph?: (d: T) => boolean
}

interface Row<T> {
  key: string
  label: string
  min: number | null
  max: number | null
  mid: number | null
  q1: number | null
  q3: number | null
  marks: (number | null)[]
  glyph: 'good' | 'warning' | 'serious' | 'critical' | null
  word: string | null
  secondary: string | null
  deemph: boolean
  datum: T
}

const statusOf = (g: Tone | undefined): Row<object>['glyph'] => (isStatusTone(g) ? g : null)

export function RangeBars<T extends object>({
  data,
  y,
  min,
  max,
  mid,
  value,
  markers,
  q1,
  q3,
  format = 'money',
  labels,
  xDomain,
  rowHeight = 32,
  ref: refLine,
  glyphTone,
  glyphLabel,
  secondary,
  deemph,
  onSelect,
  selectable,
  lockedNote,
  ariaLabel,
}: RangeBarsProps<T>) {
  const quartiles = !!q1 && !!q3
  const markerDefs: RangeMarker<T>[] =
    markers?.slice() ?? (value ? [{ key: value, label: labels?.value ?? 'Value' }] : [])
  const rows: Row<T>[] = data.map((d, i) => ({
    key: `r${i}`,
    label: textAt(d, y),
    min: numAt(d, min),
    max: numAt(d, max),
    mid: mid ? numAt(d, mid) : null,
    q1: q1 ? numAt(d, q1) : null,
    q3: q3 ? numAt(d, q3) : null,
    marks: markerDefs.map((m) => numAt(d, m.key)),
    glyph: statusOf(glyphTone?.(d)),
    word: glyphLabel?.(d) || null,
    secondary: secondary?.(d) || null,
    deemph: deemph?.(d) ?? false,
    datum: d,
  }))
  const marginTop = refLine ? 22 : 6
  const height = marginTop + rows.length * rowHeight + 26
  const hasTail = rows.some((r) => r.glyph || r.word || r.secondary)
  const midName = labels?.mid ?? (quartiles ? 'Median' : 'Midpoint')

  const theme = useChartTheme()
  const markerColor = (i: number) => seriesColor(theme, i)
  const legend: LegendSpec | null =
    markerDefs.length > 1 || quartiles || labels?.range !== undefined
      ? {
          kind: 'swatch',
          items: [
            {
              label: labels?.range ?? (quartiles ? 'Middle 50%' : 'Range'),
              color: quartiles ? theme.seq[200] : theme.seq[100],
              shape: 'rect',
            },
            ...(mid ? [{ label: midName, color: theme.ink, shape: 'line' as const }] : []),
            ...markerDefs.map((m, i) => ({ label: m.label, color: markerColor(i), shape: 'dot' as const })),
          ],
        }
      : null

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(48, width * 0.3)
    // Category labels wrap to two lines in rows of 26px or more, else they are shortened.
    const band = bandLabelLines(
      rows.map((r) => r.label),
      labelMax,
      rowHeight,
    )
    const marginLeft = Math.ceil(band.width) + 14
    // The tail: glyph, word and (from 560px) the secondary text, at most 36% of the width.
    const withSecondary = width >= 560
    const head = (r: Row<T>) => (r.glyph ? 12 : 0) + (r.word ? textWidth(r.word, 11, 500) + 4 : 0)
    const tailText = (r: Row<T>) => {
      if (!withSecondary || !r.secondary) return null
      const room = width * 0.36 - 16 - head(r)
      if (textWidth(r.secondary, 11) <= room) return r.secondary
      return room >= 40 ? truncateText(r.secondary, room, 11) : null
    }
    const tails = rows.map(tailText)
    const tailWidth = (r: Row<T>, i: number) =>
      head(r) + (tails[i] ? textWidth(tails[i] as string, 11) + 5 : 0)
    const marginRight = hasTail ? Math.ceil(Math.max(16, ...rows.map((r, i) => tailWidth(r, i) + 16))) : 16
    const ext = extent(
      rows.flatMap((r) => [r.min, r.max, r.mid, r.q1, r.q3, ...r.marks, refLine ? refLine.value : null]),
    )
    const axis = numericAxis(
      ext?.[0] ?? 0,
      ext?.[1] ?? 1,
      format,
      Math.max(3, Math.floor((width - marginLeft - marginRight) / 90)),
      xDomain,
    )
    const ranged = rows.filter((r) => r.min != null && r.max != null)
    const inset = (thickness: number) => Math.max(0, (rowHeight - thickness) / 2)
    const marks: Plot.Markish[] = [
      gridX(t, { ticks: axis.ticks }),
      hoverBand(rows, { axis: 'y', value: (r) => r.key, color: t.ink }),
    ]
    if (quartiles) {
      marks.push(
        Plot.ruleY(ranged, {
          y: (r) => r.key,
          x1: (r) => r.min,
          x2: (r) => r.max,
          stroke: t.ink2,
          strokeWidth: 1,
        }),
        Plot.barX(
          rows.filter((r) => r.q1 != null && r.q3 != null),
          {
            y: (r) => r.key,
            x1: (r) => r.q1,
            x2: (r) => r.q3,
            fill: t.seq[200],
            insetTop: inset(14),
            insetBottom: inset(14),
            r: 2,
          },
        ),
      )
    } else {
      marks.push(
        Plot.barX(ranged, {
          y: (r) => r.key,
          x1: (r) => r.min,
          x2: (r) => r.max,
          fill: (r: Row<T>) => (r.deemph ? t.rule : t.seq[100]),
          insetTop: inset(10),
          insetBottom: inset(10),
          r: 3,
        }),
      )
    }
    if (mid) {
      marks.push(
        Plot.tickX(
          rows.filter((r) => r.mid != null),
          {
            y: (r) => r.key,
            x: (r) => r.mid,
            stroke: t.ink,
            strokeWidth: 2,
            insetTop: inset(16),
            insetBottom: inset(16),
          },
        ),
      )
    }
    if (refLine) marks.push(...refRule(refLine, 'x', t))
    markerDefs.forEach((_, i) => {
      marks.push(
        Plot.dot(
          rows.filter((r) => r.marks[i] != null),
          {
            y: (r) => r.key,
            x: (r) => r.marks[i],
            r: 4.5,
            fill: (r: Row<T>) => (r.deemph ? t.deemph : seriesColor(t, i)),
            stroke: t.sheet,
            strokeWidth: 2,
          },
        ),
      )
    })
    marks.push(
      labelsMark(
        (scales, dims) =>
          rows.flatMap((r, i) =>
            bandLabel(
              r.label,
              band.lines[i],
              dims.marginLeft - 10,
              scalePos(scales, 'y', r.key),
              r.deemph ? t.muted : t.ink2,
            ),
          ),
        'category labels',
      ),
      axisX(t, { ticks: axis.ticks, tickFormat: axis.format }),
    )
    if (hasTail)
      marks.push(
        labelsMark(
          (scales, dims) =>
            rows.flatMap((r, i) => {
              const tail = tails[i]
              if (!r.glyph && !r.word && !tail) return []
              return [
                {
                  x: dims.width - dims.marginRight + 10,
                  y: scalePos(scales, 'y', r.key),
                  anchor: 'start' as const,
                  glyph: r.glyph ? { shape: glyphForTone(r.glyph), color: toneColor(t, r.glyph) } : undefined,
                  parts: [
                    ...(r.word ? [{ text: r.word, color: t.ink, size: 11, weight: 500 }] : []),
                    ...(tail ? [{ text: tail, color: t.muted, size: 11 }] : []),
                  ],
                },
              ]
            }),
          'row status',
        ),
      )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom: 26,
        marginLeft,
        x: { domain: axis.domain },
        y: { type: 'band', domain: rows.map((r) => r.key), padding: 0, round: false, axis: null },
        marks,
      },
    )
  }

  /** A row with nothing drawn (every value hidden) never opens; the view's gate decides the rest. */
  const hasRange = (r: Row<T>) =>
    r.min != null || r.max != null || r.mid != null || r.marks.some((v) => v != null)
  const open = gateOf<Row<T>>(hasRange, selectable ? (r) => selectable(r.datum) : undefined)
  const tip = (r: Row<T>): TipContent => {
    const out: TipRow[] = [
      { value: fmt(r.min, format), label: labels?.min ?? 'Minimum', strong: false },
      ...(quartiles ? [{ value: fmt(r.q1, format), label: '25th percentile', strong: false }] : []),
      ...(mid ? [{ value: fmt(r.mid, format), label: midName }] : []),
      ...(quartiles ? [{ value: fmt(r.q3, format), label: '75th percentile', strong: false }] : []),
      { value: fmt(r.max, format), label: labels?.max ?? 'Maximum', strong: false },
      ...markerDefs.map((m, i) => ({
        value: fmt(r.marks[i], format),
        label: m.label,
        color: markerColor(i),
        shape: 'dot' as const,
      })),
    ]
    const extra = [r.word, r.secondary].filter(Boolean).join(' · ')
    if (extra) out.push({ value: extra, strong: false })
    const locked = onSelect && !open(r) && hasRange(r) ? lockedNote?.(r.datum) : null
    return { title: r.label, rows: out, ...(locked ? { note: locked } : {}) }
  }

  // Keyboard: rows top to bottom; the outline wraps the range.
  const keyPoints = (plot: PlotElement) =>
    rows.map((r) => {
      const a = plotPos(plot, 'x', r.min ?? r.mid ?? 0)
      const b = plotPos(plot, 'x', r.max ?? r.mid ?? 0)
      return {
        datum: r,
        x: (a + b) / 2,
        y: plotPos(plot, 'y', r.key),
        w: Math.max(8, Math.abs(b - a)),
        h: 12,
      }
    })

  return (
    <PlotChart<Row<T>>
      keyPoints={keyPoints}
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      selectable={open}
      onSelect={onSelect ? (r) => onSelect(r.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
