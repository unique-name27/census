/**
 * The Compensation engine over the full sample company: every planted comp story in
 * src/data/sample/README.md is detected, every number is finite or null, and it runs fast.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { type CompModel, compaHeadline, computeComp } from './model'
import { DEFAULT_SETTINGS } from './settings'

let data: Datasets
let ctx: AnalyticsContext
let m: CompModel

function sampleContext(
  filters: Partial<Filters> = {},
  showPay = false,
  asOfOverride: string | null = null,
): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride,
    showPay,
  })
}

const finding = (id: string): Finding => {
  const f = m.findings.find((x) => x.id === id)
  if (!f) throw new Error(`No finding ${id}; have ${m.findings.map((x) => x.id).join(', ')}`)
  return f
}
const kpi = (id: string): Kpi => m.kpis.find((k) => k.id === id)!

beforeAll(() => {
  data = generateSample()
  ctx = sampleContext()
  m = computeComp(ctx, DEFAULT_SETTINGS)
})

describe('compensation on the sample company', () => {
  it('covers the 1,450 active employees with a comp row', () => {
    expect(m.pop.people).toHaveLength(1450)
    expect(m.pop.missingComp).toBe(0)
    expect(m.pop.noFx).toBe(0)
    expect(kpi('median-compa').value).toBeCloseTo(0.98, 1)
  })

  it('every KPI is finite or null', () => {
    for (const k of [...m.kpis, ...m.cycle.kpis]) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      if (k.delta != null) expect(Number.isFinite(k.delta), k.id).toBe(true)
    }
  })

  it('story 1: Bengaluru pay position, linked to its voluntary attrition', () => {
    const f = finding('comp-low-compa-location-Bengaluru')
    expect(f.title).toBe('Median compa-ratio in Bengaluru is 0.88 vs 1.00 for the rest of the company.')
    expect(f.detail).toContain(
      'Voluntary attrition there is 18.8% vs 9.4% for the company over the last 12 months',
    )
    expect(f.severity).toBe('critical')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    const blr = m.overview.byLocation.find((r) => r.group === 'Bengaluru')!
    expect(blr.median!).toBeCloseTo(0.88, 2)
    expect(m.findings.filter((x) => x.id.startsWith('comp-low-compa'))).toHaveLength(1)
  })

  it('story 2: 78 below minimum (41 in Bengaluru, most others recently promoted) and 44 above maximum, nearly all long-tenured L4s', () => {
    expect(m.ranges.below).toHaveLength(78)
    expect(kpi('below-min').value).toBeCloseTo(78 / 1450, 4)
    const below = finding('comp-below-min')
    expect(below.title).toBe('78 people are paid below range minimum, 5.4% of 1,450.')
    // Exclusive counts that add up to 76 of 78: the planted split between Bengaluru ranges and
    // promotions elsewhere that missed the new minimum.
    expect(below.detail).toBe(
      '41 are in Bengaluru, and 35 of the other 37 were promoted in the last 12 months.',
    )
    expect(below.people).toHaveLength(78)
    const outside = m.ranges.below.filter((r) => r.location !== 'Bengaluru')
    expect(outside.filter((r) => r.promoted === 'Yes').length).toBeGreaterThanOrEqual(35)

    expect(m.ranges.above).toHaveLength(44)
    const above = finding('comp-above-max')
    expect(above.title).toMatch(/^44 people are paid above range maximum, 4[23] of them at L4\.$/)
    expect(above.detail).toMatch(/^42 of those L4s have 5\.5 or more years of tenure/)
    expect(above.filter).toEqual({ level: ['L4'] })
  })

  it('story 3: pay compression in Design Verification L3-L4', () => {
    const f = finding('comp-compression-Design Verification')
    expect(f.title).toBe(
      'New hires in Design Verification L3-L4 are paid at a median compa-ratio of 1.04 vs 0.95 for incumbents.',
    )
    expect(f.detail).toBe(
      '33 people hired in the last 12 months against 33 already in those roles, 32 of whom are paid below the new-hire median.',
    )
    expect(f.people).toHaveLength(32)
    expect(f.filter).toEqual({ department: ['Design Verification'], level: ['L3', 'L4'] })
    expect(m.findings.filter((x) => x.id.startsWith('comp-compression'))).toHaveLength(1)
  })

  it('story 4: merit spend on budget overall, Go-to-Market over, and the guideline exceptions', () => {
    expect(m.cycle.spend.spendPct!).toBeCloseTo(0.0354, 3)
    expect(m.cycle.spend.eligible).toBe(1299)
    const gtm = m.cycle.byBu.find((r) => r.group === 'Go-to-Market')!
    expect(gtm.spendPct!).toBeCloseTo(0.0431, 3)
    for (const r of m.cycle.byBu.filter((x) => x.group !== 'Go-to-Market' && x.spendPct != null))
      expect(r.spendPct!).toBeLessThan(0.036)
    const f = finding('comp-over-budget-Go-to-Market')
    expect(f.title).toBe(
      'Go-to-Market merit proposals cost 4.31% of eligible base, 0.81 pts over the 3.50% budget.',
    )
    expect(f.severity).toBe('warning')
    expect(kpi('merit-spend').format).toBe('pct2')
    expect(kpi('merit-spend').value!).toBeCloseTo(0.03544, 5)
    expect(m.findings.some((x) => x.id === 'comp-over-budget-total')).toBe(false)

    const rules = m.cycle.exceptions.filter((e) => e.kind !== 'outlier')
    expect(rules.filter((e) => e.kind === 'top-low')).toHaveLength(5)
    expect(rules.filter((e) => e.kind === 'low-high')).toHaveLength(6)
    const ex = finding('comp-exceptions')
    expect(ex.title).toBe(
      '11 merit proposals break the guideline rules: 5 rated 5 below 2% and 6 rated 1-2 above 3%.',
    )
    // The Firmware outliers are counted in the Firmware differentiation finding, not named twice.
    expect(ex.detail).toBe('Another 25 proposals are unusual for the rating.')
    expect(m.cycle.promotions.rows).toHaveLength(104)
  })

  it('story 5: Analog & Mixed-Signal below market because its ranges trail the market', () => {
    const f = finding('comp-below-market-Analog & Mixed-Signal')
    expect(f.title).toBe('Analog & Mixed-Signal base pay is 8% below market, a median market ratio of 0.92.')
    expect(f.severity).toBe('warning')
    expect(f.detail).toContain('10% above the range midpoints')
    expect(f.filter).toEqual({ department: ['Analog & Mixed-Signal'] })
    const analog = m.market.byFamily.find((r) => r.group === 'Analog & Mixed-Signal')!
    expect(analog.median!).toBeCloseTo(0.92, 2)
    // Other families with a gap are pay-positioning notes, not range findings.
    const rangeFindings = m.findings.filter(
      (x) => x.id.startsWith('comp-below-market') && x.severity === 'warning',
    )
    expect(rangeFindings.map((x) => x.id)).toEqual(['comp-below-market-Analog & Mixed-Signal'])
  })

  it('story 6: no merit differentiation in Firmware, clear differentiation elsewhere', () => {
    const fw = m.performance.byDepartment.find((r) => r.group === 'Firmware')!
    expect(fw.ratio!).toBeLessThan(1.1)
    const f = finding('comp-no-differentiation-Firmware')
    expect(f.title).toBe(
      'Firmware merit barely follows ratings: people rated 4-5 get 1.00× the merit of people rated 3.',
    )
    expect(f.detail).toBe(
      'Mean merit is 2.85% for ratings 4-5 and 2.85% for rating 3, against 1.58× across the company. 21 of its proposals are unusual for the rating.',
    )
    expect(f.filter).toEqual({ department: ['Firmware'] })
    expect(f.tab).toBe('performance')
    expect(m.findings.filter((x) => x.id.startsWith('comp-no-differentiation'))).toHaveLength(1)
    expect(m.performance.differentiation.ratio!).toBeGreaterThan(1.4)
    expect(m.findings.some((x) => x.severity === 'good')).toBe(true)
  })

  it('keeps dollars out of findings unless pay amounts are on', () => {
    const text = (fs: Finding[]) => fs.map((f) => `${f.title} ${f.detail ?? ''} ${f.action ?? ''}`).join(' ')
    expect(text(m.findings)).not.toContain('$')
    const paid = computeComp(sampleContext({}, true), DEFAULT_SETTINGS)
    expect(text(paid.findings)).toMatch(/Bringing them to minimum costs \$[\d.]+K a year/)
  })

  it('works on a filtered scope and compares with the company', () => {
    const scoped = computeComp(sampleContext({ location: ['Bengaluru'] }), DEFAULT_SETTINGS)
    expect(scoped.pop.people).toHaveLength(319)
    const k = scoped.kpis.find((x) => x.id === 'median-compa')!
    expect(k.deltaLabel).toBe('vs company')
    expect(k.delta!).toBeLessThan(-0.05)
    for (const x of [...scoped.kpis, ...scoped.cycle.kpis])
      expect(x.value === null || Number.isFinite(x.value)).toBe(true)
  })

  it('hides averages over 1-4 people on every tile and in the findings', () => {
    for (const filters of [
      { department: ['Facilities'], level: ['L4'] },
      { department: ['DFT'], level: ['M2'] },
      { department: ['IT'], level: ['M2'] },
    ] as Partial<Filters>[]) {
      const s = computeComp(sampleContext(filters, true), DEFAULT_SETTINGS)
      expect(s.pop.people.length).toBeLessThan(5)
      for (const k of [...s.kpis, ...s.cycle.kpis]) {
        if (['eligible', 'promotions', 'exceptions', 'below-min', 'above-max'].includes(k.id)) continue
        if (k.value != null) throw new Error(`${k.id} shows ${k.value} for ${s.pop.people.length} people`)
      }
      for (const id of ['merit-spend', 'spend', 'guideline-spend']) {
        const k = [...s.kpis, ...s.cycle.kpis].find((x) => x.id === id)!
        if (s.cycle.spend.priced > 0) expect(k.suppressed, id).toBe(true)
      }
      const text = s.findings.map((f) => `${f.title} ${f.detail ?? ''}`).join(' ')
      expect(text).not.toMatch(/\d% of \d/)
      expect(s.cycle.spend.meanMerit).toBeNull()
    }
  })

  it('says when pay data and people are from different dates, and who has no comp record', () => {
    const past = computeComp(sampleContext({}, false, '2025-12-31'), DEFAULT_SETTINGS)
    expect(past.payAsOf).toBe('2026-09-30')
    expect(past.payStale).toBe(true)
    expect(past.pop.missingComp).toBeGreaterThan(0)
    const note = past.kpis.find((k) => k.id === 'median-compa')!.note!
    expect(note).toContain('as of 31 Dec 2025')
    expect(note).toContain('pay data from 30 Sep 2026')
    expect(note).toMatch(/\d+ active employees have no comp record/)
    expect(m.payStale).toBe(false)
    expect(kpi('median-compa').note).toBe('1,450 people · as of 30 Sep 2026')
  })

  it('names the rating behind pay for performance', () => {
    expect(kpi('p4p').format).toBe('times')
    expect(kpi('p4p').note).toBe('Rated 4-5 vs rated 3, latest rating (2026 Mid-year)')
  })

  it('ranks only job families of 10 or more on the market chart', () => {
    const ranked = m.market.familyChart.filter((r) => !r.group.startsWith('Other ('))
    expect(ranked.every((r) => r.n >= 10)).toBe(true)
    expect(ranked[0].group).toBe('Firmware')
  })

  it('computes the folder-tab headline', () => {
    expect(compaHeadline(ctx)!).toBeCloseTo(kpi('median-compa').value!, 6)
  })

  it('runs in under 150 ms', () => {
    const t0 = performance.now()
    computeComp(ctx, DEFAULT_SETTINGS)
    expect(performance.now() - t0).toBeLessThan(150)
  })
})
