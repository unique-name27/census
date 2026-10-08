/**
 * Stacked horizontal bars over the chip development stages: the nine lifecycle stages in order
 * (never sorted by size), a hairline, then the stages that run across the lifecycle and Not
 * mapped. Each bar ends in its total and a muted secondary text ("171 · 12% contractors"). A
 * segment drills its series, a click elsewhere in the row drills the whole stage. Tooltip on every
 * row, one tab stop with arrow keys through the segments, up to two notes. A Plot visual through
 * `PlotChart`, so it exports as one SVG (`data-chart`) from its Figure.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  baseline,
  type ChartNote,
  type ChartTheme,
  gridX,
  housePlot,
  hoverBand,
  type KeyPoint,
  type LegendSpec,
  labelsMark,
  noteMark,
  numericAxis,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  plotPos,
  scalePos,
  type TipContent,
  textWidth,
  useChartTheme,
} from '@/charts'
import { bandLabel, bandLabelLines } from '@/charts/core/marks'
import { type Format, fmt } from '@/lib/format'

export interface StageSeries<R> {
  key: string
  label: string
  value: (r: R) => number
  /** A resolved color (from the chart theme). */
  color: (t: ChartTheme) => string
}

export interface StageBarsProps<R> {
  rows: readonly R[]
  rowKey: (r: R) => string
  label: (r: R) => string
  /** Rows past the hairline: the stages across the lifecycle, and Not mapped. */
  across: (r: R) => boolean
  series: readonly StageSeries<R>[]
  format: Format
  /** The muted text after the bar's total, e.g. "12% contractors". */
  secondary?: (r: R) => string | null
  /** The printed total; default the sum of the series. */
  totalText?: (r: R) => string
  notes?: readonly ChartNote[]
  /** A segment (series key) or the whole row (null). */
  onSelect?: (r: R, series: string | null) => void
  selectable?: (r: R, series: string | null) => boolean
  ariaLabel?: string
}

const BREAK = '\u0000break'
const PITCH = 28

interface Seg<R> {
  row: R
  cat: string
  series: string
  index: number
  lo: number
  hi: number
  top: boolean
}

