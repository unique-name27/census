/**
 * Vertical bars over categories or months: one series, grouped series, or stacked series.
 * Bars are at most 24px wide with a 4px rounded data end; stacked segments are separated by a
 * 2px gap in the sheet color and only the top segment is rounded. Values sit on the caps when
 * they fit (single series, and stack totals), lifted above the reference rule when it would run
 * through them; a stack whose values are all hidden has no bar and a "—" cap. Clicking a stacked
 * segment or a grouped bar drills that series (`onSelectSegment`), elsewhere the category.
 * Up to two `notes` annotate the columns a finding cites; the chart is one tab stop whose arrow
 * keys step through the bars (across series with Up and Down). Default height 220px, 180px on
 * phones; month axes always keep at least three labels (first, middle, last).
 *
 * `glyphTone` (one series): the bar keeps its series color and a status glyph sits beside the
 * cap value (above the bar when there are no caps), so status reads by shape and the bar color
 * still means the series. `tone` fills the bar instead, for emphasis.
 *
 *   <Columns data={buckets} x="bucket" y="managers" glyphTone={(d) => (d.outlier ? 'warning' : 'default')} />
 */
import * as Plot from '@observablehq/plot'
import { useNarrow } from '@/components/useNarrow'
import { formatMonth, formatMonthShort } from '@/lib/dates'
import { DASH, type Format, fmt } from '@/lib/format'
import { isStatusTone, toneColor } from '../core/color'
import type { KeyPoint } from '../core/keyboard'
import type { LegendSpec } from '../core/legend'
import {
  glyphForTone,
  glyphPath,
  hoverBand,
  labelsMark,
  noteMark,
  refLabelWidth,
  refRule,
  roundedBarsY,
  scalePos,
  svgEl,
} from '../core/marks'
import { maxTextWidth, textWidth } from '../core/measure'
import { type Box, type ChartNote, NOTE_HEADROOM } from '../core/notes'
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
  plotBand,
  plotPos,
} from '../plot'
import { useChartTheme } from '../theme'
import { clearOfRules, groupIndexAt, groupLayout, segmentAt } from './hit'
import { type Category, categoryModel, minThreeTicks, stackSegments } from './prepare'
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
  /** Per-column fill tone (single series only), for emphasis. */
  tone?: (d: T) => Tone
  /** Per-column status glyph beside the cap (single series only); the bar keeps its color. */
  glyphTone?: (d: T) => Tone
  /** Value labels on the caps (default: when every label fits). */
  labels?: boolean
  yDomain?: [number, number]
  /** Plot height in px (default 220, 180 on phones). */
  height?: number
  /**
   * Up to two annotations tied to a column: `at` is its category (a month key "YYYY-MM" for
   * month axes), `value` defaults to the column's top; `series` picks a grouped bar.
   */
  notes?: readonly ChartNote[]
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
  glyphTone,
  labels,
  yDomain,
  height: heightProp,
  notes,
  onSelect,
  onSelectSegment,
  selectable,
  lockedNote,
  ariaLabel,
}: ColumnsProps<T>) {
  const narrow = useNarrow()
  const height = heightProp ?? (narrow ? 180 : 220)
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

  /** The status glyph a column carries: a status tone from `glyphTone` on its first row. */
  const statusOf = (c: Category<T>) => {
    const d = c.cells[0]?.datum
    const g = d && glyphTone ? glyphTone(d) : null
    return isStatusTone(g) ? g : null
  }

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
    // Notes get headroom above the plot, so a note on the tallest column has somewhere to go.
    // Status glyphs (one series): beside the cap, or above the bar when there are no caps.
    const glyphs = new Map<string, NonNullable<ReturnType<typeof statusOf>>>()
    if (!multi && glyphTone)
      for (const c of cats) {
        const g = statusOf(c)
        if (g) glyphs.set(c.key, g)
      }
    const glyphRoom = glyphs.size && !showCaps ? 12 : 0
    const marginTop = (showCaps ? 18 : 8) + glyphRoom + (notes?.length ? NOTE_HEADROOM : 0)

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
      tickKeys = minThreeTicks(
        cats.map((c) => c.key),
        cats.filter((_, i) => i % every === 0).map((c) => c.key),
      )
      // The year shows on the first tick and wherever it changes, so thinned ticks that skip
      // January still say which Feb is which.
      const shown = tickKeys
      const withYear = new Set(shown.filter((k, i) => i === 0 || k.slice(0, 4) !== shown[i - 1].slice(0, 4)))
      tickLabel = (k: string) => formatMonthShort(`${k}-01`, withYear.has(k))
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
            // An empty column gets no "0" cap: no bar reads as none, and the table keeps the zero.
            cats
              .filter((c) => (stacked ? c.total : c.cells[0]?.value) !== 0)
              .map((c) => {
                const v = stacked ? c.total : (c.cells[0]?.value ?? null)
                // A cap is ~12px tall around y; lift it above the reference rule when the rule would cross it.
                const y = scalePos(scales, 'y', Math.max(0, v ?? 0)) - 8
                const refPx = refLine ? [-scalePos(scales, 'y', refLine.value)] : []
                // With a status glyph, the glyph and the value are centred on the column together.
                const g = glyphs.has(c.key) ? 6 : 0
                return {
                  x: scalePos(scales, 'x', c.key) + g,
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
    if (glyphs.size) {
      marks.push((_i, scales, _v, _d, context) => {
        const g = svgEl(context.document, 'g', { 'aria-label': 'status glyphs' })
        for (const c of cats) {
          const tone = glyphs.get(c.key)
          const v = c.cells[0]?.value
          if (!tone || v == null) continue
          const cx = scalePos(scales, 'x', c.key)
          const top = scalePos(scales, 'y', Math.max(0, v))
          let x = cx
          let y = top - 9
          if (showCaps) {
            // Left of the cap value, at its height (the same lift as the cap label).
            const refPx = refLine ? [-scalePos(scales, 'y', refLine.value)] : []
            y = -clearOfRules(-(top - 8 + 6), 12, refPx, 2) - 6
            x = cx - textWidth(capText(c), 11, 500) / 2 - 2
          }
          const p = svgEl(context.document, 'path', { d: glyphPath(glyphForTone(tone), x, y) })
          p.style.fill = toneColor(t, tone)
          g.append(p)
        }
        return g
      })
    }
    if (notes?.length) {
      const keyOf = (at: string | number) => (month ? String(at).slice(0, 7) : String(at))
      const { thickness } = barInset(step, 24, 0.62)
      marks.push(
        noteMark(t, (scales) => {
          const obstacles: Box[] = cats.map((c) => {
            const top = stacked ? (c.total ?? 0) : Math.max(0, ...c.cells.map((cell) => cell.value ?? 0))
            const x = scalePos(scales, 'x', c.key)
            const y = scalePos(scales, 'y', top) - (showCaps ? 16 : 2)
            const w = multi && !stacked ? step * 0.8 : thickness
            return { x: x - w / 2, y, w, h: scalePos(scales, 'y', 0) - y }
          })
          const anchors = notes.flatMap((n) => {
            const c = cats.find((k) => k.key === keyOf(n.at))
            if (!c) return []
            const cell = n.series ? c.cells.find((k) => k.series === n.series) : c.cells[0]
            const v = n.value ?? (stacked ? c.total : (cell?.value ?? null))
            if (v == null) return []
            const top = scalePos(scales, 'y', v) - (showCaps && (!multi || stacked) ? 16 : 0)
            return [{ x: scalePos(scales, 'x', c.key), y: top, text: n.text }]
          })
          return { anchors, obstacles }
        }),
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

  // Keyboard: bars left to right; with several series, Up and Down move across them.
  const keyPoints = (plot: PlotElement): KeyPoint<Category<T>>[] => {
    const cats = model.categories
    const bw = plotBand(plot, 'x')
    const y0 = plotPos(plot, 'y', 0)
    const bar = (
      c: Category<T>,
      part: string | null,
      lo: number,
      hi: number,
      x: number,
      w: number,
      group?: string,
    ) => {
      const a = plotPos(plot, 'y', lo)
      const b = plotPos(plot, 'y', hi)
      return { datum: c, part, x, y: (a + b) / 2, w, h: Math.max(4, Math.abs(a - b)), group }
    }
    if (!multi)
      return cats.map((c) => {
        const v = c.cells[0]?.value ?? 0
        const x = plotPos(plot, 'x', c.key)
        return v
          ? bar(c, null, 0, v, x, barInset(bw, 24, 0.62).thickness)
          : { datum: c, part: null, x, y: y0 }
      })
    if (stacked)
      return model.series.flatMap((s) =>
        segments
          .filter((g) => g.series === s)
          .flatMap((g) => {
            const c = cats.find((k) => k.key === g.cat)
            return c
              ? [bar(c, s, g.lo, g.hi, plotPos(plot, 'x', g.cat), barInset(bw, 24, 0.62).thickness, s)]
              : []
          }),
      )
    const n = model.series.length
    const g = groupLayout(bw, n, bw * 0.8)
    return model.series.flatMap((s, i) =>
      cats.flatMap((c) => {
        const cell = c.cells.find((k) => k.series === s && k.value != null)
        if (!cell || cell.value == null) return []
        const x = plotPos(plot, 'x', c.key) - bw / 2 + g.start + i * (g.size + g.gap) + g.size / 2
        return [bar(c, s, 0, cell.value, x, g.size, s)]
      }),
    )
  }

  return (
    <PlotChart<Category<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      keyPoints={keyPoints}
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
