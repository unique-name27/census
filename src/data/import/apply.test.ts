import { describe, expect, it } from 'vitest'
import { type DatasetKey, datasetDef, type Employee } from '../schema'
import { applyMapping, suggestOptions } from './apply'
import { autoMap } from './automap'
import { issueTableRows, summarizeIssues } from './issues'
import { sheetFromRows } from './parse'
import { FIXTURE } from './test-fixtures'
import type { ApplyOptions, ParsedSheet } from './types'
import { summarizeValues } from './values'

function sheetOf(aoa: unknown[][]): ParsedSheet {
  const s = sheetFromRows('Sheet1', aoa)
  if (!s) throw new Error('empty sheet')
  return s
}

function run<K extends DatasetKey>(
  key: K,
  aoa: unknown[][],
  extra: { roster?: Employee[]; options?: ApplyOptions } = {},
) {
  const sheet = sheetOf(aoa)
  const def = datasetDef(key)
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  return applyMapping<K>({ sheet, def, mapping, ...extra })
}

const ROSTER: Employee[] = FIXTURE.employees

describe('employees', () => {
  it('skips rows missing required values and says why', () => {
    const r = run('employees', [
      ['Employee ID', 'Name', 'Hire date'],
      ['E1', 'Ana Ruiz', '2020-01-06'],
      [null, 'No Id', '2020-01-06'],
      ['E3', 'Bad Date', 'soon'],
    ])
    expect(r.rows.map((e) => e.employeeId)).toEqual(['E1'])
    expect(r.stats.skippedMissingRequired).toBe(2)
    const skipped = r.issues.filter((i) => i.action === 'row-skipped')
    expect(skipped).toEqual([
      expect.objectContaining({
        row: 3,
        field: 'employeeId',
        code: 'missing-required',
        issue: 'Employee ID is blank, and it is required.',
      }),
      expect.objectContaining({
        row: 4,
        id: 'E3',
        field: 'hireDate',
        code: 'unreadable',
        value: 'soon',
        issue: '"soon" is not a date.',
      }),
    ])
  })

  it('stops with one clear issue when a required column is not mapped', () => {
    const r = run('employees', [
      ['Employee ID', 'Name'],
      ['E1', 'Ana'],
    ])
    expect(r.rows).toEqual([])
    expect(r.issues).toEqual([
      expect.objectContaining({ row: 0, field: 'hireDate', code: 'column-missing', action: 'row-skipped' }),
    ])
    expect(r.stats.skippedMissingRequired).toBe(1)
  })

  it('fills documented defaults and logs the judgment calls', () => {
    const r = run('employees', [
      ['Employee ID', 'Hire date', 'Location', 'Worker type'],
      ['E1', '2020-01-06', 'bangalore', 'Full-time'],
      ['E2', '2021-02-01', 'Phoenix', null],
      ['E3', '2022-03-01', null, 'Seasonal'],
    ])
    const [a, b, c] = r.rows
    expect(a).toMatchObject({
      location: 'Bengaluru',
      country: 'India',
      employmentType: 'Employee',
      name: 'E1',
      department: 'Unknown',
    })
    expect(b).toMatchObject({ location: 'Phoenix', country: 'Unknown', employmentType: 'Employee' })
    // An unrecognized value is never replaced by a default: it stays blank and is logged.
    expect(c).toMatchObject({ location: 'Unknown', employmentType: null, level: null, managerId: null })
    expect(r.stats.defaults.employmentType).toBe(1)
    expect(r.stats.defaults.country).toBe(3)
    expect(r.stats.rowsWithIssues).toBe(2)
    const byField = (f: string) => r.issues.filter((i) => i.field === f)
    expect(byField('employmentType')).toEqual([
      expect.objectContaining({
        row: 3,
        code: 'defaulted',
        issue: 'Employment type was blank, so it was treated as Employee.',
      }),
      expect.objectContaining({
        row: 4,
        code: 'unknown-value',
        action: 'left-blank',
        issue: '"Seasonal" is not a recognized employment type (Employee, Contractor, Intern).',
      }),
    ])
    // Unmapped columns get one sheet-level line, not one per row.
    expect(byField('department')).toEqual([
      expect.objectContaining({
        row: 0,
        code: 'defaulted',
        issue: 'No column is mapped to Department, so 3 rows were set to Unknown.',
      }),
    ])
    expect(byField('name')).toEqual([
      expect.objectContaining({
        row: 0,
        issue: 'No column is mapped to Name, so 3 rows were filled from the employee ID.',
      }),
    ])
  })

  it('builds the name from first and last name columns', () => {
    const r = run('employees', [
      ['Employee ID', 'First Name', 'Last Name', 'Hire date'],
      ['E1', 'Ana', 'Ruiz', '2020-01-06'],
    ])
    expect(r.rows[0].name).toBe('Ana Ruiz')
  })

  it('reads a day-first date column as day-first', () => {
    const r = run('employees', [
      ['Employee ID', 'Hire date', 'Termination date'],
      ['E1', '03/04/2020', '01/02/2026'],
      ['E2', '25/12/2019', null],
      ['E3', '01/02/2021', '02/14/2026'],
    ])
    expect(r.used.dateOrders).toEqual({ 'Hire date': 'DMY', 'Termination date': 'MDY' })
    expect(r.rows.map((e) => [e.hireDate, e.terminationDate])).toEqual([
      ['2020-04-03', '2026-01-02'],
      ['2019-12-25', null],
      ['2021-02-01', '2026-02-14'],
    ])
  })

  it('lets the user override a detected day order', () => {
    const r = run(
      'employees',
      [
        ['Employee ID', 'Hire date'],
        ['E1', '03/04/2020'],
      ],
      { options: { dateOrders: { 'Hire date': 'DMY' } } },
    )
    expect(r.rows[0].hireDate).toBe('2020-04-03')
  })

  it('keeps the most recent duplicate', () => {
    const r = run('employees', [
      ['Employee ID', 'Name', 'Hire date', 'Termination date'],
      ['E1', 'Ana (rehire)', '2023-05-01', null],
      ['E1', 'Ana', '2015-01-01', '2020-06-30'],
      ['E2', 'Bo', '2019-01-01', null],
      ['E2', 'Bo Chen', '2019-01-01', null],
    ])
    expect(r.rows.map((e) => e.name)).toEqual(['Ana (rehire)', 'Bo Chen'])
    expect(r.stats.duplicates).toBe(2)
    const dups = r.issues.filter((i) => i.code === 'duplicate')
    expect(dups.map((d) => [d.row, d.issue])).toEqual([
      [3, 'Same Employee ID as row 2; the row with the more recent dates was kept.'],
      [4, 'Same Employee ID as row 5; the later row in the file was kept.'],
    ])
  })

  it('links managers by ID, then by name, and clears what it cannot trust', () => {
    const r = run('employees', [
      ['Employee ID', 'Name', 'Level', 'Manager', 'Hire date'],
      ['00100', 'Maya Lindqvist', 'E3', null, '2012-01-01'],
      ['200', 'Rahul Menon', 'E1', '100', '2015-01-01'],
      ['300', 'Jane Q. Smith', 'M1', 'Menon, Rahul', '2016-01-01'],
      ['400', 'Tom Ray', 'L3', 'Jane Smith', '2018-01-01'],
      ['500', 'Lee Park', 'L3', '500', '2019-01-01'],
      ['600', 'Alex Kim', 'L2', 'Nobody Here', '2019-01-01'],
      ['601', 'Alex Kim', 'L2', '300', '2019-01-01'],
      ['700', 'Sam Ito', 'L3', 'Alex Kim', '2020-01-01'],
      ['800', 'Loop A', 'L4', '900', '2020-01-01'],
      ['900', 'Loop B', 'M2', '1000', '2020-01-01'],
      ['1000', 'Loop C', 'L5', '800', '2020-01-01'],
    ])
    const mgr = Object.fromEntries(r.rows.map((e) => [e.employeeId, e.managerId]))
    expect(mgr).toEqual({
      '00100': null,
      '200': '00100',
      '300': '200',
      '400': '300',
      '500': null,
      '600': null,
      '601': '300',
      '700': null,
      '800': '900',
      '900': null,
      '1000': '800',
    })
    expect(r.stats.managers).toEqual({ byId: 5, byName: 2, cleared: 4, topLevel: 5 })
    const codes = r.issues.filter((i) => i.field === 'managerId').map((i) => [i.id, i.code])
    expect(codes).toEqual([
      ['500', 'manager-self'],
      ['600', 'manager-unknown'],
      ['700', 'manager-ambiguous'],
      ['900', 'manager-cycle'],
    ])
    expect(r.issues.find((i) => i.code === 'manager-cycle')?.issue).toBe(
      'Reporting line loops back (800 → 900 → 1000 → 800); cleared here so this person sits at the top.',
    )
  })
})

