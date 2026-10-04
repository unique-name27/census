import { describe, expect, it } from 'vitest'
import { attrition } from '@/lib/people'
import { computeHrbp } from '.'
import { change, ctxOf, emp, leaver, many } from './fixtures'

describe('KPI tiles', () => {
  const people = [
    ...many(40, { location: 'San Jose' }),
    ...many(20, { location: 'Austin' }),
    leaver('2026-02-02', 'Voluntary', { location: 'Austin', regrettable: true }),
    leaver('2026-03-02', 'Voluntary', { location: 'Austin' }),
    leaver('2025-03-03', 'Voluntary', { location: 'San Jose' }),
    emp({ location: 'Austin', hireDate: '2026-01-05' }),
    emp({ employmentType: 'Contractor' }),
  ]
  const jobChanges = [
    change({
      employeeId: people[0].employeeId,
      effectiveDate: '2026-03-02',
      changeType: 'Promotion',
      fromLevel: 'L3',
      toLevel: 'L4',
    }),
  ]

  it('compares rates with the prior window at company scope', () => {
    const m = computeHrbp(ctxOf({ employees: people, jobChanges }))
    const vol = m.kpi.kpis.find((k) => k.id === 'voluntary')!
    const ctx = ctxOf({ employees: people, jobChanges })
    const now = attrition(people, ctx.window, 'voluntary').rate as number
    const before = attrition(people, ctx.prior, 'voluntary').rate as number
    expect(vol.value).toBeCloseTo(now, 10)
    expect(vol.delta).toBeCloseTo(now - before, 10)
    expect(vol.deltaLabel).toBe('vs prior 12 months')
    expect(vol.goodDirection).toBe('down')
  })

  it('compares with the company and says so when an org filter is active', () => {
    const m = computeHrbp(ctxOf({ employees: people, jobChanges }, { location: ['Austin'] }))
    const vol = m.kpi.kpis.find((k) => k.id === 'voluntary')!
    expect(vol.deltaLabel).toBe('vs company')
    expect(vol.deltaMaterial).toBe(true)
    const hc = m.kpi.kpis.find((k) => k.id === 'headcount')!
    // 20 stayers + 1 hire today; 12 months ago the 2 leavers were still here.
    expect(hc).toMatchObject({ value: 21, delta: -1, deltaLabel: 'vs 12 months earlier' })
  })

  it('counts headcount without contractors and notes them separately', () => {
    const m = computeHrbp(ctxOf({ employees: people, jobChanges }))
    const hc = m.kpi.kpis.find((k) => k.id === 'headcount')!
    expect(hc.value).toBe(61)
    expect(hc.note).toBe('Plus 1 contractor or intern')
  })

  it('takes promotions from Job changes and is null without them', () => {
    const withChanges = computeHrbp(ctxOf({ employees: people, jobChanges }))
    expect(withChanges.kpi.kpis.find((k) => k.id === 'promotion-rate')!.value).toBeGreaterThan(0)
    const without = computeHrbp(ctxOf({ employees: people }))
    const tile = without.kpi.kpis.find((k) => k.id === 'promotion-rate')!
    expect(tile.value).toBeNull()
    expect(tile.note).toBe('Upload Job changes to see this')
  })

  it('suppresses rates for scopes under 5 people', () => {
    const m = computeHrbp(ctxOf({ employees: people }, { location: ['Nowhere'] }))
    expect(m.kpi.kpis.every((k) => k.value === null || k.value === 0)).toBe(true)
    const tiny = [...many(3), leaver('2026-02-02', 'Voluntary')]
    const t = computeHrbp(ctxOf({ employees: tiny }))
    const vol = t.kpi.kpis.find((k) => k.id === 'voluntary')!
    expect(vol.suppressed).toBe(true)
    expect(vol.value).toBeNull()
  })

  it('compares first-year attrition with the cohort a year earlier in every period', () => {
    // Cohort at 30 Sep 2026: hired Oct 2024 to Sep 2025 (10, 2 left). A year earlier: hired Oct 2023 to Sep 2024 (10, 1 left).
    // Three months earlier (30 Jun 2026) the cohort would be hired Jul 2024 to Jun 2025: a different group.
    const cohorts = [
      ...many(8, { hireDate: '2025-03-03' }),
      ...Array.from({ length: 2 }, () => leaver('2025-11-03', 'Voluntary', { hireDate: '2025-03-03' })),
      ...many(9, { hireDate: '2024-03-04' }),
      leaver('2024-12-02', 'Voluntary', { hireDate: '2024-03-04' }),
      ...many(30),
    ]
    for (const period of ['t12m', 't3m', 'lastQuarter', 'ytd'] as const) {
      const fy = computeHrbp(ctxOf({ employees: cohorts }, { period })).kpi.kpis.find(
        (k) => k.id === 'first-year',
      )!
      expect(fy.value).toBeCloseTo(0.2, 10)
      expect(fy.delta).toBeCloseTo(0.2 - 0.1, 10)
      expect(fy.deltaLabel).toBe('vs a year earlier')
    }
  })

  it('does not annualize the promotion rate and compares short periods with the same months last year', () => {
    const staff = many(50)
    const promo = (i: number, date: string) =>
      change({
        employeeId: staff[i].employeeId,
        effectiveDate: date,
        changeType: 'Promotion',
        fromLevel: 'L3',
        toLevel: 'L4',
      })
    // Five promotions on 1 Sep 2026, four on 1 Sep 2025, none in between.
    const jobChanges = [0, 1, 2, 3, 4]
      .map((i) => promo(i, '2026-09-01'))
      .concat([5, 6, 7, 8].map((i) => promo(i, '2025-09-01')))
    const m = computeHrbp(ctxOf({ employees: staff, jobChanges }, { period: 't3m' }))
    const tile = m.kpi.kpis.find((k) => k.id === 'promotion-rate')!
    expect(tile.value).toBeCloseTo(5 / 50, 10)
    expect(tile.delta).toBeCloseTo(5 / 50 - 4 / 50, 10)
    expect(tile.deltaLabel).toBe('vs same period last year')
    expect(tile.note).toBe('5 promotions over an average headcount of 50')
    expect(m.movement.mobility.rate).toBeCloseTo(5 / 50, 10)
  })

  it('writes notes with the right plural', () => {
    const one = [...many(20), leaver('2026-02-02', 'Voluntary')]
    const m = computeHrbp(
      ctxOf({
        employees: one,
        jobChanges: [
          change({ employeeId: one[0].employeeId, effectiveDate: '2026-03-02', changeType: 'Promotion' }),
        ],
      }),
    )
    expect(m.kpi.kpis.find((k) => k.id === 'voluntary')!.note).toMatch(
      /^1 voluntary exit over an average headcount of 20, annualized$/,
    )
    expect(m.kpi.kpis.find((k) => k.id === 'promotion-rate')!.note).toMatch(/^1 promotion over/)
  })

  it('returns finite or null values for an empty roster', () => {
    const m = computeHrbp(ctxOf({}))
    for (const k of m.kpi.kpis) expect(k.value === null || Number.isFinite(k.value)).toBe(true)
    expect(m.findings).toEqual([])
  })
})
