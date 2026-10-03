import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Employee, JobChange } from '@/data/schema'
import { buildBase } from './base'
import {
  type BackTest,
  backTestSummary,
  bandCuts,
  bandFor,
  buildRiskModel,
  learnPoints,
  type PersonSignals,
  type RiskInput,
  type Signal,
  signalsAt,
  stateAt,
} from './risk'
import { AS_OF, ctxFor, emp, review } from './test-fixtures'

const inputFor = (ctx: AnalyticsContext): RiskInput => {
  const base = buildBase(ctx)
  return {
    employees: ctx.all.employees,
    jobs: base.jobs,
    reviews: base.reviews,
    comp: ctx.all.comp,
    has: base.has,
  }
}

const signalOf = (people: PersonSignals[], id: string, key: Signal['key']) =>
  people.find((p) => p.employeeId === id)?.signals.find((s) => s.key === key)

describe('stateAt', () => {
  const e = emp('E1', { level: 'L4', department: 'Dept B', managerId: 'M2' })
  const jobs = new Map<string, JobChange[]>([
    [
      'E1',
      [
        {
          employeeId: 'E1',
          effectiveDate: '2025-03-01',
          changeType: 'Promotion',
          fromLevel: 'L3',
          toLevel: 'L4',
        },
        {
          employeeId: 'E1',
          effectiveDate: '2026-01-10',
          changeType: 'Transfer',
          fromLevel: 'L4',
          toLevel: 'L4',
          fromDepartment: 'Dept A',
          toDepartment: 'Dept B',
          fromManagerId: 'M1',
          toManagerId: 'M2',
        },
      ],
    ],
  ])
  it('reads level, department and manager back from the job history', () => {
    expect(stateAt(e, jobs, '2024-12-31')).toEqual({ level: 'L3', department: 'Dept A', managerId: 'M1' })
    expect(stateAt(e, jobs, '2025-06-30')).toEqual({ level: 'L4', department: 'Dept A', managerId: 'M1' })
    expect(stateAt(e, jobs, AS_OF)).toEqual({ level: 'L4', department: 'Dept B', managerId: 'M2' })
  })
  it('uses current values when there is no history', () => {
    expect(stateAt(e, new Map(), '2020-01-01')).toEqual({
      level: 'L4',
      department: 'Dept B',
      managerId: 'M2',
    })
  })
})

describe('bands', () => {
  it('puts the top 10% of scores in High and the next 25% in Medium', () => {
    const scores = [0, 0, 0, 0, 0, 10, 10, 20, 30, 40]
    expect(bandCuts(scores)).toEqual({ cutHigh: 40, cutMedium: 10 })
    expect(bandFor(40, 40, 10)).toBe('High')
    expect(bandFor(30, 40, 10)).toBe('Medium')
    expect(bandFor(10, 40, 10)).toBe('Medium')
    expect(bandFor(0, 40, 10)).toBe('Low')
  })
  it('gives ties at a cut the higher band and keeps 0 in Low', () => {
    const scores = [50, 50, 50, 0, 0, 0, 0, 0, 0, 0]
    const { cutHigh, cutMedium } = bandCuts(scores)
    expect(cutHigh).toBe(50)
    expect(scores.filter((s) => bandFor(s, cutHigh, cutMedium) === 'High')).toHaveLength(3)
  })
  it('returns no cuts when nobody scores', () => {
    expect(bandCuts([0, 0, 0])).toEqual({ cutHigh: null, cutMedium: null })
    expect(bandCuts([])).toEqual({ cutHigh: null, cutMedium: null })
    expect(bandFor(5, null, null)).toBe('Low')
  })
})

