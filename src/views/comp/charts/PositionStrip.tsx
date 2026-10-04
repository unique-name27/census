/**
 * Compa-ratio of every person, one row per tenure band, with range position encoded in shape as
 * well as color: in range is a circle, below minimum a square (the serious glyph), above maximum
 * a diamond (the warning glyph). The key is drawn inside the chart so it shows the exact shapes
 * and travels with PNG and SVG exports. An ink tick marks each row's median. A click on a mark
 * opens that person.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  type ChartTheme,
  glyphForTone,
  gridX,
  HOVER_CLASS,
  housePlot,
  labelsMark,
  maxTextWidth,
  numericAxis,
  type PixelLabel,
  type PlotBuildContext,
  PlotChart,
  refRule,
  seriesColor,
  type TipContent,
  textWidth,
  toneColor,
  truncateText,
} from '@/charts'
import { fmt } from '@/lib/format'
import { median } from '@/lib/stats'
import type { TenureDot } from '../engine/ranges'

type Status = 'in' | 'below' | 'above'

const ROW = 36
const KEY_ROW = 18
const REF_ROW = 22

interface Dot {
  x: number
  row: number
  y: number
  group: string
  status: Status
  datum: TenureDot
}

const STATUS_LABEL: Record<Status, string> = {
  in: 'In range',
  below: 'Below minimum',
  above: 'Above maximum',
}

const statusOf = (d: TenureDot): Status =>
  d.position === 'Below minimum' ? 'below' : d.position === 'Above maximum' ? 'above' : 'in'

function statusColor(t: ChartTheme, s: Status): string {
  return s === 'below' ? toneColor(t, 'serious') : s === 'above' ? toneColor(t, 'warning') : seriesColor(t, 0)
}

/** Stable spread in [−1, 1] from an id, so a person never moves between renders. */
function jitter(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967295) * 2 - 1
}

