/**
 * Distribution of a numeric field: binned columns with 2px gaps, an optional shaded band for the
 * healthy range (e.g. compa-ratio 0.90 to 1.10) and labeled reference rules (labels above the
 * plot; the band label steps past any rule). Click a bin to drill into its rows when the chart
 * was given `data`.
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import { HOVER_CLASS, labelsMark, scalePos } from '../core/marks'
import { textWidth } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import {
  axisX,
  axisY,
  baseline,
  gridY,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  plotPos,
} from '../plot'
import { clearOfRules } from './hit'
import { type HistogramBin, histogramBins } from './prepare'
import { numericAxis } from './scale'
import type { ChartBaseProps, Key, RefLine } from './shared'

export interface HistogramProps<T extends object> extends ChartBaseProps<HistogramBin<T>> {
  /** Plain values, or `data` + `value`. */
  values?: readonly number[]
  data?: readonly T[]
  value?: Key<T>
  /** Bin count (approximate, nice edges) or explicit edges. Default 20. */
  thresholds?: number | readonly number[]
  /** Fix the binned range, e.g. [0.7, 1.3]. */
  domain?: [number, number]
  format?: Format
  /** Shaded healthy zone [lo, hi]. */
  band?: [number, number]
  bandLabel?: string
  refs?: RefLine[]
  /** What one count is, for the tooltip: "people", "reqs". */
  unit?: string
  height?: number
  /** A bin's name in the tooltip and keyboard line, e.g. "4 d after" for a one-day bin (default "4 to 5"). */
  binLabel?: (x0: number, x1: number) => string
}

