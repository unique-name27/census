import { describe, expect, it } from 'vitest'
import type { JobChange, Review } from '@/data/schema'
import { buildBase } from './base'
import { computeOverdue } from './promotion'
import { ctxFor, emp, review } from './test-fixtures'

const annual = (id: string, r1: number, r2: number): Review[] => [
  review(id, '2024 Annual', '2024-12-15', r1, { potential: 'Moderate' }),
  review(id, '2025 Annual', '2025-12-15', r2, { potential: 'Moderate' }),
  review(id, '2026 Mid-year', '2026-06-30', r2),
]

const employees = [
  emp('A', { level: 'L4', hireDate: '2019-01-07', department: 'Verification' }),
  emp('B', { level: 'L4', hireDate: '2019-01-07', department: 'Verification' }),
  emp('C', { level: 'L4', hireDate: '2019-01-07', department: 'Verification' }),
  emp('D', { level: 'E1', hireDate: '2015-01-05', department: 'Verification' }),
  emp('E', { level: 'L3', hireDate: '2024-01-08', department: 'Verification' }),
  emp('F', { level: 'L5', hireDate: '2018-01-08', department: 'Architecture' }),
]
const reviews = [
  ...annual('A', 4, 5),
  ...annual('B', 4, 4),
  ...annual('C', 4, 3),
  ...annual('D', 5, 5),
  ...annual('E', 5, 5),
  ...annual('F', 5, 5),
]
const jobChanges: JobChange[] = [
  // Inside the last 36 months: not overdue.
  { employeeId: 'B', effectiveDate: '2024-03-01', changeType: 'Promotion', fromLevel: 'L3', toLevel: 'L4' },
  // Before the cutoff (30 Sep 2023): still overdue.
  { employeeId: 'F', effectiveDate: '2023-03-01', changeType: 'Promotion', fromLevel: 'L4', toLevel: 'L5' },
]

describe('computeOverdue', () => {
  it('lists consistent high performers with no promotion in 36 months', () => {
    const r = computeOverdue(buildBase(ctxFor({ employees, reviews, jobChanges })), new Map())
    expect(r.available).toBe(true)
    expect(r.cycles.map((c) => c.cycle)).toEqual(['2024 Annual', '2025 Annual'])
    expect(r.rows.map((x) => x.employeeId)).toEqual(['F', 'A'])
    expect(r.rows.find((x) => x.employeeId === 'F')?.lastPromotion).toBe('2023-03-01')
    expect(r.rows.find((x) => x.employeeId === 'A')?.lastPromotion).toBeNull()
    expect(r.rows.find((x) => x.employeeId === 'A')?.ratings).toBe('4, 5')
    // Executives and people under 3 years are not eligible.
    expect(r.eligible).toBe(4)
  })

  it('is unavailable without job changes rather than calling everyone overdue', () => {
    const r = computeOverdue(buildBase(ctxFor({ employees, reviews })), new Map())
    expect(r.available).toBe(false)
    expect(r.rows).toEqual([])
    expect(r.reason).toBe('Upload Job changes to see promotion history.')
  })

  it('needs two review cycles', () => {
    const r = computeOverdue(
      buildBase(ctxFor({ employees, reviews: reviews.filter((x) => x.cycle === '2025 Annual'), jobChanges })),
      new Map(),
    )
    expect(r.available).toBe(false)
  })
})
