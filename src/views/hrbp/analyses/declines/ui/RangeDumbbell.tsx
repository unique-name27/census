/**
 * Where offers sat in the range (docs/ANALYSES.md, 3.6.7): one row per location, the company
 * first, with the median position in range of declined offers (slot 1) and of accepted offers
 * (slot 2) joined by a line, on a fixed scale from 0 to 1.2 with a rule at the midpoint. A row
 * short of one outcome shows its other dot only. Each dot opens that row's offers of that outcome;
 * the keyboard steps through the dots row by row (Left and Right within a row, Up and Down across).
 */
import * as Plot from '@observablehq/plot'
import {
  axisX,
  gridX,
  housePlot,
  hoverBand,
  type KeyPoint,
  type LegendSpec,
  labelsMark,
  maxTextWidth,
  type PlotBuildContext,
  PlotChart,
  type PlotElement,
  type PlotPointer,
  plotPos,
  refRule,
  scalePos,
  seriesColor,
  type TipContent,
  truncateText,
  useChartTheme,
} from '@/charts'
import { numericAxis } from '@/charts/kit/scale'
import { DASH, fmt, plural } from '@/lib/format'
import type { RangeRow } from '../engine/competing'

export type RangeSide = 'declined' | 'accepted'

const DOMAIN: [number, number] = [0, 1.2]
const PITCH = 32

export function RangeDumbbell({
  rows,
  minGroup,
  onSelect,
  ariaLabel,
}: {
  rows: readonly RangeRow[]
  minGroup: number
  onSelect?: (row: RangeRow, side: RangeSide) => void
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  const height = 6 + rows.length * PITCH + 26
  const colorOf = (t: typeof theme, side: RangeSide) => seriesColor(t, side === 'declined' ? 0 : 1)
  const legend: LegendSpec = {
    kind: 'swatch',
    items: [
      { label: 'Declined, median', color: colorOf(theme, 'declined'), shape: 'dot' },
      { label: 'Accepted, median', color: colorOf(theme, 'accepted'), shape: 'dot' },
    ],
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!rows.length) return null
    const labelMax = Math.max(64, width * 0.32)
    const shown = rows.map((r) => truncateText(r.label, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const axis = numericAxis(
      DOMAIN[0],
      DOMAIN[1],
      'num1',
      Math.max(3, Math.floor((width - marginLeft) / 80)),
      DOMAIN,
    )
    const both = rows.filter((r) => r.declined != null && r.accepted != null)
    const dot = (side: RangeSide) =>
      Plot.dot(
        rows.filter((r) => r[side] != null),
        {
          y: (r: RangeRow) => r.label,
          x: (r: RangeRow) => r[side],
          r: 5,
          fill: colorOf(t, side),
          stroke: t.sheet,
          strokeWidth: 2,
        },
      )
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 26,
        marginLeft,
        marginRight: 16,
        x: { domain: axis.domain },
        y: { type: 'band', domain: rows.map((r) => r.label), padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks: axis.ticks }),
          hoverBand(rows, { axis: 'y', value: (r) => r.label, color: t.ink }),
          ...refRule({ value: 0.5, label: 'Midpoint' }, 'x', t, 'none'),
          Plot.ruleY(both, {
            y: (r: RangeRow) => r.label,
            x1: (r: RangeRow) => r.declined,
            x2: (r: RangeRow) => r.accepted,
            stroke: t.axis,
            strokeWidth: 2,
          }),
          dot('declined'),
          dot('accepted'),
          labelsMark(
            (scales, dims) =>
              rows.map((r, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', r.label),
                anchor: 'end' as const,
                parts: [
                  {
                    text: shown[i],
                    color: r.kind === 'company' ? t.ink : t.ink2,
                    size: 12,
                    weight: r.kind === 'company' ? 600 : 400,
                  },
                ],
                title: shown[i] === r.label ? undefined : r.label,
              })),
            'row labels',
          ),
          axisX(t, { ticks: axis.ticks, tickFormat: (v: number) => fmt(v, 'num1') }),
        ],
      },
    )
  }

  /** The dot under the pointer: the nearer of the row's two. */
  const pick = (r: RangeRow, at: PlotPointer, plot: PlotElement): string | null => {
    const sides = (['declined', 'accepted'] as const).filter((s) => r[s] != null)
    if (!sides.length) return null
    if (sides.length === 1) return sides[0]
    const dx = (s: RangeSide) => Math.abs(plotPos(plot, 'x', r[s]) - at.x)
    return dx('declined') <= dx('accepted') ? 'declined' : 'accepted'
  }

  const tip = (r: RangeRow, part: string | null): TipContent => ({
    title: r.label,
    rows: [
      {
        value: r.declined == null ? DASH : fmt(r.declined, 'num2'),
        label: `Declined (${plural(r.declinedN, 'offer')})`,
        color: colorOf(theme, 'declined'),
        shape: 'dot',
        strong: part === 'declined',
      },
      {
        value: r.accepted == null ? DASH : fmt(r.accepted, 'num2'),
        label: `Accepted (${plural(r.acceptedN, 'offer')})`,
        color: colorOf(theme, 'accepted'),
        shape: 'dot',
        strong: part === 'accepted',
      },
      ...(r.gap != null ? [{ value: fmt(r.gap, 'num2'), label: 'Accepted minus declined' }] : []),
    ],
    note:
      r.declined == null || r.accepted == null
        ? `An outcome with fewer than ${minGroup} offers is hidden to protect anonymity.`
        : undefined,
  })

  const keyPoints = (plot: PlotElement): KeyPoint<RangeRow>[] =>
    rows.flatMap((r) =>
      (['declined', 'accepted'] as const)
        .filter((s) => r[s] != null)
        .map((s) => ({
          datum: r,
          part: s,
          x: plotPos(plot, 'x', r[s]),
          y: plotPos(plot, 'y', r.label),
          group: r.label,
        })),
    )

  return (
    <PlotChart<RangeRow>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      keyPoints={keyPoints}
      selectable={
        onSelect
          ? (r, part) =>
              part === 'declined'
                ? r.declinedOffers.length > 0
                : part === 'accepted' && r.acceptedOffers.length > 0
          : undefined
      }
      onSelect={onSelect ? (r, part) => part && onSelect(r, part as RangeSide) : undefined}
      ariaLabel={ariaLabel}
    />
  )
}