describe('candidates', () => {
  it('imports a Greenhouse export without IDs using documented defaults', () => {
    const r = run('candidates', [
      ['Candidate Name', 'Job', 'Current Stage', 'Status', 'Source', 'Applied At', 'Rejected At', 'Hired At'],
      ['Ana Ruiz', 'R-2041', 'Phone Screen', 'Active', 'LinkedIn', '2026-07-01', null, null],
      ['Bo Chen', 'R-2041', 'Application Review', 'Rejected', null, '2026-07-03', '2026-07-10', null],
      ['Cy Dorn', 'R-2050', 'Offer accepted', null, 'Employee referral', '2026-06-01', null, '2026-08-20'],
    ])
    expect(r.rows).toHaveLength(3)
    const [a, b, c] = r.rows
    expect(a).toMatchObject({
      currentStage: 'Screen',
      status: 'Active',
      source: 'LinkedIn',
      stageEnteredDate: null,
    })
    expect(a.applicationId).toMatch(/^APP-[0-9A-Z]+$/)
    expect(new Set(r.rows.map((x) => x.applicationId)).size).toBe(3)
    expect(b).toMatchObject({
      currentStage: 'Applied',
      status: 'Rejected',
      source: 'Unknown',
      stageEnteredDate: '2026-07-03',
      rejectedDate: '2026-07-10',
    })
    expect(c).toMatchObject({
      currentStage: 'Hired',
      status: 'Hired',
      source: 'Referral',
      hiredDate: '2026-08-20',
      stageEnteredDate: '2026-08-20',
    })
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 0,
        field: 'applicationId',
        issue: 'No column is mapped to Application ID, so 3 rows were built from the candidate and the req.',
      }),
    )
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 4,
        field: 'status',
        issue: 'Status was blank, so it was inferred from the hired and exit dates.',
      }),
    )
  })

  it('skips candidates whose stage is not recognized, and accepts manual value corrections', () => {
    const aoa = [
      ['Application ID', 'Req ID', 'Stage', 'Status', 'Applied date'],
      ['A1', 'R1', 'Background check xyz', 'Active', '2026-01-01'],
      ['A2', 'R1', 'Screen', 'Active', '2026-01-01'],
    ]
    const r = run('candidates', aoa)
    expect(r.rows.map((x) => x.applicationId)).toEqual(['A2'])
    expect(r.issues.find((i) => i.row === 2)).toMatchObject({
      field: 'currentStage',
      code: 'unknown-value',
      action: 'row-skipped',
    })
    const fixed = run('candidates', aoa, {
      options: { valueMaps: { currentStage: { 'background check xyz': 'Offer' } } },
    })
    expect(fixed.rows.map((x) => x.currentStage)).toEqual(['Offer', 'Screen'])
  })

  it('summarizes distinct values for the value grid', () => {
    const sheet = sheetOf([['Stage'], ['Phone Screen'], ['phone screen'], ['Onsite'], ['Mystery'], [null]])
    expect(summarizeValues(sheet, 'Stage', datasetDef('candidates'), 'currentStage')).toEqual([
      { raw: 'Phone Screen', key: 'phone screen', count: 2, value: 'Screen', recognized: true },
      { raw: 'Onsite', key: 'onsite', count: 1, value: 'Onsite', recognized: true },
      { raw: 'Mystery', key: 'mystery', count: 1, value: null, recognized: false },
    ])
  })
})

