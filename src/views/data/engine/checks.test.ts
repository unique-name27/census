import { describe, expect, it } from 'vitest'
import { type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { ageText, datasetChecks, latestDate, unlinkedRows, worstSeverity } from './checks'
import { fieldCoverage } from './coverage'

const empty = (): Datasets => ({
  employees: [],
  jobChanges: [],
  requisitions: [],
  candidates: [],
  cases: [],
  transactions: [],
  reviews: [],
  succession: [],
  learning: [],
  comp: [],
})

const sample: SourceMeta = { kind: 'sample', rowCount: 0 }
const upload: SourceMeta = { kind: 'upload', rowCount: 0, fileName: 'x.xlsx', warnings: 0 }

const emp = (employeeId: string, hireDate = '2020-01-06') => ({
  employeeId,
  name: employeeId,
  jobTitle: 'Engineer',
  businessUnit: 'Silicon Engineering',
  department: 'DFT',
  location: 'San Jose',
  country: 'United States',
  level: 'L3' as const,
  managerId: null,
  hireDate,
  employmentType: 'Employee' as const,
})

const review = (employeeId: string, cycleDate = '2026-06-30') => ({
  employeeId,
  cycle: '2026 Mid-year',
  cycleDate,
  rating: 3,
})

function run(
  key: DatasetKey,
  data: Datasets,
  source: SourceMeta,
  asOf = '2026-09-30',
  sampleKeys: DatasetKey[] = [],
) {
  return datasetChecks({
    key,
    data,
    source,
    coverage: fieldCoverage(datasetDef(key), data[key] as readonly object[]),
    asOf,
    targetIsSample: (k) => sampleKeys.includes(k),
  })
}

describe('datasetChecks', () => {
  it('flags an empty dataset and nothing else', () => {
    const checks = run('reviews', empty(), sample)
    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({ kind: 'empty', severity: 'warning' })
  })

  it('finds rows that refer to people missing from the roster, with a hint when the roster is the sample', () => {
    const data = empty()
    data.employees = [emp('E1'), emp('E2')]
    data.reviews = [review('E1'), review('E2'), review('E9'), review('E8')]
    expect(unlinkedRows('reviews', data)).toEqual({ rows: 2, total: 4 })
    const checks = run('reviews', data, upload, '2026-09-30', ['employees'])
    const c = checks.find((x) => x.kind === 'unlinked')
    expect(c?.severity).toBe('warning')
    expect(c?.text).toBe(
      '2 rows (50%) refer to people who are not in Employees. Employees is still the sample; upload yours as well.',
    )
    expect(
      run('reviews', data, sample, '2026-09-30', ['employees']).find((x) => x.kind === 'unlinked')?.text,
    ).toBe('2 rows (50%) refer to people who are not in Employees.')
  })

  it('names the dataset to upload when sample rows meet an uploaded roster', () => {
    const data = empty()
    data.employees = [emp('E1')]
    data.reviews = [review('E1'), review('E2')]
    const checks = run('reviews', data, sample, '2026-09-30', [])
    expect(checks.find((x) => x.kind === 'unlinked')?.text).toBe(
      '1 row (50%) refers to people who are not in Employees. Performance reviews is still the sample; upload yours as well.',
    )
  })

  it('checks both people on a succession plan and ignores a blank successor', () => {
    const data = empty()
    data.employees = [emp('E1')]
    data.succession = [
      { roleId: 'SP-1', roleTitle: 'VP', incumbentId: 'E1', criticality: 'Critical', successorId: null },
      { roleId: 'SP-2', roleTitle: 'VP', incumbentId: 'E1', criticality: 'Critical', successorId: 'E7' },
    ]
    expect(unlinkedRows('succession', data)).toEqual({ rows: 1, total: 2 })
  })

  it('links candidates to requisitions', () => {
    const data = empty()
    data.candidates = [{ reqId: 'R1' }, { reqId: 'R2' }] as unknown as Datasets['candidates']
    data.requisitions = [{ reqId: 'R1' }] as unknown as Datasets['requisitions']
    expect(unlinkedRows('candidates', data)).toEqual({ rows: 1, total: 2 })
  })

  it('calls a recommended field blank in every row, and a thin one by its share', () => {
    const data = empty()
    data.employees = Array.from({ length: 10 }, (_, i) => ({
      ...emp(`E${i}`, '2026-09-07'),
      level: null,
      department: i < 7 ? 'DFT' : '',
    }))
    const checks = run('employees', data, sample)
    expect(checks.find((c) => c.kind === 'empty-field')?.text).toBe(
      'Level and Manager ID are blank in every row.',
    )
    expect(checks.find((c) => c.kind === 'thin-field')?.text).toBe('Department is filled in 70% of rows.')
  })

  it('says when a dataset stops well before the as-of date', () => {
    const data = empty()
    data.employees = [emp('E1')]
    data.reviews = [review('E1', '2025-06-30')]
    const stale = run('reviews', data, sample).find((c) => c.kind === 'stale')
    expect(stale?.text).toBe('The latest review cycle is dated 30 Jun 2025, 15 months before the as-of date.')
    data.reviews = [review('E1', '2026-06-30')]
    expect(run('reviews', data, sample).some((c) => c.kind === 'stale')).toBe(false)
  })

  it('ignores dates after the as-of date when measuring freshness', () => {
    const rows = [{ openedAt: '2026-08-01T10:00' }, { openedAt: '2026-12-01T10:00' }]
    expect(latestDate('cases', rows, '2026-09-30')).toBe('2026-08-01')
    expect(latestDate('cases', [{ openedAt: '2027-01-01T00:00' }], '2026-09-30')).toBeNull()
    expect(latestDate('comp', rows, '2026-09-30')).toBeNull()
  })

  it('notes rows that imported with warnings, for uploads only', () => {
    const data = empty()
    data.employees = [emp('E1', '2026-09-07')]
    const checks = run('employees', data, { ...upload, warnings: 12 })
    expect(checks.find((c) => c.kind === 'import-warnings')).toMatchObject({
      severity: 'info',
      text: '12 rows imported with a change or warning.',
    })
    expect(
      run('employees', data, { ...sample, warnings: 12 }).some((c) => c.kind === 'import-warnings'),
    ).toBe(false)
  })

  it('sorts warnings before notes', () => {
    const data = empty()
    data.employees = [emp('E1'), emp('E2')]
    data.reviews = [review('E1', '2024-12-15'), review('E9', '2024-12-15')]
    const checks = run('reviews', data, { ...upload, warnings: 3 })
    expect(checks.map((c) => c.severity)).toEqual(['warning', 'warning', 'info'])
  })
})

describe('helpers', () => {
  it('words ages in days, then months', () => {
    expect(ageText(1)).toBe('1 day')
    expect(ageText(45)).toBe('45 days')
    expect(ageText(92)).toBe('3 months')
    expect(ageText(365)).toBe('12 months')
  })
  it('picks the most serious severity', () => {
    expect(worstSeverity([])).toBe('good')
    expect(worstSeverity([{ kind: 'stale', severity: 'info', text: '', count: 1 }])).toBe('info')
    expect(
      worstSeverity([
        { kind: 'stale', severity: 'info', text: '', count: 1 },
        { kind: 'empty', severity: 'warning', text: '', count: 0 },
      ]),
    ).toBe('warning')
  })
})
