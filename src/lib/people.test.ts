import { describe, expect, it } from 'vitest'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import type { Employee, Review } from '@/data/schema'
import { periodWindows } from '@/data/scope'
import {
  attrition,
  avgHeadcount,
  buildReviewIndex,
  directReports,
  firstYearAttrition,
  hasExitData,
  headcountAt,
  latestCycle,
  monthPoints,
  NO_EXIT_DATA,
  quarterPoints,
  retention12,
  reviewAt,
  snapshotDates,
  tenureBand,
  tenureYears,
} from './people'

const emp = (id: string, hire: string, extra: Partial<Employee> = {}): Employee => ({
  employeeId: id,
  name: id,
  jobTitle: 'Engineer',
  businessUnit: 'BU',
  department: 'D',
  location: 'San Jose',
  country: 'United States',
  level: 'L3',
  hireDate: hire,
  employmentType: 'Employee',
  ...extra,
})

const ASOF = '2026-09-30'
const W = periodWindows('t12m', ASOF).current

describe('snapshots and headcount', () => {
  it('uses 13 month-end points for a 12-month window', () => {
    const pts = snapshotDates(W)
    expect(pts).toHaveLength(13)
    expect(pts[0]).toBe('2025-09-30')
    expect(pts.at(-1)).toBe('2026-09-30')
    expect(pts[1]).toBe('2025-10-31')
  })

  it('counts the hire day as active and the termination day as not active', () => {
    const e = emp('a', '2026-01-10', { terminationDate: '2026-03-01' })
    expect(headcountAt([e], '2026-01-10')).toBe(1)
    expect(headcountAt([e], '2026-02-28')).toBe(1)
    expect(headcountAt([e], '2026-03-01')).toBe(0)
  })

  it('excludes contractors and interns', () => {
    const rows = [
      emp('a', '2020-01-01'),
      emp('b', '2020-01-01', { employmentType: 'Contractor' }),
      emp('c', '2020-01-01', { employmentType: 'Intern' }),
    ]
    expect(headcountAt(rows, ASOF)).toBe(1)
  })

  it('averages headcount across snapshots', () => {
    // Present for the whole window, plus one person who joins halfway.
    const rows = [emp('a', '2020-01-01'), emp('b', '2026-04-01')]
    const avg = avgHeadcount(rows, W)
    // b is counted at 6 of 13 snapshots (Apr 30 .. Sep 30).
    expect(avg).toBeCloseTo((13 + 6) / 13, 5)
  })
})

describe('attrition', () => {
  const stayers = Array.from({ length: 18 }, (_, i) => emp(`s${i}`, '2019-01-01'))
  const leavers = [
    emp('v1', '2019-01-01', {
      terminationDate: '2026-02-01',
      terminationType: 'Voluntary',
      regrettable: true,
    }),
    emp('v2', '2019-01-01', {
      terminationDate: '2026-05-01',
      terminationType: 'Voluntary',
      regrettable: false,
    }),
    emp('i1', '2019-01-01', { terminationDate: '2025-12-01', terminationType: 'Involuntary' }),
    emp('old', '2019-01-01', { terminationDate: '2025-06-01', terminationType: 'Voluntary' }),
  ]
  const rows = [...stayers, ...leavers]

  it('counts exits in the window over average headcount', () => {
    const r = attrition(rows, W)
    expect(r.events).toBe(3)
    expect(r.rate).toBeCloseTo(3 / r.avgHeadcount, 6)
  })

  it('splits voluntary, involuntary and regretted', () => {
    expect(attrition(rows, W, 'voluntary').events).toBe(2)
    expect(attrition(rows, W, 'involuntary').events).toBe(1)
    expect(attrition(rows, W, 'regretted').events).toBe(1)
  })

  it('returns null, not zero, when termination type is missing everywhere', () => {
    const untyped = rows.map((e) => ({ ...e, terminationType: null }))
    const r = attrition(untyped, W, 'voluntary')
    expect(r.rate).toBeNull()
    expect(r.reason).toMatch(/Termination type/)
    expect(attrition(untyped, W, 'all').rate).not.toBeNull()
  })

  it('annualizes shorter windows', () => {
    const q = periodWindows('t3m', ASOF).current
    const people = [
      ...stayers,
      emp('x', '2019-01-01', { terminationDate: '2026-08-15', terminationType: 'Voluntary' }),
    ]
    const r = attrition(people, q)
    expect(r.events).toBe(1)
    expect(r.rate).toBeCloseTo((1 / r.avgHeadcount) * (12 / q.months), 6)
  })

  it('returns null with no headcount', () => {
    expect(attrition([], W).rate).toBeNull()
  })

  it('returns null, not zero, when the Employees data has no termination dates', () => {
    expect(hasExitData(rows)).toBe(true)
    expect(hasExitData(stayers)).toBe(false)
    for (const kind of ['all', 'voluntary', 'involuntary', 'regretted'] as const) {
      const r = attrition(stayers, W, kind, { exitDataPresent: hasExitData(stayers) })
      expect(r.rate, kind).toBeNull()
      expect(r.events, kind).toBe(0)
      expect(r.reason, kind).toBe('No termination dates in the Employees data')
      expect(r.avgHeadcount, kind).toBe(18)
    }
    expect(NO_EXIT_DATA).toBe('No termination dates in the Employees data')
    // Without the flag a roster of stayers reads as 0%: the caller has to say exits are missing.
    expect(attrition(stayers, W).rate).toBe(0)
  })

  it('ignores the option when exit data is present or not stated', () => {
    const plain = attrition(rows, W, 'voluntary')
    expect(attrition(rows, W, 'voluntary', { exitDataPresent: true })).toEqual(plain)
    expect(attrition(rows, W, 'voluntary', {})).toEqual(plain)
  })
})

