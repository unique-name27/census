/**
 * Mean proposed merit by rating as columns, with the guideline for each rating drawn as an ink
 * tick across its column: the reference belongs to the rating, so it is a mark per category
 * rather than a second bar series. The value sits above whichever is higher, bar or tick. A click
 * on a column drills into the proposals for that rating.
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
import type { MeritByRatingRow } from '../engine/performance'
import { pts2 } from '../engine/text'

const HEIGHT = 240

export function MeritGuideline({
  rows,
  order,
  ariaLabel,
  onSelect,
}: {
  rows: readonly MeritByRatingRow[]
  /** Rating labels, low to high. */
  order: readonly string[]
  ariaLabel?: string
  /** Click-to-drill on a rating's column. */
  onSelect?: (row: MeritByRatingRow) => void
}) {
  const theme = useChartTheme()
  const cats = [...rows].sort((a, b) => order.indexOf(a.rating) - order.indexOf(b.rating))
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Proposed merit, mean', color: seriesColor(theme, 0), shape: 'rect' },
      { label: 'Guideline', color: theme.ink, shape: 'line' },
    ],
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!cats.length) return null
    const top = Math.max(0, ...cats.map((c) => Math.max(c.mean ?? 0, c.guideline)))
    const axis = numericAxis(0, top, 'pct2', 5)
    const marginLeft = Math.ceil(axis.labelWidth) + 10
    const step = (width - marginLeft - 8) / cats.length
    const barW = Math.min(24, step * 0.5)
    const inset = (step - barW) / 2
    const tickInset = Math.max(2, (step - Math.min(step * 0.8, barW + 20)) / 2)
    const capText = (c: MeritByRatingRow) => (c.mean == null ? DASH : fmt(c.mean, 'pct2'))
    const showCaps = cats.every((c) => textWidth(capText(c), 11, 500) <= step - 4)
    // "2 Partially meets" needs ~90px; on a phone the rating number alone names the column
    // (the tooltip keeps the full label).
    const fullNames = cats.every((c) => textWidth(c.rating, 11) <= step - 6)
    const tickLabel = (r: string) => (fullNames ? r : r.split(' ')[0])
    return housePlot(
      { width, theme: t },
      {
        height: HEIGHT,
        marginTop: showCaps ? 18 : 8,
        marginRight: 8,
        marginBottom: 24,
        marginLeft,
        x: { type: 'band', domain: cats.map((c) => c.rating), padding: 0, round: false },
        y: { domain: axis.domain },
        marks: [
          gridY(t, { ticks: axis.ticks }),
          hoverBand(cats, { axis: 'x', value: (c) => c.rating, color: t.ink }),
          Plot.barY(
            cats.filter((c) => c.mean != null && c.mean > 0),
            {
              x: (c: MeritByRatingRow) => c.rating,
              y1: 0,
              y2: (c: MeritByRatingRow) => c.mean,
              fill: seriesColor(t, 0),
              insetLeft: inset,
              insetRight: inset,
              // Radii are in screen space: ry1 is the top edge, the data end of a positive bar.
              ry1: Math.min(4, barW / 2),
            },
          ),
          Plot.tickY(cats, {
            x: (c: MeritByRatingRow) => c.rating,
            y: (c: MeritByRatingRow) => c.guideline,
            stroke: t.ink,
            strokeWidth: 2,
            insetLeft: tickInset,
            insetRight: tickInset,
          }),
          baseline(t, 'y', 0),
          ...(showCaps
            ? [
                labelsMark(
                  (scales) =>
                    cats.map((c) => ({
                      x: scalePos(scales, 'x', c.rating),
                      y: scalePos(scales, 'y', Math.max(c.mean ?? 0, c.guideline)) - 9,
                      anchor: 'middle' as const,
                      halo: t.sheet,
                      parts: [
                        { text: capText(c), color: c.mean == null ? t.muted : t.ink, size: 11, weight: 500 },
                      ],
                    })),
                  'values',
                ),
              ]
            : []),
          axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
          axisX(t, { ticks: cats.map((c) => c.rating), tickFormat: tickLabel }),
        ],
      },
    )
  }

  const tip = (c: MeritByRatingRow): TipContent => ({
    title: `Rating ${c.rating}`,
    rows: [
      { value: fmt(c.mean, 'pct2'), label: 'proposed, mean', color: seriesColor(theme, 0), shape: 'rect' },
      { value: fmt(c.guideline, 'pct2'), label: 'guideline', color: theme.ink, shape: 'line' },
      { value: pts2(c.mean == null ? null : c.mean - c.guideline), label: 'mean vs guideline', strong: true },
    ],
    note: `${fmt(c.n, 'int')} proposals${onSelect && c.members.length ? '. Click to see the records' : ''}`,
  })

  return (
    <PlotChart<MeritByRatingRow>
      build={build}
      height={HEIGHT}
      legend={legend}
      tip={tip}
      selectable={(c) => c.members.length > 0}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
    />
  )
}