describe('compensation', () => {
  it('detects whole-number percents and converts them', () => {
    const r = run('comp', [
      ['Employee ID', 'Currency', 'Base salary', 'Range mid', 'Merit %', 'Target bonus'],
      ['E0006', 'USD', '128,000', '130000', '3', '10%'],
      ['E0005', 'USD', '$95k', '100000', '3.5', '12.5'],
    ])
    expect(r.used.percentWhole).toEqual({ targetBonusPct: true, meritPct: true })
    expect(r.rows.map((c) => [c.baseSalary, c.meritPct, c.targetBonusPct, c.fxToUsd])).toEqual([
      [128000, 0.03, 0.1, 1],
      [95000, 0.035, 0.125, 1],
    ])
  })

  it('annualizes hourly rows named by a pay basis column', () => {
    const sheet = sheetOf([
      ['Employee ID', 'Currency', 'Base salary', 'Range mid', 'Pay basis'],
      ['E0006', 'USD', 46, 45, 'Hourly'],
      ['E0005', 'USD', 120000, 118000, 'Salaried'],
    ])
    const def = datasetDef('comp')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    expect(suggestOptions(sheet, def, mapping).hourlyToAnnual).toEqual({
      hours: 2080,
      basisHeader: 'Pay basis',
    })
    const r = applyMapping<'comp'>({ sheet, def, mapping })
    expect(r.rows.map((c) => [c.baseSalary, c.rangeMid])).toEqual([
      [95680, 93600],
      [120000, 118000],
    ])
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 2,
        code: 'converted',
        issue: 'Hourly rate 46 annualized to 95,680 (2,080 hours a year).',
      }),
    )
    const off = applyMapping<'comp'>({ sheet, def, mapping, options: { hourlyToAnnual: null } })
    expect(off.rows[0].baseSalary).toBe(46)
  })

  it('treats a column of small amounts as hourly when there is no basis column', () => {
    const r = run('comp', [
      ['Employee ID', 'Hourly rate', 'Range mid'],
      ['E0006', 40, 42],
      ['E0005', 52.5, 50],
    ])
    expect(r.used.hourlyToAnnual).toEqual({ hours: 2080, basisHeader: null })
    expect(r.rows.map((c) => c.baseSalary)).toEqual([83200, 109200])
  })

  it('fills currency from the roster site and FX from reference rates', () => {
    const r = run(
      'comp',
      [
        ['Employee ID', 'Base salary', 'Range mid'],
        ['E0004', 112500, 110000],
        ['E0006', 128000, 130000],
        ['4', 90000, 95000],
        ['E9999', 50000, 52000],
      ],
      { roster: ROSTER },
    )
    expect(r.rows.map((c) => [c.employeeId, c.currency, c.fxToUsd])).toEqual([
      ['E0004', 'EUR', 1.1],
      ['E0006', 'USD', 1],
      ['4', 'USD', 1],
      ['E9999', 'USD', 1],
    ])
    expect(r.stats.notInRoster).toBe(2)
    expect(r.issues.filter((i) => i.row === 0).map((i) => i.issue)).toEqual([
      'No column is mapped to Currency, so 2 rows were taken from the employee’s work site.',
      'No column is mapped to Currency, so 2 rows were treated as USD.',
      'No column is mapped to FX to USD, so 1 row was set to the reference rate for EUR (1.1 USD).',
    ])
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        row: 5,
        code: 'not-in-roster',
        issue: 'Employee ID E9999 is not in the current roster.',
      }),
    )
  })

  it('restores leading zeros against the roster', () => {
    const roster: Employee[] = [{ ...ROSTER[0], employeeId: '00123', location: 'Munich' }]
    const r = run(
      'comp',
      [
        ['Employee ID', 'Base salary', 'Range mid', 'Currency'],
        [123, 100000, 100000, 'EUR'],
      ],
      { roster },
    )
    expect(r.rows[0].employeeId).toBe('00123')
    expect(r.stats.notInRoster).toBe(0)
    expect(r.issues).toContainEqual(
      expect.objectContaining({
        code: 'converted',
        issue: 'Matched to roster ID 00123 (the ID was written differently).',
      }),
    )
  })
})

