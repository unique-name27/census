import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Employee, emptyDatasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import {
  buildDrillTable,
  DRILLS_KEY,
  drillNoun,
  drillTableHint,
  PERSON_KEY,
  rowPerson,
  taskState,
} from './records'
import { drillTier } from './tier'
import { drillDataset, drillSpec } from './types'

const emp = (id: string, extra: Partial<Employee> = {}): Employee => ({
  employeeId: id,
  name: `Person ${id}`,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon',
  department: 'Design verification',
  location: 'Austin',
  country: 'United States',
  level: 'L3',
  managerId: null,
  hireDate: '2024-01-01',
  employmentType: 'Employee',
  ...extra,
})

const data: Datasets = {
  ...emptyDatasets(),
  employees: [emp('E1'), emp('E2', { hireDate: '2026-10-12' })],
  requisitions: [
    {
      reqId: 'R1',
      jobTitle: 'DV engineer',
      businessUnit: 'Silicon',
      department: 'Design verification',
      location: 'Bengaluru',
      level: 'L3',
      hiringManagerId: 'E1',
      openedDate: '2026-06-01',
      status: 'Open',
      reqType: 'New',
      priority: 'Standard',
      openings: 1,
    },
  ],
  candidates: [
    {
      applicationId: 'A1',
      candidateName: 'Ines Duarte',
      reqId: 'R1',
      source: 'Referral',
      currentStage: 'Hired',
      status: 'Hired',
      appliedDate: '2026-07-01',
      hiredDate: '2026-09-10',
      startDate: '2026-11-02',
    },
  ],
}
const sources = Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: 0 }])) as Record<
  DatasetKey,
  SourceMeta
>
const ctx = (showImmigration = false) =>
  buildContext({
    data,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: '2026-09-30',
    showPay: false,
    showImmigration,
  })

describe('onboarding task drills', () => {
  it('name the person from the roster or the accepted candidate, with the state at the as-of date', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'onboardingTasks',
        title: 'Tasks',
        rows: [
          { employeeId: 'E2', task: 'Laptop shipped', dueDate: '2026-09-25', status: 'In progress' },
          { applicationId: 'A1', task: 'Badge ready', dueDate: '2026-10-31', completedDate: '2026-10-01' },
          { employeeId: 'E2', task: 'Probation decision', status: 'Not needed' },
        ],
      }),
      ctx(),
    )
    expect(t.rows.map((r) => [r.person, r.startDate, r.state, r.daysLate])).toEqual([
      ['Person E2', '2026-10-12', 'Overdue', 5],
      ['Ines Duarte', '2026-11-02', 'Done', 0],
      ['Person E2', '2026-10-12', 'Not needed', null],
    ])
    expect(t.rows.map((r) => r[PERSON_KEY])).toEqual(['E2', null, 'E2'])
    expect(t.rows[1].department).toBe('Design verification')
    expect(t.rows[1].location).toBe('Bengaluru')
  })

  it('tells done late, blocked and not started apart', () => {
    expect(taskState({ task: 'x', dueDate: '2026-09-01', completedDate: '2026-09-03' }, '2026-09-30')).toBe(
      'Done late',
    )
    expect(taskState({ task: 'x', dueDate: '2026-10-05', status: 'Blocked' }, '2026-09-30')).toBe('Blocked')
    expect(taskState({ task: 'x', dueDate: '2026-10-05' }, '2026-09-30')).toBe('Not started')
    expect(taskState({ task: 'x', status: 'Done' }, '2026-09-30')).toBe('Done')
  })
})

describe('right to work drills', () => {
  const rows = [
    { employeeId: 'E1', authorizationType: 'Employer-sponsored visa' as const, expiryDate: '2026-12-29' },
  ]

  it('hide the authorization type unless immigration details are on', () => {
    const off = buildDrillTable(drillSpec({ kind: 'rightToWork', title: 'Expiring', rows }), ctx(false))
    expect(off.columns.map((c) => c.key)).not.toContain('authorizationType')
    expect(off.rows[0].authorizationType).toBeNull()
    expect(off.rows[0].daysToExpiry).toBe(90)
    const on = buildDrillTable(drillSpec({ kind: 'rightToWork', title: 'Expiring', rows }), ctx(true))
    expect(on.rows[0].authorizationType).toBe('Employer-sponsored visa')
    expect(rowPerson(ctx(), on.rows[0])).toBe('E1')
  })
})

