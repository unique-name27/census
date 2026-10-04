/**
 * Rating mix as 100% bars, one row per group plus a "Guideline" row on top for comparison.
 * Ratings are ordinal, so segments use the sequential blue ramp (1 lightest, 5 darkest), not
 * categorical colors. Shares sit inside segments where they fit; the tooltip lists all five and
 * bolds the one under the pointer. Clicking a segment opens the people at that rating; clicking
 * elsewhere on the row opens everyone rated in the group.
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
  ordinalColors,
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
import { type DrillSource, drill } from '@/drill'
import { DASH, fmt } from '@/lib/format'
import type { RatingMap } from '@/metrics/types'
import { RATINGS, ratingLabel } from '../engine/performance'
import { DEFAULT_GUIDELINE } from '../engine/settings'

export interface MixInput {
  group: string
  rated: number
  /** Shares for ratings 1-5, null when hidden. */
  shares: (number | null)[]
}

interface Segment {
  key: string
  rating: number
  lo: number
  hi: number
  share: number
  last: boolean
}

interface Row extends MixInput {
  key: string
  guideline: boolean
}

/** Ordinal ramp for ratings 1-5, light to dark (the kit's ordinal scheme, so it matches every chart). */
export function ratingColors(t: ChartTheme): string[] {
  return ordinalColors(t, 5)
}

/** 100% segments per row, left to right by rating; rows with a hidden share have none. */
function segmentsOf(rows: readonly Row[]): Segment[] {
  return rows.flatMap((r) => {
    if (r.shares.some((s) => s == null)) return []
    const total = r.shares.reduce<number>((a, b) => a + (b ?? 0), 0) || 1
    let acc = 0
    const lastIdx = r.shares.reduce<number>((li, s, i) => ((s ?? 0) > 0 ? i : li), -1)
    return r.shares.map((s, i) => {
      const share = (s ?? 0) / total
      const seg = { key: r.key, rating: i + 1, lo: acc, hi: acc + share, share, last: i === lastIdx }
      acc += share
      return seg
    })
  })
}

