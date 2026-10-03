import { describe, expect, it } from 'vitest'
import type { Employee, Review } from '@/data/schema'
import { buildBase } from './base'
import { computePerformance, HIGH_GUIDELINE } from './performance'
import { ctxFor, emp, review } from './test-fixtures'

const MID = '2026 Mid-year'
const MID_DATE = '2026-06-30'

/** 20 people in "Go" (60% rated 4-5) and 20 in "Core" (30%), where calibration lowered Core by 0.5. */
function fixture() {
  const employees: Employee[] = [
    ...Array.from({ length: 20 }, (_, i) => emp(`G${i}`, { businessUnit: 'Go', department: 'Sales' })),
    ...Array.from({ length: 20 }, (_, i) => emp(`C${i}`, { businessUnit: 'Core', department: 'Design' })),
  ]
  const goRatings = [...Array(10).fill(4), ...Array(2).fill(5), ...Array(8).fill(3)]
  const coreRatings = [1, 2, 2, ...Array(11).fill(3), ...Array(4).fill(4), 5, 5]
  const reviews: Review[] = [
    ...goRatings.map((r, i) => review(`G${i}`, MID, MID_DATE, r, { preCalibrationRating: r })),
    // Calibration moved the first 10 Core proposals down by one.
    ...coreRatings.map((r, i) =>
      review(`C${i}`, MID, MID_DATE, r, { preCalibrationRating: i < 10 ? r + 1 : r }),
    ),
    // An earlier cycle: Go rated 4-5 for half its people.
    ...goRatings.map((_, i) => review(`G${i}`, '2025 Annual', '2025-12-15', i < 10 ? 4 : 3)),
  ]
  return { employees, reviews }
}

describe('computePerformance', () => {
  const { employees, reviews } = fixture()
  const perf = computePerformance(buildBase(ctxFor({ employees, reviews })))

  it('compares the latest cycle with the guideline', () => {
    expect(perf.cycle?.cycle).toBe(MID)
    expect(perf.rated).toBe(40)
    const share = Object.fromEntries(perf.distribution.map((d) => [d.rating, d.share]))
    expect(share[1]).toBeCloseTo(1 / 40, 9)
    expect(share[2]).toBeCloseTo(2 / 40, 9)
    expect(share[3]).toBeCloseTo(19 / 40, 9)
    expect(share[4]).toBeCloseTo(14 / 40, 9)
    expect(share[5]).toBeCloseTo(4 / 40, 9)
    expect(perf.distribution[3].gap).toBeCloseTo(14 / 40 - 0.25, 9)
    expect(perf.highShare).toBeCloseTo(18 / 40, 9)
    expect(perf.coverage).toBe(1)
  })

  it('flags a business unit more than 8 pts above the guideline', () => {
    expect(perf.inflation).toHaveLength(1)
    const f = perf.inflation[0]
    expect(f.businessUnit).toBe('Go')
    expect(f.share).toBeCloseTo(0.6, 9)
    expect(f.share - HIGH_GUIDELINE).toBeGreaterThan(0.08)
    expect(f.rest).toBeCloseTo(0.3, 9)
    expect(f.history).toEqual([{ cycle: '2025 Annual', share: 0.5 }])
    expect(perf.outlierUnit).toBe('Go')
    expect(perf.outlierWhy).toBe('inflation')
  })

  it('measures the calibration shift as proposed minus final', () => {
    const core = perf.calibration.find((c) => c.businessUnit === 'Core')!
    expect(core.shift).toBeCloseTo(0.5, 9)
    expect(core.movedDown).toBeCloseTo(0.5, 9)
    expect(core.movedUp).toBe(0)
    expect(perf.calibration.find((c) => c.businessUnit === 'Go')?.shift).toBe(0)
    expect(perf.calibrationFlags.map((c) => c.row.businessUnit)).toEqual(['Core'])
    expect(perf.calibrationFlags[0].rest.shift).toBe(0)
  })

  it('builds the rating mix per business unit', () => {
    const go = perf.mix.find((m) => m.businessUnit === 'Go')!
    expect(go.r4).toBeCloseTo(0.5, 9)
    expect(go.r5).toBeCloseTo(0.1, 9)
    expect(go.r1).toBe(0)
  })

  it('hides groups under 5 people', () => {
    const small = computePerformance(
      buildBase(
        ctxFor({
          employees: [
            ...employees,
            ...Array.from({ length: 3 }, (_, i) => emp(`S${i}`, { businessUnit: 'Tiny' })),
          ],
          reviews: [...reviews, ...[4, 5, 4].map((r, i) => review(`S${i}`, MID, MID_DATE, r))],
        }),
      ),
    )
    const tiny = small.byBusinessUnit.find((g) => g.group === 'Tiny')!
    expect(tiny.rated).toBe(3)
    expect(tiny.share).toBeNull()
    expect(small.mix.find((m) => m.businessUnit === 'Tiny')?.r4).toBeNull()
  })

  it('measures exits within 12 months of the latest cycle with a full year of follow-up', () => {
    const people = [...Array.from({ length: 10 }, (_, i) => emp(`E${i}`, { hireDate: '2019-01-07' }))]
    people[0] = { ...people[0], terminationDate: '2025-10-01', terminationType: 'Involuntary' }
    people[1] = { ...people[1], terminationDate: '2025-11-03', terminationType: 'Involuntary' }
    people[2] = { ...people[2], terminationDate: '2026-01-05', terminationType: 'Involuntary' }
    people[3] = { ...people[3], terminationDate: '2026-01-15', terminationType: 'Voluntary' }
    // Leaves after the 12-month follow-up ends on 30 Jun 2026: not counted.
    people[4] = { ...people[4], terminationDate: '2026-08-03', terminationType: 'Voluntary' }
    const r = computePerformance(
      buildBase(
        ctxFor({
          employees: people,
          reviews: [
            ...people.map((p) => review(p.employeeId, '2025 Mid-year', '2025-06-30', 2)),
            ...people.slice(5).map((p) => review(p.employeeId, MID, MID_DATE, 3)),
          ],
        }),
      ),
    )
    expect(r.exitCycle?.cycle).toBe('2025 Mid-year')
    const two = r.exitByRating.find((x) => x.rating.startsWith('2'))!
    expect(two.rated).toBe(10)
    expect(two.voluntary).toBe(1)
    expect(two.involuntary).toBe(3)
    expect(two.voluntaryRate).toBeCloseTo(0.1, 9)
    expect(two.involuntaryRate).toBeCloseTo(0.3, 9)
    expect(r.exitByRating.find((x) => x.rating.startsWith('5'))?.rate).toBeNull()
  })

  it('returns nulls, not zeros, without reviews', () => {
    const r = computePerformance(buildBase(ctxFor({ employees })))
    expect(r.cycle).toBeNull()
    expect(r.rated).toBe(0)
    expect(r.highShare).toBeNull()
    expect(r.distribution.every((d) => d.share === null)).toBe(true)
    expect(r.inflation).toEqual([])
    expect(r.calibrationCompany).toBeNull()
    expect(r.exitByRating).toEqual([])
  })

  it('uses the as-of date to pick the latest cycle', () => {
    const r = computePerformance(buildBase(ctxFor({ employees, reviews }, { asOf: '2026-01-31' })))
    expect(r.cycle?.cycle).toBe('2025 Annual')
    expect(r.rated).toBe(20)
  })
})
