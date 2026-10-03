/**
 * Smoke test on the sample company: every planted Talent story (src/data/sample/README.md) is
 * detected by the readout, every KPI is finite or null, and the engine runs in under 150 ms.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { computeTalent, type TalentModel, talentHeadline } from './index'
import { datasets, sourcesFor } from './test-fixtures'

let data: Datasets
let ctx: AnalyticsContext
let m: TalentModel
let ms: number

const ctxWith = (filters: Partial<Filters> = {}, d: Datasets = data) =>
  buildContext({
    data: d,
    sources: sourcesFor(d, 'sample'),
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
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
  const t0 = performance.now()
  m = computeTalent(ctx)
  ms = performance.now() - t0
})

describe('Talent on the sample company', () => {
  it('runs in under 150 ms', () => {
    expect(ms).toBeLessThan(150)
  })

  it('returns finite or null KPIs with unique ids', () => {
    expect(m.kpis).toHaveLength(7)
    expectFiniteOrNull(m.kpis)
    expect(new Set(m.kpis.map((k) => k.id)).size).toBe(m.kpis.length)
    expect(new Set(m.findings.map((f) => f.id)).size).toBe(m.findings.length)
  })

  it('story 1: Go-to-Market rating inflation', () => {
    const f = finding('talent-inflation-Go-to-Market')
    expect(f?.severity).toBe('warning')
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
    expect(talentHeadline(ctx)).toEqual({ value: '71%', label: 'critical roles covered' })
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

  it('back-tests the flight-risk model honestly and it separates leavers', () => {
    const bt = m.risk.backTest
    expect(bt.population).toBeGreaterThan(1000)
    expect(bt.lift).not.toBeNull()
    expect(bt.lift!).toBeGreaterThan(1.5)
    const [low, , high] = bt.bands
    expect(high.rate!).toBeGreaterThan(low.rate!)
    const highShare = m.retention.bands.find((b) => b.band === 'High')!.share!
    expect(highShare).toBeGreaterThan(0.08)
    expect(highShare).toBeLessThan(0.16)
    expect(m.retention.keyTalent.every((k) => (k.rating ?? 0) >= 4 && k.band === 'High')).toBe(true)
    // Factors that did not go with more exits earn no points.
    for (const e of m.risk.evidence) if (e.tested && e.lift != null && e.lift < 1) expect(e.points).toBe(0)
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
      expect((f.people ?? []).length).toBeLessThanOrEqual(50)
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
    expect(talentHeadline(ctxWith({}, datasets()))).toEqual({ value: '—', label: 'critical roles covered' })
  })
})
