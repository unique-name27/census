/**
 * Vertical bars over categories or months: one series, grouped series, or stacked series.
 * Bars are at most 24px wide with a 4px rounded data end; stacked segments are separated by a
 * 2px gap in the sheet color and only the top segment is rounded. Values sit on the caps when
 * they fit (single series, and stack totals), lifted above the reference rule when it would run
 * through them; a stack whose values are all hidden has no bar and a "—" cap. Clicking a stacked
 * segment or a grouped bar drills that series (`onSelectSegment`), elsewhere the category.
 */
import * as Plot from '@observablehq/plot'
import { formatMonth, formatMonthShort } from '@/lib/dates'
import { DASH, type Format, fmt } from '@/lib/format'
import { toneColor } from '../core/color'
import type { LegendSpec } from '../core/legend'
import { hoverBand, labelsMark, refLabelWidth, refRule, roundedBarsY, scalePos } from '../core/marks'
import { maxTextWidth, textWidth } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import {
  axisX,
  axisY,
  baseline,
  gridY,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
} from '../plot'
import { useChartTheme } from '../theme'
import { clearOfRules, groupIndexAt, groupLayout, segmentAt } from './hit'
import { type Category, categoryModel, stackSegments } from './prepare'
import { bandLabelLayout, extent, numericAxis } from './scale'
import { otherLast, type SeriesColors, type SeriesScheme, seriesPalette } from './series'
import {
  barInset,
  type ChartBaseProps,
  HIDDEN_NOTE,
  type Key,
  orderedKeys,
  type RefLine,
  type Tone,
  textAt,
} from './shared'

export interface ColumnsProps<T extends object> extends Omit<ChartBaseProps<T>, 'selectable'> {
  data: readonly T[]
  /** Category (or month, with xType 'month': "YYYY-MM" or an ISO date). */
  x: Key<T>
  y: Key<T>
  /** Series property for grouped or stacked columns. */
  series?: Key<T>
  stack?: boolean
  /** Series order for the legend, grouping and stacking ("Other" series always go last). */
  seriesOrder?: readonly string[]
  /** Per-series colors (resolved colors, e.g. from useChartTheme), overriding the scheme. */
  colors?: SeriesColors
  /** 'ordinal' maps `seriesOrder` onto the sequential ramp, for ordered series such as ratings 1-5. */
  scheme?: SeriesScheme
  /** Category order (band x); months always run oldest to newest. */
  xOrder?: readonly string[]
  xType?: 'band' | 'month'
  format?: Format
  ref?: RefLine
  /** Per-column tone (single series only), e.g. emphasis or status. */
  tone?: (d: T) => Tone
  /** Value labels on the caps (default: when every label fits). */
  labels?: boolean
  yDomain?: [number, number]
  height?: number
  /**
   * Click-to-drill on one series: the row behind the stacked segment or grouped bar under the
   * pointer. Without it, such a click calls `onSelect` with that row (it still names the
   * category); clicks elsewhere in a column call `onSelect` with the category's first row.
   */
  onSelectSegment?: (d: T) => void
  /**
   * Whether a click opens records (pass the view's drill gate). `segment` is true for a click on
   * one series' bar or segment (it calls `onSelectSegment`, or `onSelect` with that row) and false
   * for a click elsewhere in the category (`onSelect` with the category's first row). A bar
   * without a value never opens.
   */
  selectable?: (d: T, segment: boolean) => boolean
}

