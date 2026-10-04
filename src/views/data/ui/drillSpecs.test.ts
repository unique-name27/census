import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { applyMapping, autoMap, sheetFromRows, summarizeIssues } from '@/data/import'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { buildDrillTable } from '@/drill/records'
import { buildManifest } from '../engine/manifest'
import { DRILL_LIMIT, issueGroupKey, issueRecordsByGroup } from '../engine/records'
import {
  checkDrillLabel,
  checkSpec,
  fieldSpec,
  indexSpec,
  issueSpec,
  midSentence,
  rowsSpec,
} from './drillSpecs'

const sample = generateSample()
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: sample[k].length }]),
) as Record<DatasetKey, SourceMeta>

/** The panel's view of a spec: the rows it would list. */
function panelRows(data: Datasets, spec: Parameters<typeof buildDrillTable>[0]) {
  const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
  return buildDrillTable(spec, ctx).rows
}

describe('midSentence', () => {
  it('lowercases a label but keeps acronyms', () => {
    expect(midSentence('Hire date')).toBe('hire date')
    expect(midSentence('FX to USD')).toBe('FX to USD')
  })
})

describe('dataset rows', () => {
  const manifest = buildManifest({ data: sample, sources, asOf: SAMPLE_AS_OF })

  it('opens every row up to 2,000 and says when there are more', () => {
    for (const row of manifest) {
      const spec = rowsSpec(row, sample)
      expect(spec.kind).toBe(row.key)
      expect(spec.rows.length, row.key).toBe(Math.min(row.rows, DRILL_LIMIT))
      if (row.rows > DRILL_LIMIT) expect(spec.note, row.key).toMatch(/^Showing the first 2,000 of /)
      else expect(spec.note, row.key).toBeUndefined()
      expect(spec.subtitle).toBe(`${row.label} · Sample data`)
    }
    expect(manifest.some((r) => r.rows > DRILL_LIMIT)).toBe(true)
  })

  it('shows the panel exactly the rows the number counts', () => {
    const employees = manifest.find((r) => r.key === 'employees')!
    const spec = rowsSpec(employees, sample)
    expect(panelRows(sample, spec)).toHaveLength(spec.rows.length)
  })
})

describe('field coverage', () => {
  const employees = sample.employees.map((e, i) => (i % 4 === 0 ? { ...e, managerId: null } : e))
  const data: Datasets = { ...sample, employees }
  const row = buildManifest({ data, sources, asOf: SAMPLE_AS_OF }).find((r) => r.key === 'employees')!
  const field = (k: string) => row.coverage.fields.find((f) => f.key === k)!

  it('opens the rows missing a field, as many as the "blank" count', () => {
    const f = field('managerId')
    expect(f.blank).toBeGreaterThan(0)
    const spec = fieldSpec(row, f, data, 'blank')!
    expect(spec.title).toBe('Employees with no manager ID')
    expect(spec.rows.length).toBe(Math.min(f.blank, DRILL_LIMIT))
    expect(spec.rows.every((e) => !('managerId' in e) || e.managerId == null)).toBe(true)
    expect(spec.note).toMatch(/^Filled = [\d,]+ ÷ [\d,]+ people below the top of the organization/)
    expect(panelRows(data, spec)).toHaveLength(spec.rows.length)
  })

  it('opens the rows where a blank-until-it-happens date happened', () => {
    const f = field('terminationDate')
    const spec = fieldSpec(row, f, data, 'filled')!
    expect(spec.title).toBe('Employees with a termination date')
    expect(spec.rows.length).toBe(Math.min(f.filled, DRILL_LIMIT))
  })

  it('opens nothing when nothing is missing', () => {
    expect(field('employeeId').blank).toBe(0)
    expect(fieldSpec(row, field('employeeId'), data, 'blank')).toBeNull()
  })
})

