import { describe, expect, it } from 'vitest'
import { applyMapping, autoMap, readWorkbook } from '@/data/import'
import { datasetDef, type Employee } from '@/data/schema'
import { datasetChecks } from './checks'
import { coverageText, fieldCoverage } from './coverage'
import { defaultFills, rowKeyOf } from './fills'
import { quietFills } from './flow'

/** A Workday-style roster with no Employment type or Country column and two blank names. */
const csv = [
  'Employee ID,Name,Department,Location,Level,Manager,Hire Date,Termination Date,Termination Type',
  'W1,Ana Ruiz,Finance,San Jose,E1,,2015-04-03,,',
  'W2,,Finance,San Jose,L4,"Ruiz, Ana",2019-03-25,,',
  'W3,Cy Park,Finance,Austin,L3,W1,2020-02-14,2025-06-30,Voluntary',
  'W4,,IT,Atlantis,L3,W1,2021-09-01,,',
  'W5,Ed Fox,IT,Austin,L2,W4,2022-07-05,2026-01-15,Involuntary',
].join('\n')

function importRoster() {
  const book = readWorkbook(new TextEncoder().encode(csv), 'workday.csv')
  const sheet = book.sheets[0]
  const def = datasetDef('employees')
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  const result = applyMapping<'employees'>({ sheet, def, mapping })
  return { def, mapping, result }
}

describe('defaultFills', () => {
  it('tells values from the file apart from the importer’s defaults', () => {
    const { def, mapping, result } = importRoster()
    expect(mapping.employmentType.header).toBeNull()
    const fills = defaultFills(def, result.rows, result.issues, mapping)
    expect(fills.notInFile).toContain('employmentType')
    expect(fills.notInFile).toContain('country')
    expect(fills.notInFile).not.toContain('name')
    // Every row was "treated as Employee"; two blank names were filled from the employee ID.
    expect(fills.defaulted.employmentType).toBe(5)
    expect(fills.defaulted.name).toBe(2)
    // Country came from known sites (accurate) or became Unknown (blank anyway): no defaults to count.
    expect(fills.defaulted.country).toBeUndefined()
    const byId = Object.fromEntries(result.rows.map((r) => [r.employeeId, r]))
    expect(byId.W2.country).toBe('United States')
    expect(byId.W4.country).toBe('Unknown')
  })

  it('makes coverage count defaults as blank and says the column was missing', () => {
    const { def, mapping, result } = importRoster()
    const fills = defaultFills(def, result.rows, result.issues, mapping)
    const plain = fieldCoverage(def, result.rows)
    const cov = fieldCoverage(def, result.rows, fills)
    const field = (k: string) => cov.fields.find((f) => f.key === k)
    expect(plain.fields.find((f) => f.key === 'name')?.share).toBe(1)
    expect(field('name')).toMatchObject({ filled: 3, expected: 5, defaulted: 2, inFile: true })
    expect(field('employmentType')).toMatchObject({ filled: 0, defaulted: 5, inFile: false })
    expect(field('country')).toMatchObject({ filled: 4, defaulted: 0, inFile: false })
    expect(cov.core).toBeLessThan(plain.core ?? 0)

    const checks = datasetChecks({
      key: 'employees',
      data: { employees: result.rows } as never,
      source: { kind: 'upload', rowCount: 5 },
      coverage: cov,
      asOf: '2026-09-30',
      fills,
    })
    expect(checks.map((c) => c.text)).toContain(
      'Employment type was not in the file, so all 5 people count as employees in headcount and rates.',
    )
    expect(checks.map((c) => c.text)).toContain(
      'Name is filled from the file for 60% of rows; the rest hold a default or are blank.',
    )
  })

  it('lists the quiet part of a field that mixes derived values and logged defaults', () => {
    const { def, result } = importRoster()
    const quiet = quietFills(def, result)
    // Four known sites gave a country; Atlantis became Unknown, which the log reports itself.
    expect(quiet.find((q) => q.field === 'country')?.message).toBe(
      'Country was taken from the work site in 4 rows.',
    )
    expect(quiet.some((q) => q.field === 'employmentType')).toBe(false)
  })

  it('treats a name built from first and last name columns as data, and the ID fallback as a default', () => {
    const roster = [
      'Employee ID,First Name,Last Name,Hire Date',
      'A1,Ana,Ruiz,2020-01-06',
      'A2,,,2021-01-06',
    ].join('\n')
    const sheet = readWorkbook(new TextEncoder().encode(roster), 'r.csv').sheets[0]
    const def = datasetDef('employees')
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    const result = applyMapping<'employees'>({ sheet, def, mapping })
    expect(result.rows.map((r) => r.name)).toEqual(['Ana Ruiz', 'A2'])
    const fills = defaultFills(def, result.rows, result.issues, mapping)
    expect(fills.notInFile).toContain('name')
    expect(fills.defaulted.name).toBe(1)
  })

  it('keys rows the way the importer writes issue ids', () => {
    expect(
      rowKeyOf(
        { rowKey: ['employeeId', 'effectiveDate'] },
        { employeeId: 'E1', effectiveDate: '2026-01-01' },
      ),
    ).toBe('E1 · 2026-01-01')
    expect(rowKeyOf({ rowKey: ['employeeId'] }, { employeeId: null })).toBeNull()
  })
})

describe('coverageText', () => {
  it('never rounds a gap away', () => {
    expect(coverageText(1)).toBe('100%')
    expect(coverageText(0.999937)).toBe('99.9%')
    expect(coverageText(0.9546)).toBe('95%')
    expect(coverageText(0.003)).toBe('<1%')
    expect(coverageText(0)).toBe('0%')
    expect(coverageText(null)).toBe('—')
  })
})

describe('fieldCoverage on a hand-built roster', () => {
  it('counts termination fields over leavers and Regrettable over voluntary leavers', () => {
    const base = { employeeId: 'E', hireDate: '2020-01-01' } as Partial<Employee>
    const rows = [
      { ...base, employeeId: 'E1' },
      {
        ...base,
        employeeId: 'E2',
        terminationDate: '2026-01-01',
        terminationType: 'Voluntary',
        regrettable: true,
      },
      { ...base, employeeId: 'E3', terminationDate: '2026-02-01', terminationType: 'Involuntary' },
      { ...base, employeeId: 'E4', terminationDate: '2026-03-01', terminationType: null },
    ]
    const cov = fieldCoverage(datasetDef('employees'), rows)
    const f = (k: string) => cov.fields.find((x) => x.key === k)
    expect(f('terminationType')).toMatchObject({ expected: 3, filled: 2, scope: 'Leavers' })
    expect(f('regrettable')).toMatchObject({ expected: 1, filled: 1, scope: 'Voluntary leavers' })
    expect(f('terminationDate')).toMatchObject({ expected: 4, scope: null })
  })
})
