import { describe, expect, it } from 'vitest'
import { jobsBelowMarket, marketBy, marketByLevel, marketLowest, marketTotal } from './market'
import { buildPopulation } from './population'
import { AS_OF, dataset, team } from './test-fixtures'

function people(...ts: ReturnType<typeof team>[]) {
  return buildPopulation(
    dataset({ employees: ts.flatMap((t) => t.employees), comp: ts.flatMap((t) => t.comp) }),
    AS_OF,
  ).people
}

describe('market position', () => {
  it('takes the median of base ÷ market median per job family, falling back to department', () => {
    const analog = team(5, { department: 'Analog & Mixed-Signal' }, () => ({ marketP50: 110_000 }))
    const dv = team(5, { jobFamily: 'Verification' })
    const rows = marketBy(people(analog, dv), (p) => p.jobFamily)
    const a = rows.find((r) => r.group === 'Analog & Mixed-Signal')!
    expect(a.median).toBeCloseTo(100 / 110)
    expect(a.gap).toBeCloseTo(100 / 110 - 1)
    expect(a.marketVsMid).toBeCloseTo(1.1)
    expect(rows.find((r) => r.group === 'Verification')!.median).toBeCloseTo(1)
  })

  it('is null without market medians, never 0', () => {
    const t = team(5, {}, () => ({ marketP50: null }))
    expect(marketTotal(people(t)).median).toBeNull()
    expect(marketBy(people(t), (p) => p.location)).toEqual([])
  })

  it('orders levels and ranks the jobs furthest below market', () => {
    const l5 = team(5, { level: 'L5', jobFamily: 'Analog' }, () => ({ marketP50: 125_000 }))
    const l2 = team(5, { level: 'L2', jobFamily: 'Analog' }, () => ({ marketP50: 105_000 }))
    const above = team(5, { level: 'L3', jobFamily: 'Software' }, () => ({ marketP50: 95_000 }))
    const ps = people(l5, l2, above)
    expect(marketByLevel(ps).map((r) => r.group)).toEqual(['L2', 'L3', 'L5'])
    const jobs = jobsBelowMarket(ps)
    expect(jobs.map((j) => j.group)).toEqual(['Analog · L5', 'Analog · L2'])
    expect(jobs[0].median).toBeCloseTo(0.8)
  })

  it('keeps the families furthest below market and folds the rest from their people', () => {
    const a = team(5, { jobFamily: 'A' }, () => ({ marketP50: 125_000 }))
    const b = team(5, { jobFamily: 'B' }, () => ({ marketP50: 110_000 }))
    const c = team(3, { jobFamily: 'C' }, () => ({ marketP50: 100_000 }))
    const d = team(3, { jobFamily: 'D' }, () => ({ marketP50: 80_000 }))
    const rows = marketLowest(people(a, b, c, d), (p) => p.jobFamily, 1, 5)
    expect(rows.map((r) => r.group)).toEqual(['A', 'Other (3)'])
    expect(rows[1].n).toBe(11)
    expect(rows[1].median).toBeCloseTo(1)
    expect(marketLowest(people(a, b), (p) => p.jobFamily, 1, 5).map((r) => r.group)).toEqual(['A', 'B'])
  })

  it('never ranks a family under 10 people, however far below market it is', () => {
    const tiny = team(7, { jobFamily: 'EDA' }, () => ({ marketP50: 125_000 }))
    const big = team(12, { jobFamily: 'Analog' }, () => ({ marketP50: 110_000 }))
    const mid = team(10, { jobFamily: 'Software' }, () => ({ marketP50: 100_000 }))
    const rows = marketLowest(people(tiny, big, mid), (p) => p.jobFamily, 15)
    expect(rows.map((r) => r.group)).toEqual(['Analog', 'Software', 'Other (1)'])
    const top1 = marketLowest(people(tiny, big, mid), (p) => p.jobFamily, 1)
    expect(top1.map((r) => r.group)).toEqual(['Analog', 'Other (2)'])
    expect(top1[1].n).toBe(17)
  })
})
