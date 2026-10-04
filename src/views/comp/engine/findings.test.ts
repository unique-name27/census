import { describe, expect, it } from 'vitest'
import type { CompRecord, Employee } from '@/data/schema'
import { exclusivePhrase, isLowCompa, tenureFloor } from './findings'
import { computeComp } from './model'
import { buildPopulation } from './population'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, context, dataset, emp, promotion, review, team } from './test-fixtures'
import { joinAnd, levelSpan, pts2 } from './text'

function merge(...ts: { employees: Employee[]; comp: CompRecord[] }[]) {
  return { employees: ts.flatMap((t) => t.employees), comp: ts.flatMap((t) => t.comp) }
}

describe('compensation findings', () => {
  it('returns nothing for empty data and keeps every KPI finite or null', () => {
    const m = computeComp(context(dataset({})), DEFAULT_SETTINGS)
    expect(m.findings).toEqual([])
    for (const k of [...m.kpis, ...m.cycle.kpis])
      expect(k.value === null || Number.isFinite(k.value)).toBe(true)
    expect(m.kpis.find((k) => k.id === 'merit-spend')!.value).toBeNull()
  })

  it('links a low-paid location to its voluntary attrition', () => {
    const sj = team(20, { location: 'San Jose' })
    const blr = team(10, { location: 'Bengaluru' }, () => ({ compa: 0.85 }))
    const leavers = Array.from({ length: 3 }, () =>
      emp({
        location: 'Bengaluru',
        terminationDate: '2026-05-15',
        terminationType: 'Voluntary',
        terminationReason: 'Base salary',
      }),
    )
    const data = dataset({ ...merge(sj, blr), employees: [...sj.employees, ...blr.employees, ...leavers] })
    const m = computeComp(context(data), DEFAULT_SETTINGS)
    const f = m.findings.find((x) => x.id === 'comp-low-compa-location-Bengaluru')!
    expect(f.title).toBe('Median compa-ratio in Bengaluru is 0.85 vs 1.00 for the rest of the company')
    expect(f.detail).toMatch(
      /^Voluntary attrition there is \d+\.\d% vs \d+\.\d% for the company over the last 12 months, and 3 of 3 leavers named pay as the reason\./,
    )
    expect(f.severity).toBe('critical')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(f.tab).toBe('ranges')
    expect(f.people).toHaveLength(10)
  })

  it('skips a low-paid department that a flagged location already explains', () => {
    const sj = team(20, { location: 'San Jose', department: 'Hardware Engineering' })
    const itBlr = team(8, { location: 'Bengaluru', department: 'IT' }, () => ({ compa: 0.85 }))
    const itSj = team(5, { location: 'San Jose', department: 'IT' })
    const sw = team(6, { location: 'San Jose', department: 'Software' }, () => ({ compa: 0.9 }))
    const m = computeComp(context(dataset(merge(sj, itBlr, itSj, sw))), DEFAULT_SETTINGS)
    const ids = m.findings.map((f) => f.id)
    expect(ids).toContain('comp-low-compa-location-Bengaluru')
    expect(ids).toContain('comp-low-compa-department-Software')
    expect(ids).not.toContain('comp-low-compa-department-IT')
  })

  it('flags at the precision people read', () => {
    expect(isLowCompa(0.9249)).toBe(true)
    expect(isLowCompa(0.925)).toBe(false)
    expect(isLowCompa(null)).toBe(false)
  })

  it('names amounts only when pay amounts are on', () => {
    const t = team(20, {}, (_, i) => ({ compa: i < 3 ? 0.7 : 1 }))
    const data = dataset(merge(t))
    const hidden = computeComp(context(data), DEFAULT_SETTINGS)
    const shown = computeComp(context(data, { showPay: true }), DEFAULT_SETTINGS)
    const text = (fs: typeof hidden.findings) => fs.map((f) => `${f.title} ${f.detail ?? ''}`).join(' ')
    expect(text(hidden.findings)).not.toMatch(/\$/)
    expect(text(shown.findings)).toMatch(/Bringing them to minimum costs \$30K a year/)
    const below = shown.findings.find((f) => f.id === 'comp-below-min')!
    expect(below.title).toBe('3 people are paid below range minimum, 15.0% of 20')
  })

  it('flags business units over the merit budget with the gap in points', () => {
    const over = team(6, { businessUnit: 'Go-to-Market' }, () => ({ meritPct: 0.045 }))
    const ok = team(6, { businessUnit: 'Operations' }, () => ({ meritPct: 0.034 }))
    const m = computeComp(context(dataset(merge(over, ok))), DEFAULT_SETTINGS)
    const f = m.findings.find((x) => x.id === 'comp-over-budget-Go-to-Market')!
    expect(f.title).toBe(
      'Go-to-Market merit proposals cost 4.50% of eligible base, 1.00 pts over the 3.50% budget',
    )
    expect(f.severity).toBe('critical')
    expect(f.filter).toEqual({ businessUnit: ['Go-to-Market'] })
    expect(m.findings.some((x) => x.id === 'comp-over-budget-Operations')).toBe(false)
  })

  it('judges overspend by one rule for a business unit and a whole scope', () => {
    const bu = team(6, { businessUnit: 'Go-to-Market' }, () => ({ meritPct: 0.0431 }))
    const ok = team(6, { businessUnit: 'Operations' }, () => ({ meritPct: 0.034 }))
    const m = computeComp(context(dataset(merge(bu, ok))), DEFAULT_SETTINGS)
    expect(m.findings.find((x) => x.id === 'comp-over-budget-Go-to-Market')!.severity).toBe('warning')
    // A whole scope 0.46 pts over is the same kind of problem as a unit 0.81 pts over: a warning.
    const e1 = team(12, { level: 'E1' }, () => ({ meritPct: 0.0396 }))
    const scope = computeComp(context(dataset(merge(e1))), DEFAULT_SETTINGS)
    const total = scope.findings.find((x) => x.id === 'comp-over-budget-total')!
    expect(total.severity).toBe('warning')
    expect(total.title).toBe('Merit proposals cost 3.96% of eligible base, 0.46 pts over the 3.50% budget')
  })

  it('needs 10 people on each side before compression reaches the readout', () => {
    const hires = team(6, { hireDate: '2026-02-02' }, () => ({ compa: 1.1 }))
    const inc = team(6, {}, () => ({ compa: 0.95 }))
    const m = computeComp(context(dataset(merge(hires, inc))), DEFAULT_SETTINGS)
    expect(m.ranges.compression[0].flagged).toBe(true)
    expect(m.findings.some((f) => f.id.startsWith('comp-compression'))).toBe(false)
  })

  it('keeps the copy rules: no em dashes, no exclamation marks, sentence-length titles', () => {
    const t = team(20, {}, (_, i) => ({ compa: i < 3 ? 0.7 : i > 16 ? 1.3 : 1, meritPct: 0.05 }))
    const m = computeComp(context(dataset(merge(t)), { showPay: true }), DEFAULT_SETTINGS)
    expect(m.findings.length).toBeGreaterThan(0)
    for (const f of m.findings) {
      const all = [f.title, f.detail ?? '', f.action ?? ''].join(' ')
      expect(all).not.toMatch(/—|!/)
      expect(f.title).not.toMatch(/\.$/)
      expect(f.action).toMatch(/\.$/)
    }
  })

  it('lists everyone a count names, so the people list matches the title', () => {
    const t = team(80, {}, (_, i) => ({ compa: i < 60 ? 0.7 : 1 }))
    const m = computeComp(context(dataset(merge(t))), DEFAULT_SETTINGS)
    const below = m.findings.find((f) => f.id === 'comp-below-min')!
    expect(below.title).toMatch(/^60 people are paid below range minimum/)
    expect(below.people).toHaveLength(60)
  })

  it('formats the helpers used in findings', () => {
    expect(pts2(0.0081)).toBe('+0.81 pts')
    expect(pts2(-0.0004)).toBe('−0.04 pts')
    expect(pts2(0.00004)).toBe('0.00 pts')
    expect(pts2(null)).toBe('—')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
    expect(levelSpan(['L4', 'L3'])).toBe('L3-L4')
    expect(levelSpan(['L3', 'L5'])).toBe('L3 and L5')
    expect(tenureFloor([4.7, 5.8, 6, 6.2, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7])).toBe(5.5)
    expect(tenureFloor([])).toBe(0)
  })

  it('uses the settings it is given', () => {
    const t = team(10, {}, () => ({ compa: 0.93 }))
    const narrow = computeComp(context(dataset(merge(t))), { ...DEFAULT_SETTINGS, bandLow: 0.95 })
    const wide = computeComp(context(dataset(merge(t))), DEFAULT_SETTINGS)
    expect(narrow.kpis.find((k) => k.id === 'in-band')!.value).toBe(0)
    expect(wide.kpis.find((k) => k.id === 'in-band')!.value).toBe(1)
    const budget = computeComp(context(dataset(merge(t))), { ...DEFAULT_SETTINGS, meritBudget: 0.02 })
    expect(budget.cycle.spend.delta).toBeCloseTo(0.01)
  })
})

