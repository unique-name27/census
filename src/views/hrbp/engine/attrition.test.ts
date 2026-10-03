import { describe, expect, it } from 'vitest'
import { firstYearAttrition } from '@/lib/people'
import { cohortSummary, computeAttrition, firstYearCohort, NOT_RATED } from './attrition'
import { emp, leaver, many, prepOf, review } from './fixtures'

describe('first-year cohort', () => {
  const people = [
    emp({ hireDate: '2024-10-01' }),
    emp({ hireDate: '2025-09-30', terminationDate: '2026-02-01', terminationType: 'Voluntary' }),
    emp({ hireDate: '2025-01-06', terminationDate: '2026-02-01', terminationType: 'Voluntary' }),
    emp({ hireDate: '2024-09-30' }),
    emp({ hireDate: '2025-10-01' }),
    emp({ hireDate: '2025-03-03', employmentType: 'Contractor', terminationDate: '2025-06-01' }),
  ]

  it('uses the same bounds as the shared first-year definition', () => {
    const shared = firstYearAttrition(people, '2026-09-30')
    const cohort = firstYearCohort(people, '2026-09-30')
    expect(cohort.length).toBe(shared.cohort)
    expect(cohort.length).toBe(3)
  })

  it('counts leavers within 365 days of hire only', () => {
    const s = cohortSummary(people, '2026-09-30')
    expect(s.leavers).toBe(1)
  })

  it('is null below a cohort of 5, not 0', () => {
    expect(cohortSummary(people, '2026-09-30').rate).toBeNull()
    expect(cohortSummary([], '2026-09-30')).toMatchObject({ rate: null, cohort: 0 })
  })
})

describe('computeAttrition', () => {
  const mgr = emp({ employeeId: 'MGR', name: 'Pat Lee', level: 'M1' })
  const stayers = many(20, { managerId: 'MGR' })
  const regretted = leaver('2026-06-15', 'Voluntary', {
    name: 'Rae Kim',
    managerId: 'MGR',
    regrettable: true,
    terminationReason: 'My manager',
    hireDate: '2022-06-13',
  })
  const other = leaver('2026-02-02', 'Voluntary', { managerId: 'MGR', terminationReason: 'Base salary' })
  const fired = leaver('2026-01-12', 'Involuntary', { managerId: 'MGR' })
  const reviews = [
    review(regretted.employeeId, '2025-12-15', 4),
    review(regretted.employeeId, '2026-06-30', 2),
  ]

  it('lists regretted leavers with manager, reason and the last rating before exit', () => {
    const a = computeAttrition(prepOf({ employees: [mgr, ...stayers, regretted, other, fired], reviews }))
    expect(a.regrettedLeavers).toHaveLength(1)
    expect(a.regrettedLeavers[0]).toMatchObject({
      name: 'Rae Kim',
      manager: 'Pat Lee',
      reason: 'My manager',
      lastRating: 4,
    })
    expect(a.regrettedLeavers[0].tenure).toBeCloseTo(4, 1)
  })

  it('ranks voluntary reasons', () => {
    const a = computeAttrition(prepOf({ employees: [mgr, ...stayers, regretted, other, fired], reviews }))
    expect(a.reasons.map((r) => r.reason)).toEqual(['Base salary', 'My manager'])
    expect(a.reasons[0].share).toBeCloseTo(0.5, 10)
    expect(a.voluntaryExits).toBe(2)
  })

  it('groups exits by last rating, with unrated leavers kept', () => {
    const a = computeAttrition(prepOf({ employees: [mgr, ...stayers, regretted, other, fired], reviews }))
    const exits = (group: string) =>
      a.byRating.filter((r) => r.group === group).reduce((s, r) => s + r.exits, 0)
    expect(exits('4 Exceeds')).toBe(1)
    expect(exits(NOT_RATED)).toBe(2)
  })

  it('leaves the rating breakdown empty without reviews', () => {
    const a = computeAttrition(prepOf({ employees: [mgr, ...stayers, regretted, other, fired] }))
    expect(a.byRating).toEqual([])
  })

  it('splits quarters by type and annualizes ×4', () => {
    const a = computeAttrition(prepOf({ employees: [mgr, ...stayers, regretted, other, fired] }))
    const q2 = a.quarters.filter((q) => q.quarter === '2026 Q2')
    const vol = q2.find((q) => q.type === 'Voluntary')!
    expect(vol.exits).toBe(1)
    expect(vol.rate).toBeCloseTo((1 / vol.avgHeadcount) * 4, 10)
    expect(a.quarters.some((q) => q.type === 'Not recorded')).toBe(false)
  })

  it('shows untyped exits as Not recorded and turns voluntary rates off when no exit has a type', () => {
    const untyped = [mgr, ...stayers, leaver('2026-03-02', null), leaver('2026-04-06', null)]
    const a = computeAttrition(prepOf({ employees: untyped }))
    expect(a.quarters.some((q) => q.type === 'Not recorded' && q.exits > 0)).toBe(true)
    expect(a.company.voluntary).toBeNull()
    expect(a.regrettedByQuarter).toEqual([])
    expect(a.byDepartment[0].voluntaryRate).toBeNull()
    expect(a.byDepartment[0].rate).not.toBeNull()
  })

  it('handles an empty roster', () => {
    const a = computeAttrition(prepOf({ employees: [] }))
    expect(a.reasons).toEqual([])
    expect(a.byDepartment).toEqual([])
    expect(a.company.all).toBeNull()
  })
})
