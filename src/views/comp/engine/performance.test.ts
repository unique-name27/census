import { describe, expect, it } from 'vitest'
import type { CompRecord, Employee, Review } from '@/data/schema'
import {
  bonusByRating,
  compaByRating,
  differentiation,
  differentiationBy,
  equityByRating,
  meritByRating,
  meritMatrix,
} from './performance'
import { buildPopulation } from './population'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, comp, dataset, emp, review } from './test-fixtures'

/** n people rated `rating` with merit `merit`, plus their reviews. */
function rated(
  n: number,
  rating: number,
  merit: number | null,
  e: Partial<Employee> = {},
  c: Partial<CompRecord> & { compa?: number } = {},
) {
  const employees = Array.from({ length: n }, () => emp(e))
  return {
    employees,
    comp: employees.map((x) => comp(x, { meritPct: merit, ...c })),
    reviews: employees.map((x) => review(x, rating)) as Review[],
  }
}

function pop(...groups: ReturnType<typeof rated>[]) {
  return buildPopulation(
    dataset({
      employees: groups.flatMap((g) => g.employees),
      comp: groups.flatMap((g) => g.comp),
      reviews: groups.flatMap((g) => g.reviews),
    }),
    AS_OF,
  ).people
}

describe('pay for performance', () => {
  it('divides mean merit of ratings 4-5 by mean merit of rating 3', () => {
    const people = pop(rated(3, 5, 0.06), rated(3, 4, 0.045), rated(5, 3, 0.03))
    const d = differentiation(people)
    expect(d.n45).toBe(6)
    expect(d.n3).toBe(5)
    expect(d.merit45).toBeCloseTo(0.0525)
    expect(d.ratio).toBeCloseTo(1.75)
  })

  it('returns null when either side has fewer than 5 people or rating 3 merit is 0', () => {
    expect(differentiation(pop(rated(4, 5, 0.06), rated(5, 3, 0.03))).ratio).toBeNull()
    expect(differentiation(pop(rated(5, 5, 0.06), rated(5, 3, 0))).ratio).toBeNull()
    expect(differentiation([]).ratio).toBeNull()
  })

  it('flags no differentiation per department', () => {
    const fw = { department: 'Firmware' }
    const rows = differentiationBy(pop(rated(5, 4, 0.029, fw), rated(5, 3, 0.029, fw)), (p) => p.department)
    expect(rows[0]).toMatchObject({ group: 'Firmware', n45: 5, n3: 5 })
    expect(rows[0].ratio).toBeCloseTo(1)
  })

  it('compares merit by rating with the guideline and leaves out people without a proposal', () => {
    const rows = meritByRating(pop(rated(5, 5, 0.05), rated(5, 3, 0.03), rated(5, 2, null)), DEFAULT_SETTINGS)
    expect(rows.map((r) => r.rating)).toEqual(['3 Meets', '5 Far exceeds'])
    expect(rows[1].guideline).toBe(0.06)
    expect(rows[1].diff).toBeCloseTo(-0.01)
  })

  it('builds the rating by range position matrix with small cells hidden', () => {
    const low = rated(5, 4, 0.05, {}, { compa: 0.85 })
    const high = rated(2, 4, 0.04, {}, { compa: 1.15 })
    const cells = meritMatrix(pop(low, high), DEFAULT_SETTINGS)
    expect(cells).toHaveLength(2)
    const q1 = cells.find((c) => c.position === 'Q1')!
    expect(q1.n).toBe(5)
    expect(q1.diff).toBeCloseTo(0.005)
    expect(cells.find((c) => c.position === 'Q4')!.mean).toBeNull()
  })

  it('reports compa-ratio, bonus payout and equity share by rating', () => {
    const people = pop(rated(5, 4, 0.045, {}, { compa: 1.05, bonusPayoutPct: 1.1, annualEquityUsd: 21_000 }))
    expect(compaByRating(people)[0]).toMatchObject({ rating: '4 Exceeds', n: 5 })
    expect(compaByRating(people)[0].median).toBeCloseTo(1.05)
    // Bonus follows the latest annual rating; these reviews are mid-year only.
    expect(bonusByRating(people)).toEqual([])
    expect(equityByRating(people)[0].median).toBeCloseTo(0.2)
  })
})