describe('compensation with a filter', () => {
  it('compares the scope with the company', () => {
    const sj = team(10, { location: 'San Jose', department: 'Software' })
    const blr = team(10, { location: 'Bengaluru', department: 'Software' }, () => ({ compa: 0.85 }))
    const data = dataset(merge(sj, blr))
    const m = computeComp(context(data, { filters: { location: ['Bengaluru'] } }), DEFAULT_SETTINGS)
    const k = m.kpis.find((x) => x.id === 'median-compa')!
    expect(k.value).toBeCloseTo(0.85)
    expect(k.deltaLabel).toBe('vs company')
    expect(k.delta).toBeCloseTo(0.85 - 0.925)
    expect(m.overview.companyMedian).toBeCloseTo(0.925)
  })
})

describe('the anonymity floor in small scopes', () => {
  // One person: Department DFT and level M2 in the sample. Their merit and rating must not leak.
  const one = () => {
    const e = emp({ department: 'DFT', level: 'M2' })
    const others = team(10, { department: 'Software' }, () => ({ meritPct: 0.03 }))
    const data = dataset({
      employees: [e, ...others.employees],
      comp: [
        {
          employeeId: e.employeeId,
          currency: 'USD',
          baseSalary: 70_000,
          rangeMin: 80_000,
          rangeMid: 100_000,
          rangeMax: 120_000,
          fxToUsd: 1,
          meritPct: 0.058,
        },
        ...others.comp,
      ],
      reviews: [review(e, 5)],
    })
    return computeComp(context(data, { filters: { department: ['DFT'] } }), DEFAULT_SETTINGS)
  }

  it('hides merit spend and spend at guideline on both KPI strips under 5 people', () => {
    const m = one()
    const tiles = [...m.kpis, ...m.cycle.kpis]
    for (const id of ['merit-spend', 'spend', 'guideline-spend']) {
      const k = tiles.find((x) => x.id === id)!
      expect(k.suppressed, id).toBe(true)
      expect(k.value, id).toBeNull()
      expect(k.delta ?? null, id).toBeNull()
      expect(k.note ?? '', id).not.toMatch(/5\.80|6\.00|5\.8%|6\.0%/)
    }
    // Counts stay: they are not rates.
    expect(m.cycle.kpis.find((x) => x.id === 'eligible')!.value).toBe(1)
    expect(m.cycle.spend.meanMerit).toBeNull()
    expect(m.cycle.spend.guidelinePct).toBeNull()
  })

  it('gives a count without a share when fewer than 5 people are placed in a range', () => {
    const m = one()
    const f = m.findings.find((x) => x.id === 'comp-below-min')!
    expect(f.title).toBe('1 person is paid below range minimum')
    expect(f.severity).toBe('info')
    expect(m.findings.some((x) => x.id === 'comp-over-budget-total')).toBe(false)
    const text = m.findings.map((x) => `${x.title} ${x.detail ?? ''}`).join(' ')
    expect(text).not.toMatch(/% of \d/)
  })
})