export function Columns<T extends object>({
  data,
  x,
  y,
  series,
  stack = false,
  seriesOrder,
  colors: seriesColors,
  scheme,
  xOrder,
  xType = 'band',
  format = 'int',
  ref: refLine,
  tone,
  labels,
  yDomain,
  height = 240,
  onSelect,
  onSelectSegment,
  selectable,
  lockedNote,
  ariaLabel,
}: ColumnsProps<T>) {
  const month = xType === 'month'
  const order = series
    ? otherLast(
        orderedKeys(
          data.map((d) => textAt(d, series)),
          seriesOrder,
        ),
      )
    : undefined
  const model = categoryModel(data, { cat: x, value: y, series, catOrder: xOrder, seriesOrder: order, month })
  const multi = !!series && model.series.length > 1
  const stacked = multi && stack
  const segments = stacked ? stackSegments(model) : []
  const catTitle = (k: string) => (month ? formatMonth(`${k}-01`) : k)
  const catTick = (k: string, i: number) =>
    month ? formatMonthShort(`${k}-01`, i === 0 || k.endsWith('-01')) : k

  const theme = useChartTheme()
  const paletteFor = (t: typeof theme) =>
    seriesPalette(t, model.series, { colors: seriesColors, scheme, order: seriesOrder })
  const legendColors = paletteFor(theme)
  const legend: LegendSpec | null = multi
    ? {
        kind: 'swatch',
        items: model.series.map((s, i) => ({ label: s, color: legendColors[i], shape: 'rect' })),
      }
    : null

  const build = ({ width, theme: t }: PlotBuildContext) => {
    const cats = model.categories
    if (!cats.length) return null
    const values = stacked ? cats.map((c) => c.total) : cats.flatMap((c) => c.cells.map((cell) => cell.value))
    const ext = extent([...values, 0, refLine?.value])
    const axis = numericAxis(ext?.[0] ?? 0, ext?.[1] ?? 1, format, height < 200 ? 4 : 5, yDomain)
    const marginLeft = Math.ceil(axis.labelWidth) + 10
    const marginRight = refLine ? Math.max(8, refLabelWidth(refLine)) : 8
    const step = (width - marginLeft - marginRight) / cats.length
    const colors = paletteFor(t)
    // One series: the series' own color when a series is named (gray for "Other"), else slot 1.
    const single = series ? colors[0] : t.series[0]

    const capText = (c: Category<T>) => fmt(stacked ? c.total : c.cells[0]?.value, format)
    const showCaps =
      (labels ?? true) && (!multi || stacked) && cats.every((c) => textWidth(capText(c), 11, 500) <= step - 4)
    const marginTop = showCaps ? 18 : 8

    // Months may be thinned (the sequence reads on its own); categories always keep every name.
    const tickIndex = new Map(cats.map((c, i) => [c.key, i]))
    let tickKeys = cats.map((c) => c.key)
    let tickLabel = (k: string) => catTick(k, tickIndex.get(k) ?? 0)
    let tickRotate = 0
    let marginBottom = 24
    if (month) {
      const every = Math.max(
        1,
        Math.ceil(
          (maxTextWidth(
            cats.map((c, i) => catTick(c.key, i)),
            11,
          ) +
            10) /
            step,
        ),
      )
      tickKeys = cats.filter((_, i) => i % every === 0).map((c) => c.key)
    } else {
      const lay = bandLabelLayout(tickKeys, step)
      tickLabel = lay.text
      tickRotate = lay.rotate
      marginBottom = lay.margin
    }

    const marks: Plot.Markish[] = [
      gridY(t, { ticks: axis.ticks }),
      hoverBand(cats, { axis: 'x', value: (c) => c.key, color: t.ink }),
    ]
    if (!multi) {
      const { inset } = barInset(step, 24, 0.62)
      const cells = cats.flatMap((c) =>
        c.cells.filter((cell) => cell.value != null).map((cell) => ({ cat: c.key, ...cell })),
      )
      marks.push(
        ...roundedBarsY(cells, (d) => d.value, {
          x: (d: (typeof cells)[number]) => d.cat,
          y1: 0,
          y2: (d: (typeof cells)[number]) => d.value,
          fill: (d: (typeof cells)[number]) => (tone ? toneColor(t, tone(d.datum)) : single),
          insetLeft: inset,
          insetRight: inset,
        }),
      )
    } else if (stacked) {
      const { inset } = barInset(step, 24, 0.62)
      const opts = (top: boolean): Plot.BarYOptions => ({
        x: (s: (typeof segments)[number]) => s.cat,
        y1: (s: (typeof segments)[number]) => s.lo,
        y2: (s: (typeof segments)[number]) => s.hi,
        fill: (s: (typeof segments)[number]) => colors[s.seriesIndex],
        insetLeft: inset,
        insetRight: inset,
        // Bar radii are in screen space: ry1 is the top edge, the data end of a positive stack.
        ...(top ? { ry1: 4 } : { insetTop: 2 }),
      })
      marks.push(
        Plot.barY(
          segments.filter((s) => !s.top),
          opts(false),
        ),
        Plot.barY(
          segments.filter((s) => s.top),
          opts(true),
        ),
      )
    } else {
      const n = model.series.length
      const { size: barW, start: left0, gap } = groupLayout(step, n, step * 0.8)
      model.series.forEach((s, i) => {
        const left = left0 + i * (barW + gap)
        const cells = cats.flatMap((c) =>
          c.cells
            .filter((cell) => cell.series === s && cell.value != null)
            .map((cell) => ({ cat: c.key, value: cell.value })),
        )
        marks.push(
          ...roundedBarsY(
            cells,
            (d) => d.value,
            {
              x: (d: (typeof cells)[number]) => d.cat,
              y1: 0,
              y2: (d: (typeof cells)[number]) => d.value,
              fill: colors[i],
              insetLeft: left,
              insetRight: step - left - barW,
            },
            Math.min(4, barW / 2),
          ),
        )
      })
    }
    marks.push(baseline(t, 'y', 0))
    if (refLine) marks.push(...refRule(refLine, 'y', t, 'outside'))
    if (showCaps) {
      marks.push(
        labelsMark(
          (scales) =>
            cats.map((c) => {
              const v = stacked ? c.total : (c.cells[0]?.value ?? null)
              // A cap is ~12px tall around y; lift it above the reference rule when the rule would cross it.
              const y = scalePos(scales, 'y', Math.max(0, v ?? 0)) - 8
              const refPx = refLine ? [-scalePos(scales, 'y', refLine.value)] : []
              return {
                x: scalePos(scales, 'x', c.key),
                y: -clearOfRules(-(y + 6), 12, refPx, 2) - 6,
                anchor: 'middle' as const,
                halo: t.sheet,
                parts: [
                  {
                    text: v == null ? DASH : capText(c),
                    color: v == null ? t.muted : t.ink,
                    size: 11,
                    weight: 500,
                  },
                ],
              }
            }),
          'values',
        ),
      )
    }
    marks.push(
      axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
      axisX(t, { ticks: tickKeys, tickFormat: tickLabel, tickRotate }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        x: { type: 'band', domain: cats.map((c) => c.key), padding: 0, round: false },
        y: { domain: axis.domain },
        marks,
      },
    )
  }

  /** The series (stacked segment or grouped bar) under the pointer, from the plot's scales. */
  const pick = (c: Category<T>, at: PlotPointer, plot: PlotElement): string | null => {
    if (stacked) {
      const v = plot.scale('y')?.invert?.(at.y)
      return typeof v === 'number' ? (segmentAt(segments, c.key, v)?.series ?? null) : null
    }
    const xs = plot.scale('x')
    const bw = xs?.bandwidth ?? 0
    const n = model.series.length
    const i = groupIndexAt(at.x - Number(xs?.apply(c.key)), groupLayout(bw, n, bw * 0.8), n)
    const s = i == null ? null : model.series[i]
    return s != null && c.cells.some((cell) => cell.series === s && cell.value != null) ? s : null
  }
  /** The row behind the hovered series, when it has a value. */
  const cellOf = (c: Category<T>, part: string | null) =>
    part == null ? undefined : c.cells.find((cell) => cell.series === part && cell.value != null)
  /** Whether the click under the pointer opens records: a bar with a value that the view's gate lets open. */
  const canOpen = (c: Category<T>, part: string | null): boolean => {
    const cell = cellOf(c, part)
    if (cell) return !!(onSelectSegment ?? onSelect) && (selectable?.(cell.datum, true) ?? true)
    const first = c.cells[0]
    return (
      !!onSelect &&
      !!first &&
      c.cells.some((x) => x.value != null) &&
      (selectable?.(first.datum, false) ?? true)
    )
  }
  /** Why a bar with a value doesn't open, for the tooltip. */
  const lockedOf = (c: Category<T>, part: string | null): string | undefined => {
    if (!lockedNote || !(onSelect || onSelectSegment) || canOpen(c, part)) return undefined
    const d = (cellOf(c, part) ?? c.cells.find((x) => x.value != null))?.datum
    return d ? (lockedNote(d) ?? undefined) : undefined
  }

  const tip = (c: Category<T>, part: string | null): TipContent => {
    if (!multi) {
      const v = c.cells[0]?.value ?? null
      return {
        title: catTitle(c.key),
        rows: [{ value: fmt(v, format) }],
        note: v == null ? HIDDEN_NOTE : lockedOf(c, part),
      }
    }
    const rows: TipRow[] = model.series.map((s, i) => {
      const cell = c.cells.find((cell) => cell.series === s)
      // In a stack a series with no row in this category adds nothing: show 0, not "—" (missing).
      return {
        value: fmt(cell ? cell.value : stacked ? 0 : null, format),
        label: s,
        color: legendColors[i],
        shape: 'rect',
        ...(part === s ? { strong: true } : {}),
      }
    })
    if (stacked) rows.reverse().push({ value: fmt(c.total, format), label: 'Total' })
    return {
      title: catTitle(c.key),
      rows,
      note: stacked && c.total == null ? HIDDEN_NOTE : lockedOf(c, part),
    }
  }

  return (
    <PlotChart<Category<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={multi ? pick : undefined}
      selectable={canOpen}
      onSelect={
        onSelect || onSelectSegment
          ? (c, part) => {
              const cell = cellOf(c, part)
              if (cell) (onSelectSegment ?? onSelect)?.(cell.datum)
              else if (c.cells[0]) onSelect?.(c.cells[0].datum)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}
