import { describe, expect, it } from 'vitest'
import type { ParsedSheet } from '@/data/import/types'
import type { ReferenceAudit, ReferenceMapping } from '@/data/reference'
import {
  AUDIT_COLUMNS,
  auditRows,
  MAPPING_COLUMNS,
  mappingRows,
  mappingSignature,
  newMappings,
  parseMappingSheet,
  pickMappingSheet,
  withoutBy,
} from './workbook'

const AT = '2026-10-01T09:30:00.000Z'
const MAPPINGS: ReferenceMapping[] = [
  {
    kind: 'move-department',
    id: 'a',
    at: AT,
    by: 'Dana',
    department: 'Design Verification',
    from: 'Systems',
    to: 'Silicon',
  },
  {
    kind: 'move-function',
    id: 'b',
    at: AT,
    by: null,
    jobFunction: 'Firmware',
    from: null,
    to: 'Systems & Software Engineering',
  },
  {
    kind: 'merge',
    id: 'c',
    at: AT,
    by: null,
    ref: 'employees.department',
    from: ['DV', 'Design verif.'],
    to: 'Design Verification',
    scope: 'category',
  },
  {
    kind: 'rename',
    id: 'd',
    at: AT,
    by: null,
    ref: 'cases.channel',
    from: ['E-mail'],
    to: 'Email',
    scope: 'field',
  },
]

/** The sheet the importer would read back from rows written under the column labels. */
function sheetOf(
  rows: Record<string, unknown>[],
  labels: readonly { key: string; label: string }[],
): ParsedSheet {
  return {
    name: 'Mappings',
    headerRow: 6,
    headers: labels.map((c) => c.label),
    rows: rows.map((r) => Object.fromEntries(labels.map((c) => [c.label, r[c.key] ?? null]))),
    rowNumbers: rows.map((_, i) => 8 + i),
  }
}

describe('mappingRows', () => {
  it('writes one readable row per mapping, in order', () => {
    const rows = mappingRows(MAPPINGS, { a: 12, c: 3 }, [{ id: 'd', reason: 'Nope.' }])
    expect(rows.map((r) => r.change)).toEqual([
      'Move department',
      'Move job function',
      'Merge values',
      'Rename value',
    ])
    expect(rows[1]).toMatchObject({
      field: 'Employees: Job family',
      fieldRef: 'employees.jobFamily',
      subject: 'Firmware',
      to: 'Systems & Software Engineering',
    })
    expect(rows[0]).toMatchObject({
      order: 1,
      subject: 'Design Verification',
      from: 'Systems',
      to: 'Silicon',
      rows: 12,
      by: 'Dana',
    })
    expect(rows[2]).toMatchObject({
      from: 'DV | Design verif.',
      fieldRef: 'employees.department',
      field: 'Employees: Department',
    })
    expect(rows[3].status).toBe('Not applied: Nope.')
    expect(rows[3].scope).toBe('This field only')
    expect(rows[1].rows).toBeNull()
    expect(MAPPING_COLUMNS.find((c) => c.key === 'subject')?.label).toBe('Department or job function')
  })

  it('writes a legacy move-family mapping with its own label', () => {
    const legacy: ReferenceMapping = {
      kind: 'move-family',
      id: 'old',
      at: AT,
      by: null,
      jobFamily: 'Digital Design',
      from: null,
      to: 'Engineering',
    }
    const [row] = mappingRows([legacy])
    expect(row).toMatchObject({
      change: 'Set job function (before job families held functions)',
      fieldRef: 'employees.jobFunction',
      subject: 'Digital Design',
      description: 'Set the job function of job family Digital Design rows to Engineering.',
    })
  })
})