describe('cohort measures', () => {
  it('first-year attrition uses the 12-24 month hire cohort', () => {
    const rows = [
      emp('a', '2025-01-15'),
      emp('b', '2025-02-01', { terminationDate: '2025-09-01' }),
      emp('c', '2025-03-01', { terminationDate: '2026-04-01' }), // left after a year: not first-year
      emp('d', '2024-06-01'), // outside cohort
    ]
    const r = firstYearAttrition(rows, ASOF)
    expect(r.cohort).toBe(3)
    expect(r.leavers).toBe(1)
    expect(r.rate).toBeCloseTo(1 / 3)
  })

  it('first-year attrition is null for an empty cohort', () => {
    expect(firstYearAttrition([emp('a', '2020-01-01')], ASOF).rate).toBeNull()
  })

  it('12-month retention', () => {
    const rows = [
      emp('a', '2020-01-01'),
      emp('b', '2020-01-01', { terminationDate: '2026-01-01' }),
      emp('c', '2026-01-01'),
    ]
    const r = retention12(rows, ASOF)
    expect(r.base).toBe(2)
    expect(r.rate).toBe(0.5)
  })
})

describe('tenure', () => {
  it('measures tenure to the exit date for leavers', () => {
    const e = emp('a', '2020-09-30', { terminationDate: '2022-09-30' })
    expect(tenureYears(e, ASOF)).toBeCloseTo(2, 1)
  })
  it('bands tenure', () => {
    expect(tenureBand(0.5)).toBe('Under 1 yr')
    expect(tenureBand(1)).toBe('1-2 yrs')
    expect(tenureBand(4.99)).toBe('2-5 yrs')
    expect(tenureBand(10)).toBe('10+ yrs')
  })
})

describe('reviews', () => {
  const reviews: Review[] = [
    { employeeId: 'a', cycle: '2025 Annual', cycleDate: '2025-12-15', rating: 4 },
    { employeeId: 'a', cycle: '2026 Mid-year', cycleDate: '2026-06-30', rating: 3 },
    { employeeId: 'b', cycle: '2025 Annual', cycleDate: '2025-12-15', rating: 5 },
  ]
  const idx = buildReviewIndex(reviews)
  it('finds the latest review on or before a date', () => {
    expect(reviewAt(idx, 'a', '2026-07-01')?.rating).toBe(3)
    expect(reviewAt(idx, 'a', '2026-01-01')?.rating).toBe(4)
    expect(reviewAt(idx, 'a', '2025-01-01')).toBeNull()
  })
  it('lists cycles in order', () => {
    expect(idx.cycles.map((c) => c.cycle)).toEqual(['2025 Annual', '2026 Mid-year'])
    expect(latestCycle(idx, ASOF)?.cycle).toBe('2026 Mid-year')
  })
})

describe('series points', () => {
  it('quarter and month points end at asOf', () => {
    expect(quarterPoints(ASOF, 4)).toEqual(['2025-12-30', '2026-03-30', '2026-06-30', '2026-09-30'])
    const m = monthPoints(ASOF, 3)
    expect(m).toEqual(['2026-07-31', '2026-08-31', '2026-09-30'])
  })
})

describe('directReports', () => {
  const people = [
    emp('M', '2020-01-01'),
    emp('A', '2021-01-01', { managerId: 'M' }),
    emp('B', '2021-01-01', { managerId: 'M', employmentType: 'Contractor' }),
    emp('C', '2026-06-01', { managerId: 'M', employmentType: 'Intern' }),
    emp('D', '2021-01-01', { managerId: 'M', terminationDate: '2026-03-31' }),
    emp('E', '2021-01-01', { managerId: 'E' }),
    emp('F', '2021-01-01', { managerId: 'A', employmentType: 'Contractor' }),
  ]
  const ids = (m: Map<string, { employeeId: string }[]>, k: string) => m.get(k)?.map((e) => e.employeeId)

  it('counts active employees only by default', () => {
    const r = directReports(people, ASOF)
    expect(ids(r, 'M')).toEqual(['A'])
    expect(r.has('A')).toBe(false)
    expect(r.has('E')).toBe(false)
  })
  it('counts contractors and interns with allWorkers', () => {
    const r = directReports(people, ASOF, { allWorkers: true })
    expect(ids(r, 'M')).toEqual(['A', 'B', 'C'])
    expect(ids(r, 'A')).toEqual(['F'])
    expect(r.has('E')).toBe(false)
    expect(ids(directReports(people, '2026-03-01', { allWorkers: true }), 'M')).toEqual(['A', 'B', 'D'])
  })
  it('matches the planted span outliers in the sample (all worker types)', () => {
    const employees = generateSample().employees
    const spans = directReports(employees, SAMPLE_AS_OF, { allWorkers: true })
    const spanOf = (name: string) => {
      const m = employees.find((e) => e.name === name && !e.terminationDate)
      return m ? (spans.get(m.employeeId)?.length ?? 0) : null
    }
    expect(spanOf('Nisha Iyer')).toBe(12)
    expect(spanOf('Rohan Murthy')).toBe(13)
    expect(spanOf('Wei-Lun Lee')).toBe(14)
    expect(spanOf('Arjun Deshpande')).toBe(9)
  })
})
