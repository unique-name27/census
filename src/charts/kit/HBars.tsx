/**
 * Horizontal bars per category: one series, grouped series, stacked series, or 100% stacked
 * (`stack: 'normalize'`) for part-to-whole with long category names. Segment labels go inside
 * a segment only when they fit; the legend and tooltip carry the rest. Clicking a stacked
 * segment or a grouped bar drills that series (`onSelectSegment`), elsewhere the category.
 * Up to two `notes` annotate a row (placed past the bar end when there is room); the chart is
 * one tab stop whose arrow keys step through the bars (across series with Up and Down).
 */
import * as Plot from '@observablehq/plot'
import { DASH, type Format, fmt } from '@/lib/format'
import { inkOn } from '../core/color'
import type { KeyPoint } from '../core/keyboard'
import type { LegendSpec } from '../core/legend'
import {
  bandLabel,
  bandLabelLines,
  hoverBand,
  labelsMark,
  noteMark,
  refRule,
  roundedBarsX,
  scalePos,
} from '../core/marks'
import { textWidth } from '../core/measure'
import type { Box, ChartNote } from '../core/notes'
import type { TipContent, TipRow } from '../core/tooltip'
import {
  axisX,
  baseline,
  gridX,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  plotBand,
  plotPos,
} from '../plot'
import { useChartTheme } from '../theme'
import { groupIndexAt, groupLayout, segmentAt } from './hit'
import { type Category, categoryModel, type StackSegment, stackSegments } from './prepare'
import { extent, numericAxis } from './scale'
import { otherLast, type SeriesColors, type SeriesScheme, seriesPalette } from './series'
import {
  barInset,
  type ChartBaseProps,
  HIDDEN_NOTE,
  type Key,
  orderedKeys,
  type RefLine,
  textAt,
} from './shared'

