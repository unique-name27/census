/**
 * Trends over time: 2px lines (optionally with a 10% area wash), a crosshair that snaps to the
 * nearest date and lists every series in one tooltip, end labels for up to four series (dodged
 * apart with short leader lines), a legend for two or more series, and emphasis (one series in
 * the accent, the rest gray) when the story is about one of them. Missing values break the line.
 */
import * as Plot from '@observablehq/plot'
import { formatDate, formatMonth, formatMonthShort, iso } from '@/lib/dates'
import { DASH, type Format, fmt } from '@/lib/format'
import type { LegendSpec } from '../core/legend'
import { HOVER_CLASS, labelsMark, refRule, svgEl } from '../core/marks'
import { textWidth, truncateText } from '../core/measure'
import type { TipContent } from '../core/tooltip'
import { axisX, axisY, gridY, housePlot, type PlotBuildContext, PlotChart } from '../plot'
import { type ChartTheme, seriesColor, useChartTheme } from '../theme'
import { dodge, parseTime } from './prepare'
import { extent, numericAxis } from './scale'
import { type ChartBaseProps, type Key, orderedKeys, type RefLine, textAt } from './shared'

export interface LinesProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  /** ISO date or "YYYY-MM". */
  x: Key<T>
  y: Key<T>
  series?: Key<T>
  seriesOrder?: readonly string[]
  /** 10% area wash under each line. */
  area?: boolean
  /** Series name to emphasize; the rest turn gray. */
  emphasize?: string
  ref?: RefLine
  format?: Format
  yDomain?: [number, number]
  /** Start the value axis at zero (default: only with `area`). */
  zero?: boolean
  /** End labels for up to four series (default true). */
  endLabels?: boolean
  height?: number
}

interface Point<T> {
  t: number
  key: string
  series: string
  y: number | null
  datum: T
}

interface Slice<T> {
  t: number
  date: Date
  points: Point<T>[]
}

