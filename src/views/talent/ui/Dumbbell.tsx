/**
 * Dumbbell: two values per row joined by a line, e.g. the average manager-proposed rating and the
 * average final rating per business unit. The gap between the dots is what calibration changed.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  gridX,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  seriesColor,
  useChartTheme,
} from '@/charts'
import type { LegendSpec } from '@/charts/core/legend'
import { hoverBand, labelsMark, scalePos } from '@/charts/core/marks'
import { maxTextWidth, truncateText } from '@/charts/core/measure'
import type { TipContent } from '@/charts/core/tooltip'
import { numericAxis } from '@/charts/kit/scale'
import { DASH, type Format, fmt } from '@/lib/format'

export interface DumbbellRow {
  label: string
  a: number | null
  b: number | null
  n: number
}

interface Row extends DumbbellRow {
  key: string
}

export function Dumbbell({
  data,
  aLabel,
  bLabel,
  format = 'num2',
  ariaLabel,
}: {
  data: readonly DumbbellRow[]
  /** Name of the first value (drawn in series 2, the "before"). */
  aLabel: string
  /** Name of the second value (drawn in series 1, the result). */
  bLabel: string
  format?: Format
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  const rows: Row[] = data.map((d, i) => ({ ...d, key: `r${i}` }))
  const pitch = 32
  const height = 6 + rows.length * pitch + 26
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: aLabel, color: seriesColor(theme, 1), shape: 'dot' },
      { label: bLabel, color: seriesColor(theme, 0), shape: 'dot' },
    ],
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(64, width * 0.34)
    const shown = rows.map((r) => truncateText(r.label, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const values = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v != null)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = Math.max(0.1, (hi - lo) * 0.15)
    const axis = numericAxis(lo - pad, hi + pad, format, Math.max(3, Math.floor((width - marginLeft) / 90)))
    const both = rows.filter((r) => r.a != null && r.b != null)
    const dot = (key: 'a' | 'b', color: string) =>
      Plot.dot(
        rows.filter((r) => r[key] != null),
        { y: (r: Row) => r.key, x: (r: Row) => r[key], r: 5, fill: color, stroke: t.sheet, strokeWidth: 2 },
      )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 26,
        marginLeft,
        marginRight: 16,
        x: { domain: axis.domain },
        y: { type: 'band', domain: rows.map((r) => r.key), padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks: axis.ticks }),
          hoverBand(rows, { axis: 'y', value: (r) => r.key, color: t.ink }),
          Plot.ruleY(both, {
            y: (r: Row) => r.key,
            x1: (r: Row) => r.a,
            x2: (r: Row) => r.b,
            stroke: t.axis,
            strokeWidth: 2,
          }),
          dot('a', seriesColor(t, 1)),
          dot('b', seriesColor(t, 0)),
          labelsMark(
            (scales, dims) =>
              rows.map((r, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', r.key),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: t.ink2, size: 12 }],
                title: shown[i] === r.label ? undefined : r.label,
              })),
            'row labels',
          ),
          axisX(t, { ticks: axis.ticks, tickFormat: axis.format }),
        ],
      },
    )
  }

  const tip = (r: Row): TipContent => ({
    title: r.label,
    rows: [
      {
        value: r.a == null ? DASH : fmt(r.a, format),
        label: aLabel,
        color: seriesColor(theme, 1),
        shape: 'dot',
      },
      {
        value: r.b == null ? DASH : fmt(r.b, format),
        label: bLabel,
        color: seriesColor(theme, 0),
        shape: 'dot',
      },
      { value: r.a == null || r.b == null ? DASH : fmt(r.a - r.b, format), label: 'Difference' },
    ],
    note: r.a == null ? 'Hidden to protect anonymity (n < 5)' : `n = ${fmt(r.n)}`,
  })

  return <PlotChart<Row> build={build} height={height} legend={legend} tip={tip} ariaLabel={ariaLabel} />
}