export interface HBarsProps<T extends object> extends Omit<ChartBaseProps<T>, 'selectable'> {
  data: readonly T[]
  /** Category property (rows). */
  y: Key<T>
  /** Value property. */
  x: Key<T>
  series?: Key<T>
  /** Stack series, or stack shares of each row's total (100% bars). */
  stack?: boolean | 'normalize'
  /** Series order for the legend, grouping and stacking ("Other" series always go last). */
  seriesOrder?: readonly string[]
  /** Per-series colors (resolved colors, e.g. from useChartTheme), overriding the scheme. */
  colors?: SeriesColors
  /** 'ordinal' maps `seriesOrder` onto the sequential ramp, for ordered series such as ratings 1-5. */
  scheme?: SeriesScheme
  yOrder?: readonly string[]
  format?: Format
  ref?: RefLine
  /** Values inside segments where they fit (default true for 100% bars). */
  labels?: boolean
  rowHeight?: number
  xDomain?: [number, number]
  /** Up to two annotations tied to a row: `at` is its category; `value` defaults to the bar end. */
  notes?: readonly ChartNote[]
  /**
   * Click-to-drill on one series: the row behind the stacked segment or grouped bar under the
   * pointer. Without it, such a click calls `onSelect` with that row (it still names the
   * category); clicks elsewhere in a row call `onSelect` with the category's first row.
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

export function HBars<T extends object>({
  data,
  y,
  x,
  series,
  stack = false,
  seriesOrder,
  colors: seriesColors,
  scheme,
  yOrder,
  format = 'int',
  ref: refLine,
  labels,
  rowHeight,
  xDomain,
  notes,
  onSelect,
  onSelectSegment,
  selectable,
  lockedNote,
  ariaLabel,
}: HBarsProps<T>) {
  const order = series
    ? otherLast(
        orderedKeys(
          data.map((d) => textAt(d, series)),
          seriesOrder,
        ),
      )
    : undefined
  const model = categoryModel(data, { cat: y, value: x, series, catOrder: yOrder, seriesOrder: order })
  const multi = !!series && model.series.length > 1
  const normalize = stack === 'normalize'
  const stacked = multi && stack !== false
  const grouped = multi && !stacked
  const segments = stacked ? stackSegments(model, normalize) : []
  const n = model.series.length
  const pitch = rowHeight ?? (grouped ? n * 12 + 14 : 30)
  const marginTop = refLine ? 22 : 4
  const height = marginTop + model.categories.length * pitch + 26

  const theme = useChartTheme()
  const paletteFor = (t: typeof theme) =>
    seriesPalette(t, model.series, { colors: seriesColors, scheme, order: seriesOrder })
  const colors = paletteFor(theme)
  const legend: LegendSpec | null = multi
    ? { kind: 'swatch', items: model.series.map((s, i) => ({ label: s, color: colors[i], shape: 'rect' })) }
    : null
  const axisFormat: Format = normalize ? 'pct0' : format

  const build = ({ width, theme: t }: PlotBuildContext) => {
    const cats = model.categories
    if (!cats.length) return null
    const palette = paletteFor(t)
    const values = stacked
      ? normalize
        ? [1]
        : cats.map((c) => c.total)
      : cats.flatMap((c) => c.cells.map((cell) => cell.value))
    const ext = extent([...values, 0, refLine?.value])
    const axis = numericAxis(
      ext?.[0] ?? 0,
      ext?.[1] ?? 1,
      axisFormat,
      Math.max(2, Math.min(6, Math.floor(width / 110))),
      normalize ? [0, 1] : xDomain,
    )
    const labelMax = Math.max(64, width * 0.34)
    // A label that would be cut breaks onto two lines instead (rows of 26px or more).
    const band = bandLabelLines(
      cats.map((c) => c.label),
      labelMax,
      pitch,
    )
    const marginLeft = Math.ceil(band.width) + 14
    const marginRight = Math.ceil(Math.max(12, textWidth(axis.format(axis.domain[1]), 11) / 2 + 4))

    const marks: Plot.Markish[] = [
      gridX(t, { ticks: axis.ticks }),
      hoverBand(cats, { axis: 'y', value: (c) => c.key, color: t.ink }),
    ]
    if (!multi) {
      const { inset } = barInset(pitch, 24, 0.5)
      const cells = cats.flatMap((c) =>
        c.cells.filter((cell) => cell.value != null).map((cell) => ({ cat: c.key, value: cell.value })),
      )
      marks.push(
        ...roundedBarsX(cells, (d) => d.value, {
          x1: 0,
          x2: (d: (typeof cells)[number]) => d.value,
          y: (d: (typeof cells)[number]) => d.cat,
          // One series: the series' own color when a series is named (gray for "Other"), else slot 1.
          fill: series ? palette[0] : t.series[0],
          insetTop: inset,
          insetBottom: inset,
        }),
      )
    } else if (stacked) {
      const { inset } = barInset(pitch, 24, 0.5)
      const opts = (top: boolean): Plot.BarXOptions => ({
        x1: (s: StackSegment<T>) => s.lo,
        x2: (s: StackSegment<T>) => s.hi,
        y: (s: StackSegment<T>) => s.cat,
        fill: (s: StackSegment<T>) => palette[s.seriesIndex],
        insetTop: inset,
        insetBottom: inset,
        ...(top ? { rx2: 4 } : { insetRight: 2 }),
      })
      marks.push(
        Plot.barX(
          segments.filter((s) => !s.top),
          opts(false),
        ),
        Plot.barX(
          segments.filter((s) => s.top),
          opts(true),
        ),
      )
    } else {
      const { size: barH, start: top0, gap } = groupLayout(pitch, n, pitch - 12)
      model.series.forEach((s, i) => {
        const top = top0 + i * (barH + gap)
        const cells = cats.flatMap((c) =>
          c.cells
            .filter((cell) => cell.series === s && cell.value != null)
            .map((cell) => ({ cat: c.key, value: cell.value })),
        )
        marks.push(
          ...roundedBarsX(
            cells,
            (d) => d.value,
            {
              x1: 0,
              x2: (d: (typeof cells)[number]) => d.value,
              y: (d: (typeof cells)[number]) => d.cat,
              fill: palette[i],
              insetTop: top,
              insetBottom: pitch - top - barH,
            },
            Math.min(4, barH / 2),
          ),
        )
      })
    }
    marks.push(baseline(t, 'x', 0))
    if (refLine) marks.push(...refRule(refLine, 'x', t))
    marks.push(
      labelsMark(
        (scales, dims) =>
          cats.flatMap((c, i) =>
            bandLabel(c.label, band.lines[i], dims.marginLeft - 10, scalePos(scales, 'y', c.key), t.ink2),
          ),
        'category labels',
      ),
    )
    if (stacked && (labels ?? normalize)) {
      marks.push(
        labelsMark(
          (scales) =>
            segments.flatMap((s) => {
              const text = normalize ? fmt(s.share, 'pct0') : fmt(s.value, format)
              const x0 = scalePos(scales, 'x', s.lo)
              const x1 = scalePos(scales, 'x', s.hi)
              if (textWidth(text, 11, 500) + 10 > x1 - x0) return []
              return [
                {
                  x: (x0 + x1) / 2,
                  y: scalePos(scales, 'y', s.cat),
                  anchor: 'middle' as const,
                  parts: [{ text, color: inkOn(t, palette[s.seriesIndex]), size: 11, weight: 500 }],
                },
              ]
            }),
          'segment values',
        ),
      )
    }
    if (notes?.length) {
      marks.push(
        noteMark(t, (scales) => {
          const end = (c: Category<T>) =>
            stacked
              ? normalize
                ? 1
                : (c.total ?? 0)
              : Math.max(0, ...c.cells.map((cell) => cell.value ?? 0))
          const obstacles: Box[] = cats.map((c) => {
            const x0 = scalePos(scales, 'x', 0)
            const yc = scalePos(scales, 'y', c.key)
            return { x: x0, y: yc - pitch / 2 + 2, w: scalePos(scales, 'x', end(c)) - x0 + 4, h: pitch - 4 }
          })
          const anchors = notes.flatMap((nt) => {
            const c = cats.find((k) => k.key === String(nt.at) || k.label === String(nt.at))
            if (!c) return []
            const cell = nt.series ? c.cells.find((k) => k.series === nt.series) : null
            const v = nt.value ?? cell?.value ?? end(c)
            return [{ x: scalePos(scales, 'x', v) + 2, y: scalePos(scales, 'y', c.key), text: nt.text }]
          })
          return { anchors, obstacles }
        }),
      )
    }
    marks.push(axisX(t, { ticks: axis.ticks, tickFormat: axis.format }))
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginBottom: 26,
        marginLeft,
        marginRight,
        x: { domain: axis.domain },
        y: { type: 'band', domain: cats.map((c) => c.key), padding: 0, round: false, axis: null },
        marks,
      },
    )
  }

  /** The series (stacked segment or grouped bar) under the pointer, from the plot's scales. */
  const pick = (c: Category<T>, at: PlotPointer, plot: PlotElement): string | null => {
    if (stacked) {
      const v = plot.scale('x')?.invert?.(at.x)
      return typeof v === 'number' ? (segmentAt(segments, c.key, v)?.series ?? null) : null
    }
    const ys = plot.scale('y')
    const bw = ys?.bandwidth ?? 0
    const i = groupIndexAt(at.y - Number(ys?.apply(c.key)), groupLayout(bw, n, bw - 12), n)
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
        title: c.label,
        rows: [{ value: fmt(v, format) }],
        note: v == null ? HIDDEN_NOTE : lockedOf(c, part),
      }
    }
    const total = c.total ?? 0
    const rows: TipRow[] = model.series.map((s, i) => {
      const cell = c.cells.find((cell) => cell.series === s)
      // In a stack a series with no row in this category adds nothing: show 0, not "—" (missing).
      const v = cell ? cell.value : stacked ? 0 : null
      const share = normalize && v != null && total > 0 ? ` (${fmt(v / total, 'pct')})` : ''
      return {
        value: v == null ? DASH : `${fmt(v, format)}${share}`,
        label: s,
        color: colors[i],
        shape: 'rect',
        ...(part === s ? { strong: true } : {}),
      }
    })
    if (stacked) rows.push({ value: fmt(c.total, format), label: 'Total' })
    return { title: c.label, rows, note: stacked && c.total == null ? HIDDEN_NOTE : lockedOf(c, part) }
  }

  // Keyboard: rows top to bottom. With several series each row is a group: Left and Right step
  // through its segments or bars, Up and Down move one row at a time (to the same series there).
  const keyPoints = (plot: PlotElement): KeyPoint<Category<T>>[] => {
    const cats = model.categories
    const bw = plotBand(plot, 'y')
    const bar = (
      c: Category<T>,
      part: string | null,
      lo: number,
      hi: number,
      y: number,
      h: number,
      group?: string,
    ) => {
      const a = plotPos(plot, 'x', lo)
      const b = plotPos(plot, 'x', hi)
      return { datum: c, part, x: (a + b) / 2, y, w: Math.max(4, Math.abs(b - a)), h, group }
    }
    const thick = barInset(pitch, 24, 0.5).thickness
    if (!multi)
      return cats.map((c) => bar(c, null, 0, c.cells[0]?.value ?? 0, plotPos(plot, 'y', c.key), thick))
    if (stacked)
      return cats.flatMap((c) =>
        model.series.flatMap((sr) => {
          const s = segments.find((g) => g.cat === c.key && g.series === sr)
          return s ? [bar(c, sr, s.lo, s.hi, plotPos(plot, 'y', c.key), thick, c.key)] : []
        }),
      )
    const g = groupLayout(bw, n, bw - 12)
    return cats.flatMap((c) =>
      model.series.flatMap((sr, i) => {
        const cell = c.cells.find((k) => k.series === sr && k.value != null)
        if (!cell || cell.value == null) return []
        const yc = plotPos(plot, 'y', c.key) - bw / 2 + g.start + i * (g.size + g.gap) + g.size / 2
        return [bar(c, sr, 0, cell.value, yc, g.size, c.key)]
      }),
    )
  }

  return (
    <PlotChart<Category<T>>
      keyPoints={keyPoints}
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
