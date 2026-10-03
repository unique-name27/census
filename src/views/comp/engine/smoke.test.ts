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

function sampleContext(filters: Partial<Filters> = {}, showPay = false): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
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
    expect(f.title).toBe('Median compa-ratio in Bengaluru is 0.88 vs 1.00 for the rest of the company')
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
    expect(below.title).toBe('78 people are paid below range minimum, 5.4% of 1,450')
    expect(below.detail).toContain('41 are in Bengaluru')
    expect(below.detail).toMatch(/\d+ were promoted in the last 12 months/)
    const outside = m.ranges.below.filter((r) => r.location !== 'Bengaluru')
    expect(outside.filter((r) => r.promoted === 'Yes').length).toBeGreaterThanOrEqual(35)

    expect(m.ranges.above).toHaveLength(44)
    const above = finding('comp-above-max')
    expect(above.title).toMatch(/^44 people are paid above range maximum, 4[23] of them at L4$/)
    expect(above.detail).toMatch(/^42 of those L4s have 5\.5 or more years of tenure/)
    expect(above.filter).toEqual({ level: ['L4'] })
  })

  it('story 3: pay compression in Design Verification L3-L4', () => {
    const f = finding('comp-compression-Design Verification')
    expect(f.title).toBe(
      'New hires in Design Verification L3-L4 are paid at a median compa-ratio of 1.04 vs 0.95 for incumbents',
    )
    expect(f.detail).toBe('33 people hired in the last 12 months against 33 already in those roles.')
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
      'Go-to-Market merit proposals cost 4.3% of eligible base, 0.8 pts over the 3.50% budget',
    )
    expect(m.findings.some((x) => x.id === 'comp-over-budget-total')).toBe(false)

    const rules = m.cycle.exceptions.filter((e) => e.kind !== 'outlier')
    expect(rules.filter((e) => e.kind === 'top-low')).toHaveLength(5)
    expect(rules.filter((e) => e.kind === 'low-high')).toHaveLength(6)
    expect(finding('comp-exceptions').title).toBe(
      '11 merit proposals break the guideline rules: 5 rated 5 below 2% and 6 rated 1-2 above 3%',
    )
    expect(m.cycle.promotions.rows).toHaveLength(104)
  })

  it('story 5: Analog & Mixed-Signal below market because its ranges trail the market', () => {
    const f = finding('comp-below-market-Analog & Mixed-Signal')
    expect(f.title).toBe('Analog & Mixed-Signal base pay is 8% below market, a median market ratio of 0.92')
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
    for (const f of m.findings) expect((f.people ?? []).length).toBeLessThanOrEqual(50)
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

  it('computes the folder-tab headline', () => {
    expect(compaHeadline(ctx)!).toBeCloseTo(kpi('median-compa').value!, 6)
  })

  it('runs in under 150 ms', () => {
    const t0 = performance.now()
    computeComp(ctx, DEFAULT_SETTINGS)
    expect(performance.now() - t0).toBeLessThan(150)
  })
})
