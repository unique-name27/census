/**
 * Two measures per entity: dots (at least 8px, with a 2px sheet ring) on a hairline grid,
 * nearest-point hover within a generous radius, optional size by a third measure, reference
 * rules, and labels on the few points worth naming (the most extreme, or a filter you give),
 * placed so they never overlap.
 */
import * as Plot from '@observablehq/plot'
import { type Format, fmt } from '@/lib/format'
import { toneColor } from '../core/color'
import { HOVER_CLASS, labelsMark, type PixelLabel, refLabelWidth, refRule } from '../core/marks'
import { textWidth, truncateText } from '../core/measure'
import type { TipContent, TipRow } from '../core/tooltip'
import {
  axisX,
  axisY,
  gridX,
  gridY,
  housePlot,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  plotPos,
} from '../plot'
import { extremeIndices } from './prepare'
import { extent, numericAxis } from './scale'
import { type ChartBaseProps, type Key, numAt, type RefLine, type Tone, textAt } from './shared'

export interface ScatterProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  x: Key<T>
  y: Key<T>
  /** Size by this measure (radius 4 to 9 px, area-true). */
  r?: Key<T>
  tone?: (d: T) => Tone
  /** Text for point labels and the tooltip title. */
  label?: Key<T>
  /** Which points get a label (default: the `labelCount` most extreme). */
  labelFilter?: (d: T) => boolean
  labelCount?: number
  xFormat?: Format
  yFormat?: Format
  rFormat?: Format
  /** Axis names, also used in the tooltip. */
  xLabel?: string
  yLabel?: string
  rLabel?: string
  refX?: RefLine
  refY?: RefLine
  xDomain?: [number, number]
  yDomain?: [number, number]
  height?: number
}

interface Pt<T> {
  x: number
  y: number
  r: number
  rv: number | null
  tone: Tone
  label: string
  datum: T
}

const TONE_ORDER: Record<Tone, number> = {
  deemph: 0,
  default: 1,
  good: 2,
  warning: 3,
  serious: 4,
  critical: 5,
}

/** A label's or a mark's box in plot px. */
type Box = { x0: number; x1: number; y0: number; y1: number }

