/**
 * TrendGrid: small multiples, one cell per measure (about 160 x 96, stretched to fill the row),
 * each on its own y scale (say so in the figure subtitle). Each cell: the measure name (12px,
 * ink-2) and its latest value (14px, 600) above; a 2px --s1 line; the latest point as a dot with
 * a sheet ring; the target as a 1px ink-2 rule. Hover shows each point's value and period; the
 * keyboard steps through a cell's points with Left and Right and between cells with Up and Down.
 * The whole grid is one SVG (`data-chart`), so PNG and SVG exports carry every cell.
 *
 * The figure exports one long table, one row per point: pass `trendGridRows(series)` and
 * `TREND_GRID_COLUMNS` to the Figure.
 *
 *   const series = rows.map((r) => ({ id: r.metricId, name: r.label, values: r.kpi.spark ?? [],
 *     periods: r.kpi.sparkDates, target: r.target, format: r.kpi.format }))
 *   <Figure id="scorecard-trends" title="Measure trends" subtitle="Each measure on its own scale"
 *           data={trendGridRows(series)} columns={TREND_GRID_COLUMNS} metric="scorecard.measures.status">
 *     <TrendGrid series={series} onSelect={(s, i) => i === s.values.length - 1 && drill(byId[s.id].kpi.drill)}
 *                selectable={(s, i) => i === s.values.length - 1} />
 *   </Figure>
 */