export function Histogram<T extends object>({
  values,
  data,
  value,
  thresholds = 20,
  domain,
  format = 'num2',
  band,
  bandLabel,
  refs = [],
  unit = 'people',
  binLabel,
  height = 220,
  onSelect,
  ariaLabel,
}: HistogramProps<T>) {
  const items: { v: number; d: T | null }[] =
    data && value
      ? data.flatMap((d) => {
          const v = (d as Record<string, unknown>)[value]
          return typeof v === 'number' && Number.isFinite(v) ? [{ v, d }] : []
        })
      : (values ?? []).filter(Number.isFinite).map((v) => ({ v, d: null }))
  const bins = histogramBins<T>(items, thresholds, domain)
  const total = items.length

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!bins.length) return null
    const x0 = Math.min(bins[0].x0, band?.[0] ?? Number.POSITIVE_INFINITY, ...refs.map((r) => r.value))
    const x1 = Math.max(
      bins[bins.length - 1].x1,
      band?.[1] ?? Number.NEGATIVE_INFINITY,
      ...refs.map((r) => r.value),
    )
    const yMax = Math.max(...bins.map((b) => b.n))
    const yAxis = numericAxis(0, yMax, 'int', 4)
    const marginLeft = Math.ceil(yAxis.labelWidth) + 10
    const marginRight = 10
    const plotW = width - marginLeft - marginRight
    const xAxis = numericAxis(x0, x1, format, Math.max(3, Math.floor(plotW / 70)), [x0, x1])
    const minBinPx = Math.min(...bins.map((b) => ((b.x1 - b.x0) / (x1 - x0 || 1)) * plotW))
    const radius = Math.max(0, Math.min(4, minBinPx / 2 - 1))
    const sortedRefs = refs.slice().sort((a, b) => a.value - b.value)
    // Reference labels that would collide go up a row.
    const refRows: number[] = []
    sortedRefs.forEach((r, i) => {
      const px = ((r.value - x0) / (x1 - x0 || 1)) * plotW
      const prev = sortedRefs[i - 1]
      const prevPx = prev ? ((prev.value - x0) / (x1 - x0 || 1)) * plotW : Number.NEGATIVE_INFINITY
      const clash =
        prev && px - prevPx < (textWidth(prev.label, 11, 500) + textWidth(r.label, 11, 500)) / 2 + 8
      refRows.push(clash ? (refRows[i - 1] + 1) % 2 : 0)
    })
    const marginTop = refs.length ? (refRows.includes(1) ? 32 : 19) : 8

    const marks: Plot.Markish[] = [gridY(t, { ticks: yAxis.ticks })]
    if (band) {
      marks.push(
        Plot.rect([band], {
          x1: (b) => b[0],
          x2: (b) => b[1],
          y1: 0,
          y2: yAxis.domain[1],
          fill: t.ink,
          fillOpacity: 0.05,
        }),
      )
    }
    marks.push(
      Plot.rect(
        bins,
        Plot.pointerX({
          x1: (b: HistogramBin<T>) => b.x0,
          x2: (b: HistogramBin<T>) => b.x1,
          y1: 0,
          y2: yAxis.domain[1],
          fill: t.ink,
          fillOpacity: 0.05,
          maxRadius: 4000,
          className: HOVER_CLASS,
        }),
      ),
      Plot.rect(
        bins.filter((b) => b.n > 0),
        {
          x1: (b) => b.x0,
          x2: (b) => b.x1,
          y1: 0,
          y2: (b) => b.n,
          fill: t.series[0],
          insetLeft: 1,
          insetRight: 1,
          ry2: radius,
        },
      ),
      baseline(t, 'y', 0),
    )
    if (sortedRefs.length) {
      marks.push(Plot.ruleX(sortedRefs, { x: (r) => r.value, stroke: t.ink2, strokeWidth: 1 }))
      marks.push(
        labelsMark(
          (scales, dims) =>
            sortedRefs.map((r, i) => ({
              x: scalePos(scales, 'x', r.value),
              y: dims.marginTop - 8 - refRows[i] * 13,
              anchor: 'middle' as const,
              parts: [{ text: r.label, color: t.ink2, size: 11, weight: 500 }],
              halo: t.sheet,
            })),
          'reference labels',
        ),
      )
    }
    if (band && bandLabel) {
      marks.push(
        labelsMark(
          (scales, dims) => [
            {
              // Past any reference rule that would run through the label.
              x: clearOfRules(
                scalePos(scales, 'x', band[0]) + 6,
                textWidth(bandLabel, 11),
                sortedRefs.map((r) => scalePos(scales, 'x', r.value)),
                3,
              ),
              y: dims.marginTop + 9,
              parts: [{ text: bandLabel, color: t.muted, size: 11 }],
              halo: t.sheet,
            },
          ],
          'band label',
        ),
      )
    }
    marks.push(
      axisY(t, { ticks: yAxis.ticks, tickFormat: yAxis.format }),
      axisX(t, { ticks: xAxis.ticks, tickFormat: xAxis.format }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom: 24,
        marginLeft,
        x: { domain: [x0, x1] },
        y: { domain: yAxis.domain },
        marks,
      },
    )
  }

  const tip = (b: HistogramBin<T>): TipContent => ({
    title: binLabel ? binLabel(b.x0, b.x1) : `${fmt(b.x0, format)} to ${fmt(b.x1, format)}`,
    rows: [
      { value: fmt(b.n, 'int'), label: unit },
      { value: fmt(b.share, 'pct'), label: `of ${fmt(total, 'int')}` },
    ],
  })

  // Keyboard: bins left to right; the outline wraps the bin.
  const keyPoints = (plot: PlotElement) =>
    bins.map((b) => {
      const xa = plotPos(plot, 'x', b.x0)
      const xb = plotPos(plot, 'x', b.x1)
      const y0 = plotPos(plot, 'y', 0)
      const y1 = plotPos(plot, 'y', b.n)
      return {
        datum: b,
        x: (xa + xb) / 2,
        y: (y0 + y1) / 2,
        w: Math.max(4, xb - xa - 2),
        h: Math.max(4, y0 - y1),
      }
    })

  return (
    <PlotChart<HistogramBin<T>>
      keyPoints={keyPoints}
      build={build}
      height={height}
      tip={tip}
      selectable={(b) => b.n > 0}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
    />
  )
}
