import { describe, expect, it } from 'vitest'
import type { ImportIssue, ParsedSheet } from '@/data/import'
import { emptyIssueCounts, type VersionMapping } from '@/data/quality'
import {
  cellKey,
  filterRawRows,
  hiddenText,
  logFromRaw,
  pageOf,
  rawColumns,
  rawExportTable,
  rawFlags,
  rawRowKey,
} from './rawGrid'

const sheet: ParsedSheet = {
  name: 'Roster',
  headerRow: 0,
  headers: ['Emp #', 'Start', 'Type', 'Notes'],
  rows: [
    { 'Emp #': 'E1', Start: '31/02/2026', Type: 'FT', Notes: null },
    { 'Emp #': 'E2', Start: '2026-01-05', Type: null, Notes: '=cmd' },
    { 'Emp #': null, Start: '2026-02-01', Type: 'PT', Notes: 'no id' },
  ],
  rowNumbers: [2, 3, 5],
}

const mapping: VersionMapping = {
  employeeId: { header: 'Emp #', confidence: 'high', confirmed: false },
  hireDate: { header: 'Start', confidence: 'medium', confirmed: false },
  employmentType: { header: 'Type', confidence: 'low', confirmed: false },
}

const issue = (p: Partial<ImportIssue>): ImportIssue => ({
  row: 0,
  id: null,
  field: '',
  label: '',
  value: '',
  code: 'converted',
  issue: 'Something happened',
  action: 'kept',
  ...p,
})

const issues: ImportIssue[] = [
  issue({ row: 2, field: 'hireDate', code: 'unreadable', action: 'left-blank', issue: 'Not a date' }),
  issue({
    row: 3,
    field: 'employmentType',
    code: 'defaulted',
    action: 'defaulted',
    issue: 'Set to Employee',
  }),
  issue({
    row: 3,
    field: 'employmentType',
    code: 'unknown-value',
    action: 'left-blank',
    issue: 'Unknown type',
  }),
  issue({ row: 5, field: 'employeeId', code: 'missing-required', action: 'row-skipped', issue: 'No ID' }),
  issue({ row: 0, field: 'location', code: 'defaulted', action: 'defaulted', issue: 'No column' }),
  issue({ row: 9, field: 'hireDate', code: 'unreadable', action: 'left-blank', issue: 'Gone' }),
  issue({ row: 2, field: 'hireDate', code: 'converted', action: 'converted', issue: 'Converted' }),
]

describe('rawFlags', () => {
  const flags = rawFlags(sheet, issues, mapping)

  it('flags the cells the log names, by Excel row and mapped column', () => {
    expect(flags.cells.get(cellKey(0, 'Start'))).toEqual({
      kind: 'invalid',
      text: 'Not a date',
      field: 'hireDate',
    })
    // An unreadable value outranks the default that replaced it.
    expect(flags.cells.get(cellKey(1, 'Type'))?.kind).toBe('invalid')
    expect(flags.counts).toEqual({ invalid: 2, defaulted: 0, skipped: 1 })
  })

  it('marks skipped rows and ignores sheet-level notes, other codes and unknown rows', () => {
    expect(flags.skipped.get(2)).toBe('No ID')
    expect(flags.cells.size).toBe(2)
    expect(flags.flaggedRows).toEqual([0, 1, 2])
  })

  it('counts a default when nothing outranks it', () => {
    const f = rawFlags(sheet, [issues[1]], mapping)
    expect(f.counts.defaulted).toBe(1)
    expect(f.cells.get(cellKey(1, 'Type'))?.kind).toBe('defaulted')
  })
})

describe('rawColumns', () => {
  const compMapping: VersionMapping = {
    employeeId: { header: 'ID', confidence: 'high', confirmed: false },
    baseSalary: { header: 'Base', confidence: 'high', confirmed: false },
    currency: { header: 'Ccy', confidence: 'high', confirmed: false },
  }

  it('hides pay columns and unmapped comp columns while pay is off', () => {
    const off = rawColumns('comp', ['ID', 'Base', 'Ccy', 'Bonus $'], compMapping, false)
    expect(off.visible).toEqual(['ID', 'Ccy'])
    expect(off.hidden.map((h) => h.header)).toEqual(['Base', 'Bonus $'])
    expect(hiddenText(off.hidden)).toEqual(['2 columns hidden: pay amounts are off.'])
    expect(rawColumns('comp', ['ID', 'Base', 'Bonus $'], compMapping, true).visible).toEqual([
      'ID',
      'Base',
      'Bonus $',
    ])
  })

  it('never shows case subcategories or unmapped case text', () => {
    const m: VersionMapping = {
      caseId: { header: 'Case', confidence: 'high', confirmed: false },
      subcategory: { header: 'Topic', confidence: 'high', confirmed: false },
    }
    const r = rawColumns('cases', ['Case', 'Topic', 'Notes'], m, true)
    expect(r.visible).toEqual(['Case'])
    expect(hiddenText(r.hidden)).toEqual([
      '2 columns hidden: employee relations topics stay at category level.',
    ])
  })

  it('shows everything else', () => {
    expect(rawColumns('employees', sheet.headers, mapping, false).visible).toEqual(sheet.headers)
  })
})

