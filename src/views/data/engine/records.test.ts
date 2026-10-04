/**
 * The rows behind the Data room's numbers: every number that opens rows must open exactly as many
 * rows as it shows, and numbers about rows that are not loaded must open none.
 */
import { describe, expect, it } from 'vitest'
import { applyMapping, autoMap, type ImportIssue, sheetFromRows, summarizeIssues } from '@/data/import'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { fmt } from '@/lib/format'
import { checkRecords, unlinkedRows } from './checks'
import { fieldCoverage, fieldRecords } from './coverage'
import { buildManifest } from './manifest'
import {
  DRILL_LIMIT,
  firstRecords,
  issueDetail,
  issueGroupKey,
  issueRecordsByGroup,
  recordKey,
  splitFigure,
} from './records'

const sample = generateSample()
const sampleSources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample[k].length }]),
) as Record<DatasetKey, SourceMeta>

describe('firstRecords', () => {
  it('keeps every row up to the limit and says when it stops', () => {
    expect(firstRecords([1, 2, 3], 5)).toEqual({ rows: [1, 2, 3], total: 3, capped: false })
    const many = Array.from({ length: DRILL_LIMIT + 7 }, (_, i) => i)
    const first = firstRecords(many)
    expect(first.rows).toHaveLength(DRILL_LIMIT)
    expect(first.rows[0]).toBe(0)
    expect(first).toMatchObject({ total: DRILL_LIMIT + 7, capped: true })
  })
})

describe('splitFigure', () => {
  it('finds the number as a whole number only', () => {
    expect(splitFigure('45 rows (2%) refer to people.', '45')).toEqual([
      '',
      '45',
      ' rows (2%) refer to people.',
    ])
    expect(splitFigure('Blank for all 1,204 leavers.', '1,204')).toEqual([
      'Blank for all ',
      '1,204',
      ' leavers.',
    ])
    // "204" inside "1,204" and "12" inside "120" are not the number.
    expect(splitFigure('Blank for all 1,204 leavers.', '204')).toBeNull()
    expect(splitFigure('In 120 rows, 12 are late.', '12')).toEqual(['In 120 rows, ', '12', ' are late.'])
    expect(splitFigure('No number here.', '3')).toBeNull()
    expect(splitFigure('Anything', '')).toBeNull()
  })
})

describe('recordKey', () => {
  it('joins the row key fields that hold a value, as the importer logs them', () => {
    expect(recordKey(datasetDef('employees'), { employeeId: 'E7' })).toBe('E7')
    expect(
      recordKey(datasetDef('jobChanges'), {
        employeeId: 'E7',
        effectiveDate: '2026-03-01',
        changeType: 'Promotion',
      }),
    ).toBe('E7 · 2026-03-01 · Promotion')
    // A role with no successor: the blank part is left out.
    expect(recordKey(datasetDef('succession'), { roleId: 'R1', successorId: null })).toBe('R1')
    expect(recordKey(datasetDef('employees'), { employeeId: '' })).toBeNull()
  })
})