describe('learnPoints', () => {
  // 200 people: 80 with tenurePeak (24 left), 80 with ratingDrop (4 left), 40 with nothing (2 left).
  const people: PersonSignals[] = Array.from({ length: 200 }, (_, i) => ({
    employeeId: `P${i}`,
    signals:
      i < 80
        ? [{ key: 'tenurePeak', strength: 1, reason: '' }]
        : i < 160
          ? [{ key: 'ratingDrop', strength: 1, reason: '' }]
          : [],
  }))
  const leftIds = new Set([
    ...Array.from({ length: 24 }, (_, i) => `P${i}`),
    ...Array.from({ length: 4 }, (_, i) => `P${80 + i}`),
    'P160',
    'P161',
  ])
  const left = (id: string) => leftIds.has(id)

  it('gives points only to factors that went with more exits', () => {
    const r = learnPoints(people, left, new Set(), { compaOn: false })
    expect(r.learned).toBe(true)
    expect(r.points.tenurePeak).toBe(100)
    expect(r.points.ratingDrop).toBe(0)
    const drop = r.evidence.find((e) => e.key === 'ratingDrop')!
    expect(drop.withFactor).toBe(80)
    expect(drop.withLeft).toBe(4)
    expect(drop.lift).toBeCloseTo(0.05 / (26 / 120), 6)
    const peak = r.evidence.find((e) => e.key === 'tenurePeak')!
    expect(peak.withRate).toBeCloseTo(0.3, 6)
    expect(peak.withoutRate).toBeCloseTo(0.05, 6)
  })
  it('keeps 10 fixed points for the untestable pay factor', () => {
    const r = learnPoints(people, left, new Set(), { compaOn: true })
    expect(r.points.tenurePeak).toBe(90)
    expect(r.points.lowCompa).toBe(10)
    expect(r.evidence.find((e) => e.key === 'lowCompa')?.tested).toBe(false)
  })
  it('falls back to default points with too little history', () => {
    const few = people.slice(0, 50)
    const r = learnPoints(few, left, new Set(), { compaOn: false })
    expect(r.learned).toBe(false)
    // Defaults of the testable factors add up to 90; tenure's 10 scale to 11 of 100.
    expect(r.points.tenurePeak).toBe(11)
    expect(r.points.promotionGap).toBe(17)
  })
  it('skips factors that are switched off', () => {
    const r = learnPoints(people, left, new Set(['tenurePeak']), { compaOn: false })
    expect(r.evidence.some((e) => e.key === 'tenurePeak')).toBe(false)
    expect(r.points.tenurePeak).toBe(0)
  })
})

