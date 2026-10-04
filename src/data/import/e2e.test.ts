/**
 * End to end on a messy, realistic export: an HRIS roster saved as CSV with the system's own
 * column names, day-first dates, month names, title-style levels, managers given as
 * "Last, First" names and free-text worker types. The import must reproduce the clean roster.
 */
import { describe, expect, it } from 'vitest'
import { datasetDef, type Employee, type Level } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { guessDataset } from './detect'
import { summarizeIssues } from './issues'
import { readWorkbook } from './parse'
import { FIXTURE } from './test-fixtures'

const LEVEL_TEXT: Record<Level, string> = {
  L1: 'IC1',
  L2: 'IC2',
  L3: 'IC3',
  L4: 'Senior',
  L5: 'Staff',
  L6: 'Principal',
  M1: 'Manager',
  M2: 'Director',
  E1: 'VP',
  E2: 'SVP',
  E3: 'CEO',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const dMonY = (d: string) => `${+d.slice(8, 10)}-${MONTHS[+d.slice(5, 7) - 1]}-${d.slice(0, 4)}`
const lastFirst = (name: string) => {
  const parts = name.split(' ')
  return `${parts.slice(1).join(' ')}, ${parts[0]}`
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function hrisExport(employees: Employee[]): string {
  const byId = new Map(employees.map((e) => [e.employeeId, e]))
  const header = [
    'Employee Number',
    'Full Name',
    'Business Title',
    'Job Family Group',
    'Job Function',
    'Division',
    'Supervisory Organization',
    'Work Location',
    'Country Name',
    'Management Level',
    'Manager',
    'Original Hire Date',
    'Termination Date',
    'Termination Category',
    'Primary Termination Reason',
    'Regrettable',
    'Worker Type',
    'HR Partner',
    'Cost Centre',
  ]
  const lines = employees.map((e) => {
    const mgr = e.managerId ? byId.get(e.managerId) : undefined
    const category = e.terminationType ? `Terminate Employee > ${e.terminationType}` : ''
    const workerType = { Employee: 'Regular', Contractor: 'Contingent Worker', Intern: 'Summer intern' }[
      e.employmentType ?? 'Employee'
    ]
    return [
      e.employeeId,
      e.name,
      e.jobTitle,
      e.jobFamily ?? '',
      e.jobFunction ?? '',
      e.businessUnit,
      e.department,
      e.location,
      e.country,
      e.level ? LEVEL_TEXT[e.level] : '',
      mgr ? lastFirst(mgr.name) : '',
      dmy(e.hireDate),
      e.terminationDate ? dMonY(e.terminationDate) : '',
      category,
      e.terminationReason ?? '',
      e.regrettable == null ? '' : e.regrettable ? 'Y' : 'N',
      workerType,
      e.hrbp ?? '',
      e.costCenter ?? '',
    ]
      .map(csvCell)
      .join(',')
  })
  return ['Workers report', 'Run on 30/09/2026', '', header.join(','), ...lines].join('\r\n')
}

describe('messy HRIS roster export', () => {
  it('imports to exactly the clean roster', () => {
    const csv = hrisExport(FIXTURE.employees)
    const book = readWorkbook(new TextEncoder().encode(csv), 'Workers report.csv')
    const sheet = book.sheets[0]
    expect(sheet.headerRow).toBe(3)

    const [best] = guessDataset(sheet)
    expect(best.key).toBe('employees')
    const def = datasetDef('employees')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    const unmapped = def.fields.filter((f) => !mapping[f.key].header).map((f) => f.key)
    expect(unmapped).toEqual([])

    const r = applyMapping<'employees'>({ sheet, def, mapping })
    expect(r.used.dateOrders['Original Hire Date']).toBe('DMY')
    expect(r.stats.managers).toEqual({ byId: 0, byName: 9, cleared: 0, topLevel: 1 })
    expect(summarizeIssues(r.issues)).toEqual([])
    expect(r.rows).toEqual(FIXTURE.employees)
  })
})
