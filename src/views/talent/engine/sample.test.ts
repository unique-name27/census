/**
 * Smoke test on the sample company: every planted Talent story (src/data/sample/README.md) is
 * detected by the readout and every KPI is finite or null. The time budget is in sample.perf.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { attrition } from '@/lib/people'
import { buildBase, trailing12 } from './base'
import { computeTalent, type TalentModel, talentHeadline } from './index'
import { monthsBack, voluntaryRates } from './risk'
import { datasets, sourcesFor } from './test-fixtures'

let data: Datasets
let ctx: AnalyticsContext
let m: TalentModel

const ctxWith = (filters: Partial<Filters> = {}, d: Datasets = data, asOf: string | null = null) =>
  buildContext({
    data: d,
    sources: sourcesFor(d, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: asOf,
    showPay: false,
  })

const finding = (id: string) => m.findings.find((f) => f.id === id)

function expectFiniteOrNull(kpis: Kpi[]) {
  for (const k of kpis) {
    expect(k.value === null || Number.isFinite(k.value), `${k.label} = ${k.value}`).toBe(true)
    if (k.delta != null) expect(Number.isFinite(k.delta), `${k.label} delta`).toBe(true)
    for (const v of k.spark ?? []) expect(v === null || Number.isFinite(v)).toBe(true)
  }
}

beforeAll(() => {
  data = generateSample()
  ctx = ctxWith()
  m = computeTalent(ctx)
})

describe('Talent on the sample company', () => {
  it('returns finite or null KPIs with unique ids', () => {
    expect(m.kpis).toHaveLength(7)
    expectFiniteOrNull(m.kpis)
    expect(new Set(m.kpis.map((k) => k.id)).size).toBe(m.kpis.length)
    expect(new Set(m.findings.map((f) => f.id)).size).toBe(m.findings.length)
  })

  it('measures required training for employees only and grays a change across different courses', () => {
    const k = m.kpis.find((x) => x.id === 'talent-training-on-time')!
    expect(m.learning.current).toEqual({ rate: 6884 / 7487, due: 7487, onTime: 6884 })
    expect(m.learning.mixDiffers).toBe(true)
    expect(k.deltaMaterial).toBe(false)
    expect(k.deltaLabel).toBe('vs prior period, different courses')
  })

  it('says how many rated people have left since the cycle', () => {
    expect(m.performance.rated).toBe(1338)
    expect(m.performance.ratedLeft).toBe(39)
    expect(m.kpis.find((x) => x.id === 'talent-high-performers')?.note).toBe(
      '1,338 rated, incl. 39 who have left',
    )
  })

  it('story 1: Go-to-Market rating inflation', () => {
    const f = finding('talent-inflation-Go-to-Market')
    expect(f?.severity).toBe('warning')
    // Share and gap at the same precision, so the arithmetic adds up.
    expect(f?.title).toBe(
      'Go-to-Market rated 45.5% of people 4 or 5 in 2026 Mid-year, 10.5 pts above the 35% guideline.',
    )
    expect(f?.filter).toEqual({ businessUnit: ['Go-to-Market'] })
    const gtm = m.performance.inflation.find((x) => x.businessUnit === 'Go-to-Market')!
    expect(gtm.share).toBeGreaterThan(0.43)
    expect(gtm.share).toBeLessThan(0.5)
    expect(m.performance.inflation.map((x) => x.businessUnit)).toEqual(['Go-to-Market'])
  })

  it('story 2: calibration pulled Silicon Engineering down by about 0.42', () => {
    const se = m.performance.calibration.find((c) => c.businessUnit === 'Silicon Engineering')!
    expect(se.shift).toBeGreaterThan(0.37)
    expect(se.shift).toBeLessThan(0.47)
    expect(m.performance.calibrationFlags.map((c) => c.row.businessUnit)).toEqual(['Silicon Engineering'])
    expect(finding('talent-calibration-Silicon Engineering')?.filter).toEqual({
      businessUnit: ['Silicon Engineering'],
    })
  })

  it('story 3: exactly three high-potential regretted exits in the last 6 months', () => {
    const f = finding('talent-hipo-exits')
    expect(f?.severity).toBe('critical')
    expect(f?.people?.map((p) => p.name).sort()).toEqual(['Daniela Herrera', 'Lior Azulay', 'Olivia Hill'])
    expect(f?.title).toMatch(/^3 high-potential people/)
  })

  it('story 4: succession gaps', () => {
    expect(m.succession.critical).toBe(28)
    expect(m.succession.criticalCovered).toBe(20)
    expect(finding('talent-critical-not-ready')?.title).toMatch(/^8 of 28 critical roles \(28\.6%\)/)
    const exposed = finding('talent-succession-exposed')
    expect(exposed?.severity).toBe('critical')
    const roles = m.succession.roles
      .filter((r) => r.successors === 0 && r.riskOfLoss === 'High')
      .map((r) => r.roleId)
    expect(roles.sort()).toEqual(['SP-001', 'SP-002', 'SP-003', 'SP-004'])
    expect(exposed?.people).toHaveLength(4)
    expect(talentHeadline(ctx)).toMatchObject({ value: '71%', label: 'critical roles covered' })
  })

  it('story 5: export control training overdue in Operations and Hsinchu', () => {
    const f = finding('talent-training-overdue')
    expect(f?.filter).toEqual({ businessUnit: ['Operations'] })
    const c = m.learning.concentration!
    expect(c.course).toBe('Export control & trade compliance')
    expect(c.top?.affected).toBe(54)
    expect(c.top?.population).toBe(167)
    expect(c.second?.value).toBe('Hsinchu')
    expect(c.second?.segValue).toBeCloseTo(34 / 141, 3)
    expect(f?.tab).toBe('learning')
    expect(f?.severity).toBe('critical')
    // The people behind the finding are the 54 it is about, not a list cut at 50.
    expect(f?.people).toHaveLength(54)
  })

  it('keeps a small onboarding gap at warning, not critical', () => {
    const early = computeTalent(ctxWith({}, data, '2025-03-31'))
    const f = early.findings.find((x) => x.id === 'talent-training-overdue')
    expect(f?.title).toMatch(/^5 of 10 people in level L5/)
    expect(f?.severity).toBe('warning')
  })

  it('story 6: 25 high performers waiting for promotion, 15 in Design Verification', () => {
    expect(m.overdue.rows).toHaveLength(25)
    expect(m.overdue.rows.filter((r) => r.department === 'Design Verification')).toHaveLength(15)
    const f = finding('talent-promotion-overdue')
    expect(f?.filter).toEqual({ department: ['Design Verification'] })
    expect(f?.title).toBe(
      '25 consistent high performers have had no promotion in 3 or more years, 15 of them in Design Verification.',
    )
  })

  it('back-tests the flight-risk model out of time and it separates leavers', () => {
    const bt = m.risk.backTest
    expect(bt.population).toBeGreaterThan(1000)
    expect(bt.scoredOn).toBe('2025-09-30')
    // Points for the back-test come only from month-ends whose 12-month outcome ended by then.
    expect(bt.learned).toBe(true)
    expect(bt.learnedFrom).toHaveLength(12)
    for (const d of bt.learnedFrom) expect(monthsBack(d, -12) <= bt.scoredOn).toBe(true)
    // Ratings start in Dec 2024, so the rating factors use default points in the back-test.
    expect(bt.defaults.sort()).toEqual(['highNoPromo', 'ratingDrop'])
    expect(bt.lift!).toBeGreaterThan(1.5)
    expect(bt.ordered).toBe(true)
    const [low, medium, high] = bt.bands
    expect(high.rate!).toBeGreaterThan(medium.rate!)
    expect(medium.rate!).toBeGreaterThan(low.rate!)
    // Today's points come from the 12 month-ends 12 to 23 months back, rounded to 5.
    expect(m.risk.learnedFrom[0]).toBe('2024-10-31')
    expect(m.risk.learnedFrom.at(-1)).toBe('2025-09-30')
    expect(Object.values(m.risk.points).every((p) => p % 5 === 0)).toBe(true)
    // The high band is close to 10% and the share reported is the real one.
    expect(m.risk.highShare!).toBeGreaterThan(0.08)
    expect(m.risk.highShare!).toBeLessThan(0.12)
    const highShare = m.retention.bands.find((b) => b.band === 'High')!.share!
    expect(highShare).toBeCloseTo(m.risk.highShare!, 9)
    expect(m.retention.keyTalent.every((k) => (k.rating ?? 0) >= 4 && k.band === 'High')).toBe(true)
    // Factors that did not go with more exits earn no points.
    for (const e of m.risk.evidence)
      if (e.source === 'learned' && e.lift != null && e.lift < 1) expect(e.points).toBe(0)
  })

  it('stays steady from one month-end to the next', () => {
    const keyTalent: number[] = []
    for (const asOf of ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31']) {
      const at = computeTalent(ctxWith({}, data, asOf))
      keyTalent.push(at.retention.keyTalent.length)
      expect(at.risk.backTest.ordered, asOf).toBe(true)
      expect(at.risk.highShare!, asOf).toBeGreaterThan(0.06)
      expect(at.risk.highShare!, asOf).toBeLessThan(0.12)
      expect(at.risk.points.tenurePeak, asOf).toBeGreaterThanOrEqual(45)
      expect(at.risk.points.tenurePeak, asOf).toBeLessThanOrEqual(60)
    }
    keyTalent.push(m.retention.keyTalent.length)
    expect(Math.max(...keyTalent) - Math.min(...keyTalent)).toBeLessThanOrEqual(12)
  })

  it('names a main reason that sets each person apart', () => {
    // Tenure of 1-3 years is shared by the whole high band, so it is never the main reason when there is another.
    expect(m.retention.commonFactors).toContain('tenurePeak')
    const tenure = m.retention.drivers.find((d) => d.key === 'tenurePeak')!
    expect(tenure.common).toBe(true)
    for (const k of m.retention.keyTalent) {
      const factors = m.risk.scores.get(k.employeeId)!.factors
      if (factors.some((f) => f.key !== 'tenurePeak')) expect(k.reason1).not.toMatch(/yrs at the company/)
    }
    expect(new Set(m.retention.keyTalent.map((k) => k.reason1.split(' ')[0])).size).toBeGreaterThan(1)
  })

  it('computes department and location attrition exactly like the shared definition', () => {
    const base = buildBase(ctx)
    const w = trailing12(ctx.asOf)
    const rates = voluntaryRates(ctx.all.employees, w)
    expect(rates.company).toBeCloseTo(attrition(ctx.all.employees, w, 'voluntary').rate!, 12)
    for (const dept of ['Design Verification', 'Physical Design', 'Software']) {
      const group = ctx.all.employees.filter((e) => e.department === dept)
      expect(rates.department.get(dept)).toBeCloseTo(attrition(group, w, 'voluntary').rate!, 12)
    }
    const blr = ctx.all.employees.filter((e) => e.location === 'Bengaluru')
    expect(rates.location.get('Bengaluru')).toBeCloseTo(attrition(blr, w, 'voluntary').rate!, 12)
    expect(base.has.terminationType).toBe(true)
  })

  it('shows regretted exits as missing, not 0, when termination type is missing', () => {
    const noType = { ...data, employees: data.employees.map((e) => ({ ...e, terminationType: null })) }
    const t = computeTalent(ctxWith({}, noType))
    const kpi = t.kpis.find((k) => k.id === 'talent-regretted-high')!
    expect(kpi.value).toBeNull()
    expect(kpi.delta).toBeNull()
    expect(kpi.note).toBe('Termination type is missing')
    expect(t.retention.regrettedHigh.available).toBe(false)
    expect(t.retention.hipoExits.available).toBe(false)
    expect(t.findings.some((f) => f.id === 'talent-hipo-exits')).toBe(false)
    expectFiniteOrNull(t.kpis)
  })

  it('exports no count over fewer than 5 people', () => {
    for (const filters of [
      {},
      { department: ['Legal'] },
      { location: ['Vancouver'] },
      { location: ['Hsinchu'] },
    ]) {
      const t = computeTalent(ctxWith(filters))
      for (const r of [
        ...t.performance.byDepartment,
        ...t.performance.byBusinessUnit,
        ...t.performance.byLevel,
      ])
        expect(r.rated >= 5 || r.high == null, `${r.group} ${JSON.stringify(filters)}`).toBe(true)
      for (const r of [...t.succession.hipoByLevel, ...t.succession.hipoByUnit])
        expect(r.assessed >= 5 || r.high == null, `${r.group} ${JSON.stringify(filters)}`).toBe(true)
      for (const r of t.performance.exitByRating) expect(r.rated >= 5 || r.voluntary == null).toBe(true)
      for (const c of [...t.learning.overdueByDepartment, ...t.learning.overdueByLocation])
        expect(c.pastDue >= 5 || c.overdue == null).toBe(true)
      const key = t.kpis.find((k) => k.id === 'talent-key-talent-risk')!
      if (t.retention.highPerformers < 5) expect(key.note ?? '').not.toMatch(/%/)
    }
    // The executive levels fold together instead of showing 2 of 4.
    expect(m.performance.byLevel.at(-1)?.group).toMatch(/^Other \(\d+\)$/)
  })

  it('places the 9-box on the latest annual cycle', () => {
    expect(m.nineBox.cycle?.cycle).toBe('2025 Annual')
    expect(m.nineBox.cells.reduce((s, c) => s + c.count, 0)).toBe(m.nineBox.placed)
    expect(m.nineBox.placed + m.nineBox.notPlaced).toBe(m.activeCount)
  })

  it('writes findings in the house style', () => {
    for (const f of m.findings) {
      expect(f.title).not.toMatch(/[!—]/)
      expect(f.title.endsWith('.')).toBe(true)
      expect(f.action).toBeTruthy()
    }
  })

  it('works in a scoped view', () => {
    const scoped = computeTalent(ctxWith({ businessUnit: ['Operations'] }))
    expectFiniteOrNull(scoped.kpis)
    expect(scoped.activeCount).toBeGreaterThan(100)
    expect(scoped.findings.some((f) => f.id === 'talent-training-overdue')).toBe(true)
    expect(scoped.findings.some((f) => f.id === 'talent-inflation-Go-to-Market')).toBe(false)
  })

  it('works with no data at all', () => {
    const empty = computeTalent(ctxWith({}, datasets()))
    expectFiniteOrNull(empty.kpis)
    expect(empty.findings).toEqual([])
    expect(empty.kpis.find((k) => k.id === 'talent-high-performers')?.value).toBeNull()
    expect(talentHeadline(ctxWith({}, datasets()))).toMatchObject({
      value: '—',
      label: 'critical roles covered',
    })
  })
})