describe('parseMappingSheet', () => {
  it('reads its own export back exactly', () => {
    const sheet = sheetOf(mappingRows(MAPPINGS) as unknown as Record<string, unknown>[], MAPPING_COLUMNS)
    const out = parseMappingSheet(sheet)
    expect(out.errors).toEqual([])
    expect(out.mappings.map(mappingSignature)).toEqual(MAPPINGS.map(mappingSignature))
    expect(out.mappings[0].by).toBe('Dana')
  })

  it('reads a sheet typed by hand from the readable columns', () => {
    const labels = [
      { key: 'change', label: 'Change' },
      { key: 'field', label: 'Field' },
      { key: 'subject', label: 'Department or job family' },
      { key: 'from', label: 'From' },
      { key: 'to', label: 'To' },
      { key: 'scope', label: 'Applies to' },
    ]
    const sheet = sheetOf(
      [
        { change: 'Move department', subject: 'Facilities', to: 'Corporate' },
        { change: 'merge', field: 'employees.location', from: 'SJ | San José', to: 'San Jose' },
        {
          change: 'Rename value',
          field: 'employees.level',
          from: 'Level 3',
          to: 'L3',
          scope: 'This field only',
        },
        { change: 'Promote', to: 'x' },
        { change: 'Merge values', field: 'employees.name', from: 'A', to: 'B' },
        { change: 'Rename value', field: 'employees.level', from: 'L3', to: 'Senior' },
        {},
      ],
      labels,
    )
    const out = parseMappingSheet(sheet)
    expect(out.mappings).toEqual([
      { kind: 'move-department', department: 'Facilities', from: null, to: 'Corporate', by: null },
      {
        kind: 'merge',
        ref: 'employees.location',
        from: ['SJ', 'San José'],
        to: 'San Jose',
        scope: 'category',
        by: null,
      },
      { kind: 'rename', ref: 'employees.level', from: ['Level 3'], to: 'L3', scope: 'field', by: null },
    ])
    expect(out.errors.map((e) => e.row)).toEqual([11, 12, 13])
    expect(out.errors[0].message).toMatch(/not a change Census knows/)
    expect(out.errors[1].message).toMatch(/not a categorical field/)
    expect(out.errors[2].message).toMatch(/must be one of/)
  })

  it('says so when the sheet has no change column', () => {
    const out = parseMappingSheet({
      name: 'X',
      headerRow: 0,
      headers: ['A'],
      rows: [{ A: 1 }],
      rowNumbers: [2],
    })
    expect(out.mappings).toEqual([])
    expect(out.errors[0].message).toMatch(/No "Change" column/)
  })

  it('refuses legacy rows (a job family moved under a function), from either column', () => {
    const legacy: ReferenceMapping = {
      kind: 'move-family',
      id: 'old',
      at: AT,
      by: null,
      jobFamily: 'Digital Design',
      from: null,
      to: 'Engineering',
    }
    const exported = parseMappingSheet(
      sheetOf(mappingRows([legacy]) as unknown as Record<string, unknown>[], MAPPING_COLUMNS),
    )
    expect(exported.mappings).toEqual([])
    expect(exported.errors[0].message).toBe('Made before job families held job functions; not imported.')
    const typed = parseMappingSheet(
      sheetOf(
        [
          { change: 'Move job family', subject: 'Digital Design', to: 'Engineering' },
          { change: 'Move job function', subject: 'Design RTL', to: 'Silicon Engineering' },
        ],
        [
          { key: 'change', label: 'Change' },
          { key: 'subject', label: 'Department or job function' },
          { key: 'to', label: 'To' },
        ],
      ),
    )
    expect(typed.errors.map((e) => e.message)).toEqual([
      'Made before job families held job functions; not imported.',
    ])
    expect(typed.mappings).toEqual([
      { kind: 'move-function', jobFunction: 'Design RTL', from: null, to: 'Silicon Engineering', by: null },
    ])
  })

  it('rejects an unreadable mapping column', () => {
    const out = parseMappingSheet(
      sheetOf([{ json: '{oops' }], [{ key: 'json', label: 'Mapping for import' }]),
    )
    expect(out.errors[0].message).toMatch(/not readable/)
  })
})

describe('pickMappingSheet', () => {
  const s = (name: string, headers: string[]): ParsedSheet => ({
    name,
    headerRow: 0,
    headers,
    rows: [],
    rowNumbers: [],
  })
  it('prefers the Mappings sheet, then any sheet with a change column', () => {
    expect(pickMappingSheet([s('Change list', ['When']), s('Mappings', ['Change'])])?.name).toBe('Mappings')
    expect(pickMappingSheet([s('Sheet1', ['When']), s('Sheet2', ['Change', 'To'])])?.name).toBe('Sheet2')
    expect(pickMappingSheet([s('Sheet1', ['When'])])).toBeNull()
  })
})

describe('newMappings', () => {
  it('skips mappings already in place and repeats within the file', () => {
    const parsed = [
      {
        kind: 'merge' as const,
        ref: 'employees.department' as const,
        from: ['Design verif.', 'DV'],
        to: 'Design Verification',
      },
      { kind: 'move-department' as const, department: 'Facilities', from: null, to: 'Corporate' },
      { kind: 'move-department' as const, department: 'Facilities', from: null, to: 'Corporate', by: 'Lee' },
    ]
    const out = newMappings(parsed, MAPPINGS)
    expect(out.duplicates).toBe(2)
    expect(out.add).toHaveLength(1)
    expect(withoutBy(out.add[0])).toEqual({
      kind: 'move-department',
      department: 'Facilities',
      from: null,
      to: 'Corporate',
    })
  })
})

describe('auditRows', () => {
  it('lists each change with who and when', () => {
    const audit: ReferenceAudit[] = [
      {
        id: 'x',
        what: 'Moved A to B.',
        by: null,
        at: AT,
        action: 'add',
        mappingId: 'a',
        mapping: MAPPINGS[0],
      },
      {
        id: 'y',
        what: 'Undid: Moved A to B.',
        by: 'Dana',
        at: AT,
        action: 'remove',
        mappingId: 'a',
        mapping: MAPPINGS[0],
      },
    ]
    expect(auditRows(audit)).toEqual([
      { at: AT, by: 'Not named', action: 'Added', what: 'Moved A to B.' },
      { at: AT, by: 'Dana', action: 'Removed', what: 'Undid: Moved A to B.' },
    ])
    expect(AUDIT_COLUMNS.map((c) => c.key)).toEqual(['at', 'by', 'action', 'what'])
  })
})
