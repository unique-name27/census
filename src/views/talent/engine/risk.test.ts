import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Employee, JobChange } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { buildBase } from './base'
import {
  type BackTest,
  backTestSummary,
  bandCuts,
  bandFor,
  buildRiskModel,
  FACTORS,
  type FactorKey,
  type LearningSample,
  learnPoints,
  monthsBack,
  type PersonSignals,
  type RiskInput,
  roundPoints,
  type Signal,
  type SignalSet,
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
  it('cuts where each band comes closest to its target share (10% high, 35% high or medium)', () => {
    const scores = [0, 0, 0, 0, 0, 10, 10, 20, 30, 40]
    expect(bandCuts(scores)).toEqual({ cutHigh: 40, cutMedium: 20, highShare: 0.1, mediumShare: 0.2 })
    expect(bandFor(40, 40, 20)).toBe('High')
    expect(bandFor(30, 40, 20)).toBe('Medium')
    expect(bandFor(10, 40, 20)).toBe('Low')
    expect(bandFor(0, 40, 20)).toBe('Low')
  })
  it('keeps people with the same score in one band and reports the real share', () => {
    // 5% score 60 and 20% score 50: a high band of 5% is closer to 10% than one of 25%.
    const scores = [...Array(5).fill(60), ...Array(20).fill(50), ...Array(75).fill(0)]
    const cuts = bandCuts(scores)
    expect(cuts.cutHigh).toBe(60)
    expect(cuts.highShare).toBeCloseTo(0.05, 9)
    // The 50s all go to Medium together (25% total, against a 35% target).
    expect(cuts.cutMedium).toBe(50)
    expect(cuts.mediumShare).toBeCloseTo(0.2, 9)
  })
  it('never leaves the high band empty while someone scores above 0, and keeps 0 in Low', () => {
    const scores = [50, 50, 50, 0, 0, 0, 0, 0, 0, 0]
    const { cutHigh, cutMedium, highShare } = bandCuts(scores)
    expect(cutHigh).toBe(50)
    expect(highShare).toBeCloseTo(0.3, 9)
    expect(scores.filter((s) => bandFor(s, cutHigh, cutMedium) === 'High')).toHaveLength(3)
    expect(scores.filter((s) => bandFor(s, cutHigh, cutMedium) === 'Low')).toHaveLength(7)
  })
  it('returns no cuts when nobody scores', () => {
    expect(bandCuts([0, 0, 0])).toEqual({ cutHigh: null, cutMedium: null, highShare: 0, mediumShare: 0 })
    expect(bandCuts([])).toEqual({ cutHigh: null, cutMedium: null, highShare: null, mediumShare: null })
    expect(bandFor(5, null, null)).toBe('Low')
  })
})

describe('roundPoints', () => {
  it('rounds to multiples of 5 that still add up to the total', () => {
    const r = roundPoints({ tenurePeak: 52.4, deptAttrition: 23.3, ratingDrop: 14.3, lowCompa: 10 }, 100)
    expect(r).toEqual({ tenurePeak: 50, deptAttrition: 25, ratingDrop: 15, lowCompa: 10 })
    expect(roundPoints({ lowCompa: 10 }, 10)).toEqual({ lowCompa: 10 })
  })
})

