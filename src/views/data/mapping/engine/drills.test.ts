import { describe, expect, it } from 'vitest'
import type { ImportIssue } from '@/data/import/types'
import { importRows, peopleSpec, requisitionSpec, rowsSpec } from './drills'
import { AS_OF, messyCompany } from './test-company'

const data = messyCompany()

const issue = (id: string, value: string, field = 'department'): ImportIssue => ({
  row: 5,
  id,
  field,
  label: 'Department',
  value,
  code: 'unknown-value',
  issue: 'Not recognized',
  action: 'cleared',
})

describe('peopleSpec', () => {
  it('lists the people at the given rows as an active list', () => {
    const spec = peopleSpec({
      title: 'Design Verification',
      asOf: AS_OF,
      employees: data.employees,
      rows: [0, 4],
      focus: 'org',
    })!
    expect(spec.rows.map((e) => e.employeeId)).toEqual(['E001', 'E005'])
    expect(spec.hide).toContain('terminationDate')
    expect(spec.subtitle).toBe('Active as of 30 Sep 2026')
    expect(spec.extra?.columns.map((c) => c.key)).toEqual(['businessUnit', 'costCenter'])
    expect(spec.extra?.values(spec.rows[1])).toMatchObject({ businessUnit: 'Systems' })
  })

  it('adds job family then job function for a job architecture number', () => {
    const spec = peopleSpec({
      title: 'Firmware',
      asOf: AS_OF,
      employees: data.employees,
      rows: [5, 6],
      focus: 'job',
    })!
    expect(spec.extra?.columns.map((c) => c.label)).toEqual(['Job family', 'Job function'])
    expect(spec.extra?.values(spec.rows[1])).toMatchObject({
      jobFamily: 'Operations',
      jobFunction: 'Firmware',
    })
  })

  it('is null when there is no one to list', () => {
    expect(
      peopleSpec({ title: 'x', asOf: AS_OF, employees: data.employees, rows: [], focus: 'job' }),
    ).toBeNull()
  })
})

describe('requisitionSpec and rowsSpec', () => {
  it('lists the requisitions or rows at the given indexes', () => {
    expect(requisitionSpec({ title: 'DV', data, rows: [1, 2] })?.rows.map((r) => r.reqId)).toEqual([
      'R2',
      'R3',
    ])
    expect(rowsSpec({ kind: 'requisitions', title: 'x', data, rows: [0, 99] })?.rows).toHaveLength(1)
    expect(rowsSpec({ kind: 'cases', title: 'x', data, rows: [0] })).toBeNull()
  })
})

describe('importRows', () => {
  it('matches logged values to loaded rows by their key', () => {
    const issues = [
      issue('E002', 'DV'),
      issue('E003', 'Design verif'),
      issue('E999', 'DV'),
      issue('E004', 'DV', 'location'),
    ]
    expect(importRows('employees', data.employees, issues, 'department', 'DV')).toEqual([1])
    expect(importRows('employees', data.employees, issues, 'department', 'Nope')).toEqual([])
  })
})
