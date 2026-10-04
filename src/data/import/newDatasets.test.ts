/**
 * The datasets added for Onboarding, Compliance, Listening and Leave & return, through the real
 * pipeline: sheet → detect → auto-map → apply.
 */
import { describe, expect, it } from 'vitest'
import { type Candidate, type DatasetKey, datasetDef, type Employee } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { guessDataset } from './detect'
import { sheetFromRows } from './sheet'
import type { ImportResult } from './types'
import { normalizeEnumValue } from './vocab'

const emp = (id: string, hireDate: string): Employee => ({
  employeeId: id,
  name: `Person ${id}`,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon',
  department: 'Design verification',
  location: 'Austin',
  country: 'United States',
  level: 'L3',
  managerId: null,
  hireDate,
  employmentType: 'Employee',
})
const roster = [emp('E1', '2026-10-12'), emp('E2', '2025-01-06')]
const candidates = [{ applicationId: 'A7', reqId: 'R1', startDate: '2026-11-02' } as Candidate]

function run<K extends DatasetKey>(
  key: K,
  aoa: unknown[][],
  extra: { roster?: Employee[]; candidates?: Candidate[] } = {},
): ImportResult<K> {
  const sheet = sheetFromRows('Sheet1', aoa)!
  const def = datasetDef(key)
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  return applyMapping<K>({ sheet, def, mapping, roster: extra.roster, candidates: extra.candidates })
}

describe('onboarding tasks', () => {
  const sheet = [
    ['Employee ID', 'Application ID', 'Task', 'Due', 'Completed', 'Status'],
    ['E1', null, 'Laptop', 'Day -3', '2026-10-08', null],
    ['E1', null, 'BGC', 'Day -3', null, 'Pending'],
    [null, 'A7', 'I-9 Section 2', '3 BD', null, null],
    [null, 'A9', 'Badge', 'Day -2', null, null],
    ['E1', null, '30-day check-in', null, null, 'Waived'],
    ['E1', null, 'Team lunch', null, null, 'Open'],
    [null, null, 'Laptop', 'Day -3', null, null],
  ]

  it('is recognized by its columns', () => {
    expect(guessDataset(sheetFromRows('Checklist', sheet)!)[0].key).toBe('onboardingTasks')
  })

  it('converts "Day -3" with the start date and fills the checklist defaults', () => {
    const r = run('onboardingTasks', sheet, { roster, candidates })
    const rows = r.rows
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({
      employeeId: 'E1',
      task: 'Laptop shipped',
      owner: 'IT',
      processId: 'ON-01',
      dueDate: '2026-10-09',
      completedDate: '2026-10-08',
      status: 'Done',
    })
    expect(rows[1]).toMatchObject({
      task: 'Background check cleared',
      status: 'In progress',
      owner: 'People ops',
    })
    // Accepted candidate: 3 business days after Monday 2 Nov 2026.
    expect(rows[2]).toMatchObject({ applicationId: 'A7', task: 'I-9 Section 2', dueDate: '2026-11-05' })
    // No start date for A9: the relative due date is left blank and logged.
    expect(rows[3]).toMatchObject({ applicationId: 'A9', task: 'Badge ready', dueDate: null })
    // A blank due date takes the checklist default once the start is known (day 30).
    expect(rows[4]).toMatchObject({ task: '30-day check-in', status: 'Not needed', dueDate: '2026-11-11' })
    // Tasks outside the checklist are kept as written, with no owner guessed.
    expect(rows[5]).toMatchObject({ task: 'Team lunch', owner: null, status: 'Not started' })
    for (const row of rows) expect(typeof row.dueDate === 'string' || row.dueDate === null).toBe(true)

    const codes = r.issues.map((i) => `${i.code}:${i.field}:${i.action}`)
    expect(codes).toContain('unreadable:dueDate:left-blank')
    expect(codes).toContain('missing-required:employeeId:row-skipped')
    const summary = r.issues.find((i) => i.row === 0 && i.code === 'converted')
    expect(summary?.issue).toMatch(/^Due dates written as days from the start .* on 3 rows\.$/)
    const blank = r.issues.find((i) => i.code === 'unreadable')
    expect(blank?.issue).toBe(
      '"Day -2" means 2 days before the start, but this person\'s start date is not known, so it was left blank.',
    )
  })

  it('refuses a sheet with neither person column', () => {
    const r = run('onboardingTasks', [
      ['Task', 'Due'],
      ['Laptop', 'Day -3'],
    ])
    expect(r.rows).toEqual([])
    expect(r.issues[0]).toMatchObject({ code: 'column-missing', action: 'row-skipped' })
    expect(r.issues[0].issue).toMatch(/^Employee ID or Application ID is required/)
  })
})

describe('hiring plan', () => {
  it('reads months, defaults one hire per row and adds up identical lines', () => {
    const r = run('hiringPlan', [
      ['Target start', 'Business Unit', 'Department', 'Job title', 'Plan HC', 'Req'],
      ['Nov 2026', 'Silicon', 'Design verification', 'DV engineer', null, null],
      ['2026-11-20', 'Silicon', 'Design verification', 'DV engineer', null, null],
      ['2026-12', 'Silicon', 'Physical design', null, 4, 'R-2050'],
      ['Q1 2027', 'Silicon', 'Physical design', null, 1, null],
    ])
    expect(r.rows).toEqual([
      expect.objectContaining({
        period: '2026-11-01',
        department: 'Design verification',
        jobTitle: 'DV engineer',
        plannedHires: 2,
      }),
      expect.objectContaining({ period: '2026-12-01', plannedHires: 4, reqId: 'R-2050' }),
    ])
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['converted', 'unreadable']))
    expect(r.issues.find((i) => i.code === 'converted')?.issue).toBe(
      'Same line as row 2; its planned hires were added to that row.',
    )
  })
})

