import { describe, expect, it } from 'vitest'
import {
  BULLET_HEADROOM,
  bulletLayout,
  SPLIT_ORDER,
  splitLabelPositions,
  splitSegments,
  splitShare,
} from './bulletModel'
import { TREND_GRID_COLUMNS, trendGridLayout, trendGridRows } from './trendModel'

interface M {
  name: string
  practice: string
  value: number | null
  target: number | null
}

const measures: M[] = [
  { name: 'Median time to fill', practice: 'Recruiting', value: 52, target: 45 },
  { name: 'Offer acceptance', practice: 'Recruiting', value: 0.781, target: 0.85 },
  { name: 'Voluntary attrition', practice: 'People stats', value: 0.094, target: null },
  { name: 'Day-one readiness', practice: 'Onboarding', value: null, target: 0.95 },
]

const acc = {
  label: (d: M) => d.name,
  value: (d: M) => d.value,
  target: (d: M) => d.target,
  group: (d: M) => d.practice,
}

describe('BulletList layout', () => {
  it('scales each row on its own: 0 to 1.15 x the larger of value and target', () => {
    const { rows } = bulletLayout(measures, acc)
    const [ttf, offer, vol, ready] = rows
    expect(ttf.max).toBeCloseTo(52 * BULLET_HEADROOM)
    expect(ttf.valueAt).toBeCloseTo(1 / BULLET_HEADROOM)
    expect(ttf.targetAt).toBeCloseTo(45 / (52 * BULLET_HEADROOM))
    // A rate and a day count share one chart without sharing a scale.
    expect(offer.max).toBeCloseTo(0.85 * BULLET_HEADROOM)
    expect(offer.targetAt).toBeCloseTo(1 / BULLET_HEADROOM)
    expect(vol.targetAt).toBeNull()
    expect(ready.valueAt).toBeNull()
    expect(ready.targetAt).toBeCloseTo(1 / BULLET_HEADROOM)
    for (const r of rows) {
      if (r.valueAt != null) expect(r.valueAt).toBeLessThanOrEqual(1)
      if (r.targetAt != null) expect(r.targetAt).toBeLessThanOrEqual(1)
    }
  })

  it('puts a header line above each group and stacks rows below it', () => {
    const { rows, groups, height } = bulletLayout(measures, acc, { rowHeight: 28, groupHeight: 24 })
    expect(groups.map((g) => g.label)).toEqual(['Recruiting', 'People stats', 'Onboarding'])
    expect(groups[0].y).toBe(0)
    expect(rows[0].y).toBe(24)
    expect(rows[1].y).toBe(52)
    expect(groups[1].y).toBe(80)
    expect(height).toBe(3 * 24 + 4 * 28)
  })

  it('puts every row on one scale when asked, so bar lengths compare', () => {
    const ratios = [
      { name: 'Verification per RTL designer', practice: '', value: 1.16, target: 1.5 },
      { name: 'DFT per RTL designer', practice: '', value: 0.39, target: null },
      { name: 'Software per silicon engineer', practice: '', value: 0.26, target: null },
      { name: 'Hidden', practice: '', value: null, target: null },
    ]
    const own = bulletLayout(ratios, acc).rows
    // On their own scales, rows without a target all draw at the same length.
    expect(own[1].valueAt).toBeCloseTo(own[2].valueAt ?? 0)
    const { rows } = bulletLayout(ratios, acc, { scale: 'shared' })
    for (const r of rows) expect(r.max).toBeCloseTo(1.5 * BULLET_HEADROOM)
    expect(rows[0].targetAt).toBeCloseTo(1 / BULLET_HEADROOM)
    expect(rows[1].valueAt).toBeCloseTo(0.39 / (1.5 * BULLET_HEADROOM))
    expect((rows[1].valueAt ?? 0) / (rows[2].valueAt ?? 1)).toBeCloseTo(0.39 / 0.26)
    expect(rows[3].valueAt).toBeNull()
  })

  it('treats missing, zero and negative values safely', () => {
    const { rows } = bulletLayout([{ name: 'x', practice: '', value: -3, target: 0 }], acc)
    expect(rows[0].max).toBe(1)
    expect(rows[0].valueAt).toBe(0)
  })
})