describe('import-log lines open the loaded rows they are about', () => {
  const def = datasetDef('employees')
  const sheet = sheetFromRows('Roster', [
    ['Employee ID', 'Name', 'Department', 'Location', 'Level', 'Manager ID', 'Hire date'],
    ['E1', 'Ada Park', 'DFT', 'San Jose', 'L3', '', '2020-01-06'],
    ['E2', 'Bo Lin', 'DFT', 'San Jose', 'Z9', 'E1', '2021-02-01'],
    ['E3', 'Cy Ode', 'DFT', 'San Jose', 'L2', 'E99', '2022-03-01'],
    ['E3', 'Cy Ode', 'DFT', 'San Jose', 'L2', 'E99', '2022-03-01'],
    ['E4', 'Di Rao', 'DFT', 'San Jose', 'L2', 'E1', ''],
    ['E5', 'Ed Wu', 'DFT', 'San Jose', 'Q7', 'E1', '2023-04-01'],
  ])
  if (!sheet) throw new Error('sheet did not parse')
  const result = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
  const rows = result.rows as Datasets['employees']
  const summaries = summarizeIssues(result.issues)
  const groups = issueRecordsByGroup(def, rows, result.issues)

  it('lists exactly the rows each line counts, by the key the importer logged', () => {
    const level = summaries.find((m) => m.field === 'level')
    const manager = summaries.find((m) => m.field === 'managerId' && m.action === 'cleared')
    expect(level && manager).toBeTruthy()
    const levelRows = groups.get(issueGroupKey(level!))!
    expect(levelRows.records.map((r) => r.employeeId)).toEqual(['E2', 'E5'])
    expect(levelRows.logged).toBe(level!.count)
    expect(levelRows.issueOf(levelRows.records[0])?.value).toBe('Z9')
    const managerRows = groups.get(issueGroupKey(manager!))!
    expect(managerRows.records.map((r) => r.employeeId)).toEqual(['E3'])
    // The number the line shows is the number of rows it opens.
    for (const m of summaries) {
      const g = groups.get(issueGroupKey(m))
      if (g) expect(g.records.length, m.message).toBe(m.count)
    }
  })

  it('opens nothing for rows the import skipped', () => {
    const skipped = summaries.filter((m) => m.action === 'row-skipped')
    expect(skipped.length).toBeGreaterThan(0)
    for (const m of skipped) expect(groups.get(issueGroupKey(m))).toBeUndefined()
  })

  it('drops rows that changed since the upload but still counts them as logged', () => {
    const level = summaries.find((m) => m.field === 'level')!
    const without = rows.filter((r) => r.employeeId !== 'E2')
    const g = issueRecordsByGroup(def, without, result.issues).get(issueGroupKey(level))!
    expect(g.records.map((r) => r.employeeId)).toEqual(['E5'])
    expect(g.logged).toBe(2)
  })

  it('keeps employee relations topics out of the drill', () => {
    const issue: ImportIssue = {
      row: 4,
      id: 'C1',
      field: 'subcategory',
      label: 'Topic',
      value: 'Complaint about a manager',
      code: 'unknown-value',
      issue: '"Complaint about a manager" is not a known topic.',
      action: 'kept',
    }
    const cases = datasetDef('cases')
    expect(issueDetail(cases, { caseId: 'C1', category: 'Employee relations' }, issue)).toEqual({
      value: null,
      issue: 'Not shown for employee relations cases',
    })
    expect(issueDetail(cases, { caseId: 'C1', category: 'Payroll' }, issue).value).toBe(
      'Complaint about a manager',
    )
  })
})

describe('field coverage opens the rows missing the field', () => {
  it('matches every field of every sample dataset', () => {
    for (const key of DATASET_KEYS) {
      const def = datasetDef(key)
      const rows = sample[key] as readonly object[]
      for (const f of fieldCoverage(def, rows).fields) {
        const found = fieldRecords(def, rows, f.key)
        expect(found.blank.length, `${key}.${f.key}`).toBe(f.blank)
        expect(found.filled.length, `${key}.${f.key}`).toBe(f.filled + f.defaulted)
        expect(found.blank.length + found.filled.length, `${key}.${f.key}`).toBe(f.expected)
      }
    }
  })

  it('counts only the rows a field applies to, and leaves defaulted rows out of the blanks', () => {
    const def = datasetDef('employees')
    const rows = [
      { employeeId: 'A', terminationDate: '2026-01-01', terminationType: 'Voluntary' },
      { employeeId: 'B', terminationDate: '2026-02-01', terminationType: null },
      { employeeId: 'C', terminationDate: null, terminationType: null },
      { employeeId: 'D', terminationDate: '2026-03-01', terminationType: 'Unknown' },
    ]
    const found = fieldRecords(def, rows, 'terminationType')
    expect(found.blank.map((r) => r.employeeId)).toEqual(['B', 'D'])
    expect(found.filled.map((r) => r.employeeId)).toEqual(['A'])
    const f = fieldCoverage(def, rows, { notInFile: [], defaulted: { terminationType: 1 } }).fields.find(
      (x) => x.key === 'terminationType',
    )!
    // One filled value came from a default: it counts as blank in the share, but can't be listed.
    expect(f).toMatchObject({ expected: 3, filled: 0, defaulted: 1, blank: 2 })
  })
})

