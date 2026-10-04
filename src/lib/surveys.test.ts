import { describe, expect, it } from 'vitest'
import type { Candidate, Employee, Requisition, SurveyResponse, SurveyType } from '@/data/schema'
import {
  aggregate,
  BY_DEPARTMENT,
  BY_RECRUITER,
  breakdown,
  byDriver,
  byItem,
  byWave,
  driverOf,
  groupRows,
  isTopBox,
  isValidScore,
  itemIndex,
  latestWaves,
  managerCuts,
  managerWindowStart,
  npsOf,
  percentOfScale,
  respondentIndex,
  respondentKey,
  responseRate,
  selectResponses,
  targetOf,
  waveChange,
  wavesOf,
} from './surveys'

/** One answer; respondent keys are made up and never leave these functions. */
const r = (respondentKey: string, score: number, extra: Partial<SurveyResponse> = {}): SurveyResponse => ({
  survey: 'Onboarding pulse day 30',
  wave: '2026-07',
  responseDate: '2026-07-10',
  respondentKey,
  item: 'OB30-READY',
  driver: 'Readiness',
  score,
  scale: '1-5',
  ...extra,
})

/** n respondents, each answering one item with the given score. */
const many = (n: number, score: number, extra: Partial<SurveyResponse> = {}, prefix = 'E') =>
  Array.from({ length: n }, (_, i) => r(`${prefix}${i}`, score, extra))

const emp = (id: string, managerId: string | null, extra: Partial<Employee> = {}): Employee => ({
  employeeId: id,
  name: `Person ${id}`,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon',
  department: 'Design verification',
  location: 'Austin',
  country: 'United States',
  level: 'L3',
  managerId,
  hireDate: '2024-01-01',
  employmentType: 'Employee',
  ...extra,
})

describe('scales', () => {
  it('checks scores against their scale and puts them on one 0-100 basis', () => {
    expect(isValidScore(5, '1-5')).toBe(true)
    expect(isValidScore(0, '1-5')).toBe(false)
    expect(isValidScore(10, '0-10')).toBe(true)
    expect(isValidScore(11, '0-10')).toBe(false)
    expect(isValidScore(Number.NaN, '1-5')).toBe(false)
    expect(percentOfScale(1, '1-5')).toBe(0)
    expect(percentOfScale(3, '1-5')).toBe(50)
    expect(percentOfScale(5, '0-10')).toBe(50)
    expect(isTopBox(4, '1-5')).toBe(true)
    expect(isTopBox(8, '0-10')).toBe(false)
    expect(isTopBox(9, '0-10')).toBe(true)
  })

  it('computes NPS as promoters minus detractors, null with no answers', () => {
    expect(npsOf([])).toBeNull()
    // 2 promoters, 1 passive, 1 detractor of 4
    expect(npsOf([10, 9, 8, 3])).toBe(25)
    expect(npsOf([0, 6])).toBe(-100)
  })
})

describe('aggregate', () => {
  it('hides every number below the minimum, counting distinct respondents', () => {
    // 4 people answering twice each is still 4 respondents.
    const rows = [...many(4, 5), ...many(4, 4, { item: 'OB30-CLARITY' })]
    const a = aggregate(rows, { min: 5 })
    expect(a).toMatchObject({ respondents: 4, responses: 8, suppressed: true, mean: null, topBox: null })
    const b = aggregate([...rows, r('E9', 1)], { min: 5 })
    expect(b.suppressed).toBe(false)
    expect(b.respondents).toBe(5)
    expect(b.mean).toBeCloseTo((4 * 5 + 4 * 4 + 1) / 9, 10)
    expect(b.topBox).toBeCloseTo(8 / 9, 10)
    expect(b.bottomBox).toBeCloseTo(1 / 9, 10)
    expect(b.nps).toBeNull()
  })

  it('reports a mean per scale and none overall when scales are mixed', () => {
    const rows = [...many(5, 4), ...many(5, 10, { scale: '0-10', item: 'NPS' }, 'C')]
    const a = aggregate(rows, { min: 5 })
    expect(a.scale).toBe('mixed')
    expect(a.mean).toBeNull()
    expect(a.meanByScale).toEqual({ '1-5': 4, '0-10': 10 })
    expect(a.percentOfScale).toBeCloseTo((5 * 75 + 5 * 100) / 10, 10)
    expect(a.nps).toBe(100)
  })

  it('returns null numbers, not zeros, for no answers', () => {
    expect(aggregate([], { min: 1 })).toMatchObject({
      respondents: 0,
      mean: null,
      scale: null,
      suppressed: true,
    })
  })
})

