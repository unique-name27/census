import { describe, expect, it } from 'vitest'
import {
  binDomain,
  binValues,
  guidelineExceptions,
  meritSpend,
  promotions,
  ratingPeerStats,
  rewardsMix,
  spendBy,
} from './cycle'
import { buildPopulation } from './population'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, comp, dataset, emp, review } from './test-fixtures'

describe('merit cycle', () => {
  it('weights merit spend by base in USD and skips rows without an FX rate', () => {
    const a = emp()
    const b = emp({ location: 'Bengaluru' })
    const c = emp()
    const ineligible = emp()
    const people = buildPopulation(
      dataset({
        employees: [a, b, c, ineligible],
        comp: [
          comp(a, { baseSalary: 100_000, meritPct: 0.04 }),
          comp(b, { currency: 'INR', baseSalary: 5_000_000, fxToUsd: 0.012, meritPct: 0.02 }),
          comp(c, { fxToUsd: null, meritPct: 0.1 }),
          comp(ineligible, { meritPct: null }),
        ],
      }),
      AS_OF,
    ).people
    const s = meritSpend(people, DEFAULT_SETTINGS)
    expect(s.eligible).toBe(3)
    expect(s.priced).toBe(2)
    expect(s.skippedFx).toBe(1)
    expect(s.eligibleBaseUsd).toBeCloseTo(160_000)
    expect(s.spendUsd).toBeCloseTo(4000 + 1200)
    expect(s.spendPct).toBeCloseTo(5200 / 160_000)
    expect(s.delta).toBeCloseTo(5200 / 160_000 - 0.035)
    expect(s.budgetUsd).toBeCloseTo(5600)
  })

  it('prorates the guideline spend by service in the last 12 months', () => {
    const full = emp()
    const half = emp({ hireDate: '2026-04-01' })
    const people = buildPopulation(
      dataset({
        employees: [full, half],
        comp: [comp(full, { meritPct: 0.03 }), comp(half, { meritPct: 0.03 })],
        reviews: [review(full, 5), review(half, 5)],
      }),
      AS_OF,
    ).people
    const s = meritSpend(people, DEFAULT_SETTINGS)
    expect(s.guidelinePct).toBeCloseTo((0.06 + 0.06 * (182 / 365)) / 2)
  })

  it('is null with no proposals rather than 0', () => {
    const a = emp()
    const people = buildPopulation(
      dataset({ employees: [a], comp: [comp(a, { meritPct: null })] }),
      AS_OF,
    ).people
    const s = meritSpend(people, DEFAULT_SETTINGS)
    expect(s.spendPct).toBeNull()
    expect(s.delta).toBeNull()
    expect(spendBy(people, (p) => p.businessUnit, DEFAULT_SETTINGS)).toEqual([])
  })

  it('hides spend for groups under 5 priced people', () => {
    const team = Array.from({ length: 4 }, () => emp({ businessUnit: 'Corporate' }))
    const people = buildPopulation(dataset({ employees: team, comp: team.map((e) => comp(e)) }), AS_OF).people
    const [row] = spendBy(people, (p) => p.businessUnit, DEFAULT_SETTINGS)
    expect(row.n).toBe(4)
    expect(row.spendPct).toBeNull()
  })

  it('flags guideline rule breaks and robust outliers, never promotions', () => {
    const peers = Array.from({ length: 12 }, () => emp())
    const top = emp()
    const low = emp()
    const odd = emp()
    const promoted = emp()
    const employees = [...peers, top, low, odd, promoted]
    const people = buildPopulation(
      dataset({
        employees,
        comp: [
          ...peers.map((e, i) => comp(e, { meritPct: 0.03 + (i % 3) * 0.002 })),
          comp(top, { meritPct: 0.015 }),
          comp(low, { meritPct: 0.035 }),
          comp(odd, { meritPct: 0.07 }),
          comp(promoted, { meritPct: 0.03, promotionPct: 0.12 }),
        ],
        reviews: [
          ...peers.map((e) => review(e, 3)),
          review(top, 5),
          review(low, 2),
          review(odd, 3),
          review(promoted, 3),
        ],
      }),
      AS_OF,
    ).people
    const rows = guidelineExceptions(people, DEFAULT_SETTINGS, ratingPeerStats(people))
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      [top.employeeId, 'top-low'],
      [low.employeeId, 'low-high'],
      [odd.employeeId, 'outlier'],
    ])
    expect(rows[2].rule).toBe('High for the rating')
    expect(rows[2].z).toBeGreaterThan(3.5)
  })

  it('keeps promotions apart from merit', () => {
    const a = emp()
    const b = emp()
    const people = buildPopulation(
      dataset({ employees: [a, b], comp: [comp(a, { meritPct: 0.03, promotionPct: 0.1 }), comp(b)] }),
      AS_OF,
    ).people
    const p = promotions(people)
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0].total).toBeCloseTo(0.13)
    expect(p.share).toBeNull()
  })

  it('splits target total rewards into shares by level', () => {
    const team = Array.from({ length: 5 }, () => emp({ level: 'L5' }))
    const people = buildPopulation(
      dataset({
        employees: team,
        comp: team.map((e) => comp(e, { targetBonusPct: 0.2, annualEquityUsd: 30_000 })),
      }),
      AS_OF,
    ).people
    const [row] = rewardsMix(people, true)
    expect(row.base).toBeCloseTo(100 / 150)
    expect(row.bonus).toBeCloseTo(20 / 150)
    expect(row.equity).toBeCloseTo(30 / 150)
    expect(rewardsMix(people, false)[0].equity).toBeNull()
  })

  it('bins values on a fixed grid with the last edge inclusive', () => {
    expect(binDomain([0.81, 1.19], 0.05)).toEqual([0.8, 1.2])
    expect(binDomain([], 0.05)).toBeNull()
    const bins = binValues([0.8, 0.84, 1.2], 0.8, 1.2, 0.1)
    expect(bins.map((b) => b.n)).toEqual([2, 0, 0, 1])
    expect(bins[0].share).toBeCloseTo(2 / 3)
  })
})
