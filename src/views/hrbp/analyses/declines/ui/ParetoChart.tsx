/**
 * Why offers were declined, as a Pareto (docs/ANALYSES.md, 3.6.1): a column per reason (its share
 * of declined offers, largest first, "Other reasons (k)" after them and "Not recorded" last in the
 * de-emphasis gray), a 2px line with dots for the running share, and a labelled rule at 80%. Both
 * marks are shares of the same declined offers on one scale from 0 to 100%, so this is one axis,
 * never two. A bracket over the reasons that reach 80% says how few they are and their running
 * total, so the line itself carries no value labels. One tab stop: Left
 * and Right step through the reasons, Enter opens a reason's declined offers.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  axisY,
  baseline,
  gridY,
  housePlot,
  hoverBand,
  type KeyPoint,
  type LegendSpec,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  plotBand,
  plotPos,
  refRule,
  scalePos,
  type TipContent,
  useChartTheme,
} from '@/charts'
import { roundedBarsY, svgEl } from '@/charts/core/marks'
import { bandLabelLayout, numericAxis } from '@/charts/kit/scale'
import { barInset } from '@/charts/kit/shared'
import { fmt, plural } from '@/lib/format'
import { PARETO_LINE, type ReasonRow, shortReason } from '../engine/reasons'

const LINE_LABEL = `${Math.round(PARETO_LINE * 100)}% of declines`

export function ParetoChart({
  rows,
  height,
  onSelect,
  ariaLabel,
}: {
  rows: readonly ReasonRow[]
  height: number
  onSelect?: (r: ReasonRow) => void
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  // The reasons that reach the line, for the bracket ("3 reasons, 86% of declines").
  const reach = (() => {
    let k = 0
    for (const r of rows) {
      if (r.kind !== 'reason' || r.cumulative == null) return 0
      k++
      if (r.cumulative >= PARETO_LINE - 1e-9) return k
    }
    return 0
  })()
  const bracketText = reach
    ? `${plural(reach, 'reason')}, ${fmt(rows[reach - 1].cumulative, 'pct0')} of declines`
    : null
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Share of declined offers', color: theme.series[0], shape: 'rect' },
      { label: 'Running total', color: theme.ink2, shape: 'line' },
    ],
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    // Shares are null under the anonymity minimum: the panel shows its empty state instead.
    if (!rows.length || rows.some((r) => r.share == null)) return null
    const axis = numericAxis(0, 1, 'pct0', height < 240 ? 4 : 5, [0, 1])
    const marginLeft = Math.ceil(axis.labelWidth) + 10
    const marginRight = 12
    const step = (width - marginLeft - marginRight) / rows.length
    const lay = bandLabelLayout(
      rows.map((r) => shortReason(r.reason)),
      step,
    )
    const marginTop = bracketText ? 30 : 10
    const { inset } = barInset(step, 24, 0.62)
    const fill = (r: ReasonRow) => (r.kind === 'notRecorded' ? t.deemph : t.series[0])
    const marks: Plot.Markish[] = [
      gridY(t, { ticks: axis.ticks }),
      hoverBand(rows, { axis: 'x', value: (r) => r.reason, color: t.ink }),
      ...roundedBarsY(rows, (r) => r.share, {
        x: (r: ReasonRow) => r.reason,
        y1: 0,
        y2: (r: ReasonRow) => r.share,
        fill,
        insetLeft: inset,
        insetRight: inset,
      }),
      baseline(t, 'y', 0),
      // Labelled at the right end, where the running total has climbed well clear of the rule.
      ...refRule({ value: PARETO_LINE, label: LINE_LABEL }, 'y', t, 'end'),
      Plot.line(rows, {
        x: (r: ReasonRow) => r.reason,
        y: (r: ReasonRow) => r.cumulative,
        stroke: t.ink2,
        strokeWidth: 2,
        curve: 'linear',
      }),
      Plot.dot(rows, {
        x: (r: ReasonRow) => r.reason,
        y: (r: ReasonRow) => r.cumulative,
        r: 4,
        fill: t.ink2,
        stroke: t.sheet,
        strokeWidth: 2,
      }),
    ]
    // The bracket over the reasons that reach the line, just above the plot.
    if (reach && bracketText)
      marks.push((_i, scales, _v, dims, context) => {
        const doc = context.document
        const g = svgEl(doc, 'g', { 'aria-label': bracketText })
        const bw = scales.scales.x?.bandwidth ?? step
        const x0 = scalePos(scales, 'x', rows[0].reason) - bw / 2 + inset
        const x1 = scalePos(scales, 'x', rows[reach - 1].reason) + bw / 2 - inset
        const y = dims.marginTop - 8
        const path = svgEl(doc, 'path', { d: `M${x0},${y + 5}V${y}H${x1}V${y + 5}`, fill: 'none' })
        path.style.stroke = t.ink2
        path.style.strokeWidth = '1'
        const label = svgEl(doc, 'text', {
          x: (x0 + x1) / 2,
          y: y - 5,
          'text-anchor': 'middle',
          'font-size': 11,
        })
        label.style.fill = t.ink2
        label.textContent = bracketText
        g.append(path, label)
        return g
      })
    marks.push(
      axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
      axisX(t, { tickFormat: (reason: string) => lay.text(shortReason(reason)), tickRotate: lay.rotate }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop,
        marginRight,
        marginBottom: lay.margin,
        marginLeft,
        x: { type: 'band', domain: rows.map((r) => r.reason), padding: 0, round: false },
        y: { domain: axis.domain },
        marks,
      },
    )
  }

  const tip = (r: ReasonRow): TipContent => ({
    title: r.reason,
    rows: [
      { value: fmt(r.declined, 'int'), label: 'Declined offers' },
      {
        value: fmt(r.share, 'pct'),
        label: 'Share of declined offers',
        color: theme.series[0],
        shape: 'rect',
      },
      { value: fmt(r.cumulative, 'pct'), label: 'Running total', color: theme.ink2, shape: 'line' },
      ...(r.theme ? [{ value: r.theme, label: 'Theme' }] : []),
    ],
    spoken: `${r.reason}: ${plural(r.declined, 'declined offer')}, ${fmt(r.share, 'pct')} of declines, running total ${fmt(r.cumulative, 'pct')}`,
  })

  const keyPoints = (plot: PlotElement): KeyPoint<ReasonRow>[] => {
    const bw = plotBand(plot, 'x')
    const y0 = plotPos(plot, 'y', 0)
    return rows.map((r) => {
      const top = plotPos(plot, 'y', r.share)
      return {
        datum: r,
        x: plotPos(plot, 'x', r.reason),
        y: (top + y0) / 2,
        w: barInset(bw, 24, 0.62).thickness,
        h: Math.max(4, y0 - top),
      }
    })
  }

  return (
    <PlotChart<ReasonRow>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      keyPoints={keyPoints}
      selectable={onSelect ? (r) => r.offers.length > 0 : undefined}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
    />
  )
}
