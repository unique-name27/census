/**
 * The first 90 days on hand-built rows: exact definitions for day-one readiness, I-9 Section 2,
 * required training, check-ins, probation decisions and early voluntary attrition, with groups
 * under the anonymity minimum folded and hidden.
 */
import { describe, expect, it } from 'vitest'
import type { LearningRecord, SurveyResponse } from '@/data/schema'
import { metricsWith } from '@/metrics/testing'
import { M } from '../metrics'
import { onboardingBase } from './base'
import { computeFirst90, managerAtHire, rateBy } from './first90'
import { emp, fixtureContext, task } from './testkit'

const first90 = (ctx: ReturnType<typeof fixtureContext>) => computeFirst90(onboardingBase(ctx), ctx)

describe('rateBy', () => {
  it('folds groups under the minimum into "Other (k)" and hides what they meet', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ g: 'A', ok: i < 3 })),
      ...Array.from({ length: 3 }, () => ({ g: 'B', ok: true })),
      ...Array.from({ length: 1 }, () => ({ g: 'C', ok: false })),
    ]
    const out = rateBy(
      rows,
      (r) => r.g,
      (r) => r.ok,
      5,
    )
    expect(out.map((g) => [g.group, g.n, g.met, g.rate])).toEqual([
      ['A', 6, 3, 0.5],
      ['Other (2)', 4, null, null],
    ])
  })
})

describe('day-one readiness and I-9 Section 2', () => {
  // Five US starts on Friday 4 Sep 2026: the I-9 deadline is Wednesday 9 Sep.
  const ids = ['E1', 'E2', 'E3', 'E4', 'E5']
  const employees = ids.map((id) => emp(id, { hireDate: '2026-09-04' }))
  const tasks = ids.flatMap((id, i) => [
    task({
      employeeId: id,
      task: 'Laptop shipped',
      dueDate: '2026-09-01',
      completedDate: i === 0 ? '2026-09-07' : '2026-08-31',
      status: 'Done',
    }),
    task({
      employeeId: id,
      task: 'I-9 Section 2',
      dueDate: '2026-09-09',
      completedDate: i === 1 ? '2026-09-10' : i === 2 ? null : '2026-09-09',
      status: i === 2 ? 'In progress' : 'Done',
    }),
  ])

  it('counts starts with every day-one task done by the first day', () => {
    const f = first90(fixtureContext({ employees, onboardingTasks: tasks }))
    expect(f.dayOne.judged).toHaveLength(5)
    expect(f.dayOne.ready).toHaveLength(4)
    expect(f.dayOne.rate).toBe(0.8)
  })

  it('judges I-9 Section 2 against business days from the start, counting open past the deadline as late', () => {
    const f = first90(fixtureContext({ employees, onboardingTasks: tasks }))
    expect(f.i9.judged).toHaveLength(5)
    expect(f.i9.late.map((x) => x.start.key).sort()).toEqual(['E2', 'E3'])
    expect(f.i9.rate).toBe(0.6)
    expect(f.i9.judged[0].deadline).toBe('2026-09-09')
  })

  it('reads the allowed business days from the dictionary', () => {
    const ctx = fixtureContext(
      { employees, onboardingTasks: tasks },
      { metrics: metricsWith({ [M.i9]: { businessDays: 5 } }) },
    )
    expect(first90(ctx).i9.late.map((x) => x.start.key)).toEqual(['E3'])
  })

  it('leaves out starts outside the US and Section 2 not yet due', () => {
    const late = [
      emp('E6', { hireDate: '2026-09-29' }),
      emp('E7', { hireDate: '2026-09-04', location: 'Munich' }),
    ]
    const rows = late.map((e) =>
      task({ employeeId: e.employeeId, task: 'I-9 Section 2', status: 'Not started' }),
    )
    expect(first90(fixtureContext({ employees: late, onboardingTasks: rows })).i9.judged).toHaveLength(0)
  })
})

describe('required training', () => {
  const p = emp('E1', { hireDate: '2026-08-03' })
  const l = (course: string, x: Partial<LearningRecord>): LearningRecord => ({
    employeeId: 'E1',
    course,
    category: 'Onboarding',
    required: true,
    assignedDate: '2026-08-03',
    dueDate: '2026-09-02',
    ...x,
  })
  it('judges assignments made and due in the first weeks by start + the allowed days', () => {
    const learning = [
      l('A', { completedDate: '2026-09-01' }),
      l('B', { completedDate: '2026-09-05' }),
      l('C', { dueDate: '2026-09-17', completedDate: '2026-09-10' }),
      l('D', { required: false }),
      l('E', { assignedDate: '2026-07-01' }),
    ]
    const f = first90(fixtureContext({ employees: [p], learning }))
    expect(f.training.judged.map((x) => x.record.course)).toEqual(['A', 'B'])
    expect(f.training.rate).toBe(0.5)
  })
})

