/**
 * Rating distribution against the guideline: one column per rating for the actual share, with the
 * guideline drawn as a short ink tick across the column instead of a second, equally heavy bar.
 * The gap between the column top and the tick is the story.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  axisY,
  baseline,
  gridY,
  housePlot,
  hoverBand,
  type LegendSpec,
  labelsMark,
  numericAxis,
  type PlotBuildContext,
  PlotChart,
  scalePos,
  seriesColor,
  type TipContent,
  textWidth,
  useChartTheme,
} from '@/charts'
import { DASH, fmt } from '@/lib/format'
import type { DistributionRow } from '../engine/performance'

export function GuidelineColumns({
  data,
  height = 260,
  ariaLabel,
}: {
  data: readonly DistributionRow[]
  height?: number
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Actual', color: seriesColor(theme, 0), shape: 'rect' },
      { label: 'Guideline', color: theme.ink, shape: 'line' },
    ],
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!data.length) return null
    const top = Math.max(...data.map((d) => Math.max(d.share ?? 0, d.guideline)))
    const axis = numericAxis(0, top, 'pct0', height < 200 ? 4 : 5)
    const marginLeft = Math.ceil(axis.labelWidth) + 10
    const marginRight = 8
    const step = (width - marginLeft - marginRight) / data.length
    const barW = Math.min(24, step * 0.5)
    const inset = (step - barW) / 2
    const tickInset = Math.max(2, inset - 7)
    // Full names ("3 Meets") when they fit under each column, else the rating number.
    const fits = data.every((d) => textWidth(d.label, 11) <= step - 6)
    const tickText = (label: string) => (fits ? label : label.split(' ')[0])
    const shown = data.filter((d) => d.share != null)
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 18,
        marginBottom: 24,
        marginLeft,
        marginRight,
        x: { type: 'band', domain: data.map((d) => d.label), padding: 0, round: false },
        y: { domain: axis.domain },
        marks: [
          gridY(t, { ticks: axis.ticks }),
          hoverBand(data, { axis: 'x', value: (d) => d.label, color: t.ink }),
          Plot.barY(shown, {
            x: (d: DistributionRow) => d.label,
            y1: 0,
            y2: (d: DistributionRow) => d.share,
            fill: seriesColor(t, 0),
            insetLeft: inset,
            insetRight: inset,
            ry1: 4,
          }),
          baseline(t, 'y', 0),
          Plot.tickY(data, {
            x: (d: DistributionRow) => d.label,
            y: (d: DistributionRow) => d.guideline,
            stroke: t.ink,
            strokeWidth: 2,
            insetLeft: tickInset,
            insetRight: tickInset,
          }),
          labelsMark(
            (scales) =>
              shown.map((d) => ({
                x: scalePos(scales, 'x', d.label),
                y: scalePos(scales, 'y', Math.max(d.share ?? 0, d.guideline)) - 9,
                anchor: 'middle' as const,
                halo: t.sheet,
                parts: [{ text: fmt(d.share, 'pct0'), color: t.ink, size: 11, weight: 500 }],
              })),
            'actual shares',
          ),
          axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
          axisX(t, { tickFormat: tickText }),
        ],
      },
    )
  }

  const tip = (d: DistributionRow): TipContent => ({
    title: `Rated ${d.label}`,
    rows: [
      {
        value: d.share == null ? DASH : fmt(d.share, 'pct'),
        label: 'Actual',
        color: seriesColor(theme, 0),
        shape: 'rect',
      },
      { value: fmt(d.guideline, 'pct0'), label: 'Guideline', color: theme.ink, shape: 'line' },
      { value: d.gap == null ? DASH : fmt(d.gap, 'pts'), label: 'Gap to guideline' },
    ],
    note: d.share == null ? 'Hidden to protect anonymity (n < 5)' : `${fmt(d.people)} people`,
  })

  return (
    <PlotChart<DistributionRow>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      ariaLabel={ariaLabel}
    />
  )
}
