/**
 * Two medians per row joined by a line: incumbents and new hires at the same department and
 * level. The gap is printed at the right; rows past the compression threshold carry a warning
 * glyph so the flag does not rest on color. A click on a dot drills into that side (new hires or
 * incumbents); elsewhere on the row, both.
 */
import * as Plot from '@observablehq/plot'
import { ticks as d3ticks } from 'd3'
import {
  axisX,
  glyphForTone,
  gridX,
  housePlot,
  hoverBand,
  type LegendSpec,
  labelsMark,
  maxTextWidth,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  scalePos,
  seriesColor,
  type TipContent,
  textWidth,
  toneColor,
  truncateText,
  useChartTheme,
} from '@/charts'
import { fmt } from '@/lib/format'
import type { CompressionRow } from '../engine/ranges'

const ROW = 30

const gapText = (g: number) => `${g >= 0 ? '+' : '−'}${fmt(Math.abs(g), 'num2')}`
/** A dot counts as hovered within this many px of the pointer. */
const DOT_HIT = 10

export type DumbbellSide = 'hires' | 'incumbents'

export function Dumbbell({
  rows,
  ariaLabel,
  onSelect,
}: {
  rows: readonly CompressionRow[]
  ariaLabel?: string
  /** Click-to-drill: the row, and the side whose dot is under the pointer (null elsewhere). */
  onSelect?: (row: CompressionRow, side: DumbbellSide | null) => void
}) {
  const theme = useChartTheme()
  const height = 6 + rows.length * ROW + 26
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Incumbents', color: seriesColor(theme, 1), shape: 'dot' },
      { label: 'Hired in the last 12 months', color: seriesColor(theme, 0), shape: 'dot' },
    ],
  }
  const keyOf = (i: number) => `r${i}`

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const shown = rows.map((r) => truncateText(r.group, Math.max(80, width * 0.36), 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const marginRight = Math.ceil(textWidth('+0.00', 12, 500)) + 28
    const lo = Math.min(...rows.map((r) => r.low), 1) - 0.03
    const hi = Math.max(...rows.map((r) => r.high), 1) + 0.03
    const ticks = d3ticks(lo, hi, Math.max(3, Math.floor(width / 110)))
    const idx = rows.map((_, i) => i)
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 26,
        marginLeft,
        marginRight,
        x: { domain: [lo, hi] },
        y: { type: 'band', domain: idx.map(keyOf), padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks }),
          Plot.ruleX([1], { stroke: t.axis, strokeWidth: 1 }),
          hoverBand(idx, { axis: 'y', value: keyOf, color: t.ink }),
          Plot.ruleY(idx, {
            y: keyOf,
            x1: (i: number) => rows[i].incMedian,
            x2: (i: number) => rows[i].newMedian,
            stroke: t.deemph,
            strokeWidth: 2,
          }),
          Plot.dot(idx, {
            y: keyOf,
            x: (i: number) => rows[i].incMedian,
            r: 5,
            fill: seriesColor(t, 1),
            stroke: t.sheet,
            strokeWidth: 2,
          }),
          Plot.dot(idx, {
            y: keyOf,
            x: (i: number) => rows[i].newMedian,
            r: 5,
            fill: seriesColor(t, 0),
            stroke: t.sheet,
            strokeWidth: 2,
          }),
          labelsMark(
            (scales, dims) =>
              idx.map((i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', keyOf(i)),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: t.ink2, size: 12 }],
                title: shown[i] === rows[i].group ? undefined : rows[i].group,
              })),
            'row labels',
          ),
          labelsMark(
            (scales, dims) =>
              idx.map((i) => ({
                x: dims.width - dims.marginRight + 8,
                y: scalePos(scales, 'y', keyOf(i)),
                glyph: rows[i].flagged
                  ? { shape: glyphForTone('warning'), color: toneColor(t, 'warning') }
                  : undefined,
                parts: [
                  {
                    text: gapText(rows[i].gap),
                    color: rows[i].flagged ? t.ink : t.muted,
                    size: 12,
                    weight: rows[i].flagged ? 500 : undefined,
                  },
                ],
              })),
            'gaps',
          ),
          axisX(t, { ticks, tickFormat: (v: number) => fmt(v, 'ratio') }),
        ],
      },
    )
  }

  /** The side whose dot sits under the pointer: the nearer one, within DOT_HIT px. */
  const pick = (i: number, at: PlotPointer, plot: PlotElement): string | null => {
    const r = rows[i]
    const x = plot.scale('x')
    if (!r || !x) return null
    const dNew = Math.abs(Number(x.apply(r.newMedian)) - at.x)
    const dInc = Math.abs(Number(x.apply(r.incMedian)) - at.x)
    if (Math.min(dNew, dInc) > DOT_HIT) return null
    return dNew <= dInc ? 'hires' : 'incumbents'
  }

  const tip = (i: number, part: string | null): TipContent | null => {
    const r = rows[i]
    if (!r) return null
    return {
      title: r.group,
      rows: [
        {
          value: fmt(r.newMedian, 'ratio'),
          label: `hired in the last 12 months (${fmt(r.newN, 'int')})`,
          color: seriesColor(theme, 0),
          shape: 'dot',
          strong: part === 'hires',
        },
        {
          value: fmt(r.incMedian, 'ratio'),
          label: `incumbents (${fmt(r.incN, 'int')})`,
          color: seriesColor(theme, 1),
          shape: 'dot',
          strong: part === 'incumbents',
        },
        { value: gapText(r.gap), label: 'gap', strong: part == null },
      ],
      note: [
        r.flagged ? 'New hires are 0.05 or more above incumbents' : null,
        onSelect ? 'Click to see the records' : null,
      ]
        .filter(Boolean)
        .join('. '),
    }
  }

  return (
    <PlotChart<number>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      onSelect={onSelect ? (i, part) => onSelect(rows[i], part as DumbbellSide | null) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
