import { describe, expect, it } from 'vitest'
import { buildPopulation, positionOf } from './population'
import { AS_OF, comp, dataset, emp, promotion, review } from './test-fixtures'

describe('comp population', () => {
  it('keeps active employees with a comp row and derives the ratios', () => {
    const a = emp()
    const leaver = emp({ terminationDate: '2026-06-30' })
    const contractor = emp({ employmentType: 'Contractor' })
    const future = emp({ hireDate: '2026-10-05' })
    const noComp = emp()
    const data = dataset({
      employees: [a, leaver, contractor, future, noComp],
      comp: [comp(a, { compa: 0.9, marketP50: 95_000 }), comp(leaver), comp(contractor), comp(future)],
    })
    const pop = buildPopulation(data, AS_OF)
    expect(pop.people.map((p) => p.id)).toEqual([a.employeeId])
    expect(pop.missingComp).toBe(1)
    const p = pop.people[0]
    expect(p.compa).toBeCloseTo(0.9)
    expect(p.penetration).toBeCloseTo((90_000 - 80_000) / 40_000)
    expect(p.position).toBe('Q2')
    expect(p.marketRatio).toBeCloseTo(90_000 / 95_000)
    expect(p.marketVsMid).toBeCloseTo(0.95)
    expect(p.baseUsd).toBe(90_000)
  })

  it('converts amounts with fxToUsd and leaves them null without a rate', () => {
    const inr = emp({ location: 'Bengaluru' })
    const nofx = emp()
    const data = dataset({
      employees: [inr, nofx],
      comp: [
        comp(inr, {
          currency: 'INR',
          baseSalary: 1_000_000,
          rangeMin: 900_000,
          rangeMid: 1_000_000,
          rangeMax: 1_100_000,
          fxToUsd: 0.012,
        }),
        comp(nofx, { fxToUsd: null }),
      ],
    })
    const pop = buildPopulation(data, AS_OF)
    const [a, b] = pop.people
    expect(a.baseUsd).toBeCloseTo(12_000)
    expect(a.minUsd).toBeCloseTo(10_800)
    expect(a.compa).toBe(1)
    expect(b.baseUsd).toBeNull()
    expect(b.compa).toBe(1)
    expect(pop.noFx).toBe(1)
  })

  it('places base in six positions with min and max inside the range', () => {
    expect(positionOf(79, 80, 120)).toBe('Below minimum')
    expect(positionOf(80, 80, 120)).toBe('Q1')
    expect(positionOf(90, 80, 120)).toBe('Q2')
    expect(positionOf(100, 80, 120)).toBe('Q3')
    expect(positionOf(110, 80, 120)).toBe('Q4')
    expect(positionOf(120, 80, 120)).toBe('Q4')
    expect(positionOf(121, 80, 120)).toBe('Above maximum')
    expect(positionOf(100, null, 120)).toBeNull()
    expect(positionOf(100, 120, 120)).toBeNull()
  })

  it('reads the latest rating at the as-of date and the latest annual rating', () => {
    const a = emp()
    const data = dataset({
      employees: [a],
      comp: [comp(a)],
      reviews: [
        review(a, 4, { cycle: '2025 Annual', cycleDate: '2025-12-15' }),
        review(a, 3, { cycle: '2026 Mid-year', cycleDate: '2026-06-30' }),
        review(a, 5, { cycle: '2026 Annual', cycleDate: '2026-12-15' }),
      ],
    })
    const pop = buildPopulation(data, AS_OF)
    expect(pop.people[0].rating).toBe(3)
    expect(pop.people[0].annualRating).toBe(4)
    expect(pop.latestCycle).toBe('2026 Mid-year')
    expect(pop.annualCycle).toBe('2025 Annual')
  })

  it('flags recent hires, recent promotions and service for proration', () => {
    const hire = emp({ hireDate: '2026-03-30' })
    const promoted = emp()
    const old = emp()
    const data = dataset({
      employees: [hire, promoted, old],
      comp: [comp(hire), comp(promoted), comp(old)],
      jobChanges: [promotion(promoted, '2026-03-01'), promotion(old, '2025-09-01')],
    })
    const [h, p, o] = buildPopulation(data, AS_OF).people
    expect(h.hiredRecently).toBe(true)
    expect(h.service).toBeCloseTo(184 / 365)
    expect(p.promotedRecently).toBe(true)
    expect(o.promotedRecently).toBe(false)
    expect(o.service).toBe(1)
  })

  it('reports missing optional columns instead of zeros', () => {
    const a = emp()
    const data = dataset({
      employees: [a],
      comp: [comp(a, { marketP50: null, meritPct: null, annualEquityUsd: null, bonusPayoutPct: null })],
    })
    const pop = buildPopulation(data, AS_OF)
    expect(pop.has).toMatchObject({
      market: false,
      merit: false,
      equity: false,
      bonusPayout: false,
      reviews: false,
    })
    expect(pop.people[0].marketRatio).toBeNull()
    expect(pop.people[0].merit).toBeNull()
  })

  it('handles empty data', () => {
    const pop = buildPopulation(dataset({}), AS_OF)
    expect(pop.people).toEqual([])
    expect(pop.missingComp).toBe(0)
    expect(pop.latestCycle).toBeNull()
  })
})