describe('StatusSplit segments', () => {
  it('keeps the fixed order, leaves out zero counts, and adds up', () => {
    const { segments, total } = splitSegments({ missed: 10, met: 4, none: 0, watch: 7 }, 402)
    expect(segments.map((s) => s.key)).toEqual(['met', 'watch', 'missed'])
    expect(total).toBe(21)
    expect(segments.reduce((s, x) => s + x.count, 0)).toBe(total)
    expect(segments.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    // Widths fill the bar less the 2px gaps.
    expect(segments.reduce((s, x) => s + x.w, 0)).toBeCloseTo(402 - 2 * 2)
    expect(segments[1].x).toBeCloseTo(segments[0].w + 2)
    expect(SPLIT_ORDER).toEqual(['met', 'watch', 'missed', 'none', 'hidden'])
  })

  it('names segments with the default words or the given ones', () => {
    const { segments } = splitSegments({ watch: 1, hidden: 2 }, 100, { labels: { watch: 'On watch' } })
    expect(segments.map((s) => s.label)).toEqual(['On watch', 'Not shown'])
  })

  it('places labels without overlap and inside the chart', () => {
    const { segments } = splitSegments({ met: 1, watch: 1, missed: 30 }, 300)
    const xs = splitLabelPositions(segments, () => 60, 300)
    expect(xs[1]).toBeGreaterThanOrEqual(xs[0] + 72)
    expect(xs[2]).toBeGreaterThanOrEqual(xs[1] + 72)
    expect(xs[2] + 60).toBeLessThanOrEqual(300)
  })

  it('is empty when nothing is counted', () => {
    expect(splitSegments({}, 300)).toEqual({ segments: [], total: 0 })
  })
})

describe('TrendGrid', () => {
  const series = [
    {
      id: 'a',
      name: 'Time to fill',
      values: [50, 52, null, 55],
      periods: ['2026-06', '2026-07', '2026-08', '2026-09'],
      target: 45,
      format: 'days' as const,
    },
    { id: 'b', name: 'Offer acceptance', values: [0.8, 0.78], target: 0.85, format: 'pct' as const },
    { id: 'c', name: 'Flat', values: [3, 3, 3], format: 'num1' as const },
  ]

  it('exports one row per point with the series, period, value and target', () => {
    const rows = trendGridRows(series)
    expect(rows).toHaveLength(4 + 2 + 3)
    expect(rows[2]).toMatchObject({
      series: 'Time to fill',
      period: '2026-08',
      value: null,
      target: 45,
      format: 'days',
    })
    expect(rows[4]).toMatchObject({ series: 'Offer acceptance', period: 'Point 1', value: 0.8 })
    expect(rows[6].target).toBeNull()
    expect(TREND_GRID_COLUMNS.map((c) => c.key)).toEqual(['series', 'period', 'value', 'target'])
  })

  it('lays cells out in reading order, each on its own scale', () => {
    const { cells, columns, height } = trendGridLayout(series, 320, { minCell: 140, gap: 16 })
    expect(columns).toBe(2)
    expect(cells.map((c) => [c.col, c.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
    ])
    expect(height).toBeGreaterThan(0)
    // The gap leaves the line broken: three points for four values.
    expect(cells[0].points.map((p) => p.i)).toEqual([0, 1, 3])
    expect(cells[0].latest).toEqual({ i: 3, value: 55 })
    // Own scales: both cells span their plot height, whatever the units.
    for (const c of cells.slice(0, 2)) {
      const ys = [...c.points.map((p) => p.y), c.targetY as number]
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(c.plot.y)
      expect(Math.max(...ys)).toBeLessThanOrEqual(c.plot.y + c.plot.h)
    }
    // A flat series sits mid-cell.
    const flat = cells[2]
    expect(flat.points[0].y).toBeCloseTo(flat.plot.y + flat.plot.h / 2)
  })
})

describe('splitShare', () => {
  it('gives met, watch and missed as shares of the measures with a target, the rest none', () => {
    const counts = { met: 4, watch: 7, missed: 10, none: 3 }
    expect(splitShare(counts, 'met')).toEqual({ share: 4 / 21, judged: 21 })
    expect(splitShare(counts, 'missed')?.share).toBeCloseTo(10 / 21, 12)
    expect(splitShare(counts, 'none')).toBeNull()
    expect(splitShare(counts, 'hidden')).toBeNull()
    expect(splitShare({ none: 2 }, 'met')).toBeNull()
  })
})