describe('checks', () => {
  it('opens the unlinked rows with the references that were not found', () => {
    const data: Datasets = { ...sample, employees: sample.employees.slice(60) }
    const gone = new Set(sample.employees.slice(0, 60).map((e) => e.employeeId))
    const row = buildManifest({ data, sources, asOf: SAMPLE_AS_OF }).find((r) => r.key === 'reviews')!
    const check = row.checks.find((c) => c.kind === 'unlinked')!
    const spec = checkSpec(row, check.records, data)!
    expect(spec.title).toBe('Rows in Performance reviews that refer to people who are not in Employees')
    expect(spec.rows.length).toBe(Math.min(check.records!.count, DRILL_LIMIT))
    const values = spec.extra!.values
    for (const r of spec.rows) expect(gone.has(String(values(r).notFound))).toBe(true)
    expect(checkSpec(row, undefined, data)).toBeNull()
    expect(checkDrillLabel(row, check.records!)).toBe(
      `Show the ${check.records!.count} rows that refer to people who are not in Employees`,
    )
    expect(
      checkDrillLabel(
        { key: 'employees' },
        { select: { by: 'blank', field: 'managerId' }, count: 1, figure: null },
      ),
    ).toBe('Show the 1 row with no manager ID')
    expect(
      checkDrillLabel(
        { key: 'employees' },
        { select: { by: 'defaulted', field: 'employmentType' }, count: 1200, figure: '1,200' },
      ),
    ).toBe('Show the 1,200 rows with employment type set by default')
  })
})

describe('last upload lines', () => {
  it('opens the loaded rows a line is about, with the logged value beside each', () => {
    const def = datasetDef('employees')
    const sheet = sheetFromRows('Roster', [
      ['Employee ID', 'Name', 'Department', 'Location', 'Level', 'Hire date'],
      ['E1', 'Ada Park', 'DFT', 'San Jose', 'Z9', '2020-01-06'],
      ['E2', 'Bo Lin', 'DFT', 'San Jose', 'L3', '2021-02-01'],
    ])!
    const result = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    const rows = result.rows as Datasets['employees']
    const m = summarizeIssues(result.issues).find((x) => x.field === 'level')!
    const found = issueRecordsByGroup(def, rows, result.issues).get(issueGroupKey(m))
    const log = { fileName: 'roster.xlsx', sheetName: 'Roster', importedAt: '2026-10-01T09:00:00Z' }
    const ds = {
      key: 'employees' as const,
      label: 'Employees',
      source: { kind: 'upload' as const, label: 'roster.xlsx', detail: null },
    }
    const spec = issueSpec(ds, log, m, found)!
    expect(spec.title).toBe('Level not recognized, last upload')
    expect(spec.subtitle).toBe('Employees · roster.xlsx › Roster · 1 Oct 2026')
    expect(spec.rows).toHaveLength(1)
    expect(spec.extra!.values(spec.rows[0])).toMatchObject({ fileRow: 2, fileValue: 'Z9' })
    expect(spec.note).toBe(m.message)
    // A logged row that is no longer loaded is named in the note, not listed.
    const gone = issueSpec(ds, log, m, { ...found!, logged: found!.logged + 1 })!
    expect(gone.rows).toHaveLength(1)
    expect(gone.note).toBe(`${m.message} 1 logged row is no longer in the loaded data, so it is not listed.`)
    expect(issueSpec(ds, log, m, undefined)).toBeNull()
  })
})

describe('indexSpec', () => {
  const ds = {
    key: 'employees' as const,
    label: 'Employees',
    source: { kind: 'sample' as const, label: 'Sample', detail: null },
  }

  it('lists the rows at the given indexes, in order', () => {
    const spec = indexSpec(ds, sample, [3, 1, 999_999], 'Employees with no manager', { scope: 'Everyone' })
    expect(spec?.rows).toEqual([sample.employees[3], sample.employees[1]])
    expect(spec?.subtitle).toBe('Everyone · Employees · Sample data')
    expect(spec?.note).toBeUndefined()
  })

  it('returns null with nothing to list and caps long lists', () => {
    expect(indexSpec(ds, sample, [], 'Nothing')).toBeNull()
    const many = sample.employees.map((_, i) => i)
    const spec = indexSpec(ds, sample, many, 'Everyone', { note: 'All of them.' })
    expect(spec?.rows).toHaveLength(Math.min(many.length, DRILL_LIMIT))
    expect(spec?.note?.startsWith('All of them.')).toBe(true)
  })
})
