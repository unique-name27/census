import { describe, expect, it } from 'vitest'
import type { Datasets, Employee } from './schema'
import {
  buildOrgIndex,
  DEFAULT_FILTERS,
  periodWindows,
  resolveAsOf,
  scopeDatasets,
  scopeLabel,
  subtreeIds,
} from './scope'

const e = (id: string, managerId: string | null, extra: Partial<Employee> = {}): Employee => ({
  employeeId: id,
  name: `Person ${id}`,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon Engineering',
  department: 'Design Verification',
  location: 'San Jose',
  country: 'United States',
  level: 'L3',
  managerId,
  hireDate: '2020-01-01',
  employmentType: 'Employee',
  ...extra,
})

const employees = [
  e('ceo', null, { level: 'E3', department: 'Executive Office', businessUnit: 'Executive Office' }),
  e('vp', 'ceo', { level: 'E1' }),
  e('m1', 'vp', { level: 'M1' }),
  e('ic1', 'm1'),
  e('ic2', 'm1', { location: 'Hsinchu' }),
  e('gone', 'm1', { terminationDate: '2026-02-01' }),
  e('cyc1', 'cyc2'),
  e('cyc2', 'cyc1'),
]

const empty: Datasets = {
  employees,
  jobChanges: [],
  requisitions: [],
  candidates: [],
  cases: [],
  transactions: [],
  reviews: [],
  succession: [],
  learning: [],
  comp: [],
  hiringPlan: [],
  onboardingTasks: [],
  rightToWork: [],
  surveyResponses: [],
  surveyItems: [],
}

describe('period windows', () => {
  it('trailing 12 months is inclusive and has a 12-month prior', () => {
    const { current, prior } = periodWindows('t12m', '2026-09-30')
    expect(current.start).toBe('2025-10-01')
    expect(current.end).toBe('2026-09-30')
    expect(prior.start).toBe('2024-10-01')
    expect(prior.end).toBe('2025-09-30')
    expect(current.months).toBeCloseTo(12, 0)
  })
  it('year to date compares with the same span last year', () => {
    const { current, prior } = periodWindows('ytd', '2026-09-30')
    expect(current.start).toBe('2026-01-01')
    expect(prior).toMatchObject({ start: '2025-01-01', end: '2025-09-30' })
  })
  it('last full quarter uses the quarter ending on asOf when asOf is a quarter end', () => {
    expect(periodWindows('lastQuarter', '2026-09-30').current).toMatchObject({
      start: '2026-07-01',
      end: '2026-09-30',
    })
    expect(periodWindows('lastQuarter', '2026-09-15').current).toMatchObject({
      start: '2026-04-01',
      end: '2026-06-30',
    })
    expect(periodWindows('lastQuarter', '2026-09-30').prior).toMatchObject({
      start: '2026-04-01',
      end: '2026-06-30',
    })
  })
  it('custom range has an equal-length prior window', () => {
    const { current, prior } = periodWindows('custom', '2026-09-30', {
      start: '2026-07-01',
      end: '2026-07-31',
    })
    expect(current).toMatchObject({ start: '2026-07-01', end: '2026-07-31' })
    expect(prior).toMatchObject({ start: '2026-05-31', end: '2026-06-30' })
  })
})

describe('org scoping', () => {
  const index = buildOrgIndex(employees)
  it('subtree includes the leader, reports, and former reports', () => {
    expect([...subtreeIds(index, 'vp')].sort()).toEqual(['gone', 'ic1', 'ic2', 'm1', 'vp'])
  })
  it('is cycle-safe', () => {
    expect(subtreeIds(index, 'cyc1').size).toBe(2)
  })
  it('returns the same object when no org filter is set', () => {
    expect(scopeDatasets(empty, DEFAULT_FILTERS, index)).toBe(empty)
  })
  it('combines leader and location filters', () => {
    const out = scopeDatasets(empty, { ...DEFAULT_FILTERS, leaderId: 'vp', location: ['Hsinchu'] }, index)
    expect(out.employees.map((x) => x.employeeId)).toEqual(['ic2'])
  })
  it('labels the scope in plain words', () => {
    expect(scopeLabel(DEFAULT_FILTERS, index)).toBe('Whole company')
    expect(scopeLabel({ ...DEFAULT_FILTERS, leaderId: 'vp', location: ['Hsinchu'] }, index)).toBe(
      "Person vp's org · Hsinchu",
    )
  })
})

