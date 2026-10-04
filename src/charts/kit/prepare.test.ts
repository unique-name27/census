import { describe, expect, it } from 'vitest'
import {
  barListRows,
  categoryModel,
  dodge,
  extremeIndices,
  histogramBins,
  jitter,
  monthOf,
  parseTime,
  quarterLabel,
  stackSegments,
  timeTicks,
} from './prepare'
import { extent, numericAxis } from './scale'

const depts = [
  { dept: 'Fab', rate: 0.16, n: 380 },
  { dept: 'Test', rate: 0.11, n: 96 },
  { dept: 'Finance', rate: null, n: 3 },
  { dept: 'Design', rate: 0.08, n: 160 },
  { dept: 'Sales', rate: 0.12, n: 41 },
  { dept: 'People', rate: 0.09, n: 22 },
]

describe('barListRows', () => {
  it('ranks descending with missing values last', () => {
    const rows = barListRows(depts, { label: 'dept', value: 'rate' })
    expect(rows.map((r) => r.label)).toEqual(['Fab', 'Sales', 'Test', 'People', 'Design', 'Finance'])
    expect(rows[5].value).toBeNull()
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  it('keeps input order with sort none', () => {
    const rows = barListRows(depts, { label: 'dept', value: 'rate', sort: 'none' })
    expect(rows.map((r) => r.label)).toEqual(depts.map((d) => d.dept))
  })

  it('folds the tail into Other (k) with sum by default', () => {
    const counts = depts.map((d) => ({ ...d, leavers: Math.round((d.rate ?? 0) * d.n) }))
    const rows = barListRows(counts, { label: 'dept', value: 'leavers', top: 2 })
    expect(rows).toHaveLength(3)
    expect(rows[2].label).toBe('Other (4)')
    expect(rows[2].folded).toBe(4)
    expect(rows[2].datum).toBeNull()
    expect(rows[2].tone).toBe('deemph')
    const restSum = counts
      .map((d) => d.leavers)
      .sort((a, b) => b - a)
      .slice(2)
      .reduce((a, b) => a + b, 0)
    expect(rows[2].value).toBe(restSum)
  })

  it('folds with a weighted rule when given one', () => {
    const rows = barListRows(depts, {
      label: 'dept',
      value: 'rate',
      top: 3,
      other: (rest) => {
        const n = rest.reduce((a, b) => a + b.n, 0)
        const l = rest.reduce((a, b) => a + (b.rate ?? 0) * b.n, 0)
        return n ? l / n : null
      },
    })
    expect(rows[3].label).toBe('Other (3)')
    expect(rows[3].value).toBeCloseTo((0.09 * 22 + 0.08 * 160) / (22 + 160 + 3))
  })

  it('never folds a single row', () => {
    expect(barListRows(depts, { label: 'dept', value: 'rate', top: 5 })).toHaveLength(6)
  })

  it('applies secondary text and tones', () => {
    const rows = barListRows(depts, {
      label: 'dept',
      value: 'rate',
      secondary: (d) => `n = ${d.n}`,
      tone: (d) => ((d.rate ?? 0) > 0.15 ? 'critical' : 'default'),
    })
    expect(rows[0].secondary).toBe('n = 380')
    expect(rows[0].tone).toBe('critical')
    expect(rows[1].tone).toBe('default')
  })
})

describe('categoryModel and stacks', () => {
  const data = [
    { month: '2026-02-14', src: 'Referral', hires: 3 },
    { month: '2026-01-03', src: 'Agency', hires: 1 },
    { month: '2026-01-20', src: 'Referral', hires: 2 },
    { month: '2026-02-01', src: 'Agency', hires: 0 },
    { month: '2026-02-09', src: 'Sourced', hires: 4 },
  ]

  it('groups months in time order and series in the given order', () => {
    const m = categoryModel(data, {
      cat: 'month',
      value: 'hires',
      series: 'src',
      month: true,
      seriesOrder: ['Referral', 'Sourced', 'Agency'],
    })
    expect(m.categories.map((c) => c.key)).toEqual(['2026-01', '2026-02'])
    expect(m.series).toEqual(['Referral', 'Sourced', 'Agency'])
    expect(m.categories[1].cells.map((c) => c.series)).toEqual(['Referral', 'Sourced', 'Agency'])
    expect(m.categories[1].total).toBe(7)
  })

  it('stacks positive values, marks the top segment and normalizes to shares', () => {
    const m = categoryModel(data, {
      cat: 'month',
      value: 'hires',
      series: 'src',
      month: true,
      seriesOrder: ['Referral', 'Sourced', 'Agency'],
    })
    const segs = stackSegments(m)
    const feb = segs.filter((s) => s.cat === '2026-02')
    expect(feb.map((s) => [s.series, s.lo, s.hi, s.top])).toEqual([
      ['Referral', 0, 3, false],
      ['Sourced', 3, 7, true],
    ])
    const shares = stackSegments(m, true).filter((s) => s.cat === '2026-02')
    expect(shares[1].hi).toBeCloseTo(1)
    expect(shares[0].share).toBeCloseTo(3 / 7)
  })

  it('orders band categories by the given order, unknowns after', () => {
    const m = categoryModel(
      [
        { d: 'B', v: 1 },
        { d: 'C', v: 2 },
        { d: 'A', v: 3 },
      ],
      { cat: 'd', value: 'v', catOrder: ['A', 'B'] },
    )
    expect(m.categories.map((c) => c.key)).toEqual(['A', 'B', 'C'])
    expect(m.series).toEqual([''])
  })
})

describe('time and bins', () => {
  it('parses months, dates and date-times as UTC', () => {
    expect(parseTime('2026-09')?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(parseTime('2026-09-30')?.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(parseTime('2026-09-30T14:05')?.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(parseTime('Sep 2026')).toBeNull()
    expect(monthOf('2026-09-30')).toBe('2026-09')
  })

  it('bins values with shares that sum to 1 and keeps rows', () => {
    const items = [0.81, 0.92, 0.95, 1.01, 1.02, 1.04, 1.18].map((v, i) => ({ v, d: { id: i } }))
    const bins = histogramBins(items, [0.8, 0.9, 1.0, 1.1, 1.2])
    expect(bins.map((b) => b.n)).toEqual([1, 2, 3, 1])
    expect(bins.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1)
    expect(bins[2].rows.map((r) => r.id)).toEqual([3, 4, 5])
    expect(histogramBins([], 10)).toEqual([])
  })
})

describe('layout helpers', () => {
  it('jitters deterministically within [-1, 1]', () => {
    expect(jitter('E10001')).toBe(jitter('E10001'))
    for (const id of ['a', 'b', 'E1', 'E2', 'x'.repeat(40)]) {
      expect(Math.abs(jitter(id))).toBeLessThanOrEqual(1)
    }
  })

  it('dodges labels apart while keeping order and bounds', () => {
    const out = dodge([100, 104, 106, 300], 13, 0, 400)
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(12.9)
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(12.9)
    expect(out[3]).toBe(300)
    expect(dodge([5, 6], 13, 0, 100).every((p) => p >= 0)).toBe(true)
  })

  it('picks the most extreme points to label', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.45, y: 0.55 },
      { x: 0.5, y: 0.52 },
    ]
    expect(extremeIndices(pts, 2).sort()).toEqual([0, 1])
    expect(extremeIndices(pts, 0)).toEqual([])
  })

  it('plans nice numeric axes', () => {
    const a = numericAxis(0.013, 0.135, 'pct', 5)
    expect(a.domain[0]).toBeLessThanOrEqual(0.013)
    expect(a.domain[1]).toBeGreaterThanOrEqual(0.135)
    expect(a.ticks.length).toBeGreaterThan(2)
    expect(a.format(0.1)).toBe('10%')
    expect(numericAxis(5, 5, 'int').domain[1]).toBeGreaterThan(5)
    expect(numericAxis(0, 1, 'pct0', 5, [0, 1]).domain).toEqual([0, 1])
    expect(extent([3, null, 1, Number.NaN, 7])).toEqual([1, 7])
    expect(extent([null])).toBeNull()
  })
})

describe('BarList glyph tone', () => {
  it('records a glyph tone without changing the bar tone', () => {
    const rows = barListRows(depts, {
      label: 'dept',
      value: 'rate',
      tone: (d) => (d.dept === 'Fab' ? 'deemph' : 'default'),
      glyphTone: (d) => (d.rate != null && d.rate > 0.15 ? 'critical' : 'default'),
    })
    const fab = rows.find((r) => r.label === 'Fab')!
    expect(fab.tone).toBe('deemph')
    expect(fab.glyph).toBe('critical')
    expect(rows.find((r) => r.label === 'Test')?.glyph).toBe('default')
    expect(barListRows(depts, { label: 'dept', value: 'rate' })[0]).not.toHaveProperty('glyph')
  })
})

describe('time ticks', () => {
  const utc = (s: string) => Date.parse(`${s}T00:00:00Z`)
  const measure = (l: string) => l.length * 6

  it('labels quarters as Q3 and a two-digit year', () => {
    expect(quarterLabel(utc('2026-09-30'))).toBe("Q3 '26")
    expect(quarterLabel(utc('2026-01-01'))).toBe("Q1 '26")
    expect(quarterLabel(utc('2025-12-31'))).toBe("Q4 '25")
  })

  it('ticks quarter ends of monthly data, skipping a partial quarter', () => {
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']
    const ticks = timeTicks(
      months.map((m) => utc(`${m}-01`)),
      'quarter',
      800,
      measure,
    )
    expect(ticks.map((k) => k.label)).toEqual(["Q4 '25", "Q1 '26"])
    expect(ticks[0].t).toBe(utc('2025-12-01'))
  })

  it('ticks every point of quarterly data, thinned from the latest when crowded', () => {
    const qs = [
      '2024-12-31',
      '2025-03-31',
      '2025-06-30',
      '2025-09-30',
      '2025-12-31',
      '2026-03-31',
      '2026-06-30',
      '2026-09-30',
    ]
    const times = qs.map(utc)
    expect(timeTicks(times, 'quarter', 800, measure).map((k) => k.label)).toEqual([
      "Q4 '24",
      "Q1 '25",
      "Q2 '25",
      "Q3 '25",
      "Q4 '25",
      "Q1 '26",
      "Q2 '26",
      "Q3 '26",
    ])
    const narrow = timeTicks(times, 'quarter', 200, measure)
    expect(narrow[narrow.length - 1].label).toBe("Q3 '26")
    expect(narrow.length).toBeLessThan(8)
    // Off-cycle quarterly points (e.g. as of 15 Aug) still get one tick each.
    expect(
      timeTicks([utc('2026-02-15'), utc('2026-05-15'), utc('2026-08-15')], 'quarter', 600, measure),
    ).toHaveLength(3)
  })

  it('ticks months with the year on the first tick and on January', () => {
    const months = ['2025-11', '2025-12', '2026-01', '2026-02']
    expect(
      timeTicks(
        months.map((m) => utc(`${m}-01`)),
        'month',
        800,
        measure,
      ).map((k) => k.label),
    ).toEqual(["Nov '25", 'Dec', "Jan '26", 'Feb'])
  })
})