describe('right to work', () => {
  it('keeps broad authorization categories and never citizenship', () => {
    const r = run(
      'rightToWork',
      [
        ['Employee ID', 'Citizenship', 'Visa Type', 'Visa Expiry', 'License required', 'License status'],
        ['E1', 'Elsewhere', 'H-1B', '2027-03-31', 'Yes', 'Pending'],
        ['E2', 'Here', 'US Citizen', null, 'No', null],
      ],
      { roster },
    )
    expect(r.rows).toEqual([
      expect.objectContaining({
        employeeId: 'E1',
        authorizationType: 'Employer-sponsored visa',
        expiryDate: '2027-03-31',
        exportLicenseRequired: true,
        exportLicenseStatus: 'Pending',
      }),
      expect.objectContaining({
        employeeId: 'E2',
        authorizationType: 'Permanent (no expiry)',
        exportLicenseRequired: false,
        exportLicenseStatus: 'Not needed',
      }),
    ])
    for (const row of r.rows) expect(JSON.stringify(row)).not.toMatch(/Elsewhere|Here|itizen/)
  })

  it.each([
    ['H-4 EAD', 'Dependent work authorization'],
    ['STEM OPT', 'Student work authorization'],
    ['EAD (C09)', 'Employment authorization document'],
    ['L-1A', 'Intra-company transfer'],
    ['TN', 'Employer-sponsored visa'],
    ['EU Blue Card', 'Work permit'],
    ['Green card', 'Permanent (no expiry)'],
    ['International student', 'Student work authorization'],
  ])('reads %s as %s', (raw, want) => {
    const def = datasetDef('rightToWork').fields.find((f) => f.key === 'authorizationType')!
    expect(normalizeEnumValue('rightToWork', 'authorizationType', def.values!, raw)).toBe(want)
  })
})

describe('survey responses', () => {
  it('fills the wave and scale, reads agreement words and skips scores off their scale', () => {
    const r = run('surveyResponses', [
      ['Survey', 'Response date', 'Respondent ID', 'Question ID', 'Answer', 'Comments'],
      ['Day 30 pulse', '2026-07-02', 'E1', 'OB30-READY', 'Agree', 'great first week'],
      ['Candidate NPS', '2026-08-14', 'A7', 'CX-NPS', 9, null],
      ['Exit', '2026-05-20', 'E2', 'EX-1', 'Strongly disagree', null],
      ['Exit', '2026-05-20', 'E2', 'EX-2', 7, null],
    ])
    expect(r.rows).toEqual([
      expect.objectContaining({
        survey: 'Onboarding pulse day 30',
        wave: '2026-07',
        respondentKey: 'E1',
        score: 4,
        scale: '1-5',
      }),
      expect.objectContaining({ survey: 'Candidate experience', score: 9, scale: '0-10' }),
      expect.objectContaining({ survey: 'Exit survey', score: 1, scale: '1-5' }),
      // 7 reads as a 0-10 answer, so it stays.
      expect.objectContaining({ item: 'EX-2', score: 7, scale: '0-10' }),
    ])
    // The comment column never reaches the rows.
    for (const row of r.rows) expect(JSON.stringify(row)).not.toContain('great first week')
  })

  it('skips a score outside a stated scale', () => {
    const r = run('surveyResponses', [
      ['Survey', 'Wave', 'Response date', 'Respondent key', 'Item', 'Score', 'Scale'],
      ['Exit survey', '2026 Q2', '2026-05-20', 'E2', 'EX-1', 7, '1-5'],
    ])
    expect(r.rows).toEqual([])
    expect(r.issues[0]).toMatchObject({ code: 'out-of-range', field: 'score', action: 'row-skipped' })
  })

  it.each([
    ['Upward feedback', 'Manager feedback'],
    ['Hiring manager survey', 'Hiring manager satisfaction'],
    ['Return to work check-in', 'Return to work'],
    ['Case CSAT', 'HR service survey'],
    ['Course evaluation', 'Training evaluation'],
    ['Q3 engagement pulse', 'Engagement'],
    ['Onboarding 90 day', 'Onboarding pulse day 90'],
    ['Stay interviews', 'Stay interview'],
  ])('reads the survey %s as %s', (raw, want) => {
    const def = datasetDef('surveyResponses').fields.find((f) => f.key === 'survey')!
    expect(normalizeEnumValue('surveyResponses', 'survey', def.values!, raw)).toBe(want)
  })
})

describe('leave reasons', () => {
  it.each([
    ['Maternity leave', 'Parental'],
    ['FMLA - baby bonding', 'Parental'],
    ['Short-term disability', 'Medical'],
    ["Workers' Comp", "Workers' compensation"],
    ['Jury duty', 'Civic duty'],
    ['Caregiver leave', 'Family care'],
    ['Military reserve', 'Military'],
    ['LWOP', 'Personal'],
  ])('reads %s as %s', (raw, want) => {
    const def = datasetDef('transactions').fields.find((f) => f.key === 'leaveReason')!
    expect(normalizeEnumValue('transactions', 'leaveReason', def.values!, raw)).toBe(want)
  })
})
