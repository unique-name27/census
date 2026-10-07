/**
 * Trends over time: 2px lines (optionally with a 10% area wash), a crosshair that snaps to the
 * nearest date and lists every series in one tooltip, end labels for up to four series (dodged
 * apart with short leader lines), a legend for two or more series, and emphasis (one series in
 * the accent, the rest dashed in muted ink, 3:1 or more on the sheet) when the story is about one
 * of them. Missing values break the line.
 * A reference rule is labeled in the right margin (dodged with the end labels), never over the
 * data. Clicking drills the series nearest the pointer at the hovered date.
 *
 * Refresh (docs/DESIGN-REFRESH.md 2.7): up to two `notes` tie a finding's sentence to its point
 * ("Fell to 68%, mostly Bengaluru"); the right margin comes from the measured end labels and a
 * name that would not fit is shortened, so labels stay inside the figure at 375px; the time axis
 * keeps at least three labels; default height 220px (180px on phones); the chart is one tab stop
 * whose arrow keys walk the points (Left and Right along a series, Up and Down across series).
 *
 *   <Lines data={rows} x="quarterEnd" y="rate" format="pct"
 *          notes={[{ at: '2026-09-30', text: 'Fell to 68%, mostly Bengaluru' }]} />
 */
import * as Plot from '@observablehq/plot'
import { scaleUtc } from 'd3'
import { useNarrow } from '@/components/useNarrow'
import { formatDate, formatMonth, formatMonthShort, iso } from '@/lib/dates'
import { DASH, type Format, fmt } from '@/lib/format'
import type { KeyPoint } from '../core/keyboard'
import type { LegendSpec } from '../core/legend'
import { HOVER_CLASS, labelsMark, noteMark, refLabelWidth, refRule, svgEl } from '../core/marks'
import { textWidth, truncateText } from '../core/measure'
import { type ChartNote, lineBoxes, NOTE_HEADROOM } from '../core/notes'
import type { TipContent } from '../core/tooltip'
import {
  axisX,
  axisY,
  gridY,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  plotPos,
} from '../plot'
import { type ChartTheme, seriesColor, useChartTheme } from '../theme'
import { nearestBy } from './hit'
import { dodge, minThreeTicks, parseTime, tickHasYear, timeTicks } from './prepare'
import { extent, numericAxis } from './scale'
import { isOtherSeries, otherLast } from './series'
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
  /**
   * Time-axis ticks on the data dates: every month, or every quarter end labeled "Q3 '26"
   * (thinned to fit). Default: automatic ticks.
   */
  xTicks?: 'month' | 'quarter'
  /**
   * Names each x value (a survey wave, say): the axis ticks on every data date with that name and
   * the tooltip leads with it. Give the points evenly spaced dates for an axis of equal steps.
   */
  xLabel?: (x: string) => string
  /** Plot height in px (default 220, 180 on phones). */
  height?: number
  /**
   * Up to two annotations: `at` is the x of the point (the same ISO date or "YYYY-MM" as the
   * data), `value` defaults to that point's value on `series` (or the emphasized or first series).
   */
  notes?: readonly ChartNote[]
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
  xTicks,
  xLabel,
  height: heightProp,
  notes,
  onSelect,
  selectable,
  ariaLabel,
}: LinesProps<T>) {
  const narrow = useNarrow()
  const height = heightProp ?? (narrow ? 180 : 220)
  // "Other" series are listed last and drawn in gray, beneath the named ones.
  const names = series
    ? otherLast(
        orderedKeys(
          data.map((d) => textAt(d, series)),
          seriesOrder,
        ),
      )
    : ['']
  const slots = names.filter((n) => !isOtherSeries(n))
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
  const labelAt = new Map(xLabel ? slices.map((s) => [s.t, xLabel(s.points[0]?.key ?? '')]) : [])
  // Quarterly data on quarter ends reads as its quarter ("Q3 2026"), not the quarter's last day.
  const quarterOf = (t: number): string | null => {
    const d = new Date(t)
    const next = new Date(t + 86_400_000)
    if (d.getUTCMonth() % 3 !== 2 || next.getUTCDate() !== 1) return null
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
  }
  const when = (t: number) =>
    labelAt.get(t) ??
    (xTicks === 'quarter' ? quarterOf(t) : null) ??
    (monthly ? formatMonth(iso(t)) : formatDate(iso(t)))

  const theme = useChartTheme()
  // The series an emphasized chart plays down are drawn dashed in muted ink: still 3:1 or more
  // against the sheet (they drill too), and plainly secondary to the accent line.
  const playedDown = (name: string) => emphasize !== undefined && name !== emphasize
  const colorOf = (t: ChartTheme, name: string) => {
    if (emphasize !== undefined) return name === emphasize ? t.series[0] : t.muted
    if (isOtherSeries(name)) return t.deemph
    return seriesColor(t, slots.indexOf(name))
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
    // End labels get at most 32% of the width: a series name that would not fit is shortened, or
    // dropped (the legend and tooltip keep it), so the label never runs past the figure's edge.
    const room = width * 0.32 - 16
    const nameMax = Math.min(
      120,
      Math.max(0, room - Math.max(0, ...ends.map((e) => textWidth(fmt(e.y, format), 11, 600))) - 5),
    )
    // A name that fits is shown in full; one that does not is shortened only where there is room
    // for most of it (80px), and otherwise left to the legend, so a phone never shows "Last 12…".
    const endName = (name: string) =>
      !multi
        ? ''
        : textWidth(name, 11) <= nameMax
          ? name
          : nameMax >= 80
            ? truncateText(name, nameMax, 11)
            : ''
    const endText = (e: { name: string; y: number }) => ({
      name: endName(e.name),
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
    // The reference label sits in the right margin too: beside the rule, or among the end labels.
    const refText = refLine ? truncateText(refLine.label, Math.max(40, room), 11, 500) : ''
    const refWidth = refLine
      ? labelEnds
        ? textWidth(refText, 11, 500) + 16
        : refLabelWidth({ value: refLine.value, label: refText })
      : 0
    const marginRight = Math.ceil(Math.min(Math.max(endWidth, refWidth), width * 0.32))
    const plotW = width - marginLeft - marginRight
    const tickCount = Math.max(2, Math.floor(plotW / 84))

    const under = [...names.filter(isOtherSeries), ...names.filter((s) => !isOtherSeries(s))]
    const order = emphasize === undefined ? under : [...under.filter((s) => s !== emphasize), emphasize]
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
    if (refLine) {
      marks.push(...refRule({ value: refLine.value, label: refText }, 'y', t, labelEnds ? 'none' : 'outside'))
    }
    const lineOpts = (dashed: boolean): Plot.LineYOptions => ({
      x: (p: Point<T>) => new Date(p.t),
      y: (p: Point<T>) => p.y ?? Number.NaN,
      z: (p: Point<T>) => p.series,
      stroke: (p: Point<T>) => colorOf(t, p.series),
      strokeWidth: dashed ? 1.5 : 2,
      strokeLinejoin: 'round',
      strokeLinecap: dashed ? 'butt' : 'round',
      ...(dashed ? { strokeDasharray: '4 3' } : {}),
    })
    marks.push(
      Plot.line(
        lineData.filter((p) => playedDown(p.series)),
        lineOpts(true),
      ),
      Plot.line(
        lineData.filter((p) => !playedDown(p.series)),
        lineOpts(false),
      ),
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
        // The reference label is dodged with the end labels so the two never overlap.
        const refY = refLine ? Number(scales.y?.(refLine.value)) : Number.NaN
        const all = Number.isFinite(refY) ? [...targets, refY] : targets
        const placedAll = dodge(all, 13, dims.marginTop + 4, dims.height - dims.marginBottom - 4)
        const placed = placedAll.slice(0, targets.length)
        const refAt = placedAll[targets.length]
        if (refAt !== undefined && Math.abs(refAt - refY) > 2) {
          const leader = svgEl(context.document, 'path', { d: `M${xEnd + 2},${refY}L${xEnd + 9},${refAt}` })
          leader.style.stroke = t.muted
          leader.style.fill = 'none'
          leader.style.strokeWidth = '1px'
          g.append(leader)
        }
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
          () => [
            ...ends.map((e, k) => {
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
            ...(refAt !== undefined
              ? [{ x: xEnd + 11, y: refAt, parts: [{ text: refText, color: t.ink2, size: 11, weight: 500 }] }]
              : []),
          ],
          'end values',
        )(index, scales, values, dims, context)
        if (labelG) g.append(labelG)
        return g
      })
    }
    if (notes?.length) {
      const noteSeries = (n: ChartNote) => n.series ?? emphasize ?? names[0]
      marks.push(
        noteMark(t, (scales) => {
          const px = (p: Point<T>) => ({ x: Number(scales.x?.(new Date(p.t))), y: Number(scales.y?.(p.y)) })
          const obstacles = names.flatMap((name) =>
            lineBoxes(points.filter((p) => p.series === name && p.y != null).map(px)),
          )
          const anchors = notes.flatMap((n) => {
            const at = parseTime(n.at)
            if (!at) return []
            const p = points.find((q) => q.t === at.getTime() && q.series === noteSeries(n))
            const v = n.value ?? p?.y
            if (v == null) return []
            return [{ x: Number(scales.x?.(at)), y: Number(scales.y?.(v)), text: n.text }]
          })
          return { anchors, obstacles }
        }),
      )
    }
    const shortSpan = lastT - slices[0].t < 75 * 86_400_000
    const explicit = xTicks
      ? timeTicks(
          slices.map((s) => s.t),
          xTicks,
          plotW,
          (l) => textWidth(l, 11),
        )
      : null
    // Automatic ticks that would show fewer than three labels fall back to the first, middle and
    // last data dates, so a phone never shows a single tick.
    const autoTicks = scaleUtc()
      .domain([new Date(slices[0].t), new Date(lastT)])
      .ticks(tickCount)
    const fewTicks = !explicit && slices.length >= 3 && autoTicks.length < 3
    const fallbackTicks = fewTicks
      ? minThreeTicks(
          slices.map((s) => s.date),
          [],
        )
      : null
    const explicitLabel = new Map(explicit?.map((k) => [k.t, k.label]))
    // Month ticks carry the year on the first tick and wherever the year changes from the tick
    // before ("Oct '24, Sep '25, Sep '26"), so two ticks never read the same.
    const monthTicks = (ticks: readonly Date[]) => ({
      ticks: [...ticks],
      tickFormat: (d: Date) => {
        const key = iso(d.getTime())
        if (shortSpan) return `${d.getUTCDate()} ${formatMonthShort(key)}`
        return formatMonthShort(
          key,
          tickHasYear(
            ticks,
            ticks.findIndex((x) => x.getTime() === d.getTime()),
          ),
        )
      },
    })
    const keyAt = new Map(slices.map((s) => [s.t, s.points[0]?.key ?? '']))
    marks.push(
      axisY(t, { ticks: axis.ticks, tickFormat: axis.format }),
      xLabel
        ? axisX(t, {
            ticks: slices.map((s) => s.date),
            tickFormat: (d: Date) => xLabel(keyAt.get(d.getTime()) ?? ''),
          })
        : explicit
          ? axisX(t, {
              ticks: explicit.map((k) => new Date(k.t)),
              tickFormat: (d: Date) => explicitLabel.get(d.getTime()) ?? '',
            })
          : axisX(t, monthTicks(fallbackTicks ?? autoTicks)),
    )
    return housePlot(
      { width, theme: t },
      {
        height,
        // Notes get headroom above the plot, so a note on the highest point has somewhere to go.
        marginTop: 10 + (notes?.length ? NOTE_HEADROOM : 0),
        marginRight,
        marginBottom: 24,
        marginLeft,
        x: { type: 'utc', domain: [new Date(slices[0].t), new Date(lastT)] },
        y: { domain: axis.domain },
        marks,
      },
    )
  }

  /** The series whose point at the hovered date is nearest the pointer (vertically). */
  const pick = (s: Slice<T>, at: PlotPointer, plot: PlotElement): string | null => {
    const y = plot.scale('y')
    if (!y) return null
    const near = nearestBy(
      s.points.filter((p) => p.y != null),
      (p) => Number(y.apply(p.y)),
      at.y,
    )
    return near?.series ?? null
  }
  /** The row to drill: the picked series' point at this date, else the date's first row. */
  const datumOf = (s: Slice<T>, part: string | null): T | undefined =>
    (part == null ? undefined : s.points.find((p) => p.series === part && p.y != null)?.datum) ??
    s.points[0]?.datum

  const tip = (s: Slice<T>, part: string | null): TipContent => {
    if (!multi) {
      const v = s.points[0]?.y ?? null
      return { title: when(s.t), rows: [{ value: fmt(v, format) }] }
    }
    const strongName = part ?? emphasize
    const rows = names.map((name) => {
      const p = s.points.find((q) => q.series === name)
      return {
        value: p?.y == null ? DASH : fmt(p.y, format),
        label: name,
        color: colorOf(theme, name),
        shape: 'line' as const,
        strong: strongName === name ? true : undefined,
        sort: p?.y ?? Number.NEGATIVE_INFINITY,
      }
    })
    rows.sort((a, b) => b.sort - a.sort)
    return { title: when(s.t), rows: rows.map(({ sort: _, ...r }) => r) }
  }

  // Keyboard: each series' points in time order (one group per series), the emphasized series
  // first, so the first key press lands on the line the figure is about.
  const keyOrder =
    emphasize !== undefined && names.includes(emphasize)
      ? [emphasize, ...names.filter((n) => n !== emphasize)]
      : names
  const keyPoints = (plot: PlotElement): KeyPoint<Slice<T>>[] =>
    keyOrder.flatMap((name) =>
      slices.flatMap((sl) => {
        const p = sl.points.find((q) => q.series === name && q.y != null)
        if (!p) return []
        return [
          {
            datum: sl,
            part: multi ? name : null,
            x: plotPos(plot, 'x', sl.date),
            y: plotPos(plot, 'y', p.y),
            group: multi ? name : undefined,
          },
        ]
      }),
    )

  return (
    <PlotChart<Slice<T>>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      keyPoints={keyPoints}
      pick={multi ? pick : undefined}
      selectable={(s, part) => {
        // A point opens only when the view's gate says its records open (none for a hidden point).
        const d = datumOf(s, part)
        return d !== undefined && (selectable?.(d) ?? true)
      }}
      onSelect={
        onSelect
          ? (s, part) => {
              const d = datumOf(s, part)
              if (d) onSelect(d)
            }
          : undefined
      }
      ariaLabel={ariaLabel}
    />
  )
}
