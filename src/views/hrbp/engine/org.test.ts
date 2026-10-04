import { describe, expect, it } from 'vitest'
import { change, emp, leaver, many, prepOf } from './fixtures'
import { computeOrg, managerFlag, spanBucket } from './org'

describe('spans and flags', () => {
  it('buckets spans as 1, 2, 3-5, 6-8, 9-11, 12+', () => {
    expect([1, 2, 3, 5, 6, 8, 9, 11, 12, 20].map(spanBucket)).toEqual([
      '1',
      '2',
      '3-5',
      '3-5',
      '6-8',
      '6-8',
      '9-11',
      '9-11',
      '12+',
      '12+',
    ])
  })
  it('flags Overloaded ≥ 12, Heavy ≥ 9, Light < 3, New, else Healthy', () => {
    expect(managerFlag(12, false)).toBe('Overloaded')
    expect(managerFlag(9, true)).toBe('Heavy')
    expect(managerFlag(2, true)).toBe('Light')
    expect(managerFlag(5, true)).toBe('New')
    expect(managerFlag(5, false)).toBe('Healthy')
  })

  it('does not flag executives for span: their team size is set by the org design', () => {
    expect(managerFlag(9, false, 'E1')).toBe('Healthy')
    expect(managerFlag(14, false, 'E2')).toBe('Healthy')
    expect(managerFlag(2, true, 'E3')).toBe('New')
    expect(managerFlag(9, false, 'M2')).toBe('Heavy')
  })
})

describe('computeOrg', () => {
  const top = emp({ employeeId: 'TOP', name: 'Top', level: 'E1', hireDate: '2015-01-05' })
  const wide = emp({ employeeId: 'W', name: 'Wide', managerId: 'TOP', level: 'M1', hireDate: '2016-01-04' })
  const wideTeam = [
    ...many(10, { managerId: 'W' }),
    emp({ managerId: 'W', employmentType: 'Contractor' }),
    emp({ managerId: 'W', employmentType: 'Intern', hireDate: '2026-09-08' }),
    leaver('2026-03-02', 'Voluntary', { managerId: 'W', regrettable: true }),
    leaver('2026-05-04', 'Voluntary', { managerId: 'W', regrettable: false }),
  ]
  const solo = emp({ employeeId: 'S', name: 'Solo', managerId: 'TOP', level: 'M2' })
  const lead = emp({ employeeId: 'L', name: 'Lead', managerId: 'S', level: 'M1' })
  const leadTeam = many(5, { managerId: 'L' })
  const fresh = emp({
    employeeId: 'N',
    name: 'Newly promoted',
    managerId: 'TOP',
    level: 'M1',
    hireDate: '2018-02-05',
  })
  const freshTeam = many(5, { managerId: 'N' })
  const people = [top, wide, ...wideTeam, solo, lead, ...leadTeam, fresh, ...freshTeam]
  const jobChanges = [
    change({
      employeeId: 'N',
      effectiveDate: '2026-03-02',
      changeType: 'Promotion',
      fromLevel: 'L6',
      toLevel: 'M1',
    }),
  ]
  const org = computeOrg(prepOf({ employees: people, jobChanges }))
  const row = (id: string) => org.managers.find((m) => m.managerId === id)!

  it('counts contractors and interns in spans', () => {
    expect(row('W').directs).toBe(12)
    expect(row('W').flag).toBe('Overloaded')
  })

  it('counts regretted exits per manager over 12 months', () => {
    expect(row('W').regretted12).toBe(1)
  })

  it('sizes the total org below each manager', () => {
    expect(row('TOP').totalOrg).toBe(people.filter((p) => !p.terminationDate).length - 1)
    expect(row('S').totalOrg).toBe(6)
  })

  it('finds single-report chains with 5 or more people below the report', () => {
    expect(org.chains).toHaveLength(1)
    expect(org.chains[0]).toMatchObject({ managerId: 'S', reportId: 'L', below: 5 })
  })

  it('treats a recent move into management as a new manager', () => {
    expect(row('N').newManager).toBe(true)
    expect(row('N').managerSince).toBe('2026-03-02')
    expect(row('N').flag).toBe('New')
    expect(row('W').newManager).toBe(false)
  })

  it('computes layers, mean and median span and the manager ratio', () => {
    expect(org.layers).toBe(4)
    const spans = org.managers.map((m) => m.directs)
    expect(org.meanSpan).toBeCloseTo(spans.reduce((a, b) => a + b, 0) / spans.length, 10)
    expect(org.managerRatio).toBeCloseTo((org.activeWorkers - org.managers.length) / org.managers.length, 10)
    expect(org.spanBuckets.find((b) => b.bucket === '12+')!.managers).toBe(1)
    expect(org.spanBuckets.find((b) => b.bucket === '1')!.managers).toBe(1)
  })

  it('flags people below layer 7, as the Org chart does', () => {
    const chain = [emp({ employeeId: 'D0' })]
    for (let i = 1; i <= 9; i++) chain.push(emp({ employeeId: `D${i}`, managerId: `D${i - 1}` }))
    const deep = computeOrg(prepOf({ employees: chain }))
    expect(deep.layers).toBe(10)
    expect(deep.deep.people.map((e) => e.employeeId)).toEqual(['D7', 'D8', 'D9'])
    expect(deep.deep.maxDepth).toBe(9)
  })

  it('survives a reporting cycle', () => {
    const cyc = [emp({ employeeId: 'X', managerId: 'Y' }), emp({ employeeId: 'Y', managerId: 'X' })]
    const o = computeOrg(prepOf({ employees: cyc }))
    expect(o.managers).toHaveLength(2)
    expect(Number.isFinite(o.layers)).toBe(true)
  })

  it('returns nulls for an empty scope', () => {
    const o = computeOrg(prepOf({ employees: [] }))
    expect(o).toMatchObject({ meanSpan: null, medianSpan: null, managerRatio: null, layers: null })
  })
})