export function Lines<T extends object>({
  data,
  x,
  y,
  series,
  seriesOrder,
  area = false,
  emphasize,
  ref: refLine,
  format = 'int',
  yDomain,
  zero,
  endLabels = true,
  height = 240,
  onSelect,
  ariaLabel,
}: LinesProps<T>) {
  const names = series
    ? orderedKeys(
        data.map((d) => textAt(d, series)),
        seriesOrder,
      )
    : ['']
  const multi = names.length > 1
  const points: Point<T>[] = []
  for (const d of data) {
    const date = parseTime((d as Record<string, unknown>)[x])
    if (!date) continue
    const v = (d as Record<string, unknown>)[y]
    points.push({
      t: date.getTime(),
      key: textAt(d, x),
      series: series ? textAt(d, series) : '',
      y: typeof v === 'number' && Number.isFinite(v) ? v : null,
      datum: d,
    })
  }
  points.sort((a, b) => a.t - b.t)
  const slices: Slice<T>[] = []
  for (const p of points) {
    const last = slices[slices.length - 1]
    if (last && last.t === p.t) last.points.push(p)
    else slices.push({ t: p.t, date: new Date(p.t), points: [p] })
  }
  const monthly = slices.every((s) => new Date(s.t).getUTCDate() === 1)
  const when = (t: number) => (monthly ? formatMonth(iso(t)) : formatDate(iso(t)))

  const theme = useChartTheme()
  const colorOf = (t: ChartTheme, name: string) => {
    if (emphasize !== undefined) return name === emphasize ? t.series[0] : t.deemph
    return seriesColor(t, names.indexOf(name))
  }
  const legend: LegendSpec | null = multi
    ? { kind: 'swatch', items: names.map((s) => ({ label: s, color: colorOf(theme, s), shape: 'line' })) }
    : null

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!slices.length) return null
    const ext = extent([...points.map((p) => p.y), refLine?.value])
    const withZero = zero ?? area
    const lo = withZero ? Math.min(0, ext?.[0] ?? 0) : (ext?.[0] ?? 0)
    const axis = numericAxis(lo, ext?.[1] ?? 1, format, height < 200 ? 4 : 5, yDomain)
    const marginLeft = Math.ceil(axis.labelWidth) + 10

    // End labels: series whose last value sits on the final date, at most four (or the emphasized one).
    const lastT = slices[slices.length - 1].t
    const ends = names
      .map((name) => {
        const own = points.filter((p) => p.series === name && p.y != null)
        const last = own[own.length - 1]
        return last && last.t === lastT ? { name, y: last.y as number } : null
      })
      .filter((e): e is { name: string; y: number } => e !== null)
      .filter((e) => emphasize === undefined || e.name === emphasize)
    const labelEnds = endLabels && ends.length > 0 && ends.length <= 4
    const nameMax = 120
    const endText = (e: { name: string; y: number }) => ({
      name: multi ? truncateText(e.name, nameMax, 11) : '',
      value: fmt(e.y, format),
    })
    const endWidth = labelEnds
      ? Math.max(
          ...ends.map((e) => {
            const tx = endText(e)
            return (tx.name ? textWidth(tx.name, 11) + 5 : 0) + textWidth(tx.value, 11, 600)
          }),
        ) + 16
      : 12
    const marginRight = Math.ceil(Math.min(endWidth, width * 0.32))
    const plotW = width - marginLeft - marginRight
    const tickCount = Math.max(2, Math.floor(plotW / 84))

    const order = emphasize === undefined ? names : [...names.filter((s) => s !== emphasize), emphasize]
    const lineData = order.flatMap((name) => points.filter((p) => p.series === name))
    const base = axis.domain[0] > 0 ? axis.domain[0] : 0
    const isolated = lineData.filter((p, i) => {
      if (p.y == null) return false
      const prev = lineData[i - 1]
      const next = lineData[i + 1]
      const joined = (q: Point<T> | undefined) => q && q.series === p.series && q.y != null
      return !joined(prev) && !joined(next)
    })

    const crosshair: Plot.RenderFunction = (index, scales, values, dims, context) => {
      const g = svgEl(context.document, 'g', { class: HOVER_CLASS })
      const i = index[0]
      if (i === undefined) return g
      const px = (values as Record<string, ArrayLike<number> | undefined>).x?.[i]
      if (px === undefined) return g
      const line = svgEl(context.document, 'line', {
        x1: px,
        x2: px,
        y1: dims.marginTop,
        y2: dims.height - dims.marginBottom,
      })
      line.style.stroke = t.axis
      line.style.strokeWidth = '1px'
      g.append(line)
      for (const p of slices[i].points) {
        if (p.y == null) continue
        const dot = svgEl(context.document, 'circle', { cx: px, cy: Number(scales.y?.(p.y)), r: 4 })
        dot.style.fill = colorOf(t, p.series)
        dot.style.stroke = t.sheet
        dot.style.strokeWidth = '2px'
        g.append(dot)
      }
      return g
    }

    const marks: Plot.Markish[] = [gridY(t, { ticks: axis.ticks })]
    if (area) {
      marks.push(
        Plot.areaY(lineData, {
          x: (p) => new Date(p.t),
          y1: base,
          y2: (p) => p.y ?? Number.NaN,
          z: (p) => p.series,
          fill: (p) => colorOf(t, p.series),
          fillOpacity: 0.1,
        }),
      )
    }
    if (axis.domain[0] <= 0 && axis.domain[1] >= 0) marks.push(Plot.ruleY([0], { stroke: t.axis }))
    if (refLine) marks.push(...refRule(refLine, 'y', t, 'start'))
    marks.push(
      Plot.line(lineData, {
        x: (p) => new Date(p.t),
        y: (p) => p.y ?? Number.NaN,
        z: (p) => p.series,
        stroke: (p) => colorOf(t, p.series),
        strokeWidth: 2,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      }),
      Plot.dot(isolated, {
        x: (p) => new Date(p.t),
        y: (p) => p.y,
        r: 2.5,
        fill: (p) => colorOf(t, p.series),
      }),
      Plot.ruleX(slices, Plot.pointerX({ x: (s: Slice<T>) => s.date, maxRadius: 4000, render: crosshair })),
    )
    if (labelEnds) {
      marks.push((index, scales, values, dims, context) => {
        const g = svgEl(context.document, 'g', { 'aria-label': 'end labels' })
        const xEnd = Number(scales.x?.(new Date(lastT)))
        const targets = ends.map((e) => Number(scales.y?.(e.y)))
        const placed = dodge(targets, 13, dims.marginTop + 4, dims.height - dims.marginBottom - 4)
        ends.forEach((e, k) => {
          const color = colorOf(t, e.name)
          const dot = svgEl(context.document, 'circle', { cx: xEnd, cy: targets[k], r: 3.5 })
          dot.style.fill = color
          dot.style.stroke = t.sheet
          dot.style.strokeWidth = '2px'
          g.append(dot)
          if (Math.abs(placed[k] - targets[k]) > 2) {
            const leader = svgEl(context.document, 'path', {
              d: `M${xEnd + 5},${targets[k]}L${xEnd + 9},${placed[k]}`,
            })
            leader.style.stroke = t.muted
            leader.style.fill = 'none'
            leader.style.strokeWidth = '1px'
            g.append(leader)
          }
        })
        const labelG = labelsMark(
          () =>
            ends.map((e, k) => {
              const tx = endText(e)
              return {
                x: xEnd + 11,
                y: placed[k],
                parts: [
                  ...(tx.name ? [{ text: tx.name, color: t.ink2, size: 11 }] : []),
                  { text: tx.value, color: t.ink, size: 11, weight: 600 },
                ],
              }
            }),
          'end values',
        )(index, scales, values, dims, context)
        if (labelG) g.append(labelG)
        return g
      })
    }
    const shortSpan = lastT - slices[0].t < 75 * 86_400_000
    marks.push(
      axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
      axisX(t, {
        ticks: tickCount,
        tickFormat: (d: Date, i: number) => {
          const key = iso(d.getTime())
          if (shortSpan) return `${d.getUTCDate()} ${formatMonthShort(key)}`
          return formatMonthShort(key, i === 0 || d.getUTCMonth() === 0)
        },
      }),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: refLine ? 16 : 10,
        marginRight,
        marginBottom: 24,
        marginLeft,
        x: { type: 'utc', domain: [new Date(slices[0].t), new Date(lastT)] },
        y: { domain: axis.domain },
        marks,
      },
    )
  }

  const tip = (s: Slice<T>): TipContent => {
    if (!multi) {
      const v = s.points[0]?.y ?? null
      return { title: when(s.t), rows: [{ value: fmt(v, format) }] }
    }
    const rows = names.map((name) => {
      const p = s.points.find((q) => q.series === name)
      return {
        value: p?.y == null ? DASH : fmt(p.y, format),
        label: name,
        color: colorOf(theme, name),
        shape: 'line' as const,
        strong: emphasize === name ? true : undefined,
        sort: p?.y ?? Number.NEGATIVE_INFINITY,
      }
    })
    rows.sort((a, b) => b.sort - a.sort)
    return { title: when(s.t), rows: rows.map(({ sort: _, ...r }) => r) }
  }

  return (
    <PlotChart<Slice<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      onSelect={
        onSelect
          ? (s) => {
              const first = s.points[0]
              if (first) onSelect(first.datum)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}
