import { describe, expect, it } from 'vitest'
import { buildPopulation } from './population'
import {
  aboveMaximum,
  belowMinimum,
  compaBy,
  compaRow,
  compression,
  costToMinimum,
  penetrationByLevel,
  positionMix,
} from './ranges'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, comp, dataset, emp, team } from './test-fixtures'

const popOf = (parts: { employees: ReturnType<typeof emp>[]; comp: ReturnType<typeof comp>[] }) =>
  buildPopulation(dataset(parts), AS_OF).people

describe('range position', () => {
  it('computes the median, band share and out-of-range counts', () => {
    const t = team(6, {}, (_, i) => ({ compa: [0.75, 0.9, 1.0, 1.0, 1.1, 1.25][i] }))
    const row = compaRow('All', popOf(t), DEFAULT_SETTINGS)
    expect(row.n).toBe(6)
    expect(row.median).toBeCloseTo(1)
    expect(row.inBand).toBeCloseTo(4 / 6)
    expect(row.belowMin).toBe(1)
    expect(row.aboveMax).toBe(1)
  })

  it('hides statistics for groups under 5 and folds them into Other', () => {
    const big = team(6, { location: 'San Jose' })
    const a = team(2, { location: 'Haifa' })
    const b = team(3, { location: 'Munich' })
    const people = popOf({
      employees: [...big.employees, ...a.employees, ...b.employees],
      comp: [...big.comp, ...a.comp, ...b.comp],
    })
    const rows = compaBy(people, (p) => p.location, DEFAULT_SETTINGS)
    expect(rows.map((r) => r.group)).toEqual(['San Jose', 'Other (2)'])
    expect(rows[1].n).toBe(5)
    expect(rows[1].median).toBeCloseTo(1)
    const one = compaBy(popOf(a), (p) => p.location, DEFAULT_SETTINGS)
    expect(one[0].median).toBeNull()
  })

  it('shares the six position buckets per group', () => {
    const t = team(5, { businessUnit: 'Operations' }, (_, i) => ({ compa: [0.7, 0.85, 0.95, 1.05, 1.3][i] }))
    const [row] = positionMix(popOf(t), (p) => p.businessUnit)
    expect(row).toMatchObject({
      group: 'Operations',
      n: 5,
      below: 0.2,
      q1: 0.2,
      q2: 0.2,
      q3: 0.2,
      q4: 0,
      above: 0.2,
    })
  })

  it('lists people below minimum with the gap and cost to minimum', () => {
    const a = emp()
    const b = emp()
    const c = emp()
    const people = popOf({
      employees: [a, b, c],
      comp: [comp(a, { compa: 0.7 }), comp(b, { compa: 0.78, fxToUsd: null }), comp(c, { compa: 1.3 })],
    })
    const below = belowMinimum(people)
    expect(below.map((r) => r.id)).toEqual([a.employeeId, b.employeeId])
    expect(below[0].gapPct).toBeCloseTo(10_000 / 70_000)
    expect(below[0].gapUsd).toBe(10_000)
    expect(below[1].gapUsd).toBeNull()
    expect(costToMinimum(below)).toEqual({ usd: 10_000, skipped: 1 })
    const above = aboveMaximum(people)
    expect(above.map((r) => r.id)).toEqual([c.employeeId])
    expect(above[0].gapPct).toBeCloseTo(10_000 / 120_000)
  })

  it('reports penetration quartiles by level in level order', () => {
    const l5 = team(5, { level: 'L5' }, (_, i) => ({ compa: 0.8 + i * 0.1 }))
    const l2 = team(5, { level: 'L2' })
    const rows = penetrationByLevel(
      popOf({ employees: [...l5.employees, ...l2.employees], comp: [...l5.comp, ...l2.comp] }),
    )
    expect(rows.map((r) => r.level)).toEqual(['L2', 'L5'])
    expect(rows[1].median).toBeCloseTo(0.5)
    expect(rows[1].q1).toBeCloseTo(0.25)
  })

  it('compares new hires with incumbents at the same department and level', () => {
    const hires = team(5, { hireDate: '2026-02-02' }, () => ({ compa: 1.06 }))
    const inc = team(6, { hireDate: '2019-02-04' }, () => ({ compa: 0.95 }))
    const fewHires = team(4, { hireDate: '2026-02-02', level: 'L4' }, () => ({ compa: 1.2 }))
    const fewInc = team(6, { level: 'L4' })
    const rows = compression(
      popOf({
        employees: [...hires.employees, ...inc.employees, ...fewHires.employees, ...fewInc.employees],
        comp: [...hires.comp, ...inc.comp, ...fewHires.comp, ...fewInc.comp],
      }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ level: 'L3', newN: 5, incN: 6, flagged: true })
    expect(rows[0].gap).toBeCloseTo(0.11)
  })
})