describe('where below-minimum pay sits', () => {
  it('splits overlapping segments into counts that add up', () => {
    const blrPromoted = team(13, { location: 'Bengaluru' }, () => ({ compa: 0.7 }))
    const blr = team(28, { location: 'Bengaluru' }, () => ({ compa: 0.7 }))
    const promotedElsewhere = team(35, { location: 'San Jose' }, () => ({ compa: 0.7 }))
    const rest = team(2, { location: 'San Jose' }, () => ({ compa: 0.7 }))
    const all = [blrPromoted, blr, promotedElsewhere, rest]
    const employees = all.flatMap((t) => t.employees)
    const people = buildPopulation(
      dataset({
        employees,
        comp: all.flatMap((t) => t.comp),
        jobChanges: [...blrPromoted.employees, ...promotedElsewhere.employees].map((e) =>
          promotion(e, '2026-06-01'),
        ),
      }),
      AS_OF,
    ).people
    const loc = { dim: 'location', value: 'Bengaluru', get: (p: (typeof people)[number]) => p.location }
    const promo = {
      dim: 'promoted',
      value: 'Yes',
      get: (p: (typeof people)[number]) => (p.promotedRecently ? 'Yes' : 'No'),
    }
    expect(exclusivePhrase(people, loc, promo)).toBe(
      '41 are in Bengaluru, and 35 of the other 37 were promoted in the last 12 months.',
    )
    expect(exclusivePhrase(people, loc)).toBe('41 are in Bengaluru.')
    expect(exclusivePhrase(people.slice(0, 76), loc, promo)).toBe(
      '41 are in Bengaluru, and the other 35 were promoted in the last 12 months.',
    )
  })

  it('leads with the location and only talks about promotions when they explain it', () => {
    const blr = team(12, { location: 'Bengaluru' }, () => ({ compa: 0.7 }))
    const sj = team(30, { location: 'San Jose' })
    const m = computeComp(context(dataset(merge(blr, sj))), DEFAULT_SETTINGS)
    const f = m.findings.find((x) => x.id === 'comp-below-min')!
    expect(f.detail).toBe('12 are in Bengaluru.')
    expect(f.filter).toEqual({ location: ['Bengaluru'] })
    expect(f.action).toBe(
      'Plan adjustments to range minimum into the focal cycle, starting with the largest gaps.',
    )
  })
})