describe('filterRawRows', () => {
  const flags = rawFlags(sheet, issues, mapping)
  it('searches visible cells, ignoring case', () => {
    expect(filterRawRows(sheet, sheet.headers, 'pt')).toEqual([2])
    expect(filterRawRows(sheet, ['Emp #'], 'no id')).toEqual([])
    expect(filterRawRows(sheet, sheet.headers, '  ')).toEqual([0, 1, 2])
  })
  it('finds a row by its number in the file', () => {
    const s = { rows: [{ A: 'x' }, { A: 'y' }], rowNumbers: [7, 12] }
    expect(filterRawRows(s, ['A'], '12')).toEqual([1])
  })
  it('keeps only flagged rows on request', () => {
    expect(filterRawRows(sheet, sheet.headers, '', 'flagged', { flaggedRows: [1] })).toEqual([1])
    expect(filterRawRows(sheet, sheet.headers, 'e2', 'flagged', flags)).toEqual([1])
  })
})

describe('pageOf', () => {
  const list = Array.from({ length: 120 }, (_, i) => i)
  it('pages and clamps', () => {
    expect(pageOf(list, 0)).toMatchObject({ page: 0, pages: 3, from: 1, to: 50, total: 120 })
    expect(pageOf(list, 2).items).toHaveLength(20)
    expect(pageOf(list, 9)).toMatchObject({ page: 2, from: 101, to: 120 })
    expect(pageOf([], 3)).toMatchObject({ page: 0, pages: 1, from: 0, to: 0, total: 0 })
  })
})

describe('rawExportTable', () => {
  it('writes the row number, visible columns and notes', () => {
    const flags = rawFlags(sheet, issues, mapping)
    const t = rawExportTable(sheet, ['Emp #', 'Start'], flags)
    expect(t.columns.map((c) => c.label)).toEqual(['Row in the file', 'Emp #', 'Start', 'Import notes'])
    expect(t.rows[0]).toEqual({ r: 2, c0: 'E1', c1: '31/02/2026', flags: 'Not a date' })
    expect(t.rows[2].flags).toBe('Skipped: No ID')
    // Notes about hidden columns stay out, like the columns themselves.
    expect(rawExportTable(sheet, ['Emp #'], flags, [1]).rows).toEqual([{ r: 3, c0: 'E2', flags: '' }])
  })
})

describe('logFromRaw', () => {
  it('builds the import summary from a version’s counts and stored issues', () => {
    const log = logFromRaw(
      {
        dataset: 'candidates',
        fileName: 'ats-export.xlsx',
        sheetName: null,
        importedAt: null,
        issues: {
          ...emptyIssueCounts(98),
          rowsIn: 100,
          byCode: { 'missing-required': 2, duplicate: 1 },
          defaultedByField: { source: 3, status: 2 },
          invalidByField: { currentStage: 4 },
          rowsWithErrors: 6,
        },
      },
      issues,
    )
    expect(log.stats).toMatchObject({
      rowsIn: 100,
      rowsOut: 98,
      skippedMissingRequired: 2,
      duplicates: 1,
      defaulted: 5,
      blanked: 4,
      rowsWithIssues: 6,
    })
    expect(log).toMatchObject({ fileName: 'ats-export.xlsx', sheetName: '', importedAt: '', truncated: 0 })
    expect(log.issues).toHaveLength(issues.length)
  })
})

describe('unrecognized values kept as they were', () => {
  it('flags the raw cell of a loaded value that is not recognized, by row key', () => {
    const flags = rawFlags(sheet, [], mapping, {
      rowKey: ['employeeId'],
      values: [{ field: 'employmentType', label: 'Employment type', keys: new Set(['E1']) }],
    })
    expect(flags.cells.get(cellKey(0, 'Type'))).toEqual({
      kind: 'invalid',
      text: 'Employment type is not one of the recognized values; kept as it was.',
      field: 'employmentType',
    })
    expect(flags.counts.invalid).toBe(1)
    expect(flags.flaggedRows).toEqual([0])
  })

  it('keeps the log’s own flag when both name a cell', () => {
    const flags = rawFlags(sheet, issues, mapping, {
      rowKey: ['employeeId'],
      values: [{ field: 'hireDate', label: 'Hire date', keys: new Set(['E1']) }],
    })
    expect(flags.cells.get(cellKey(0, 'Start'))?.text).toBe('Not a date')
    expect(flags.counts.invalid).toBe(2)
  })

  it('builds raw row keys like the importer', () => {
    expect(
      rawRowKey(
        { A: ' E1 ', B: 'X' },
        {
          id: { header: 'A', confidence: 'high', confirmed: false },
          c: { header: 'B', confidence: 'high', confirmed: false },
        },
        ['id', 'c'],
      ),
    ).toBe('E1 · X')
    expect(
      rawRowKey({ A: null }, { id: { header: 'A', confidence: 'high', confirmed: false } }, ['id']),
    ).toBeNull()
  })
})