describe('other datasets', () => {
  it('reviews: rating labels and cycle dates from the cycle name', () => {
    const r = run('reviews', [
      ['Employee ID', 'Review cycle', 'Final rating', 'Potential'],
      ['E0005', '2026 Mid-year', 'Exceeds', 'Medium'],
      ['E0008', 'FY25 Annual', '3 - Meets', 'HiPo'],
    ])
    expect(r.rows.map((x) => [x.cycleDate, x.rating, x.potential])).toEqual([
      ['2026-06-30', 4, 'Moderate'],
      ['2025-12-31', 3, 'High'],
    ])
  })

  it('cases: SLA defaults from the category, timestamps to the minute', () => {
    const r = run('cases', [
      ['Case ID', 'Opened', 'Status', 'Category', 'Channel'],
      ['HR-1', '2026-09-30 14:05:31', 'Work in progress', 'payroll', 'e-mail'],
      ['HR-2', '9/30/2026 9:00 AM', 'New', 'Parking', null],
    ])
    expect(r.rows[0]).toMatchObject({
      openedAt: '2026-09-30T14:05',
      status: 'In progress',
      category: 'Payroll',
      channel: 'Email',
      processId: 'PY-05',
      team: 'Payroll',
      responseTargetHours: 8,
      resolutionTargetHours: 48,
      priority: 'P3',
      tier: 'Tier 1',
    })
    expect(r.rows[1]).toMatchObject({
      openedAt: '2026-09-30T09:00',
      category: 'Parking',
      team: 'Unknown',
      processId: null,
      channel: 'Unknown',
    })
  })

  it('transactions: process from the type, due date from the effective date', () => {
    const r = run('transactions', [
      ['Transaction ID', 'Business process', 'Employee ID', 'Initiated', 'Effective date'],
      ['T1', 'Hire', 'E0009', '2026-05-20', '2026-06-01'],
    ])
    expect(r.rows[0]).toMatchObject({ type: 'New hire', processId: 'ON-03', dueDate: '2026-06-01' })
  })

  it('requisitions: unknown statuses skip the row; hiring managers resolve by name', () => {
    const r = run(
      'requisitions',
      [
        ['Req ID', 'Job title', 'Hiring manager', 'Opened date', 'Status'],
        ['R1', 'Verification engineer', 'Chen Wei-Ling', '2026-01-05', 'Approved'],
        ['R2', 'Layout designer', 'Avi Peretz', '2026-02-01', 'Draft'],
      ],
      { roster: ROSTER },
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      status: 'Open',
      hiringManagerId: 'E0003',
      openings: 1,
      reqType: 'New',
      priority: 'Standard',
      level: null,
    })
    expect(r.issues.find((i) => i.row === 3)).toMatchObject({
      field: 'status',
      code: 'unknown-value',
      action: 'row-skipped',
    })
  })

  it('job changes: change type inferred from levels when blank', () => {
    const r = run('jobChanges', [
      ['Employee ID', 'Effective date', 'Prior level', 'New level', 'From department', 'To department'],
      ['E0005', '2024-04-01', 'L3', 'L4', 'DV', 'DV'],
      ['E0008', '2025-09-15', 'L2', 'L2', 'DV', 'PD'],
    ])
    expect(r.rows.map((x) => x.changeType)).toEqual(['Promotion', 'Transfer'])
  })
})

