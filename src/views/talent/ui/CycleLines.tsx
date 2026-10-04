/**
 * Average rating per business unit across review cycles. Cycles are discrete events, so the x axis
 * names them ("2025 Annual") instead of spacing them on a calendar, and the tooltip lists every
 * unit for the hovered cycle, bolding the line nearest the pointer. One unit can be emphasized in
 * the series color, the rest in gray. Clicking opens the ratings behind the nearest line's point.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  axisY,
  gridY,
  housePlot,
  type LegendSpec,
  labelsMark,
  nearestBy,
  numericAxis,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  scalePos,
  seriesColor,
  seriesPalette,
  type TipContent,
  textWidth,
  useChartTheme,
} from '@/charts'
import { type DrillSource, drill } from '@/drill'
import { formatDate } from '@/lib/dates'
import { DASH, fmt } from '@/lib/format'
import type { CycleRow } from '../engine/performance'

interface CyclePoint {
  cycle: string
  cycleDate: string
}

export function CycleLines({
  data,
  emphasize,
  yDomain,
  height = 260,
  drillFor,
  ariaLabel,
}: {
  data: readonly CycleRow[]
  emphasize?: string | null
  yDomain: [number, number]
  /** The ratings behind one unit's average in one cycle; clicking opens them. */
  drillFor?: (cycle: string, businessUnit: string) => DrillSource
  height?: number
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  const cycles: CyclePoint[] = [...new Map(data.map((d) => [d.cycle, d.cycleDate])).entries()]
    .map(([cycle, cycleDate]) => ({ cycle, cycleDate }))
    .sort((a, b) => (a.cycleDate < b.cycleDate ? -1 : 1))
  // The emphasized unit is drawn last, on top.
  const units = [...new Set(data.map((d) => d.businessUnit))].sort(
    (a, b) => (a === emphasize ? 1 : 0) - (b === emphasize ? 1 : 0) || a.localeCompare(b),
  )
  const colorsFor = (t: typeof theme) => {
    const palette = seriesPalette(t, units)
    return new Map(
      units.map((u, i) => [u, emphasize ? (u === emphasize ? seriesColor(t, 0) : t.deemph) : palette[i]]),
    )
  }
  const legendColors = colorsFor(theme)
  const legend: LegendSpec = emphasize
    ? {
        kind: 'swatch',
        items: [
          { label: emphasize, color: seriesColor(theme, 0), shape: 'line' },
          { label: 'Other business units', color: theme.deemph, shape: 'line' },
        ],
      }
    : { kind: 'swatch', items: units.map((u) => ({ label: u, color: legendColors.get(u)!, shape: 'line' })) }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!cycles.length) return null
    const colors = colorsFor(t)
    const axis = numericAxis(yDomain[0], yDomain[1], 'num2', height < 200 ? 4 : 5, yDomain)
    const last = cycles[cycles.length - 1].cycle
    const endLabel = emphasize
      ? data.find((d) => d.businessUnit === emphasize && d.cycle === last)
      : undefined
    const labelText = endLabel?.mean != null ? fmt(endLabel.mean, 'num2') : ''
    const marginRight = labelText ? Math.ceil(textWidth(labelText, 11, 600)) + 14 : 12
    const marginLeft = Math.ceil(axis.labelWidth) + 10
    const step = (width - marginLeft - marginRight) / Math.max(1, cycles.length)
    const fits = cycles.every((c) => textWidth(c.cycle, 11) <= step - 6)
    const tick = (c: string) => (fits ? c : c.replace(/^(\d{4}) /, (_, y: string) => `'${y.slice(2)} `))
    const points = data.filter((d) => d.mean != null)
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 10,
        marginBottom: 24,
        marginLeft,
        marginRight,
        x: { type: 'point', domain: cycles.map((c) => c.cycle), padding: 0.4 },
        y: { domain: axis.domain },
        marks: [
          gridY(t, { ticks: axis.ticks }),
          Plot.ruleX(
            cycles,
            Plot.pointerX({
              x: (c: CyclePoint) => c.cycle,
              stroke: t.ink,
              strokeOpacity: 0.25,
              maxRadius: 4000,
            }),
          ),
          ...units.map((u) =>
            Plot.line(
              points.filter((d) => d.businessUnit === u),
              {
                x: (d: CycleRow) => d.cycle,
                y: (d: CycleRow) => d.mean,
                stroke: colors.get(u),
                strokeWidth: !emphasize || u === emphasize ? 2 : 1.5,
              },
            ),
          ),
          Plot.dot(
            points.filter((d) => !emphasize || d.businessUnit === emphasize),
            {
              x: (d: CycleRow) => d.cycle,
              y: (d: CycleRow) => d.mean,
              r: 4,
              fill: (d: CycleRow) => colors.get(d.businessUnit),
              stroke: t.sheet,
              strokeWidth: 2,
            },
          ),
          labelsMark(
            (scales) =>
              endLabel?.mean != null
                ? [
                    {
                      x: scalePos(scales, 'x', last) + 8,
                      y: scalePos(scales, 'y', endLabel.mean),
                      anchor: 'start' as const,
                      halo: t.sheet,
                      parts: [{ text: labelText, color: seriesColor(t, 0), size: 11, weight: 600 }],
                    },
                  ]
                : [],
            'end label',
          ),
          axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
          axisX(t, { tickFormat: tick }),
        ],
      },
    )
  }

  /** The unit whose point at the hovered cycle is nearest the pointer (units with an average only). */
  const pick = (c: CyclePoint, at: PlotPointer, plot: PlotElement): string | null => {
    const y = plot.scale('y')
    if (!y?.apply) return null
    const points = data.filter((d) => d.cycle === c.cycle && d.mean != null)
    return nearestBy(points, (d) => Number(y.apply(d.mean)), at.y)?.businessUnit ?? null
  }
  const sourceOf = (c: CyclePoint, part: string | null): DrillSource =>
    part && drillFor ? drillFor(c.cycle, part) : null

  const tip = (c: CyclePoint, part: string | null): TipContent => {
    const colors = colorsFor(theme)
    const rows = data
      .filter((d) => d.cycle === c.cycle)
      .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
      .map((d) => ({
        value: d.mean == null ? DASH : fmt(d.mean, 'num2'),
        label: d.businessUnit,
        color: colors.get(d.businessUnit),
        shape: 'line' as const,
        strong: part ? d.businessUnit === part : d.businessUnit === emphasize,
      }))
    const closed = `Cycle closed ${formatDate(c.cycleDate)}`
    return {
      title: c.cycle,
      rows,
      note: sourceOf(c, part) ? `${closed} · Click to see the ${part} ratings` : closed,
    }
  }

  return (
    <PlotChart<CyclePoint>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={drillFor ? pick : undefined}
      selectable={(c, part) => sourceOf(c, part) != null}
      onSelect={(c, part) => drill(sourceOf(c, part))}
      ariaLabel={ariaLabel}
    />
  )
}
