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
import { axisX, axisY, gridX, gridY, housePlot, type PlotBuildContext, PlotChart } from '../plot'
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

    const marks: Plot.Markish[] = [
      gridX(t, { ticks: xAxis.ticks }),
      gridY(t, { ticks: yAxis.ticks }),
      ...(refX ? refRule(refX, 'x', t) : []),
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
          const boxes: { x0: number; x1: number; y0: number; y1: number }[] = []
          const out: PixelLabel[] = []
          const right = dims.width - dims.marginRight
          for (const p of labeled) {
            const text = truncateText(p.label, 140, 11)
            const w = textWidth(text, 11, 500)
            const cx = Number(scales.x?.(p.x))
            const cy = Number(scales.y?.(p.y))
            const leftSide = cx + p.r + 4 + w > right
            const x0 = leftSide ? cx - p.r - 4 - w : cx + p.r + 4
            const box = { x0: x0 - 2, x1: x0 + w + 2, y0: cy - 7, y1: cy + 7 }
            if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue
            boxes.push(box)
            out.push({
              x: leftSide ? cx - p.r - 4 : cx + p.r + 4,
              y: cy,
              anchor: leftSide ? 'end' : 'start',
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

  return (
    <PlotChart<Pt<T>>
      build={build}
      height={height}
      tip={tip}
      onSelect={onSelect ? (p) => onSelect(p.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