describe('learnPoints', () => {
  const set = (people: PersonSignals[], off: FactorKey[] = []): SignalSet => ({
    date: '2025-09-30',
    people,
    off: off.map((key) => ({ key, why: 'test' })),
    companyVoluntary: null,
    levelNorms: new Map(),
  })
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
  const sample = (list = people, off: FactorKey[] = []): LearningSample => ({
    signals: set(list, off),
    left: (id) => leftIds.has(id),
  })

  it('gives points only to factors that went with more exits', () => {
    const r = learnPoints([sample()], new Set(), { compaOn: false })
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
    expect(peak.source).toBe('learned')
    expect(r.people).toBe(200)
    expect(r.leavers).toBe(30)
  })
  it('pools several month-ends, counting each person once per month-end', () => {
    const r = learnPoints([sample(), sample()], new Set(), { compaOn: false })
    expect(r.evidence.find((e) => e.key === 'tenurePeak')?.withFactor).toBe(160)
    expect(r.people).toBe(200)
    expect(r.leavers).toBe(30)
  })
  it('keeps 10 fixed points for the untestable pay factor', () => {
    const r = learnPoints([sample()], new Set(), { compaOn: true })
    expect(r.points.tenurePeak).toBe(90)
    expect(r.points.lowCompa).toBe(10)
    expect(r.evidence.find((e) => e.key === 'lowCompa')).toMatchObject({ tested: false, source: 'fixed' })
  })
  it('falls back to default points, rounded to 5, with too little history', () => {
    const r = learnPoints([sample(people.slice(0, 50))], new Set(), { compaOn: false })
    expect(r.learned).toBe(false)
    // The testable defaults add up to 90 and are rescaled to 100, then rounded to multiples of 5.
    expect(r.points.promotionGap).toBe(15)
    expect(r.points.tenurePeak).toBe(10)
    expect(Object.values(r.points).reduce((a, b) => a + b, 0)).toBe(100)
    expect(Object.values(r.points).every((p) => p % 5 === 0)).toBe(true)
    expect(r.evidence.every((e) => e.source === 'default')).toBe(true)
  })
  it('keeps default points for a factor whose data does not reach back, and learns the rest', () => {
    // ratingDrop is switched off at the learning month-end (no reviews yet) but is on today.
    const r = learnPoints([sample(people, ['ratingDrop'])], new Set(), { compaOn: false })
    const drop = r.evidence.find((e) => e.key === 'ratingDrop')!
    expect(drop.tested).toBe(false)
    expect(drop.source).toBe('default')
    expect(r.points.ratingDrop).toBe(10)
    expect(r.points.tenurePeak).toBe(90)
  })
  it('skips factors that are switched off today', () => {
    const r = learnPoints([sample()], new Set(['tenurePeak']), { compaOn: false })
    expect(r.evidence.some((e) => e.key === 'tenurePeak')).toBe(false)
    expect(r.points.tenurePeak).toBe(0)
  })
  it('returns default points when there is nothing to learn from', () => {
    const r = learnPoints([], new Set(), { compaOn: false })
    expect(r.learned).toBe(false)
    expect(r.snapshots).toEqual([])
    expect(Object.values(r.points).reduce((a, b) => a + b, 0)).toBe(100)
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
  it('switches rating factors off before enough review cycles had closed', () => {
    const before = signalsAt(input, '2025-12-01', { useComp: false })
    const off = new Map(before.off.map((o) => [o.key, o.why]))
    expect(off.get('ratingDrop')).toBe('No review cycle had closed by 1 Dec 2025')
    expect(off.get('highNoPromo')).toBe('No review cycle had closed by 1 Dec 2025')
    const one = signalsAt(input, '2026-01-31', { useComp: false })
    expect(one.off.find((o) => o.key === 'ratingDrop')?.why).toBe(
      'Only one review cycle had closed by 31 Jan 2026',
    )
    expect(one.off.some((o) => o.key === 'highNoPromo')).toBe(false)
  })
  it('counts exits only from the first one in the file, and needs 6 months of them', () => {
    const short = signalsAt(input, AS_OF, { useComp: false, historyStart: '2026-05-01' })
    expect(short.off.find((o) => o.key === 'deptAttrition')?.why).toBe(
      'Less than 6 months of exits before 30 Sep 2026',
    )
    expect(short.off.some((o) => o.key === 'peersLeft')).toBe(true)
    const clipped = signalsAt(input, AS_OF, { useComp: false, historyStart: '2026-01-15' })
    expect(signalOf(clipped.people, 'Q1', 'peersLeft')?.reason).toBe(
      '2 of 4 people under the same manager left since 15 Jan 2026',
    )
    expect(signalOf(clipped.people, 'X0', 'deptAttrition')).toBeDefined()
  })
  it('handles an empty roster', () => {
    const empty = signalsAt(inputFor(ctxFor({})), AS_OF, { useComp: true })
    expect(empty.people).toEqual([])
  })
})

describe('buildRiskModel', () => {
  /*
   * A company where what predicts exits changes a year ago:
   *  - before 1 Oct 2025, people left at 18 months of tenure (cohorts hired up to Mar 2024), and a
   *    group that got a new manager in Jan 2024 stayed;
   *  - after it, tenure stops mattering and 40 long-tenured people who got a new manager in
   *    Jul 2025 resign in the first half of 2026.
   * An honest back-test (points learned only from outcomes known by 30 Sep 2025) cannot see the
   * new-manager effect; today's points can.
   */
  const employees: Employee[] = []
  const jobChanges: JobChange[] = []
  for (let q = 0; q < 22; q++) {
    const hire = addMonths('2021-01-04', q * 3)
    for (let i = 0; i < 30; i++) {
      const leaves = hire <= '2024-03-31' && i < 15
      employees.push(
        emp(`C${q}-${i}`, {
          hireDate: hire,
          ...(leaves ? { terminationDate: addMonths(hire, 18), terminationType: 'Voluntary' as const } : {}),
        }),
      )
    }
  }
  for (let i = 0; i < 300; i++) {
    const o: Partial<Employee> = { hireDate: '2015-01-05' }
    if (i < 50)
      Object.assign(o, { terminationDate: addMonths('2022-07-15', i), terminationType: 'Voluntary' })
    else if (i < 90) o.managerId = 'MOLD'
    else if (i < 130)
      Object.assign(o, {
        managerId: 'MNEW',
        terminationDate: addMonths('2026-01-12', (i - 90) % 6),
        terminationType: 'Voluntary',
      })
    employees.push(emp(`B${i}`, o))
    if (i >= 50 && i < 130) {
      const recent = i >= 90
      jobChanges.push({
        employeeId: `B${i}`,
        effectiveDate: recent ? '2025-07-01' : '2024-01-08',
        changeType: 'Manager change',
        fromLevel: 'L3',
        toLevel: 'L3',
        fromManagerId: 'MPREV',
        toManagerId: recent ? 'MNEW' : 'MOLD',
      })
    }
  }
  const model = buildRiskModel(inputFor(ctxFor({ employees, jobChanges })), AS_OF)
  const bt = model.backTest

  it('learns today’s points from the 12 month-ends 12 to 23 months back', () => {
    expect(model.learned).toBe(true)
    expect(model.learnedFrom).toHaveLength(12)
    expect(model.learnedFrom[0]).toBe('2024-10-31')
    expect(model.learnedFrom[11]).toBe('2025-09-30')
    expect(model.points.newManager).toBeGreaterThan(0)
    expect(Object.values(model.points).every((p) => p % 5 === 0)).toBe(true)
  })
  it('back-tests with points learned only from outcomes known at the scoring date', () => {
    expect(bt.scoredOn).toBe('2025-09-30')
    expect(bt.learned).toBe(true)
    // Every month-end's 12-month outcome ended by the scoring date.
    expect(bt.learnedFrom.length).toBeGreaterThan(0)
    for (const d of bt.learnedFrom) expect(monthsBack(d, -12) <= bt.scoredOn).toBe(true)
    expect(bt.learnedFrom.at(-1)).toBe('2024-09-30')
    // So the new-manager exits after it can't have taught the back-test any points...
    expect(bt.points.newManager).toBe(0)
    expect(bt.points.tenurePeak).toBeGreaterThan(0)
    // ...and the honest result is that the bands did not separate the leavers.
    const [low, , high] = bt.bands
    expect(high.rate!).toBeLessThan(low.rate!)
    expect(bt.ordered).toBe(false)
    expect(backTestSummary(bt)).toMatch(/^The bands did not separate leavers from stayers/)
  })
  it('reports the real band shares and scores everyone active today', () => {
    expect(model.population).toBe(
      employees.filter((e) => !e.terminationDate || e.terminationDate > AS_OF).length,
    )
    expect(model.highShare).not.toBeNull()
    const high = [...model.scores.values()].filter((s) => s.band === 'High').length
    expect(high / model.population).toBeCloseTo(model.highShare!, 9)
  })
  it('uses default points when nobody has left', () => {
    const none = buildRiskModel(
      inputFor(ctxFor({ employees: employees.map((e) => ({ ...e, terminationDate: null })) })),
      AS_OF,
    )
    expect(none.learned).toBe(false)
    expect(none.learnedFrom).toEqual([])
    expect(none.backTest.lift).toBeNull()
    expect(FACTORS.every((f) => none.points[f.key] % 5 === 0)).toBe(true)
  })
})

describe('backTestSummary', () => {
  const bt = (low: number | null, high: number | null, lift: number | null, medium = 0.1): BackTest => ({
    scoredOn: '2025-09-30',
    outcome: { start: '2025-10-01', end: AS_OF, months: 12, label: '' },
    exitKind: 'voluntary',
    population: 100,
    leavers: 10,
    overallRate: 0.1,
    bands: [
      { band: 'Low', people: 60, leavers: 3, rate: low, shareOfLeavers: null },
      { band: 'Medium', people: 30, leavers: 3, rate: medium, shareOfLeavers: null },
      { band: 'High', people: 10, leavers: 4, rate: high, shareOfLeavers: null },
    ],
    lift,
    ordered: low == null || high == null ? null : high > medium && medium > low,
    points: Object.fromEntries(FACTORS.map((f) => [f.key, 0])) as BackTest['points'],
    learned: true,
    learnedFrom: [],
    learnedLeavers: 0,
    defaults: [],
    highShare: 0.1,
    scored: new Map(),
    leaverIds: new Set(),
  })
  it('says plainly when the bands separate leavers', () => {
    expect(backTestSummary(bt(0.05, 0.2, 4))).toBe(
      'People placed in the high band a year ago left voluntarily at 4.0× the rate of the low band (20.0% vs 5.0%). The medium band fell in between at 10.0%.',
    )
  })
  it('says plainly when the bands are out of order', () => {
    expect(backTestSummary(bt(0.07, 0.15, 2, 0.04))).toBe(
      'People placed in the high band a year ago left voluntarily at 2.0× the rate of the low band (15.0% vs 7.0%). The medium band left voluntarily at 4.0%, less often than the low band, so only the high band stands out.',
    )
    expect(backTestSummary(bt(0.06, 0.12, 2, 0.13))).toMatch(
      /The medium band left voluntarily at 13\.0%, as often as the high band, so the line between those two bands means little\.$/,
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