describe('check-ins and probation', () => {
  it('counts check-ins due in the window by the as-of date, on time when done by the due date', () => {
    const employees = [emp('E1', { hireDate: '2026-06-01' })]
    const onboardingTasks = [
      task({
        employeeId: 'E1',
        task: '30-day check-in',
        dueDate: '2026-07-01',
        completedDate: '2026-07-01',
        status: 'Done',
      }),
      task({
        employeeId: 'E1',
        task: '60-day check-in',
        dueDate: '2026-07-31',
        completedDate: '2026-08-04',
        status: 'Done',
      }),
      task({ employeeId: 'E1', task: '90-day check-in', dueDate: '2026-08-30' }),
      task({ employeeId: 'E1', task: '90-day check-in', dueDate: '2026-10-30' }),
    ]
    const f = first90(fixtureContext({ employees, onboardingTasks }))
    expect(f.checkIns.judged).toHaveLength(3)
    expect(f.checkIns.judged.filter((x) => x.onTime)).toHaveLength(1)
  })

  it('lists probation decisions overdue and due soon for people still employed', () => {
    const employees = [
      emp('E1', { hireDate: '2026-03-02', location: 'Bengaluru', country: 'India' }),
      emp('E2', {
        hireDate: '2026-03-02',
        location: 'Bengaluru',
        country: 'India',
        terminationDate: '2026-08-01',
      }),
      emp('E3', { hireDate: '2026-04-20', location: 'Munich', country: 'Germany' }),
      emp('E4', { hireDate: '2026-03-02', location: 'Bengaluru', country: 'India' }),
    ]
    const onboardingTasks = [
      task({ employeeId: 'E1', task: 'Probation decision', dueDate: '2026-08-18' }),
      task({ employeeId: 'E2', task: 'Probation decision', dueDate: '2026-08-18' }),
      // No due date: six months in Germany less ten business days, 6 Oct.
      task({ employeeId: 'E3', task: 'Probation decision' }),
      task({
        employeeId: 'E4',
        task: 'Probation decision',
        dueDate: '2026-08-18',
        status: 'Done',
        completedDate: '2026-08-10',
      }),
    ]
    const f = first90(fixtureContext({ employees, onboardingTasks }))
    expect(f.probation.map((x) => [x.person.key, x.state, x.due])).toEqual([
      ['E1', 'Overdue', '2026-08-18'],
      ['E3', 'Due soon', '2026-10-06'],
    ])
    expect(f.probation[0].daysLate).toBe(43)
  })
})

describe('early voluntary attrition', () => {
  const hire = (id: string, department: string, p: Parameters<typeof emp>[1] = {}) =>
    emp(id, { hireDate: '2026-01-05', department, ...p })
  const employees = [
    ...['A1', 'A2', 'A3', 'A4', 'A5'].map((id) => hire(id, 'Software')),
    hire('A6', 'Software', { terminationDate: '2026-02-20', terminationType: 'Voluntary' }),
    hire('B1', 'Finance', { terminationDate: '2026-03-10', terminationType: 'Involuntary' }),
    hire('B2', 'Finance', { terminationDate: '2026-07-01', terminationType: 'Voluntary' }),
    // Started too recently for the window to have passed.
    hire('C1', 'Finance', {
      hireDate: '2026-08-03',
      terminationDate: '2026-08-20',
      terminationType: 'Voluntary',
    }),
  ]

  it('counts resignations within the window among starts whose window has passed', () => {
    const f = first90(fixtureContext({ employees }))
    expect(f.attrition.cohort).toHaveLength(8)
    expect(f.attrition.leavers.map((e) => e.employeeId)).toEqual(['A6'])
    expect(f.attrition.rate).toBe(1 / 8)
    expect(f.attrition.byDepartment.map((g) => [g.group, g.met, g.rate])).toEqual([
      ['Software', 1, 1 / 6],
      ['Other (1)', null, null],
    ])
  })

  it('reads the window from the dictionary', () => {
    const ctx = fixtureContext({ employees }, { metrics: metricsWith({ [M.attrition90]: { days: 200 } }) })
    expect(
      first90(ctx)
        .attrition.leavers.map((e) => e.employeeId)
        .sort(),
    ).toEqual(['A6', 'B2'])
  })

  it('groups by the manager at hire', () => {
    const e = emp('E1', { hireDate: '2026-01-05', managerId: 'M2' })
    expect(
      managerAtHire(e, [
        {
          employeeId: 'E1',
          effectiveDate: '2026-03-01',
          changeType: 'Manager change',
          fromManagerId: 'M1',
          toManagerId: 'M2',
        },
      ]),
    ).toBe('M1')
    expect(managerAtHire(e, [])).toBe('M2')
  })
})

describe('day-30 pulse', () => {
  const answer = (respondentKey: string, score: number): SurveyResponse => ({
    survey: 'Onboarding pulse day 30',
    wave: '2026 Q3',
    responseDate: '2026-08-15',
    respondentKey,
    item: 'ON30_READY',
    driver: 'Week-1 readiness',
    score,
    scale: '1-5',
  })
  it('groups answers by region and hides groups under the survey minimum', () => {
    const employees = [
      ...['H1', 'H2', 'H3', 'H4', 'H5'].map((id) => emp(id, { location: 'Hsinchu', country: 'Taiwan' })),
      emp('S1'),
    ]
    const surveyResponses = [...['H1', 'H2', 'H3', 'H4', 'H5'].map((id) => answer(id, 3)), answer('S1', 5)]
    const f = first90(fixtureContext({ employees, surveyResponses }))
    expect(f.pulse.overall?.mean).toBeCloseTo(20 / 6)
    expect(f.pulse.byRegion?.groups.map((g) => [g.group, g.mean])).toEqual([['APAC', 3]])
    expect(f.pulse.byRegion?.other?.suppressed).toBe(true)
    expect(f.pulse.target).toBe(4)
  })
})