export function Scatter<T extends object>({
  data,
  x,
  y,
  r,
  tone,
  label,
  labelFilter,
  labelCount = 5,
  xFormat = 'num2',
  yFormat = 'num2',
  rFormat = 'int',
  xLabel,
  yLabel,
  rLabel,
  refX,
  refY,
  xDomain,
  yDomain,
  height = 300,
  onSelect,
  ariaLabel,
}: ScatterProps<T>) {
  const rExt = r ? extent(data.map((d) => numAt(d, r))) : null
  const radius = (v: number | null) => {
    if (!rExt || v == null) return 4.5
    const [a, b] = rExt
    const k = b > a ? Math.sqrt((v - a) / (b - a)) : 0.5
    return 4 + k * 5
  }
  const pts: Pt<T>[] = data
    .flatMap((d) => {
      const px = numAt(d, x)
      const py = numAt(d, y)
      if (px == null || py == null) return []
      const rv = r ? numAt(d, r) : null
      return [
        {
          x: px,
          y: py,
          r: radius(rv),
          rv,
          tone: tone?.(d) ?? 'default',
          label: label ? textAt(d, label) : '',
          datum: d,
        },
      ]
    })
    // Gray context first, status points last, so the points that matter sit on top.
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])

  const labeled = new Set<Pt<T>>(
    label
      ? labelFilter
        ? pts.filter((p) => labelFilter(p.datum))
        : extremeIndices(pts, labelCount).map((i) => pts[i])
      : [],
  )

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!pts.length) return null
    const xe = extent([...pts.map((p) => p.x), refX?.value])
    const ye = extent([...pts.map((p) => p.y), refY?.value])
    const yAxis = numericAxis(ye?.[0] ?? 0, ye?.[1] ?? 1, yFormat, height < 240 ? 4 : 5, yDomain)
    const marginLeft = Math.ceil(yAxis.labelWidth) + 12
    // A horizontal reference is labeled in the right margin, beside its rule and clear of the dots.
    const marginRight = refY ? Math.max(14, refLabelWidth(refY)) : 14
    const xAxis = numericAxis(
      xe?.[0] ?? 0,
      xe?.[1] ?? 1,
      xFormat,
      Math.max(3, Math.floor((width - marginLeft - marginRight) / 90)),
      xDomain,
    )
    const marginTop = yLabel || refX ? 24 : 12
    const marginBottom = xLabel ? 40 : 26

    // The vertical reference's label sits above the plot, unless it would run into the y axis
    // title there (a rule near the left edge, or a phone): then inside the plot beside the rule,
    // at the top or the bottom, wherever no dot is; with no such spot it is left off (the subtitle
    // says what the rule is). The point labels keep clear of it.
    const refXSpot = (
      scales: Plot.ScaleFunctions,
      dims: Plot.Dimensions,
    ): { x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box } | null => {
      if (!refX) return null
      const px = Number(scales.x?.(refX.value))
      const w = textWidth(refX.label, 11, 500)
      const left = dims.marginLeft
      const right = dims.width - dims.marginRight
      const top = dims.marginTop
      const bottom = dims.height - dims.marginBottom
      const anchor = px - left < 40 ? 'start' : right - px < 40 ? 'end' : 'middle'
      const x0 = anchor === 'start' ? px : anchor === 'end' ? px - w : px - w / 2
      const titleEnd = yLabel ? textWidth(yLabel, 11, 500) + 8 : 0
      if (x0 >= titleEnd)
        return { x: px, y: top - 8, anchor, box: { x0, x1: x0 + w, y0: top - 15, y1: top - 1 } }
      const dots = pts.map((q) => ({ x: Number(scales.x?.(q.x)), y: Number(scales.y?.(q.y)), r: q.r + 2 }))
      const spots = [top + 8, bottom - 8].flatMap((y) => [
        { x: px + 4, y, anchor: 'start' as const, box: { x0: px + 2, x1: px + 6 + w, y0: y - 7, y1: y + 7 } },
        { x: px - 4, y, anchor: 'end' as const, box: { x0: px - 6 - w, x1: px - 2, y0: y - 7, y1: y + 7 } },
      ])
      return (
        spots.find(
          (c) =>
            c.box.x0 >= left &&
            c.box.x1 <= right &&
            !dots.some(
              (d) =>
                d.x + d.r > c.box.x0 && d.x - d.r < c.box.x1 && d.y + d.r > c.box.y0 && d.y - d.r < c.box.y1,
            ),
        ) ?? null
      )
    }

    const marks: Plot.Markish[] = [
      gridX(t, { ticks: xAxis.ticks }),
      gridY(t, { ticks: yAxis.ticks }),
      ...(refX ? refRule(refX, 'x', t, 'none') : []),
      ...(refX
        ? [
            labelsMark((scales, dims) => {
              const spot = refXSpot(scales, dims)
              const part = { text: refX.label, color: t.ink2, size: 11, weight: 500 }
              return spot ? [{ x: spot.x, y: spot.y, parts: [part], anchor: spot.anchor, halo: t.sheet }] : []
            }, 'reference label'),
          ]
        : []),
      ...(refY ? refRule(refY, 'y', t, 'outside') : []),
      Plot.dot(pts, {
        x: (p) => p.x,
        y: (p) => p.y,
        r: (p) => p.r,
        fill: (p) => toneColor(t, p.tone),
        fillOpacity: 0.9,
        stroke: t.sheet,
        strokeWidth: 2,
      }),
      Plot.dot(
        pts,
        Plot.pointer({
          x: (p: Pt<T>) => p.x,
          y: (p: Pt<T>) => p.y,
          r: (p: Pt<T>) => p.r + 3,
          fill: 'none',
          stroke: t.ink,
          strokeWidth: 1.5,
          maxRadius: 24,
          className: HOVER_CLASS,
        }),
      ),
    ]
    if (labeled.size) {
      marks.push(
        labelsMark((scales, dims) => {
          const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
          const ref = refXSpot(scales, dims)
          const boxes: Box[] = ref ? [ref.box] : []
          const out: PixelLabel[] = []
          const left = dims.marginLeft
          const right = dims.width - dims.marginRight
          const top = dims.marginTop
          const bottom = dims.height - dims.marginBottom
          // Every dot is an obstacle, and so are the reference rules: a label never covers a mark.
          const dots: Box[] = pts.map((q) => {
            const qx = Number(scales.x?.(q.x))
            const qy = Number(scales.y?.(q.y))
            return { x0: qx - q.r - 1, x1: qx + q.r + 1, y0: qy - q.r - 1, y1: qy + q.r + 1 }
          })
          const rules: Box[] = [
            ...(refX
              ? [Number(scales.x?.(refX.value))].map((v) => ({ x0: v - 1, x1: v + 1, y0: top, y1: bottom }))
              : []),
            ...(refY
              ? [Number(scales.y?.(refY.value))].map((v) => ({ x0: left, x1: right, y0: v - 1, y1: v + 1 }))
              : []),
          ]
          for (const p of labeled) {
            const text = truncateText(p.label, 140, 11)
            const w = textWidth(text, 11, 500)
            const cx = Number(scales.x?.(p.x))
            const cy = Number(scales.y?.(p.y))
            const own = pts.indexOf(p)
            // Right of the dot, left of it, then above and below it: the first spot clear of the
            // plot edge, the other labels and every mark.
            const spots: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; box: Box }[] = [
              {
                x: cx + p.r + 4,
                y: cy,
                anchor: 'start',
                box: { x0: cx + p.r + 2, x1: cx + p.r + 6 + w, y0: cy - 7, y1: cy + 7 },
              },
              {
                x: cx - p.r - 4,
                y: cy,
                anchor: 'end',
                box: { x0: cx - p.r - 6 - w, x1: cx - p.r - 2, y0: cy - 7, y1: cy + 7 },
              },
              {
                x: cx,
                y: cy - p.r - 9,
                anchor: 'middle',
                box: { x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: cy - p.r - 16, y1: cy - p.r - 2 },
              },
              {
                x: cx,
                y: cy + p.r + 9,
                anchor: 'middle',
                box: { x0: cx - w / 2 - 2, x1: cx + w / 2 + 2, y0: cy + p.r + 2, y1: cy + p.r + 16 },
              },
            ]
            const inPlot = (b: Box) =>
              b.x0 >= left - 2 && b.x1 <= right + 2 && b.y0 >= top - 4 && b.y1 <= bottom + 4
            const clear = (b: Box, strict: boolean) =>
              inPlot(b) &&
              !boxes.some((o) => hits(o, b)) &&
              !dots.some((d, i) => i !== own && hits(d, b)) &&
              (!strict || !rules.some((r) => hits(r, b)))
            // Clear of the rules too when possible; a label may sit on a rule (with its halo) rather than go.
            const spot = spots.find((c) => clear(c.box, true)) ?? spots.find((c) => clear(c.box, false))
            if (!spot) continue
            boxes.push(spot.box)
            out.push({
              x: spot.x,
              y: spot.y,
              anchor: spot.anchor,
              parts: [{ text, color: t.ink2, size: 11, weight: 500 }],
              halo: t.sheet,
              title: text === p.label ? undefined : p.label,
            })
          }
          return out
        }, 'point labels'),
      )
    }
    if (xLabel || yLabel) {
      marks.push(
        labelsMark(
          (_, dims) => [
            ...(yLabel
              ? [{ x: 0, y: 8, parts: [{ text: yLabel, color: t.ink2, size: 11, weight: 500 }] }]
              : []),
            ...(xLabel
              ? [
                  {
                    x: dims.width - dims.marginRight,
                    y: dims.height - 8,
                    anchor: 'end' as const,
                    parts: [{ text: xLabel, color: t.ink2, size: 11, weight: 500 }],
                  },
                ]
              : []),
          ],
          'axis labels',
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
        marginBottom,
        marginLeft,
        x: { domain: xAxis.domain },
        y: { domain: yAxis.domain },
        r: { type: 'identity' },
        marks,
      },
    )
  }

  const tip = (p: Pt<T>): TipContent => {
    const rows: TipRow[] = [
      { value: fmt(p.x, xFormat), label: xLabel ?? x },
      { value: fmt(p.y, yFormat), label: yLabel ?? y },
    ]
    if (r) rows.push({ value: fmt(p.rv, rFormat), label: rLabel ?? r })
    return { title: p.label || undefined, rows }
  }

  // Keyboard: points left to right (top to bottom on ties).
  const keyPoints = (plot: PlotElement) =>
    pts
      .map((p) => ({
        datum: p,
        x: plotPos(plot, 'x', p.x),
        y: plotPos(plot, 'y', p.y),
        w: p.r * 2,
        h: p.r * 2,
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y)

  return (
    <PlotChart<Pt<T>>
      keyPoints={keyPoints}
      build={build}
      height={height}
      tip={tip}
      onSelect={onSelect ? (p) => onSelect(p.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