export function PositionStrip({
  data,
  yOrder,
  ariaLabel,
  onSelect,
}: {
  data: readonly TenureDot[]
  yOrder: readonly string[]
  ariaLabel?: string
  /** Click on a person's mark. */
  onSelect?: (d: TenureDot) => void
}) {
  const present = new Set(data.map((d) => d.tenureBand))
  const groups = [...yOrder.filter((g) => present.has(g)), ...[...present].filter((g) => !yOrder.includes(g))]
  const rowOf = new Map(groups.map((g, i) => [g, i]))
  const dots: Dot[] = data.flatMap((d) => {
    const row = rowOf.get(d.tenureBand)
    if (row === undefined || !Number.isFinite(d.compa)) return []
    return [
      { x: d.compa, row, y: row + jitter(d.id) * 0.27, group: d.tenureBand, status: statusOf(d), datum: d },
    ]
  })
  const medians = groups.flatMap((_, row) => {
    const m = median(dots.filter((d) => d.row === row).map((d) => d.x))
    return m == null ? [] : [{ row, m }]
  })
  // Without range data there is no position to key.
  const hasRanges = data.some((d) => d.position !== '')
  const shown = hasRanges
    ? (['in', 'below', 'above'] as const).filter((s) => dots.some((d) => d.status === s))
    : []
  const bodyHeight = groups.length * ROW + 26
  /** Key items laid out from the left edge, wrapping onto more lines when the chart is narrow. */
  const keyLayout = (width: number) => {
    const items: { s: Status; x: number; line: number }[] = []
    let x = 0
    let line = 0
    for (const s of shown) {
      const w = 12 + textWidth(STATUS_LABEL[s], 12)
      if (x > 0 && x + w > width) {
        x = 0
        line++
      }
      items.push({ s, x, line })
      x += w + 16
    }
    return { items, lines: shown.length ? line + 1 : 0 }
  }
  const height = keyLayout(320).lines * KEY_ROW + REF_ROW + bodyHeight

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!dots.length) return null
    const layout = keyLayout(width)
    const marginTop = layout.lines * KEY_ROW + REF_ROW
    const labels = groups.map((g) => truncateText(g, Math.max(48, width * 0.3), 12))
    const marginLeft = Math.ceil(maxTextWidth(labels, 12)) + 14
    const marginRight = 12
    const xs = dots.map((d) => d.x)
    const axis = numericAxis(
      Math.min(...xs, 1),
      Math.max(...xs, 1),
      'ratio',
      Math.max(3, Math.floor((width - marginLeft - marginRight) / 80)),
    )
    const of = (s: Status) => dots.filter((d) => d.status === s)
    const dot = (s: Status, extra: Plot.DotOptions): Plot.Markish =>
      Plot.dot(of(s), {
        x: (d: Dot) => d.x,
        y: (d: Dot) => d.y,
        fill: statusColor(t, s),
        stroke: t.sheet,
        strokeWidth: 1.5,
        ...extra,
      })
    // The key: glyph + label for each status present, from the left edge like the house legend.
    const key = labelsMark(
      () =>
        layout.items.map(
          ({ s, x, line }): PixelLabel => ({
            x,
            y: line * KEY_ROW + KEY_ROW / 2,
            glyph: {
              shape: s === 'in' ? 'circle' : glyphForTone(s === 'below' ? 'serious' : 'warning'),
              color: statusColor(t, s),
            },
            parts: [{ text: STATUS_LABEL[s], color: t.ink2, size: 12 }],
          }),
        ),
      'key',
    )
    return housePlot(
      { width, theme: t },
      {
        height: marginTop + bodyHeight,
        marginTop,
        marginRight,
        marginBottom: 26,
        marginLeft,
        x: { domain: axis.domain },
        y: { domain: [groups.length - 0.5, -0.5], axis: null },
        marks: [
          gridX(t, { ticks: axis.ticks }),
          Plot.ruleY(
            groups.slice(1).map((_, i) => i + 0.5),
            { stroke: t.rule, strokeWidth: 1 },
          ),
          ...refRule({ value: 1, label: 'Midpoint' }, 'x', t),
          dot('in', { r: 4, fillOpacity: 0.85 }),
          // Out-of-range people sit on top so a cluster never hides them.
          dot('below', { symbol: 'square', r: 4.5 }),
          dot('above', { symbol: 'diamond2', r: 5 }),
          Plot.ruleX(medians, {
            x: (m) => m.m,
            y1: (m) => m.row - 0.36,
            y2: (m) => m.row + 0.36,
            stroke: t.ink,
            strokeWidth: 2,
          }),
          Plot.dot(
            dots,
            Plot.pointer({
              x: (d: Dot) => d.x,
              y: (d: Dot) => d.y,
              r: 7,
              fill: 'none',
              stroke: t.ink,
              strokeWidth: 1.5,
              maxRadius: 16,
              className: HOVER_CLASS,
            }),
          ),
          labelsMark(
            (scales, dims) =>
              groups.map((g, i) => ({
                x: dims.marginLeft - 10,
                y: Number(scales.y?.(i)),
                anchor: 'end' as const,
                parts: [{ text: labels[i], color: t.ink2, size: 12 }],
                title: labels[i] === g ? undefined : g,
              })),
            'group labels',
          ),
          key,
          axisX(t, { ticks: axis.ticks, tickFormat: axis.format }),
        ],
      },
    )
  }

  const tip = (d: Dot): TipContent => {
    const m = medians.find((q) => q.row === d.row)
    return {
      title: d.datum.name,
      rows: [
        { value: fmt(d.x, 'ratio'), label: `compa-ratio, ${d.group}` },
        ...(d.datum.position ? [{ value: STATUS_LABEL[d.status], label: 'range position' }] : []),
        ...(m ? [{ value: fmt(m.m, 'ratio'), label: 'tenure band median' }] : []),
      ],
      note: onSelect ? 'Click to open their card' : undefined,
    }
  }

  return (
    <PlotChart<Dot>
      build={build}
      height={height}
      tip={tip}
      onSelect={onSelect ? (d) => onSelect(d.datum) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