describe('signalsAt', () => {
  const old = '2018-01-08'
  const employees: Employee[] = [
    // Department with high voluntary attrition: 10 stay, 3 resign in March 2026.
    ...Array.from({ length: 10 }, (_, i) =>
      emp(`X${i}`, { department: 'Analog', hireDate: old, managerId: 'MX' }),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      emp(`XL${i}`, {
        department: 'Analog',
        hireDate: old,
        managerId: 'MX',
        terminationDate: '2026-03-02',
        terminationType: 'Voluntary',
      }),
    ),
    ...Array.from({ length: 30 }, (_, i) => emp(`Y${i}`, { hireDate: old, managerId: 'MY' })),
    emp('T', { hireDate: '2024-09-30', managerId: 'MY' }),
    emp('R', { hireDate: old, managerId: 'MY' }),
    emp('H', { hireDate: '2019-01-07', managerId: 'MY' }),
    emp('P', { hireDate: old, managerId: 'MY' }),
    emp('G', { hireDate: '2022-03-31', managerId: 'MY' }),
    emp('N', { hireDate: old, managerId: 'MZ' }),
    // A small team that lost 2 of 4 people (involuntary, so department attrition is unaffected).
    ...['Q1', 'Q2', 'Q3'].map((id) => emp(id, { hireDate: old, managerId: 'MP' })),
    emp('QL1', {
      hireDate: old,
      managerId: 'MP',
      terminationDate: '2026-02-02',
      terminationType: 'Involuntary',
    }),
    emp('QL2', {
      hireDate: old,
      managerId: 'MP',
      terminationDate: '2026-05-04',
      terminationType: 'Involuntary',
    }),
    emp('C', { hireDate: old, managerId: 'MY' }),
  ]
  const ctx = ctxFor({
    employees,
    reviews: [
      review('R', '2025 Annual', '2025-12-15', 4),
      review('R', '2026 Mid-year', '2026-06-30', 3),
      review('H', '2026 Mid-year', '2026-06-30', 5),
      review('P', '2026 Mid-year', '2026-06-30', 5),
    ],
    jobChanges: [
      {
        employeeId: 'P',
        effectiveDate: '2025-03-01',
        changeType: 'Promotion',
        fromLevel: 'L2',
        toLevel: 'L3',
      },
      {
        employeeId: 'N',
        effectiveDate: '2026-05-01',
        changeType: 'Manager change',
        fromLevel: 'L3',
        toLevel: 'L3',
        fromManagerId: 'MY',
        toManagerId: 'MZ',
      },
    ],
    comp: [
      {
        employeeId: 'C',
        currency: 'USD',
        baseSalary: 85_000,
        rangeMin: 80_000,
        rangeMid: 100_000,
        rangeMax: 120_000,
        fxToUsd: 1,
      },
      {
        employeeId: 'Y0',
        currency: 'USD',
        baseSalary: 100_000,
        rangeMin: 80_000,
        rangeMid: 100_000,
        rangeMax: 120_000,
        fxToUsd: 1,
      },
    ],
  })
  const input = inputFor(ctx)
  const set = signalsAt(input, AS_OF, { useComp: true })

  it('scores only employees active on the date', () => {
    expect(set.people.some((p) => p.employeeId === 'XL0')).toBe(false)
    expect(set.people).toHaveLength(employees.filter((e) => !e.terminationDate).length)
  })
  it('flags tenure between 1 and 3 years with a plain reason', () => {
    expect(signalOf(set.people, 'T', 'tenurePeak')?.reason).toBe(
      '1.9 yrs at the company, within the 1-3 year range',
    )
    expect(signalOf(set.people, 'Y0', 'tenurePeak')).toBeUndefined()
  })
  it('flags a rating drop between the last two reviews', () => {
    expect(signalOf(set.people, 'R', 'ratingDrop')?.reason).toBe('Rating fell from 4 to 3 in 2026 Mid-year')
  })
  it('flags a high rating without promotion in 3 years, not after a recent promotion', () => {
    expect(signalOf(set.people, 'H', 'highNoPromo')?.reason).toBe(
      'Rated 5, not promoted since joining in 2019',
    )
    expect(signalOf(set.people, 'P', 'highNoPromo')).toBeUndefined()
    expect(signalOf(set.people, 'P', 'promotionGap')).toBeUndefined()
  })
  it('scales the promotion gap from half strength at the typical time', () => {
    // L3 falls back to 30 months (fewer than 5 promotions in the data); 54 months is 1.8 times that.
    expect(signalOf(set.people, 'G', 'promotionGap')?.strength).toBeCloseTo(0.9, 2)
    expect(signalOf(set.people, 'G', 'promotionGap')?.reason).toBe(
      '54 months since joining; typical at L3 is 30',
    )
  })
  it('flags a manager change in the last 6 months', () => {
    expect(signalOf(set.people, 'N', 'newManager')?.reason).toBe('New manager since 1 May 2026')
    expect(signalOf(set.people, 'Y0', 'newManager')).toBeUndefined()
  })
  it('flags teams where at least 40% left in 12 months', () => {
    expect(signalOf(set.people, 'Q1', 'peersLeft')?.reason).toBe(
      '2 of 4 people under the same manager left in the last 12 months',
    )
    // 3 of 12 under MX is 25%.
    expect(signalOf(set.people, 'X0', 'peersLeft')).toBeUndefined()
  })
  it('flags departments with voluntary attrition more than 2 pts above the company', () => {
    const s = signalOf(set.people, 'X0', 'deptAttrition')
    expect(s?.strength).toBe(1)
    expect(s?.reason).toMatch(/^Voluntary attrition in Analog is \d+\.\d%, vs \d+\.\d% company-wide$/)
    expect(signalOf(set.people, 'Y0', 'deptAttrition')).toBeUndefined()
  })
  it('flags compa-ratio below 0.90 only for today’s score', () => {
    expect(signalOf(set.people, 'C', 'lowCompa')?.reason).toBe('Compa-ratio 0.85, below 0.90')
    expect(signalOf(set.people, 'Y0', 'lowCompa')).toBeUndefined()
    const past = signalsAt(input, AS_OF, { useComp: false })
    expect(signalOf(past.people, 'C', 'lowCompa')).toBeUndefined()
    expect(past.off.map((o) => o.key)).toContain('lowCompa')
  })
  it('switches factors off when their data is missing, never treating it as 0', () => {
    const bare = signalsAt(
      inputFor(ctxFor({ employees: employees.map((e) => ({ ...e, terminationType: null })) })),
      AS_OF,
      { useComp: true },
    )
    const off = new Map(bare.off.map((o) => [o.key, o.why]))
    expect(off.get('promotionGap')).toBe('Job changes are not loaded')
    expect(off.get('ratingDrop')).toBe('Reviews are not loaded')
    expect(off.get('deptAttrition')).toBe('Termination type is missing')
    expect(off.get('lowCompa')).toBe('Compensation is not loaded')
    expect(bare.companyVoluntary).toBeNull()
    expect(
      bare.people.every((p) => p.signals.every((s) => s.key === 'tenurePeak' || s.key === 'peersLeft')),
    ).toBe(true)
  })
  it('handles an empty roster', () => {
    const empty = signalsAt(inputFor(ctxFor({})), AS_OF, { useComp: true })
    expect(empty.people).toEqual([])
  })
})