describe('as-of resolution', () => {
  it('uses the latest event date capped at today, or the override', () => {
    expect(resolveAsOf(empty, '2026-10-03')).toBe('2026-02-01')
    expect(resolveAsOf(empty, '2026-10-03', '2026-06-30')).toBe('2026-06-30')
  })
})

describe('scoping the onboarding, compliance and listening datasets', () => {
  const index = buildOrgIndex(employees)
  const reqs = [
    {
      reqId: 'R1',
      hiringManagerId: 'm1',
      businessUnit: 'Silicon Engineering',
      department: 'Design Verification',
      location: 'San Jose',
      level: 'L3',
    },
    {
      reqId: 'R2',
      hiringManagerId: 'ceo',
      businessUnit: 'Executive Office',
      department: 'Executive Office',
      location: 'Austin',
      level: 'L3',
    },
  ] as unknown as Datasets['requisitions']
  const data: Datasets = {
    ...empty,
    requisitions: reqs,
    candidates: [
      { applicationId: 'A1', reqId: 'R1' },
      { applicationId: 'A2', reqId: 'R2' },
    ] as unknown as Datasets['candidates'],
    rightToWork: [{ employeeId: 'ic1' }, { employeeId: 'ceo' }],
    onboardingTasks: [
      { employeeId: 'ic2', task: 'Laptop shipped' },
      { applicationId: 'A1', task: 'Badge ready' },
      { applicationId: 'A2', task: 'Badge ready' },
      { applicationId: 'gone-app', task: 'Badge ready' },
    ],
    surveyResponses: [
      { respondentKey: 'ic1', survey: 'Exit survey' },
      { respondentKey: 'A1', survey: 'Candidate experience' },
      { respondentKey: 'A2', survey: 'Candidate experience' },
      { respondentKey: 'ceo', survey: 'Exit survey' },
    ] as unknown as Datasets['surveyResponses'],
    surveyItems: [{ item: 'Q1', driver: 'Readiness' }],
    hiringPlan: [
      {
        period: '2026-11-01',
        businessUnit: 'Silicon Engineering',
        department: 'Design Verification',
        plannedHires: 2,
      },
      {
        period: '2026-11-01',
        businessUnit: 'Executive Office',
        department: 'Executive Office',
        plannedHires: 1,
      },
      {
        period: '2026-12-01',
        businessUnit: 'Executive Office',
        department: 'Executive Office',
        plannedHires: 1,
        reqId: 'R1',
      },
    ],
  }

  it('follows each person: employee first, else the candidate requisition', () => {
    const out = scopeDatasets(data, { ...DEFAULT_FILTERS, leaderId: 'vp' }, index)
    expect(out.rightToWork.map((r) => r.employeeId)).toEqual(['ic1'])
    expect(out.onboardingTasks.map((t) => t.employeeId ?? t.applicationId)).toEqual(['ic2', 'A1'])
    expect(out.surveyResponses.map((r) => r.respondentKey)).toEqual(['ic1', 'A1'])
    // Reference data is never scoped.
    expect(out.surveyItems).toBe(data.surveyItems)
  })

  it('keeps plan lines for the leader’s departments or linked to a requisition in scope', () => {
    const out = scopeDatasets(data, { ...DEFAULT_FILTERS, leaderId: 'vp' }, index)
    expect(out.hiringPlan.map((p) => `${p.department} ${p.period}`)).toEqual([
      'Design Verification 2026-11-01',
      'Executive Office 2026-12-01',
    ])
    const byDept = scopeDatasets(data, { ...DEFAULT_FILTERS, department: ['Executive Office'] }, index)
    expect(byDept.hiringPlan).toHaveLength(2)
    const byLoc = scopeDatasets(data, { ...DEFAULT_FILTERS, location: ['Hsinchu'] }, index)
    expect(byLoc.hiringPlan).toHaveLength(0)
  })

  it('fills in datasets a caller left out, so engines never meet undefined', () => {
    const partial = { ...empty } as Partial<Datasets>
    delete partial.surveyItems
    delete partial.hiringPlan
    const out = scopeDatasets(partial as Datasets, { ...DEFAULT_FILTERS, leaderId: 'vp' }, index)
    expect(out.surveyItems).toEqual([])
    expect(out.hiringPlan).toEqual([])
    expect(scopeDatasets(partial as Datasets, DEFAULT_FILTERS, index).surveyItems).toEqual([])
  })
})