export function StageBars<R>({
  rows,
  rowKey,
  label,
  across,
  series,
  format,
  secondary,
  totalText,
  notes,
  onSelect,
  selectable,
  ariaLabel,
}: StageBarsProps<R>) {
  const theme = useChartTheme()
  const before = rows.filter((r) => !across(r))
  const after = rows.filter((r) => across(r))
  const domain = [
    ...before.map(rowKey),
    ...(before.length && after.length ? [BREAK] : []),
    ...after.map(rowKey),
  ]
  const byKey = new Map(rows.map((r) => [rowKey(r), r]))
  const total = (r: R) => series.reduce((n, s) => n + Math.max(0, s.value(r) || 0), 0)
  const segments: Seg<R>[] = rows.flatMap((r) => {
    let lo = 0
    const out: Seg<R>[] = []
    series.forEach((s, index) => {
      const v = Math.max(0, s.value(r) || 0)
      if (v > 0) {
        out.push({ row: r, cat: rowKey(r), series: s.key, index, lo, hi: lo + v, top: false })
        lo += v
      }
    })
    if (out.length) out[out.length - 1].top = true
    return out
  })
  const height = 4 + domain.length * PITCH + 26
  const valueText = (r: R) => (totalText ? totalText(r) : fmt(total(r), format))
  const legend: LegendSpec | null =
    series.length > 1
      ? {
          kind: 'swatch',
          items: series.map((s) => ({ label: s.label, color: s.color(theme), shape: 'rect' })),
        }
      : null

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const max = Math.max(0, ...rows.map(total))
    const axis = numericAxis(0, max || 1, format, Math.max(2, Math.min(6, Math.floor(width / 110))))
    const band = bandLabelLines(rows.map(label), Math.max(64, width * 0.34), PITCH)
    const lines = new Map(rows.map((r, i) => [rowKey(r), band.lines[i]]))
    const marginLeft = Math.ceil(band.width) + 14
    const tails = rows.map((r) => {
      const sec = secondary?.(r) ?? null
      return textWidth(valueText(r), 12, 500) + (sec ? 5 + textWidth(sec, 11) : 0)
    })
    const marginRight = Math.ceil(Math.min(Math.max(16, ...tails) + 12, width * 0.42))
    const thick = Math.min(24, PITCH * 0.5)
    const inset = (PITCH - thick) / 2
    const colorOf = (s: Seg<R>) => series[s.index].color(t)
    const opts = (top: boolean): Plot.BarXOptions => ({
      x1: (s: Seg<R>) => s.lo,
      x2: (s: Seg<R>) => s.hi,
      y: (s: Seg<R>) => s.cat,
      fill: colorOf,
      insetTop: inset,
      insetBottom: inset,
      ...(top ? { rx2: 4 } : { insetRight: 2 }),
    })
    const marks: Plot.Markish[] = [
      gridX(t, { ticks: axis.ticks }),
      hoverBand(rows, { axis: 'y', value: (r) => rowKey(r), color: t.ink }),
      Plot.barX(
        segments.filter((s) => !s.top),
        opts(false),
      ),
      Plot.barX(
        segments.filter((s) => s.top),
        opts(true),
      ),
      baseline(t, 'x', 0),
    ]
    if (domain.includes(BREAK))
      marks.push((_i, scales, _v, dims, context) => {
        const y = scalePos(scales, 'y', BREAK)
        const g = context.document.createElementNS('http://www.w3.org/2000/svg', 'line')
        g.setAttribute('x1', '0')
        g.setAttribute('x2', String(dims.width))
        g.setAttribute('y1', String(y))
        g.setAttribute('y2', String(y))
        g.setAttribute('stroke', t.rule)
        g.setAttribute('stroke-width', '1')
        g.setAttribute('aria-hidden', 'true')
        return g
      })
    marks.push(
      labelsMark(
        (scales, dims) =>
          rows.flatMap((r) =>
            bandLabel(
              label(r),
              lines.get(rowKey(r)) ?? [label(r)],
              dims.marginLeft - 10,
              scalePos(scales, 'y', rowKey(r)),
              t.ink2,
            ),
          ),
        'stage labels',
      ),
      labelsMark(
        (scales) =>
          rows.map((r) => {
            const sec = secondary?.(r) ?? null
            return {
              x: scalePos(scales, 'x', total(r)) + 6,
              y: scalePos(scales, 'y', rowKey(r)),
              halo: t.sheet,
              parts: [
                { text: valueText(r), color: t.ink, size: 12, weight: 500 },
                ...(sec ? [{ text: sec, color: t.muted, size: 11 }] : []),
              ],
            }
          }),
        'totals',
      ),
    )
    if (notes?.length)
      marks.push(
        noteMark(t, (scales) => {
          const tailEnd = (r: R, i: number) => scalePos(scales, 'x', total(r)) + 6 + tails[i]
          const obstacles = rows.map((r, i) => {
            const yc = scalePos(scales, 'y', rowKey(r))
            const x0 = scalePos(scales, 'x', 0)
            return { x: x0, y: yc - PITCH / 2 + 3, w: tailEnd(r, i) - x0, h: PITCH - 6 }
          })
          const anchors = notes.flatMap((n) => {
            const i = rows.findIndex((r) => rowKey(r) === String(n.at) || label(r) === String(n.at))
            if (i < 0) return []
            return [{ x: tailEnd(rows[i], i) + 2, y: scalePos(scales, 'y', rowKey(rows[i])), text: n.text }]
          })
          return { anchors, obstacles }
        }),
      )
    marks.push(axisX(t, { ticks: axis.ticks, tickFormat: axis.format }))
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 4,
        marginBottom: 26,
        marginLeft,
        marginRight,
        x: { domain: axis.domain },
        y: { type: 'band', domain, padding: 0, round: false, axis: null },
        marks,
      },
    )
  }

  const pick = (r: R, at: PlotPointer, plot: PlotElement): string | null => {
    const v = plot.scale('x')?.invert?.(at.x)
    if (typeof v !== 'number') return null
    const k = rowKey(r)
    return segments.find((s) => s.cat === k && v >= s.lo && v <= s.hi)?.series ?? null
  }
  const canOpen = (r: R, part: string | null): boolean => {
    if (!onSelect) return false
    if (part != null) return selectable?.(r, part) ?? true
    return total(r) > 0 && (selectable?.(r, null) ?? true)
  }
  const tip = (r: R, part: string | null): TipContent => {
    const sec = secondary?.(r) ?? null
    return {
      title: label(r),
      rows: [
        ...series.map((s) => ({
          value: fmt(s.value(r), format),
          label: s.label,
          color: s.color(theme),
          shape: 'rect' as const,
          ...(part === s.key ? { strong: true } : {}),
        })),
        ...(series.length > 1 ? [{ value: valueText(r), label: 'Total' }] : []),
      ],
      note: sec ?? (total(r) > 0 ? undefined : 'Nobody in this stage'),
    }
  }
  const keyPoints = (plot: PlotElement): KeyPoint<R>[] => {
    const thick = Math.min(24, PITCH * 0.5)
    return rows.flatMap((r): KeyPoint<R>[] => {
      const segs = segments.filter((s) => s.cat === rowKey(r))
      const y = plotPos(plot, 'y', rowKey(r))
      if (!segs.length)
        return [{ datum: r, part: null, x: plotPos(plot, 'x', 0) + 4, y, w: 8, h: thick, group: rowKey(r) }]
      return segs.map((s) => {
        const a = plotPos(plot, 'x', s.lo)
        const b = plotPos(plot, 'x', s.hi)
        return {
          datum: r,
          part: s.series,
          x: (a + b) / 2,
          y,
          w: Math.max(4, b - a),
          h: thick,
          group: rowKey(r),
        }
      })
    })
  }

  return (
    <PlotChart<R>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      keyPoints={keyPoints}
      selectable={canOpen}
      onSelect={onSelect ? (r, part) => onSelect(byKey.get(rowKey(r)) ?? r, part) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
