/**
 * Rating mix as 100% bars, one row per group plus a "Guideline" row on top for comparison.
 * Ratings are ordinal, so segments use the sequential blue ramp (1 lightest, 5 darkest), not
 * categorical colors. Shares sit inside segments where they fit; the tooltip lists all five.
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
  scalePos,
  type TipContent,
  textWidth,
  truncateText,
  useChartTheme,
} from '@/charts'
import { RATING_GUIDELINE } from '@/data/schema'
import { DASH, fmt } from '@/lib/format'
import { RATINGS, ratingLabel } from '../engine/performance'

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

export function RatingMix({ data, ariaLabel }: { data: readonly MixInput[]; ariaLabel?: string }) {
  const theme = useChartTheme()
  const rows: Row[] = [
    {
      key: 'g',
      group: 'Guideline',
      rated: 0,
      shares: RATINGS.map((r) => RATING_GUIDELINE[r] ?? 0),
      guideline: true,
    },
    ...data.map((d, i) => ({ ...d, key: `r${i}`, guideline: false })),
  ]
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
    const segments: Segment[] = rows.flatMap((r) => {
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

  const tip = (r: Row): TipContent => {
    const colors = ratingColors(theme)
    return {
      title: r.guideline ? 'Rating guideline' : r.group,
      rows: RATINGS.map((rating, i) => ({
        value: r.shares[i] == null ? DASH : fmt(r.shares[i], 'pct'),
        label: ratingLabel(rating),
        color: colors[i],
        shape: 'rect' as const,
      })),
      note: r.guideline ? 'Target share of rated people' : `${fmt(r.rated)} people rated`,
    }
  }

  return <PlotChart<Row> build={build} height={height} legend={legend} tip={tip} ariaLabel={ariaLabel} />
}