describe('issue summaries', () => {
  it('groups the log, most serious first, in plain sentences', () => {
    const r = run('employees', [
      ['Employee ID', 'Hire date', 'Level', 'Worker type'],
      ['E1', 'soon', 'L3', 'FTE'],
      ['E2', '2020-01-01', 'Wizard', null],
      ['E3', '2020-01-01', 'Guru', null],
      ['E3', '2021-01-01', 'L4', 'FTE'],
    ])
    const s = summarizeIssues(r.issues)
    expect(s.map((x) => x.message)).toEqual([
      '1 hire date value could not be read (for example "soon"); the row was skipped.',
      '1 duplicate row by employee ID; the most recent row was kept.',
      '1 level value is not recognized (for example "Wizard"); left blank.',
      'No column is mapped to Name, so 2 rows were filled from the employee ID.',
      'No column is mapped to Job title, so 2 rows were set to Unknown.',
      'No column is mapped to Business unit, so 2 rows were set to Unknown.',
      'No column is mapped to Department, so 2 rows were set to Unknown.',
      'No column is mapped to Location, so 2 rows were set to Unknown.',
      'No column is mapped to Country, so 2 rows were set to Unknown.',
      'Employment type was filled with a default in 1 row.',
    ])
    expect(issueTableRows(r.issues)[0]).toEqual({
      row: null,
      id: '',
      field: 'Name',
      value: '',
      issue: 'No column is mapped to Name, so 2 rows were filled from the employee ID.',
      action: 'Default used',
    })
  })

  it('counts defaults on the imported rows only, after duplicates are dropped', () => {
    const r = run('employees', [
      ['Employee ID', 'Hire date', 'Worker type'],
      ['E1', '2020-01-01', null],
      ['E2', '2020-01-01', null],
      ['E2', '2021-01-01', null],
      ['E2', '2022-01-01', 'FTE'],
      ['E3', 'never', null],
    ])
    expect(r.stats.rowsIn).toBe(5)
    expect(r.stats.duplicates).toBe(2)
    expect(r.stats.skippedMissingRequired).toBe(1)
    expect(r.stats.rowsOut).toBe(2)
    // Unmapped columns: one default per imported row, never more than rowsOut.
    expect(r.stats.defaults.name).toBe(2)
    expect(r.stats.defaults.department).toBe(2)
    for (const n of Object.values(r.stats.defaults)) expect(n).toBeLessThanOrEqual(r.stats.rowsOut)
    // A mapped column left blank: only E1 (the kept E2 row has a worker type).
    expect(r.stats.defaults.employmentType).toBe(1)
    expect(r.stats.defaulted).toBe(Object.values(r.stats.defaults).reduce((a, b) => a + b, 0))
    const name = r.issues.find((x) => x.row === 0 && x.field === 'name')
    expect(name?.issue).toBe('No column is mapped to Name, so 2 rows were filled from the employee ID.')
  })
})