describe('breakdowns', () => {
  const rows = [
    ...many(6, 5, { driver: 'Readiness' }, 'A'),
    ...many(6, 3, { driver: 'Role clarity', item: 'OB30-CLARITY' }, 'B'),
    ...many(2, 1, { driver: 'Manager support', item: 'OB30-MGR' }, 'C'),
    ...many(2, 2, { driver: 'Tools', item: 'OB30-TOOLS' }, 'D'),
  ]

  it('folds groups under the minimum into Other, hidden while it is still too small', () => {
    const b = byDriver(rows, { min: 5 })
    expect(b.groups.map((g) => g.group)).toEqual(['Readiness', 'Role clarity'])
    expect(b.other).toMatchObject({
      group: 'Other (2)',
      folded: 2,
      respondents: 4,
      suppressed: true,
      mean: null,
    })
    const bigger = byDriver([...rows, ...many(1, 2, { driver: 'Tools', item: 'OB30-TOOLS' }, 'X')], {
      min: 5,
    })
    expect(bigger.other).toMatchObject({ respondents: 5, suppressed: false })
  })

  it('keeps small groups as hidden rows for fixed tables, and follows a given order', () => {
    const b = byDriver(rows, { min: 5, keepSmall: true, order: ['Tools', 'Readiness'] })
    expect(b.other).toBeNull()
    expect(b.groups.map((g) => [g.group, g.suppressed])).toEqual([
      ['Tools', true],
      ['Readiness', false],
      ['Role clarity', false],
      ['Manager support', true],
    ])
  })

  it('counts answers whose group is unknown instead of guessing one', () => {
    const b = breakdown(rows, (x) => (x.respondentKey.startsWith('A') ? 'A' : null), { min: 5 })
    expect(b.unassigned).toBe(rows.length - 6)
    expect(b.groups).toHaveLength(1)
  })

  it('groups by item and takes drivers from the Survey items sheet when the answer has none', () => {
    const items = itemIndex([
      { item: 'Q1', driver: 'Readiness', survey: 'Onboarding pulse day 30', target: 4 },
      { item: 'Q2', driver: 'Belonging' },
    ])
    const a = r('E1', 4, { item: 'Q1', driver: null })
    expect(driverOf(a, items)).toBe('Readiness')
    expect(driverOf(r('E1', 4, { item: 'Q2', driver: '' }), items)).toBe('Belonging')
    expect(driverOf(r('E1', 4, { item: 'Q3', driver: null }), items)).toBe('Q3')
    expect(targetOf(items, 'Onboarding pulse day 30', 'Q1')).toBe(4)
    expect(targetOf(items, 'Exit survey', 'Q1')).toBeNull()
    // Equal sizes sort by name.
    expect(byItem(rows, { min: 5 }).groups.map((g) => g.group)).toEqual(['OB30-CLARITY', 'OB30-READY'])
  })
})

describe('waves', () => {
  const s: SurveyType = 'Exit survey'
  const rows = [
    ...many(5, 2, { survey: s, wave: '2026 Q1', responseDate: '2026-02-10' }),
    ...many(6, 4, { survey: s, wave: '2026 Q2', responseDate: '2026-05-10' }),
    ...many(3, 5, { survey: s, wave: '2026 Q3', responseDate: '2026-08-10' }),
    ...many(5, 3, { wave: '2026-07' }),
  ]

  it('orders waves by their first answer and pools nothing across surveys', () => {
    expect(wavesOf(rows, s).map((w) => [w.wave, w.respondents])).toEqual([
      ['2026 Q1', 5],
      ['2026 Q2', 6],
      ['2026 Q3', 3],
    ])
    expect(latestWaves(rows, s, '2026-06-30')).toMatchObject({
      latest: { wave: '2026 Q2' },
      prior: { wave: '2026 Q1' },
    })
    expect(byWave(rows, s, { min: 5 }).map((w) => [w.group, w.suppressed, w.mean])).toEqual([
      ['2026 Q1', false, 2],
      ['2026 Q2', false, 4],
      ['2026 Q3', true, null],
    ])
  })

  it('gives the change since the last wave, and none when either wave is too small', () => {
    expect(waveChange(rows, s, { min: 5, asOf: '2026-06-30' })).toMatchObject({
      wave: '2026 Q2',
      priorWave: '2026 Q1',
      delta: 2,
    })
    expect(waveChange(rows, s, { min: 5, measure: 'topBox', asOf: '2026-06-30' }).delta).toBe(1)
    expect(waveChange(rows, s, { min: 5 })).toMatchObject({ wave: '2026 Q3', delta: null })
    expect(waveChange([], s, { min: 5 })).toMatchObject({ wave: null, current: null, delta: null })
  })

  it('filters by survey, wave, driver, dates and valid scores', () => {
    const bad = r('E1', 9)
    expect(selectResponses([...rows, bad], { survey: s })).toHaveLength(14)
    expect(selectResponses([...rows, bad], { survey: 'Onboarding pulse day 30' })).toHaveLength(5)
    expect(selectResponses(rows, { wave: ['2026 Q1', '2026 Q3'] })).toHaveLength(8)
    expect(selectResponses(rows, { from: '2026-05-01', to: '2026-07-31' })).toHaveLength(11)
    expect(selectResponses(rows, { driver: 'Readiness' })).toHaveLength(rows.length)
  })
})

