import { describe, expect, it } from 'vitest'
import type { ImportIssue } from '@/data/import/types'
import { computeQuality } from '@/data/quality/compute'
import { DEFAULT_QUALITY_RULES } from '@/data/quality/rules'
import { emptyDatasets, roster } from '@/data/quality/test-fixtures'
import { makeVersion } from '@/data/quality/versions'
import type { Datasets } from '@/data/schema'
import { fieldProblemSpec, leftOutSpec, recordsNoun } from './drills'
import { rowsLeftOut } from './engine/leftOut'
import { fieldCells } from './engine/summary'
import { AS_OF } from './engine/test-fixtures'

/**
 * 40 people, 10 leavers. The importer did not recognize the reasons of E038 and E039 and left them
 * blank; E040 has no reason at all; E035's reason is kept but not on the list.
 */
function company(): { data: Datasets; issues: ImportIssue[] } {
  const employees = roster().map((e, i) =>
    i >= 37 ? { ...e, terminationReason: null } : i === 34 ? { ...e, terminationReason: 'Moved away' } : e,
  )
  const issue = (row: number, id: string): ImportIssue => ({
    row,
    id,
    field: 'terminationReason',
    label: 'Termination reason',
    value: 'Gone',
    code: 'unknown-value',
    issue: 'x',
    action: 'left-blank',
  })
  return { data: { ...emptyDatasets(), employees }, issues: [issue(39, 'E038'), issue(40, 'E039')] }
}

function setup() {
  const { data, issues } = company()
  const v = makeVersion({
    dataset: 'employees',
    source: 'upload',
    rows: data.employees,
    versionId: 'employees-v1',
    fileName: 'employees.xlsx',
    importedAt: '2026-09-29T09:00:00.000Z',
    issues,
  })
  // The index in force has no import log; the drill index has it.
  const q = computeQuality(data, { employees: v }, undefined, { asOf: AS_OF })
  const drillQ = computeQuality(data, { employees: v }, { employees: issues }, { asOf: AS_OF })
  const cell = fieldCells('employees', q).find((c) => c.ref === 'employees.terminationReason')!
  return { data, q, drillQ, cell }
}

describe('the rows behind a field’s gaps', () => {
  it('opens exactly as many rows as the count it is shown with', () => {
    const { data, q, drillQ, cell } = setup()
    // 3 blank, 3 not recognized (2 of them blanked at import, 1 kept): 4 distinct rows.
    expect(cell).toMatchObject({ blank: 3, invalid: 3, invalidBlank: 2, problems: 4 })
    const spec = fieldProblemSpec({
      cell,
      data,
      rowsOf: (k) => (k === 'blank' ? q.fieldRows(cell.ref, 'blank') : drillQ.fieldRows(cell.ref, k)),
      source: null,
      minCoverage: DEFAULT_QUALITY_RULES.minCoverage,
    })!
    expect(spec.rows).toHaveLength(cell.problems)
    expect(spec.title).toBe('People with a gap in termination reason')
    expect(spec.note).toBe(
      'Filled = 7 ÷ 10 rows it applies to (70%). Listed: the 4 rows with a blank or a value not recognized.',
    )
    const why = spec.rows.map((r) => spec.extra?.values(r).fieldProblem)
    expect(why).toEqual(['Not recognized', 'Blank, Not recognized', 'Blank, Not recognized', 'Blank'])
  })

  it('lists only the kind asked for, named the way the dataset counts its records', () => {
    const { data, q, drillQ, cell } = setup()
    const blanks = fieldProblemSpec({
      cell,
      data,
      rowsOf: (k) => (k === 'blank' ? q.fieldRows(cell.ref, 'blank') : drillQ.fieldRows(cell.ref, k)),
      source: null,
      kinds: ['blank'],
    })!
    expect(blanks.rows).toHaveLength(cell.blank)
    expect(blanks.title).toBe('People with no termination reason')
    expect(blanks.note).toMatch(/Listed: the 3 rows with a blank\.$/)
    expect(recordsNoun('learning')).toBe('assignments')
    expect(recordsNoun('comp')).toBe('people')
  })
})

describe('the gaps under a number', () => {
  it('says left out only for rows a required field leaves out', () => {
    const { data, q } = setup()
    const uses = ['employees.terminationReason', 'employees.terminationDate'] as const
    const gaps = rowsLeftOut(q, uses).parts[0]
    const any = leftOutSpec({
      part: gaps,
      data,
      what: 'Exits by reason',
      uses,
      scopeLabel: 'Company',
      source: null,
    })!
    expect(any.title).toBe('Employees rows with a gap under exits by reason')
    expect(any.rows).toHaveLength(gaps.gaps)
    expect(any.note).toMatch(/^6 of 10 rows complete\. /)

    const req = rowsLeftOut(q, uses, { requires: ['employees.terminationDate'] }).parts[0]
    expect(
      leftOutSpec({ part: req, which: 'leftOut', data, what: 'Exits', uses, scopeLabel: '', source: null }),
    ).toBeNull()
    const kept = leftOutSpec({
      part: req,
      which: 'kept',
      data,
      what: 'Exits',
      uses,
      scopeLabel: '',
      source: null,
    })!
    expect(kept.title).toBe('Employees rows in exits with a gap')
    expect(kept.rows).toHaveLength(4)
  })
})