describe('checks open the rows they count', () => {
  /** A sample with gaps planted: people removed, managers cleared, no exits, no employment type column. */
  function planted(): { data: Datasets; sources: Record<DatasetKey, SourceMeta> } {
    const employees = sample.employees
      .slice(40)
      .map((e, i) => ({ ...e, managerId: i % 3 === 0 ? null : e.managerId, terminationDate: null }))
    const data: Datasets = { ...sample, employees }
    const sources = {
      ...sampleSources,
      employees: { kind: 'upload', rowCount: employees.length, fileName: 'roster.xlsx', warnings: 0 },
    } as Record<DatasetKey, SourceMeta>
    return { data, sources }
  }

  it('every check with rows opens exactly the rows its number shows', () => {
    const { data, sources } = planted()
    const manifest = buildManifest({
      data,
      sources,
      asOf: SAMPLE_AS_OF,
      uploads: { employees: { fills: { notInFile: ['employmentType'], defaulted: {} }, changeKinds: 0 } },
    })
    const withRows = manifest.flatMap((r) =>
      r.checks.filter((c) => c.records).map((c) => ({ key: r.key, check: c })),
    )
    // Unlinked rows in other datasets, thin managers, no leavers, and the employment type default.
    const kinds = new Set(withRows.map((x) => `${x.check.kind}:${x.check.records?.select.by}`))
    expect(kinds).toEqual(
      new Set(['unlinked:unlinked', 'thin-field:blank', 'metric-field:blank', 'metric-field:defaulted']),
    )
    for (const { key, check } of withRows) {
      const r = check.records!
      const found = checkRecords(key, data, r.select)
      expect(found.length, check.text).toBe(r.count)
      expect(r.count, check.text).toBeGreaterThan(0)
      if (r.figure) {
        expect(r.figure).toBe(fmt(r.count, 'int'))
        expect(splitFigure(check.text, r.figure), check.text).not.toBeNull()
      }
    }
    // The unlinked count in the sentence is the one the check engine counts.
    const reviews = manifest.find((r) => r.key === 'reviews')!.checks.find((c) => c.kind === 'unlinked')!
    expect(reviews.records?.count).toBe(unlinkedRows('reviews', data)?.rows)
  })

  it('checks that are not about loaded rows open none', () => {
    const stale = { ...sample, cases: sample.cases.filter((c) => c.openedAt < '2026-01-01') }
    const manifest = buildManifest({ data: stale, sources: sampleSources, asOf: SAMPLE_AS_OF })
    const cases = manifest.find((r) => r.key === 'cases')!
    const staleCheck = cases.checks.find((c) => c.kind === 'stale')
    expect(staleCheck).toBeDefined()
    expect(staleCheck?.records).toBeUndefined()
    const empty = buildManifest({
      data: { ...sample, learning: [] },
      sources: sampleSources,
      asOf: SAMPLE_AS_OF,
    }).find((r) => r.key === 'learning')!
    expect(empty.checks.every((c) => !c.records)).toBe(true)
  })

  it('a field filled only by defaults leaves nothing to list', () => {
    const rows = sample.employees.slice(0, 50)
    const def = datasetDef('employees')
    const f = fieldCoverage(def, rows, { notInFile: [], defaulted: { department: 50 } }).fields.find(
      (x) => x.key === 'department',
    )!
    expect(f).toMatchObject({ filled: 0, defaulted: 50, blank: 0 })
    const manifest = buildManifest({
      data: { ...sample, employees: rows },
      sources: { ...sampleSources, employees: { kind: 'upload', rowCount: 50, fileName: 'r.xlsx' } },
      asOf: SAMPLE_AS_OF,
      uploads: { employees: { fills: { notInFile: [], defaulted: { department: 50 } }, changeKinds: 0 } },
    })
    const dept = manifest[0].checks.find((c) => c.text.startsWith('Department'))
    expect(dept).toBeDefined()
    expect(dept?.records).toBeUndefined()
  })
})
