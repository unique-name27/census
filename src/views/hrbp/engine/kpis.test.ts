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

  it('returns finite or null values for an empty roster', () => {
    const m = computeHrbp(ctxOf({}))
    for (const k of m.kpi.kpis) expect(k.value === null || Number.isFinite(k.value)).toBe(true)
    expect(m.findings).toEqual([])
  })
})
