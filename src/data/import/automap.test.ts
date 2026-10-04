import { describe, expect, it } from 'vitest'
import { datasetDef } from '../schema'
import { autoMap, knownShare, rankHeaders, withChoice } from './automap'
import { profileColumn } from './sniff'
import type { Mapping } from './types'

/** Field → header for the mapped fields only. */
const picks = (m: Mapping) =>
  Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (v.header ? [[k, v.header]] : [])))

/** Rows built from per-header sample columns. */
function rows(cols: Record<string, unknown[]>): Record<string, unknown>[] {
  const n = Math.max(...Object.values(cols).map((c) => c.length))
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(Object.entries(cols).map(([h, c]) => [h, c[i] ?? null])),
  )
}

describe('autoMap: tricky headers', () => {
  it("doesn't give the employee's name to 'Manager name'", () => {
    const headers = ['Employee ID', 'Manager name', 'Hire date']
    const m = autoMap(headers, [], datasetDef('employees'))
    expect(m.name.header).toBe(null)
    expect(m.managerId.header).toBe('Manager name')
  })

  it("doesn't read 'Termination type' as the employment type", () => {
    const headers = ['Employee ID', 'Hire date', 'Termination type']
    const m = autoMap(
      headers,
      rows({ 'Termination type': ['Voluntary', 'Involuntary', 'Voluntary', null] }),
      datasetDef('employees'),
    )
    expect(m.employmentType.header).toBe(null)
    expect(m.terminationType.header).toBe('Termination type')
  })

  it("never matches short words inside longer ones ('id', 'min', 'mid', 'rate')", () => {
    const headers = ['Paid Hours', 'Administration', 'Midwest Region', 'Accurate', 'Salary']
    const m = autoMap(headers, [], datasetDef('comp'))
    expect(picks(m)).toEqual({ baseSalary: 'Salary' })
  })

  it('does not let a qualified header take a plain field', () => {
    const m = autoMap(['Manager Employee ID', 'Hire Date'], [], datasetDef('employees'))
    expect(m.employeeId.header).toBe(null)
    expect(m.managerId.header).toBe('Manager Employee ID')
  })

  it('assigns strongest matches first so a later field keeps its exact column', () => {
    // "Salary Min" partly matches base salary but exactly matches range minimum.
    const m = autoMap(
      ['Employee ID', 'Salary Min', 'Base Salary', 'Salary Max', 'Midpoint'],
      [],
      datasetDef('comp'),
    )
    expect(picks(m)).toEqual({
      employeeId: 'Employee ID',
      baseSalary: 'Base Salary',
      rangeMin: 'Salary Min',
      rangeMid: 'Midpoint',
      rangeMax: 'Salary Max',
    })
  })

  it('prefers the more specific of two exact matches', () => {
    const m = autoMap(['ID', 'Employee ID', 'Name'], [], datasetDef('employees'))
    expect(m.employeeId.header).toBe('Employee ID')
  })

  it('matches across spelling, order, case and abbreviations', () => {
    const m = autoMap(
      ['EMP_NO', 'Date Hired', 'Mgr ID', 'Dept.', 'termDate', 'Employee #'],
      [],
      datasetDef('employees'),
    )
    expect(m.hireDate.header).toBe('Date Hired')
    expect(m.managerId.header).toBe('Mgr ID')
    expect(m.department.header).toBe('Dept.')
    expect(m.terminationDate.header).toBe('termDate')
    expect(['EMP_NO', 'Employee #']).toContain(m.employeeId.header)
  })

  it('reads percent and hash signs in headers', () => {
    const m = autoMap(
      ['Employee ID', 'Merit %', 'Target Bonus %', 'Base salary', 'Range mid'],
      [],
      datasetDef('comp'),
    )
    expect(m.meritPct.header).toBe('Merit %')
    expect(m.targetBonusPct.header).toBe('Target Bonus %')
  })
})