describe('response rates', () => {
  it('counts invited people who answered, and respondents outside the list', () => {
    const rows = [...many(3, 4), r('E0', 5, { item: 'Q2' }), r('Z9', 3)]
    expect(responseRate(rows, ['E0', 'E1', 'E2', 'E3'])).toEqual({
      invited: 4,
      responded: 3,
      rate: 0.75,
      outside: 1,
    })
    expect(responseRate(rows, new Set<string>()).rate).toBeNull()
  })
})

describe('joining respondents', () => {
  const employees = [emp('E0', 'M1'), emp('E1', 'M1', { department: 'Physical design' })]
  const requisitions = [
    { reqId: 'R1', department: 'Test engineering', recruiter: 'Sam Ito' } as unknown as Requisition,
  ]
  const candidates = [
    { applicationId: 'A1', reqId: 'R1', source: 'Referral', recruiter: null } as unknown as Candidate,
  ]

  it('labels answers by the employee or the candidate requisition, never returning the record', () => {
    const idx = respondentIndex({ employees, candidates, requisitions })
    const dept = respondentKey(idx, BY_DEPARTMENT)
    expect(dept(r('E1', 4))).toBe('Physical design')
    expect(dept(r('A1', 4))).toBe('Test engineering')
    expect(dept(r('nobody', 4))).toBeNull()
    expect(respondentKey(idx, BY_RECRUITER)(r('A1', 4))).toBe('Sam Ito')
    // The group key returns a label only.
    expect(typeof dept(r('E0', 4))).toBe('string')
  })
})

describe('manager cuts', () => {
  const asOf = '2026-09-30'
  const team = (mgr: string, n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => emp(`${prefix}${i}`, mgr))
  const employees = [emp('M1', null), emp('M2', null), ...team('M1', 12, 'a'), ...team('M2', 9, 'b')]
  const fb = (key: string, score: number, date: string, subjectKey: string | null = null) =>
    r(key, score, { survey: 'Manager feedback', wave: 'x', responseDate: date, subjectKey })

  it('pools four quarters and needs the manager minimum of distinct respondents', () => {
    expect(managerWindowStart(asOf)).toBe('2025-10-01')
    const rows = [
      ...team('M1', 12, 'a').map((e) => fb(e.employeeId, 4, '2026-03-01')),
      ...team('M2', 9, 'b').map((e) => fb(e.employeeId, 2, '2026-03-01')),
      // Older than four quarters: left out.
      fb('b0', 1, '2025-09-15'),
    ]
    const out = managerCuts(rows, employees, { asOf, minManager: 10 })
    expect(out.window).toEqual({ start: '2025-10-01', end: asOf })
    expect(out.hidden).toBe(1)
    const m1 = out.cuts.find((c) => c.managerId === 'M1')!
    const m2 = out.cuts.find((c) => c.managerId === 'M2')!
    expect(m1).toMatchObject({ respondents: 12, mean: 4, suppressed: false })
    expect(m2).toMatchObject({ respondents: 9, mean: null, topBox: null, suppressed: true })
  })

  it('uses the subject the answer names when it is a person in the roster', () => {
    const rows = Array.from({ length: 10 }, (_, i) => fb(`x${i}`, 5, '2026-06-01', 'M2'))
    const out = managerCuts(rows, employees, { asOf, minManager: 10 })
    expect(out.cuts).toHaveLength(1)
    expect(out.cuts[0]).toMatchObject({ managerId: 'M2', respondents: 10, suppressed: false })
  })
})

describe('drill rows', () => {
  it('carry grouped counts only: no respondent, date or single answer', () => {
    const rows = [...many(6, 5, {}, 'A'), ...many(2, 1, { driver: 'Tools' }, 'B')]
    const b = byDriver(rows, { min: 5 })
    const out = groupRows(b, { survey: 'Onboarding pulse day 30', wave: '2026-07', groupBy: 'Driver' })
    expect(out.map((g) => [g.group, g.respondents, g.suppressed])).toEqual([
      ['Readiness', 6, false],
      ['Other (1)', 2, true],
    ])
    for (const g of out) {
      expect(Object.keys(g)).not.toContain('respondentKey')
      expect(Object.keys(g)).not.toContain('responseDate')
      expect(Object.keys(g)).not.toContain('score')
    }
    expect(groupRows(b.groups, { survey: 'Exit survey', groupBy: 'Driver' })[0].wave).toBeNull()
  })
})
