import { describe, expect, it } from 'vitest'
import { attrition } from '@/lib/people'
import { trailing } from './base'
import { emp, leaver, many } from './fixtures'
import { annualRate, exitsByGroup } from './rates'

const W = trailing('2026-09-30', 12)

describe('exitsByGroup', () => {
  const staff = [
    ...many(18, { location: 'Austin' }),
    leaver('2026-03-15', 'Voluntary', { location: 'Austin', regrettable: true }),
    leaver('2026-05-15', 'Involuntary', { location: 'Austin' }),
    ...many(3, { location: 'Boulder' }),
    leaver('2026-01-10', 'Voluntary', { location: 'Boulder' }),
    emp({ location: 'Austin', employmentType: 'Contractor' }),
  ]

  it('matches the shared attrition definition for each group', () => {
    const g = exitsByGroup(staff, W, (e) => e.location).get('Austin')!
    const austin = staff.filter((e) => e.location === 'Austin')
    const shared = attrition(austin, W, 'all')
    expect(g.avgHeadcount).toBeCloseTo(shared.avgHeadcount, 10)
    expect(g.exits).toBe(2)
    expect(g.voluntary).toBe(1)
    expect(g.involuntary).toBe(1)
    expect(g.regretted).toBe(1)
    expect(annualRate(g.exits, g.avgHeadcount, W)).toBeCloseTo(shared.rate as number, 10)
  })

  it('leaves contractors out of headcount and exits', () => {
    const g = exitsByGroup(staff, W, (e) => e.location).get('Austin')!
    expect(g.avgHeadcount).toBeLessThan(21)
  })

  it('suppresses groups under 5 average headcount', () => {
    const g = exitsByGroup(staff, W, (e) => e.location).get('Boulder')!
    expect(g.avgHeadcount).toBeLessThan(5)
    expect(annualRate(g.exits, g.avgHeadcount, W)).toBeNull()
  })

  it('annualizes by 12 ÷ months', () => {
    expect(annualRate(3, 100, { months: 6 })).toBeCloseTo(0.06, 10)
    expect(annualRate(3, 100, { months: 12 })).toBeCloseTo(0.03, 10)
    expect(annualRate(3, 0, { months: 12 })).toBeNull()
  })

  it('can key snapshots by a date-dependent group', () => {
    const people = many(10, { level: 'L4' })
    const g = exitsByGroup(
      people,
      W,
      (e) => e.level,
      (_e, d) => (d < '2026-04-01' ? 'L3' : 'L4'),
    )
    expect(g.get('L3')!.avgHeadcount).toBeCloseTo((10 * 7) / 13, 10)
    expect(g.get('L4')!.avgHeadcount).toBeCloseTo((10 * 6) / 13, 10)
  })

  it('returns no groups for an empty population', () => {
    expect(exitsByGroup([], W, (e) => e.location).size).toBe(0)
  })
})
