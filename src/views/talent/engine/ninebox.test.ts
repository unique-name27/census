import { describe, expect, it } from 'vitest'
import { buildBase } from './base'
import { cellKey, computeNineBox } from './ninebox'
import { ctxFor, emp, review } from './test-fixtures'

const CYCLE = '2025 Annual'
const DATE = '2025-12-15'

describe('computeNineBox', () => {
  const employees = [
    emp('A'),
    emp('B'),
    emp('C'),
    emp('D'),
    emp('E'),
    emp('F'),
    emp('G', { terminationDate: '2026-04-01', terminationType: 'Voluntary' }),
    emp('X', { employmentType: 'Contractor' }),
  ]
  const reviews = [
    review('A', CYCLE, DATE, 5, { potential: 'High' }),
    review('B', CYCLE, DATE, 4, { potential: 'High' }),
    review('C', CYCLE, DATE, 3, { potential: 'Moderate' }),
    review('D', CYCLE, DATE, 2, { potential: 'Low' }),
    review('E', CYCLE, DATE, 1, { potential: 'Moderate' }),
    // No potential: not placed.
    review('F', CYCLE, DATE, 3),
    // Left since the cycle: not placed.
    review('G', CYCLE, DATE, 5, { potential: 'High' }),
    review('X', CYCLE, DATE, 4, { potential: 'High' }),
  ]
  const r = computeNineBox(
    buildBase(ctxFor({ employees, reviews })),
    new Map([['A', { employeeId: 'A', score: 80, band: 'High' as const, factors: [] }]]),
  )
  const cell = (perf: 'Low' | 'Moderate' | 'High', pot: 'Low' | 'Moderate' | 'High') =>
    r.cells.find((c) => c.performance === perf && c.potential === pot)!

  it('places active employees by rating band and potential', () => {
    expect(r.cycle?.cycle).toBe(CYCLE)
    expect(r.cells).toHaveLength(9)
    expect(r.placed).toBe(5)
    expect(r.notPlaced).toBe(1)
    expect(cell('High', 'High').count).toBe(2)
    expect(cell('Moderate', 'Moderate').count).toBe(1)
    expect(cell('Low', 'Low').count).toBe(1)
    expect(cell('Low', 'Moderate').count).toBe(1)
    expect(cell('High', 'High').share).toBeCloseTo(0.4, 9)
    expect(cell('High', 'High').label).toBe('High performance, high potential')
  })

  it('carries flight risk into the people list', () => {
    expect(cell('High', 'High').highRisk).toBe(1)
    expect(cell('High', 'High').people.map((p) => [p.employeeId, p.riskBand])).toEqual([
      ['A', 'High'],
      ['B', null],
    ])
    expect(cellKey('High', 'High')).toBe('High|High')
  })

  it('hides shares when fewer than 5 people are placed', () => {
    const small = computeNineBox(buildBase(ctxFor({ employees: employees.slice(0, 2), reviews })), new Map())
    expect(small.placed).toBe(2)
    expect(small.cells.every((c) => c.share === null)).toBe(true)
  })

  it('places nobody without potential ratings', () => {
    const none = computeNineBox(
      buildBase(ctxFor({ employees, reviews: reviews.map((x) => ({ ...x, potential: null })) })),
      new Map(),
    )
    expect(none.cycle).toBeNull()
    expect(none.placed).toBe(0)
  })
})