describe('hiring plan drills', () => {
  it('show the month and open the linked requisition from its ID', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'hiringPlan',
        title: 'Plan',
        rows: [
          { period: '2026-11-01', businessUnit: 'Silicon', department: 'DV', plannedHires: 2, reqId: 'R1' },
          { period: '2026-12-01', businessUnit: 'Silicon', department: 'DV', plannedHires: 1, reqId: 'R9' },
        ],
      }),
      ctx(),
    )
    expect(t.rows.map((r) => [r.period, r.reqStatus])).toEqual([
      ['Nov 2026', 'Open'],
      ['Dec 2026', 'Not found'],
    ])
    const link = (t.rows[0][DRILLS_KEY] as Record<string, () => { kind: string; rows: unknown[] }>).reqId()
    expect(link).toMatchObject({ kind: 'requisitions', rows: [data.requisitions[0]] })
    expect(t.rows[1][DRILLS_KEY]).toBeUndefined()
  })
})

describe('survey drills', () => {
  it('open groups, never a respondent, a date or a single answer', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'surveyGroups',
        title: 'Day-30 readiness by department',
        rows: [
          {
            survey: 'Onboarding pulse day 30',
            wave: '2026-07',
            groupBy: 'Department',
            group: 'Design verification',
            driver: 'Readiness',
            item: null,
            respondents: 12,
            responses: 12,
            scale: '1-5',
            mean: 3.4,
            topBox: 0.42,
            nps: null,
            suppressed: false,
          },
          {
            survey: 'Onboarding pulse day 30',
            wave: '2026-07',
            groupBy: 'Department',
            group: 'Other (2)',
            driver: 'Readiness',
            item: null,
            respondents: 4,
            responses: 4,
            scale: '1-5',
            mean: 2.1,
            topBox: 0.2,
            nps: null,
            suppressed: true,
          },
        ],
      }),
      ctx(),
    )
    expect(t.rows[1]).toMatchObject({ mean: null, topBox: null, shown: 'Hidden to protect anonymity' })
    for (const r of t.rows) expect(r[PERSON_KEY]).toBeNull()
    expect(drillNoun('surveyGroups', 2)).toBe('2 groups')
    expect(drillTableHint('surveyGroups', { rowsOpen: true, cellsOpen: false })).toBeNull()
  })

  it('show raw answers in the Data room without respondent, date or score', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'surveyResponses',
        title: 'Answers with no driver',
        rows: [
          {
            survey: 'Exit survey',
            wave: '2026 Q2',
            responseDate: '2026-05-20',
            respondentKey: 'E1',
            item: 'EX-1',
            score: 2,
            scale: '1-5',
            subjectKey: 'HR-1',
          },
        ],
      }),
      ctx(),
    )
    const keys = t.columns.map((c) => c.key)
    for (const k of ['respondentKey', 'responseDate', 'score', 'subjectKey']) expect(keys).not.toContain(k)
    expect(JSON.stringify(t.rows)).not.toMatch(/E1|2026-05-20|HR-1/)
  })

  it('take their tier from Survey responses', () => {
    expect(drillDataset('surveyGroups')).toBe('surveyResponses')
    expect(drillDataset('rightToWork')).toBe('rightToWork')
    const tier = drillTier(ctx().quality, { kind: 'surveyGroups' })
    expect(tier).toMatchObject({ dataset: 'surveyResponses', tier: 'none', ofDataset: true })
  })
})

describe('leave transactions', () => {
  it('show the expected return but never the leave reason against a named person', () => {
    const t = buildDrillTable(
      drillSpec({
        kind: 'transactions',
        title: 'On leave',
        rows: [
          {
            transactionId: 'T1',
            type: 'Leave start',
            employeeId: 'E1',
            submittedDate: '2026-08-01',
            effectiveDate: '2026-08-15',
            dueDate: '2026-08-15',
            leaveReason: 'Medical',
            expectedReturnDate: '2026-11-15',
          },
        ],
      }),
      ctx(),
    )
    expect(t.columns.map((c) => c.key)).toContain('expectedReturnDate')
    expect(JSON.stringify(t.rows)).not.toContain('Medical')
  })
})