describe('buildRiskModel back-test', () => {
  // 150 people in their second year a year ago (60 resign), 150 long-tenured (6 resign).
  const employees: Employee[] = [
    ...Array.from({ length: 150 }, (_, i) =>
      emp(`M${i}`, {
        hireDate: '2023-06-05',
        managerId: 'BOSS',
        ...(i < 60 ? { terminationDate: '2026-03-02', terminationType: 'Voluntary' as const } : {}),
      }),
    ),
    ...Array.from({ length: 150 }, (_, i) =>
      emp(`O${i}`, {
        hireDate: '2015-01-05',
        managerId: 'BOSS',
        ...(i < 6 ? { terminationDate: '2026-03-02', terminationType: 'Voluntary' as const } : {}),
      }),
    ),
  ]
  const model = buildRiskModel(inputFor(ctxFor({ employees })), AS_OF)

  it('learns points from who actually left', () => {
    expect(model.learned).toBe(true)
    expect(model.points.tenurePeak).toBe(100)
    expect(model.points.peersLeft).toBe(0)
  })
  it('reports out-of-sample exit rates per band a year later', () => {
    const bt = model.backTest
    expect(bt.scoredOn).toBe('2025-09-30')
    expect(bt.population).toBe(300)
    expect(bt.leavers).toBe(66)
    const [low, medium, high] = bt.bands
    expect(high.people).toBe(150)
    expect(high.rate).toBeCloseTo(0.4, 6)
    expect(low.rate).toBeCloseTo(0.04, 6)
    expect(medium.people).toBe(0)
    expect(medium.rate).toBeNull()
    expect(bt.lift).toBeCloseTo(10, 6)
  })
  it('scores today with the learned points', () => {
    // Today the remaining 90 second-year hires are past 3 years, so nobody carries the factor.
    expect(model.population).toBe(234)
    expect([...model.scores.values()].every((s) => s.score === 0 && s.band === 'Low')).toBe(true)
  })
})

describe('backTestSummary', () => {
  const bt = (low: number | null, high: number | null, lift: number | null): BackTest => ({
    scoredOn: '2025-09-30',
    outcome: { start: '2025-10-01', end: AS_OF, months: 12, label: '' },
    exitKind: 'voluntary',
    population: 100,
    leavers: 10,
    overallRate: 0.1,
    bands: [
      { band: 'Low', people: 60, leavers: 3, rate: low, shareOfLeavers: null },
      { band: 'Medium', people: 30, leavers: 3, rate: 0.1, shareOfLeavers: null },
      { band: 'High', people: 10, leavers: 4, rate: high, shareOfLeavers: null },
    ],
    lift,
  })
  it('says plainly when the bands separate leavers', () => {
    expect(backTestSummary(bt(0.05, 0.2, 4))).toBe(
      'People placed in the high band a year ago left voluntarily at 4.0× the rate of the low band (20.0% vs 5.0%).',
    )
  })
  it('says when the separation is modest', () => {
    expect(backTestSummary(bt(0.1, 0.13, 1.3))).toMatch(/^The bands separated leavers only modestly/)
  })
  it('says when the model did not work', () => {
    expect(backTestSummary(bt(0.1, 0.09, 0.9))).toBe(
      'The bands did not separate leavers from stayers in this data (9.0% vs 10.0%). Treat scores as a prompt for conversations, not a prediction.',
    )
    expect(backTestSummary(bt(null, null, null))).toBe(
      'There were too few people or exits a year ago to test the bands.',
    )
  })
})
