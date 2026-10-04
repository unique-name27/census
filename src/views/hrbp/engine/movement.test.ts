import { describe, expect, it } from 'vitest'
import { change, emp, many, prepOf } from './fixtures'
import { computeMovement, sinceBand } from './movement'

const staff = many(20, { level: 'L3' })
const a = emp({ employeeId: 'A', level: 'L5' })
const b = emp({ employeeId: 'B', level: 'L4' })
const contractor = emp({ employeeId: 'C', employmentType: 'Contractor' })
const people = [...staff, a, b, contractor]

const changes = [
  // A promoted twice in the window: both events count.
  change({
    employeeId: 'A',
    effectiveDate: '2025-11-03',
    changeType: 'Promotion',
    fromLevel: 'L3',
    toLevel: 'L4',
  }),
  change({
    employeeId: 'A',
    effectiveDate: '2026-09-01',
    changeType: 'Promotion',
    fromLevel: 'L4',
    toLevel: 'L5',
  }),
  // A also transferred: still one person for mobility.
  change({
    employeeId: 'A',
    effectiveDate: '2026-05-04',
    changeType: 'Transfer',
    fromDepartment: 'Software',
    toDepartment: 'Design Verification',
  }),
  change({
    employeeId: 'B',
    effectiveDate: '2026-03-02',
    changeType: 'Lateral move',
    fromLevel: 'L4',
    toLevel: 'L4',
  }),
  // Before the window, and a contractor event: neither counts.
  change({
    employeeId: 'B',
    effectiveDate: '2024-03-01',
    changeType: 'Promotion',
    fromLevel: 'L3',
    toLevel: 'L4',
  }),
  change({
    employeeId: 'C',
    effectiveDate: '2026-03-02',
    changeType: 'Promotion',
    fromLevel: 'L2',
    toLevel: 'L3',
  }),
  change({ employeeId: 'A', effectiveDate: '2026-02-02', changeType: 'Manager change' }),
]

describe('computeMovement', () => {
  const m = computeMovement(prepOf({ employees: people, jobChanges: changes }))

  it('counts every promotion event in the window', () => {
    expect(m.promotions.promotions).toBe(2)
    expect(m.promotions.rate).toBeCloseTo(2 / m.promotions.avgHeadcount, 10)
  })

  it('counts each person once for internal mobility (no double counting)', () => {
    expect(m.mobility.movers).toBe(2)
    expect(m.mobility.rate).toBeCloseTo(2 / m.promotions.avgHeadcount, 10)
  })

  it('separates transfers, lateral moves and ignores manager changes', () => {
    expect(m.transfers).toBe(1)
    expect(m.lateral).toBe(1)
    expect(m.moves.map((x) => x.type).sort()).toEqual(['Lateral move', 'Promotion', 'Promotion', 'Transfer'])
  })

  it('attributes promotions to the level promoted from', () => {
    const l3 = m.byLevel.find((r) => r.level === 'L3')!
    const l4 = m.byLevel.find((r) => r.level === 'L4')!
    expect(l3.promotions).toBe(1)
    expect(l4.promotions).toBe(1)
    // A sat in L3 until 3 Nov 2025, so L3 average headcount includes A for 2 of 13 snapshots.
    expect(l3.avgHeadcount).toBeCloseTo(20 + 2 / 13, 10)
  })

  it('bands time since the last promotion', () => {
    const since = Object.fromEntries(m.sincePromotion.map((r) => [r.band, r.people]))
    expect(since['Under 1 yr']).toBe(1)
    expect(since['2-3 yrs']).toBe(1)
    expect(since['Never promoted']).toBe(20)
    expect(sinceBand(null)).toBe('Never promoted')
    expect(sinceBand(5)).toBe('5+ yrs')
  })

  it('leaves missing levels and departments empty in the moves table, not a dash', () => {
    const t = m.moves.find((x) => x.type === 'Transfer')!
    expect(t.fromLevel).toBeNull()
    expect(t.fromDepartment).toBe('Software')
  })

  it('does not annualize: a 3-month window holding a promotion cycle is not multiplied by 4', () => {
    const q = computeMovement(prepOf({ employees: people, jobChanges: changes }, { period: 't3m' }))
    expect(q.promotions.promotions).toBe(1)
    expect(q.promotions.rate).toBeCloseTo(1 / q.promotions.avgHeadcount, 10)
    expect(q.byQuarter.at(-1)!.rate).toBeCloseTo(1 / q.byQuarter.at(-1)!.avgHeadcount, 10)
    expect(q.priorLabel).toBe('vs same period last year')
    expect(m.priorLabel).toBe('vs prior 12 months')
  })

  it('is null, not 0, without a Job changes dataset', () => {
    const none = computeMovement(prepOf({ employees: people }))
    expect(none.promotions.rate).toBeNull()
    expect(none.mobility.rate).toBeNull()
    expect(none.byLevel.every((r) => r.rate === null)).toBe(true)
  })

  it('suppresses promotion rates for groups under 5', () => {
    const tiny = computeMovement(prepOf({ employees: [a, b], jobChanges: changes }))
    expect(tiny.promotions.rate).toBeNull()
    expect(tiny.promotions.promotions).toBe(2)
  })
})