import * as Plot from '@observablehq/plot'
import { DASH, fmt } from '@/lib/format'
import type { KeyPoint } from '../core/keyboard'
import { HOVER_CLASS, svgEl } from '../core/marks'
import { truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { housePlot, type PlotBuildContext, PlotChart, type PlotElement } from '../plot'
import {
  periodLabel,
  type TrendCell,
  type TrendGridOptions,
  type TrendSeries,
  trendGridLayout,
} from './trendModel'

export { TREND_GRID_COLUMNS, type TrendRow, type TrendSeries, trendGridRows } from './trendModel'

export interface TrendGridProps extends TrendGridOptions {
  series: readonly TrendSeries[]
  /** Click-to-drill on a point (`i` indexes the series' values; the last is the latest). */
  onSelect?: (s: TrendSeries, i: number) => void
  /** Whether a point opens records (default: every point, when `onSelect` is given). */
  selectable?: (s: TrendSeries, i: number) => boolean
  ariaLabel?: string
}

interface Hit {
  cell: TrendCell
  i: number
  value: number
  x: number
  y: number
}

const plotWidth = (plot: PlotElement) => {
  const svg = plot instanceof SVGSVGElement ? plot : plot.querySelector('svg')
  return Number(svg?.getAttribute('width')) || 0
}

export function TrendGrid({ series, onSelect, selectable, ariaLabel, ...opts }: TrendGridProps) {
  const hitsOf = (width: number): Hit[] =>
    trendGridLayout(series, width, opts).cells.flatMap((cell) =>
      cell.points.map((p) => ({ cell, i: p.i, value: p.value, x: p.x, y: p.y })),
    )

  const build = ({ width, theme: t }: PlotBuildContext) => {
    const layout = trendGridLayout(series, width, opts)
    if (!layout.cells.length) return null
    const hits = hitsOf(width)
    const draw: Plot.RenderFunction = (_i, _s, _v, _d, context) => {
      const doc = context.document
      const root = svgEl(doc, 'g', { 'aria-label': 'trend cells' })
      for (const c of layout.cells) {
        const g = svgEl(doc, 'g')
        // Header: name, then the latest value.
        const name = svgEl(doc, 'text', { x: c.x + 4, y: c.y + 9, dy: '0.32em', 'text-anchor': 'start' })
        name.textContent = truncateText(c.series.name, c.w - 8, 12)
        name.style.fill = t.ink2
        name.style.fontSize = '12px'
        const title = svgEl(doc, 'title')
        title.textContent = c.series.name
        name.append(title)
        const latest = svgEl(doc, 'text', { x: c.x + 4, y: c.y + 26, dy: '0.32em', 'text-anchor': 'start' })
        latest.textContent = c.latest ? fmt(c.latest.value, c.series.format) : DASH
        latest.style.fill = c.latest ? t.ink : t.muted
        latest.style.fontSize = '14px'
        latest.style.fontWeight = '600'
        g.append(name, latest)
        // Baseline hairline under the plot area.
        const base = svgEl(doc, 'line', {
          x1: c.plot.x,
          x2: c.plot.x + c.plot.w,
          y1: c.plot.y + c.plot.h + 0.5,
          y2: c.plot.y + c.plot.h + 0.5,
        })
        base.style.stroke = t.grid
        base.style.strokeWidth = '1px'
        g.append(base)
        if (c.targetY != null) {
          const rule = svgEl(doc, 'line', {
            x1: c.plot.x,
            x2: c.plot.x + c.plot.w,
            y1: c.targetY,
            y2: c.targetY,
          })
          rule.style.stroke = t.ink2
          rule.style.strokeWidth = '1px'
          rule.setAttribute('shape-rendering', 'crispEdges')
          g.append(rule)
        }
        // The line, broken at gaps.
        let d = ''
        let prev = -2
        for (const p of c.points) {
          d += `${p.i === prev + 1 ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
          prev = p.i
        }
        if (d) {
          const line = svgEl(doc, 'path', { d })
          line.style.fill = 'none'
          line.style.stroke = t.series[0]
          line.style.strokeWidth = '2px'
          line.style.strokeLinejoin = 'round'
          line.style.strokeLinecap = 'round'
          g.append(line)
        }
        const last = c.points[c.points.length - 1]
        if (last) {
          const dot = svgEl(doc, 'circle', { cx: last.x, cy: last.y, r: 4 })
          dot.style.fill = t.series[0]
          dot.style.stroke = t.sheet
          dot.style.strokeWidth = '2px'
          g.append(dot)
        }
        root.append(g)
      }
      return root
    }
    const hover: Plot.RenderFunction = (index, _s, _v, _d, context) => {
      const g = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return g
      const h = hits[i]
      const dot = svgEl(context.document, 'circle', { cx: h.x, cy: h.y, r: 4 })
      dot.style.fill = t.series[0]
      dot.style.stroke = t.sheet
      dot.style.strokeWidth = '2px'
      g.append(dot)
      return g
    }
    const node = housePlot(
      { width, theme: t },
      {
        width,
        height: Math.max(1, layout.height),
        margin: 0,
        x: { type: 'identity', axis: null },
        y: { type: 'identity', axis: null },
        marks: [
          draw,
          Plot.dot(
            hits,
            Plot.pointer({ x: (h: Hit) => h.x, y: (h: Hit) => h.y, maxRadius: 24, render: hover }),
          ),
        ],
      },
    )
    node.setAttribute('data-chart', '')
    return node
  }

  const tip = (h: Hit): TipContent => {
    const s = h.cell.series
    const rows = [{ value: fmt(h.value, s.format), label: periodLabel(s.periods?.[h.i], h.i) }]
    if (s.target != null) rows.push({ value: fmt(s.target, s.format), label: 'Target' })
    return { title: s.name, rows }
  }
  const canOpen = (h: Hit) => !!onSelect && (selectable?.(h.cell.series, h.i) ?? true)
  const keyPoints = (plot: PlotElement): KeyPoint<Hit>[] =>
    hitsOf(plotWidth(plot)).map((h) => ({ datum: h, x: h.x, y: h.y, group: h.cell.series.id }))
  // Reserve the height before the first measure (two rows of cells at the design width).
  const reserve = trendGridLayout(series, 960, opts).height

  return (
    <PlotChart<Hit>
      build={build}
      height={reserve}
      tip={tip}
      keyPoints={keyPoints}
      selectable={canOpen}
      onSelect={onSelect ? (h) => onSelect(h.cell.series, h.i) : undefined}
      ariaLabel={ariaLabel ?? `Trends for ${series.length} measures`}
    />
  )
}