describe('autoMap: value shapes', () => {
  it('drops a date field whose column holds names', () => {
    const headers = ['Candidate Name', 'Hiring Manager', 'Applied At']
    const data = rows({
      'Candidate Name': ['Ana Ruiz', 'Bo Chen', 'Cy Dorn'],
      'Hiring Manager': ['Chen Wei-Ling', 'Avi Peretz', 'Chen Wei-Ling'],
      'Applied At': ['2026-07-01', '2026-07-03', '2026-07-09'],
    })
    const m = autoMap(headers, data, datasetDef('candidates'))
    expect(m.hmDate.header).toBe(null)
    expect(m.appliedDate.header).toBe('Applied At')
    expect(m.appliedDate.reason).toMatch(/values are dates/)
  })

  it('finds an oddly named status column from its values', () => {
    const headers = ['Application ID', 'Disposition', 'Stage', 'Applied']
    const data = rows({
      'Application ID': ['A1', 'A2', 'A3', 'A4', 'A5'],
      Disposition: ['Hired', 'Rejected', 'Active', 'Withdrawn', 'Rejected'],
      Stage: ['Hired', 'Screen', 'Onsite', 'Applied', 'Screen'],
      Applied: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
    })
    const m = autoMap(headers, data, datasetDef('candidates'))
    expect(m.status.header).toBe('Disposition')
    expect(m.status.reason).toMatch(/values match the allowed list/)
    expect(m.currentStage.header).toBe('Stage')
  })

  it('marks an exact header with the wrong kind of values as doubtful', () => {
    const data = rows({ 'Hire date': ['soon', 'later', 'TBD'] })
    const m = autoMap(['Employee ID', 'Hire date'], data, datasetDef('employees'))
    expect(m.hireDate.header).toBe('Hire date')
    expect(m.hireDate.confidence).toBe('low')
    expect(m.hireDate.reason).toMatch(/don't look like dates/)
  })

  it('doubts amounts that look like percentages and percentages that look like amounts', () => {
    const data = rows({
      Salary: [0.03, 0.04, 0.035],
      'Merit %': [120000, 98000, 101000],
      'Range mid': [100000, 100000, 100000],
    })
    const m = autoMap(['Employee ID', 'Salary', 'Merit %', 'Range mid'], data, datasetDef('comp'))
    expect(m.baseSalary.reason).toMatch(/values look like percentages/)
    expect(m.baseSalary.confidence).not.toBe('high')
    expect(m.meritPct.reason).toMatch(/values look like amounts/)
    expect(m.rangeMid.confidence).toBe('high')
  })

  it('doubts a name column that holds email addresses', () => {
    const data = rows({ Name: ['ana@northgate.example', 'bo@northgate.example', 'cy@northgate.example'] })
    const m = autoMap(['Employee ID', 'Name', 'Hire date'], data, datasetDef('employees'))
    expect(m.name.reason).toMatch(/email addresses/)
    expect(m.name.confidence).toBe('medium')
  })
})

describe('autoMap: real exports', () => {
  it('maps a Greenhouse candidate export', () => {
    const headers = [
      'Candidate Name',
      'Job',
      'Current Stage',
      'Status',
      'Source',
      'Applied At',
      'Rejected At',
      'Hired At',
      'Hiring Manager',
    ]
    const data = rows({
      'Candidate Name': ['Ana Ruiz', 'Bo Chen', 'Cy Dorn'],
      Job: ['Design Verification Engineer', 'Physical Design Engineer', 'Design Verification Engineer'],
      'Current Stage': ['Application Review', 'Phone Screen', 'Offer'],
      Status: ['Active', 'Rejected', 'Hired'],
      Source: ['LinkedIn', 'Referral', 'Company Website'],
      'Applied At': ['2026-07-01', '2026-07-03', '2026-07-09'],
      'Rejected At': [null, '2026-07-10', null],
      'Hired At': [null, null, '2026-08-20'],
      'Hiring Manager': ['Chen Wei-Ling', 'Avi Peretz', 'Chen Wei-Ling'],
    })
    const m = autoMap(headers, data, datasetDef('candidates'))
    expect(picks(m)).toEqual({
      candidateName: 'Candidate Name',
      reqId: 'Job',
      currentStage: 'Current Stage',
      status: 'Status',
      source: 'Source',
      appliedDate: 'Applied At',
      rejectedDate: 'Rejected At',
      hiredDate: 'Hired At',
    })
    expect(m.candidateName.confidence).toBe('high')
    expect(m.appliedDate.confidence).toBe('high')
    // A job title in place of a req ID is worth a second look.
    expect(m.reqId.confidence).toBe('medium')
  })

  it('maps a Workday or Darwinbox roster export', () => {
    const headers = [
      'Employee Number',
      'Full Name',
      'Business Title',
      'Supervisory Organization',
      'Work Location',
      'Management Level',
      'Manager Employee ID',
      'Original Hire Date',
      'Termination Date',
      'Termination Category',
      'Regrettable',
    ]
    const data = rows({
      'Employee Number': ['10001', '10002', '10003'],
      'Full Name': ['Maya Lindqvist', 'Rahul Menon', 'Jonas Becker'],
      'Business Title': ['CEO', 'VP Engineering', 'Staff Engineer'],
      'Supervisory Organization': ['Office of the CEO', 'Engineering', 'Verification'],
      'Work Location': ['San Jose', 'Bengaluru', 'Munich'],
      'Management Level': ['1 Executive', '3 Vice President', '7 Individual Contributor'],
      'Manager Employee ID': [null, '10001', '10002'],
      'Original Hire Date': ['03/01/2012', '07/13/2015', '04/01/2019'],
      'Termination Date': [null, null, '05/29/2026'],
      'Termination Category': [null, null, 'Terminate Employee > Voluntary'],
      Regrettable: [null, null, 'Yes'],
    })
    const m = autoMap(headers, data, datasetDef('employees'))
    expect(picks(m)).toEqual({
      employeeId: 'Employee Number',
      name: 'Full Name',
      jobTitle: 'Business Title',
      department: 'Supervisory Organization',
      location: 'Work Location',
      level: 'Management Level',
      managerId: 'Manager Employee ID',
      hireDate: 'Original Hire Date',
      terminationDate: 'Termination Date',
      terminationType: 'Termination Category',
      regrettable: 'Regrettable',
    })
    for (const k of [
      'employeeId',
      'name',
      'jobTitle',
      'department',
      'location',
      'managerId',
      'hireDate',
      'terminationDate',
      'regrettable',
    ])
      expect(m[k].confidence, k).toBe('high')
  })

  it('maps a ServiceNow HR case export', () => {
    const headers = [
      'Number',
      'Opened',
      'Closed',
      'State',
      'HR service',
      'Opened for',
      'Assigned to',
      'Assignment group',
      'Priority',
      'Contact type',
    ]
    const m = autoMap(headers, [], datasetDef('cases'))
    expect(m.caseId.header).toBe('Number')
    expect(m.openedAt.header).toBe('Opened')
    expect(m.resolvedAt.header).toBe('Closed')
    expect(m.status.header).toBe('State')
    expect(m.category.header).toBe('HR service')
    expect(m.requesterId.header).toBe('Opened for')
    expect(m.assignee.header).toBe('Assigned to')
    expect(m.team.header).toBe('Assignment group')
    expect(m.priority.header).toBe('Priority')
  })
})

describe('autoMap: Greenhouse export with both Job ID and Requisition ID', () => {
  const headers = [
    'Candidate ID',
    'Candidate Name',
    'Job',
    'Job ID',
    'Requisition ID',
    'Current Stage',
    'Status',
    'Source',
    'Applied At',
  ]
  const data = rows({
    'Candidate ID': ['81234', '81235', '81236', '81237'],
    'Candidate Name': ['Ana Ruiz', 'Bo Chen', 'Cy Dorn', 'Di Park'],
    Job: ['DV Engineer', 'PD Engineer', 'PD Engineer', 'Analog Designer'],
    'Job ID': ['4012345005', '4012345006', '4012345006', '4012345011'],
    'Requisition ID': ['REQ-0042', 'REQ-0043', 'REQ-0043', 'REQ-0050'],
    'Current Stage': ['Offer', 'Application Review', 'Phone Screen', 'Onsite'],
    Status: ['Active', 'Rejected', 'Active', 'Active'],
    Source: ['LinkedIn', 'Referral', 'Agency', 'LinkedIn'],
    'Applied At': ['2026-07-01', '2026-07-03', '2026-07-09', '2026-07-12'],
  })
  const def = datasetDef('candidates')

  it('prefers Requisition ID over Job ID for the req ID, in any column order', () => {
    expect(autoMap(headers, data, def).reqId.header).toBe('Requisition ID')
    const swapped = ['Requisition ID', ...headers.filter((h) => h !== 'Requisition ID')]
    expect(autoMap(swapped, data, def).reqId.header).toBe('Requisition ID')
    expect(autoMap(headers, [], def).reqId.header).toBe('Requisition ID')
    expect(rankHeaders(headers, data, def, 'reqId').map((r) => r.header)).toEqual([
      'Requisition ID',
      'Job ID',
      'Job',
    ])
  })

  it('keeps the rest of the Greenhouse mapping', () => {
    const m = autoMap(headers, data, def)
    expect(picks(m)).toMatchObject({
      candidateId: 'Candidate ID',
      candidateName: 'Candidate Name',
      currentStage: 'Current Stage',
      status: 'Status',
      source: 'Source',
      appliedDate: 'Applied At',
    })
    // Job ID is left free for the user rather than mapped to something else.
    expect(Object.values(m).some((x) => x.header === 'Job ID')).toBe(false)
  })

  it('prefers the column whose values match the loaded requisitions', () => {
    const byJobId = [{ field: 'reqId', values: new Set(['4012345005', '4012345006', '4012345011']) }]
    const m = autoMap(headers, data, def, undefined, byJobId)
    expect(m.reqId.header).toBe('Job ID')
    expect(m.reqId.reason).toMatch(/values match records already loaded/)
    expect(rankHeaders(headers, data, def, 'reqId', byJobId)[0].header).toBe('Job ID')

    // Requisition IDs written in another case still count.
    const byReq = [{ field: 'reqId', values: new Set(['req-0042', 'req-0043', 'req-0050']) }]
    expect(autoMap(headers, data, def, undefined, byReq).reqId.header).toBe('Requisition ID')
    // A hint for another field, or an empty one, changes nothing.
    const other = [
      { field: 'candidateId', values: new Set(['4012345005']) },
      { field: 'reqId', values: new Set<string>() },
    ]
    expect(autoMap(headers, data, def, undefined, other).reqId.header).toBe('Requisition ID')
  })

  it('never lets a known-value match beat a clearly better name', () => {
    // "Job" holds titles; even if they matched, Requisition ID is the stronger name.
    const titles = [{ field: 'reqId', values: new Set(['DV Engineer', 'PD Engineer', 'Analog Designer']) }]
    expect(autoMap(headers, data, def, undefined, titles).reqId.header).toBe('Requisition ID')
  })

  it('knownShare is the share of sampled values found in the known set', () => {
    const p = profileColumn('Job ID', data)
    expect(knownShare('reqId', p, [{ field: 'reqId', values: new Set(['4012345006']) }])).toBe(0.5)
    expect(knownShare('reqId', p, undefined)).toBe(0)
    expect(
      knownShare('reqId', profileColumn('Missing', data), [{ field: 'reqId', values: new Set(['x']) }]),
    ).toBe(0)
  })
})

describe('learned synonyms and manual choices', () => {
  it('applies learned picks before scoring', () => {
    const m = autoMap(['Worker Ref', 'Hire Date'], [], datasetDef('employees'), {
      'worker ref': 'employeeId',
    })
    expect(m.employeeId).toEqual({
      header: 'Worker Ref',
      confidence: 'high',
      score: 1,
      reason: 'You chose this column before',
    })
  })

  it('ignores learned picks for fields the dataset lacks', () => {
    const m = autoMap(['Worker Ref'], [], datasetDef('employees'), { 'worker ref': 'reqId' })
    expect(m.employeeId.header).toBe(null)
  })

  it('withChoice moves a column to the chosen field and frees it elsewhere', () => {
    const m = autoMap(['Employee ID', 'Name'], [], datasetDef('employees'))
    const next = withChoice(m, 'hrbp', 'Name')
    expect(next.name.header).toBe(null)
    expect(next.hrbp).toEqual({ header: 'Name', confidence: 'high', score: 1, reason: 'Chosen by you' })
    expect(withChoice(next, 'hrbp', null).hrbp.reason).toBe('Left unmapped by you')
  })

  it('ranks columns for one field', () => {
    const ranked = rankHeaders(
      ['Hire Date', 'Start Date', 'Term Date', 'Name'],
      [],
      datasetDef('employees'),
      'hireDate',
    )
    expect(ranked.map((r) => r.header)).toEqual(['Hire Date', 'Start Date'])
    expect(ranked[0].confidence).toBe('high')
  })
})

describe('every dataset maps its own labels exactly', () => {
  it.each([
    'employees',
    'jobChanges',
    'requisitions',
    'candidates',
    'cases',
    'transactions',
    'reviews',
    'succession',
    'learning',
    'comp',
  ] as const)('%s', (key) => {
    const def = datasetDef(key)
    const headers = def.fields.map((f) => (f.required ? `${f.label} *` : f.label))
    const m = autoMap(headers, [], def)
    for (const f of def.fields) {
      expect(m[f.key].header, f.key).toBe(f.required ? `${f.label} *` : f.label)
      expect(m[f.key].score, f.key).toBe(1)
    }
  })
})
