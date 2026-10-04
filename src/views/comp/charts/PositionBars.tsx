/**
 * Range position as 100% bars, one row per group: an ordinal blue ramp for the four quartiles of
 * the range, with the two out-of-range buckets in status colors at either end (below minimum on
 * the left, above maximum on the right), so position reads from left to right like the range.
 * The ramp runs seq-400 to seq-700 so even the first quarter holds 3:1 against the sheet in both
 * themes (the dark tokens invert, so Q4 is the lightest there). A click on a segment drills into
 * the people at that position in that group; elsewhere on the row, everyone in the group.
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  type ChartTheme,
  gridX,
  housePlot,
  hoverBand,
  inkOn,
  type LegendSpec,
  labelsMark,
  maxTextWidth,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  scalePos,
  type TipContent,
  textWidth,
  truncateText,
  useChartTheme,
} from '@/charts'
import { fmt } from '@/lib/format'
import { POSITIONS, type Position } from '../engine/population'
import { POSITION_FIELD, type PositionMixRow } from '../engine/ranges'

const ROW = 32
const BAR = 18

export function positionColor(t: ChartTheme, p: Position): string {
  switch (p) {
    case 'Below minimum':
      return t.status.serious
    case 'Q1':
      return t.seq[400]
    case 'Q2':
      return t.seq[500]
    case 'Q3':
      return t.seq[600]
    case 'Q4':
      return t.seq[700]
    case 'Above maximum':
      return t.status.warning
  }
}

interface Segment {
  row: number
  position: Position
  share: number
  lo: number
  hi: number
  last: boolean
}

function segmentsOf(rows: readonly PositionMixRow[]): Segment[] {
  const out: Segment[] = []
  rows.forEach((r, row) => {
    let acc = 0
    const segs: Segment[] = []
    for (const p of POSITIONS) {
      const v = r[POSITION_FIELD[p]]
      if (v == null || v <= 0) continue
      segs.push({ row, position: p, share: v, lo: acc, hi: acc + v, last: false })
      acc += v
    }
    if (segs.length) segs[segs.length - 1].last = true
    out.push(...segs)
  })
  return out
}

export function PositionBars({
  rows,
  ariaLabel,
  onSelect,
}: {
  rows: readonly PositionMixRow[]
  ariaLabel?: string
  /** Click-to-drill: the group, and the position under the pointer (null between segments). */
  onSelect?: (row: PositionMixRow, position: Position | null) => void
}) {
  const theme = useChartTheme()
  const segments = segmentsOf(rows)
  const height = 6 + rows.length * ROW + 26
  const legend: LegendSpec = {
    kind: 'swatch',
    items: POSITIONS.map((p) => ({ label: p, color: positionColor(theme, p), shape: 'rect' })),
  }
  const keyOf = (i: number) => `r${i}`

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(64, width * 0.32)
    const shown = rows.map((r) => truncateText(r.group, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const inset = (ROW - BAR) / 2
    const bar = (last: boolean): Plot.BarXOptions => ({
      x1: (s: Segment) => s.lo,
      x2: (s: Segment) => s.hi,
      y: (s: Segment) => keyOf(s.row),
      fill: (s: Segment) => positionColor(t, s.position),
      insetTop: inset,
      insetBottom: inset,
      ...(last ? { rx2: 4 } : { insetRight: 2 }),
    })
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 26,
        marginLeft,
        marginRight: 16,
        x: { domain: [0, 1] },
        y: { type: 'band', domain: rows.map((_, i) => keyOf(i)), padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks: [0, 0.25, 0.5, 0.75, 1] }),
          hoverBand(
            rows.map((_, i) => i),
            { axis: 'y', value: (i) => keyOf(i), color: t.ink },
          ),
          Plot.barX(
            segments.filter((s) => !s.last),
            bar(false),
          ),
          Plot.barX(
            segments.filter((s) => s.last),
            bar(true),
          ),
          labelsMark(
            (scales, dims) =>
              rows.map((r, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', keyOf(i)),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: t.ink2, size: 12, weight: i === 0 ? 600 : undefined }],
                title: shown[i] === r.group ? undefined : r.group,
              })),
            'group labels',
          ),
          labelsMark(
            (scales) =>
              segments.flatMap((s) => {
                const text = fmt(s.share, 'pct0')
                const x0 = scalePos(scales, 'x', s.lo)
                const x1 = scalePos(scales, 'x', s.hi)
                if (textWidth(text, 11, 500) + 10 > x1 - x0) return []
                return [
                  {
                    x: (x0 + x1) / 2,
                    y: scalePos(scales, 'y', keyOf(s.row)),
                    anchor: 'middle' as const,
                    parts: [{ text, color: inkOn(t, positionColor(t, s.position)), size: 11, weight: 500 }],
                  },
                ]
              }),
            'segment values',
          ),
          axisX(t, { ticks: [0, 0.25, 0.5, 0.75, 1], tickFormat: (v: number) => fmt(v, 'pct0') }),
        ],
      },
    )
  }

  /** The position whose segment of row `i` sits under the pointer. */
  const pick = (i: number, at: PlotPointer, plot: PlotElement): string | null => {
    const v = plot.scale('x')?.invert?.(at.x)
    if (typeof v !== 'number') return null
    return segments.find((s) => s.row === i && v >= s.lo && v <= s.hi)?.position ?? null
  }
  const canSelect = (i: number) => !!onSelect && (rows[i]?.members.length ?? 0) > 0

  const tip = (i: number, part: string | null): TipContent | null => {
    const r = rows[i]
    if (!r) return null
    return {
      title: r.group,
      rows: POSITIONS.map((p) => ({
        value: fmt(r[POSITION_FIELD[p]], 'pct'),
        label: p,
        color: positionColor(theme, p),
        shape: 'rect' as const,
        strong: p === part,
      })),
      note: `${fmt(r.n, 'int')} people${canSelect(i) ? '. Click to see the records' : ''}`,
    }
  }

  return (
    <PlotChart<number>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      selectable={canSelect}
      onSelect={onSelect ? (i, part) => onSelect(rows[i], part as Position | null) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