export function RatingMix({
  data,
  drillFor,
  guideline = DEFAULT_GUIDELINE,
  minGroup = 5,
  ariaLabel,
}: {
  data: readonly MixInput[]
  /** The records behind a group (rating null) or one rating in it; clicking opens them. */
  drillFor?: (group: string, rating: number | null) => DrillSource
  /** The rating guideline in force (the "Guideline" row). */
  guideline?: Readonly<RatingMap>
  /** The anonymity minimum in force, for the hidden-row note. */
  minGroup?: number
  ariaLabel?: string
}) {
  const theme = useChartTheme()
  const rows: Row[] = [
    {
      key: 'g',
      group: 'Guideline',
      rated: 0,
      shares: RATINGS.map((r) => guideline[r] ?? 0),
      guideline: true,
    },
    ...data.map((d, i) => ({ ...d, key: `r${i}`, guideline: false })),
  ]
  const segments = segmentsOf(rows)
  const pitch = 30
  const height = 6 + rows.length * pitch + 26
  const legend: LegendSpec = {
    kind: 'swatch',
    items: RATINGS.map((r, i) => ({ label: ratingLabel(r), color: ratingColors(theme)[i], shape: 'rect' })),
  }

  const build = ({ width, theme: t }: PlotBuildContext) => {
    if (!data.length) return null
    const colors = ratingColors(t)
    const labelMax = Math.max(64, width * 0.32)
    const shown = rows.map((r) => truncateText(r.group, labelMax, 12))
    const marginLeft = Math.ceil(maxTextWidth(shown, 12)) + 14
    const inset = (pitch - Math.min(24, pitch * 0.5)) / 2
    const bar = (last: boolean): Plot.BarXOptions => ({
      x1: (s: Segment) => s.lo,
      x2: (s: Segment) => s.hi,
      y: (s: Segment) => s.key,
      fill: (s: Segment) => colors[s.rating - 1],
      insetTop: inset,
      insetBottom: inset,
      ...(last ? { rx2: 4 } : { insetRight: 2 }),
    })
    const ticks = [0, 0.25, 0.5, 0.75, 1]
    return housePlot(
      { width, theme: t },
      {
        height,
        marginTop: 6,
        marginBottom: 26,
        marginLeft,
        marginRight: 14,
        x: { domain: [0, 1] },
        y: { type: 'band', domain: rows.map((r) => r.key), padding: 0, round: false, axis: null },
        marks: [
          gridX(t, { ticks }),
          hoverBand(rows, { axis: 'y', value: (r) => r.key, color: t.ink }),
          Plot.barX(
            segments.filter((s) => s.share > 0 && !s.last),
            bar(false),
          ),
          Plot.barX(
            segments.filter((s) => s.share > 0 && s.last),
            bar(true),
          ),
          labelsMark(
            (scales) =>
              segments.flatMap((s) => {
                const text = fmt(s.share, 'pct0')
                const x0 = scalePos(scales, 'x', s.lo)
                const x1 = scalePos(scales, 'x', s.hi)
                if (textWidth(text, 11, 500) + 8 > x1 - x0) return []
                return [
                  {
                    x: (x0 + x1) / 2,
                    y: scalePos(scales, 'y', s.key),
                    anchor: 'middle' as const,
                    parts: [{ text, color: inkOn(t, colors[s.rating - 1]), size: 11, weight: 500 }],
                  },
                ]
              }),
            'segment values',
          ),
          labelsMark(
            (scales, dims) =>
              rows.map((r, i) => ({
                x: dims.marginLeft - 10,
                y: scalePos(scales, 'y', r.key),
                anchor: 'end' as const,
                parts: [{ text: shown[i], color: r.guideline ? t.muted : t.ink2, size: 12 }],
                title: shown[i] === r.group ? undefined : r.group,
              })),
            'group labels',
          ),
          axisX(t, { ticks, tickFormat: (v: number) => fmt(v, 'pct0') }),
        ],
      },
    )
  }

  /** The rating whose segment is under the pointer, from the x scale. */
  const pick = (r: Row, at: PlotPointer, plot: PlotElement): string | null => {
    if (r.guideline) return null
    const v = plot.scale('x')?.invert?.(at.x)
    if (typeof v !== 'number') return null
    const s = segments.find((g) => g.key === r.key && g.share > 0 && v >= g.lo && v <= g.hi)
    return s ? String(s.rating) : null
  }
  const sourceOf = (r: Row, part: string | null): DrillSource =>
    r.guideline || !drillFor ? null : drillFor(r.group, part ? Number(part) : null)

  const tip = (r: Row, part: string | null): TipContent => {
    const colors = ratingColors(theme)
    const hidden = r.shares.some((s) => s == null)
    return {
      title: r.guideline ? 'Rating guideline' : r.group,
      rows: [
        ...RATINGS.map((rating, i) => ({
          value: r.shares[i] == null ? DASH : fmt(r.shares[i], 'pct'),
          label: ratingLabel(rating),
          color: colors[i],
          shape: 'rect' as const,
          ...(part === String(rating) ? { strong: true } : {}),
        })),
        ...(r.guideline ? [] : [{ value: fmt(r.rated), label: 'People rated' }]),
      ],
      // Without a note the chart says "Click to see the records" on rows that open them.
      note: r.guideline
        ? 'Target share of rated people'
        : hidden
          ? `Hidden to protect anonymity (n < ${minGroup})`
          : undefined,
    }
  }

  return (
    <PlotChart<Row>
      build={build}
      height={height}
      legend={legend}
      tip={tip}
      pick={pick}
      selectable={(r, part) => sourceOf(r, part) != null}
      onSelect={(r, part) => drill(sourceOf(r, part))}
      ariaLabel={ariaLabel}
    />
  )
}
