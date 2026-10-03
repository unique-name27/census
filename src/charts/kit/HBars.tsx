/**
 * Horizontal bars per category: one series, grouped series, stacked series, or 100% stacked
 * (`stack: 'normalize'`) for part-to-whole with long category names. Segment labels go inside
 * a segment only when they fit; the legend and tooltip carry the rest.
 */
import * as Plot from '@observablehq/plot'
import { DASH, type Format, fmt } from '@/lib/format'
import { inkOn } from '../core/color'
import type { LegendSpec } from '../core/legend'
import { hoverBand, labelsMark, refRule, roundedBarsX, scalePos } from '../core/marks'
import { maxTextWidth, textWidth, truncateText } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import { axisX, baseline, gridX, housePlot, type PlotBuildContext, PlotChart } from '../plot'
import { seriesColor, useChartTheme } from '../theme'
import { type Category, categoryModel, type StackSegment, stackSegments } from './prepare'
import { extent, numericAxis } from './scale'
import { barInset, type ChartBaseProps, HIDDEN_NOTE, type Key, type RefLine } from './shared'

export interface HBarsProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  /** Category property (rows). */
  y: Key<T>
  /** Value property. */
  x: Key<T>
  series?: Key<T>
  /** Stack series, or stack shares of each row's total (100% bars). */
  stack?: boolean | 'normalize'
  seriesOrder?: readonly string[]
  yOrder?: readonly string[]
  format?: Format
  ref?: RefLine
  /** Values inside segments where they fit (default true for 100% bars). */
  labels?: boolean
  rowHeight?: number
  xDomain?: [number, number]
}

export function HBars<T extends object>({
  data,
  y,
  x,
  series,
  stack = false,
  seriesOrder,
  yOrder,
  format = 'int',
  ref: refLine,
  labels,
  rowHeight,
  xDomain,
  onSelect,
  ariaLabel,
}: HBarsProps<T>) {
  const model = categoryModel(data, { cat: y, value: x, series, catOrder: yOrder, seriesOrder })
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
  const colors = model.series.map((_, i) => seriesColor(theme, i))
  const legend: LegendSpec | null = multi
    ? { kind: 'swatch', items: model.series.map((s, i) => ({ label: s, color: colors[i], shape: 'rect' })) }
    : null
  const axisFormat: Format = normalize ? 'pct0' : format

  const build = ({ width, theme: t }: PlotBuildContext) => {
    const cats = model.categories
    if (!cats.length) return null
    const palette = model.series.map((_, i) => seriesColor(t, i))
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
    const shown = cats.map((c) => truncateText(c.label, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
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
          fill: t.series[0],
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
      const gap = 2
      const barH = Math.max(2, Math.min(24, (pitch - 12 - (n - 1) * gap) / n))
      const top0 = (pitch - (n * barH + (n - 1) * gap)) / 2
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
          cats.map((c, i) => ({
            x: dims.marginLeft - 10,
            y: scalePos(scales, 'y', c.key),
            anchor: 'end' as const,
            parts: [{ text: shown[i], color: t.ink2, size: 12 }],
            title: shown[i] === c.label ? undefined : c.label,
          })),
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

  const tip = (c: Category<T>): TipContent => {
    if (!multi) {
      const v = c.cells[0]?.value ?? null
      return { title: c.label, rows: [{ value: fmt(v, format) }], note: v == null ? HIDDEN_NOTE : undefined }
    }
    const rows: TipRow[] = model.series.map((s, i) => {
      const cell = c.cells.find((cell) => cell.series === s)
      const v = cell?.value ?? null
      const share = normalize && v != null && c.total > 0 ? ` (${fmt(v / c.total, 'pct')})` : ''
      return {
        value: v == null ? DASH : `${fmt(v, format)}${share}`,
        label: s,
        color: colors[i],
        shape: 'rect',
      }
    })
    if (stacked) rows.push({ value: fmt(c.total, format), label: 'Total' })
    return { title: c.label, rows }
  }

  return (
    <PlotChart<Category<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      onSelect={
        onSelect
          ? (c) => {
              if (c.cells[0]) onSelect(c.cells[0].datum)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}
