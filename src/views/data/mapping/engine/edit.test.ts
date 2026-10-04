import { describe, expect, it } from 'vitest'
import type { ReferenceMapping } from '@/data/reference'
import { inferStructure } from '@/data/reference'
import { JOB_FUNCTIONS } from '@/data/schema'
import {
  draftMapping,
  EMPTY_DRAFT,
  editOptions,
  placementText,
  previewChange,
  previewText,
  rowsChangedBy,
  scopeText,
  whenText,
} from './edit'
import { AS_OF, messyCompany } from './test-company'

const data = messyCompany()
const report = inferStructure(data, { asOf: AS_OF })

describe('editOptions', () => {
  const opts = editOptions(report, data)

  it('lists departments with where they sit now, including requisition-only ones', () => {
    const dv = opts.departments.find((d) => d.value === 'Design Verification')!
    expect(dv.under).toEqual([
      { under: 'Silicon', headcount: 3 },
      { under: 'Systems', headcount: 1 },
    ])
    expect(opts.departments.find((d) => d.value === 'DV')?.under).toEqual([
      { under: 'Silicon', headcount: 0 },
    ])
    expect(opts.departments.map((d) => d.value)).toEqual([
      'Design Verification',
      'DV',
      'Facilities',
      'Firmware',
    ])
  })

  it('offers every business unit and the standard functions plus your own', () => {
    expect(opts.units).toEqual(['Silicon', 'Systems'])
    expect(opts.functions.slice(0, JOB_FUNCTIONS.length)).toEqual([...JOB_FUNCTIONS])
    expect(
      opts.families
        .find((f) => f.value === 'Firmware')
        ?.under.map((p) => p.under)
        .sort(),
    ).toEqual(['Engineering', 'Operations'])
  })

  it('writes placements as text', () => {
    expect(
      placementText(
        [
          { under: 'A', headcount: 1200 },
          { under: null, headcount: 2 },
        ],
        'none',
      ),
    ).toBe('A (1,200), none (2)')
  })
})

describe('previewChange', () => {
  it('counts the rows a move would change in each dataset', () => {
    const p = previewChange(data, {
      kind: 'move-department',
      department: 'Design Verification',
      from: null,
      to: 'Silicon',
    })
    // Employees: the Systems row (index 4); the leaver under Silicon is already there. Requisitions: none.
    expect(p.byDataset).toEqual([{ dataset: 'employees', label: 'Employees', rows: 1 }])
    expect(previewText(p)).toBe('Changes 1 row in Employees.')
  })

  it('counts a category-wide merge across datasets', () => {
    const p = previewChange(data, {
      kind: 'merge',
      ref: 'requisitions.department',
      from: ['DV'],
      to: 'Design Verification',
    })
    expect(p.total).toBe(2)
    expect(previewText(p)).toBe('Changes 2 rows in Requisitions.')
    const both = previewChange(data, {
      kind: 'rename',
      ref: 'employees.businessUnit',
      from: ['Silicon'],
      to: 'Silicon Engineering',
    })
    expect(previewText(both)).toBe('Changes 8 rows: 5 in Employees and 3 in Requisitions.')
  })

  it('explains why a change cannot be made', () => {
    expect(
      previewText(previewChange(data, { kind: 'move-department', department: '', from: null, to: 'X' })),
    ).toBe('Choose a department.')
    expect(
      previewText(
        previewChange(data, { kind: 'rename', ref: 'employees.level', from: ['L3'], to: 'Senior' }),
      ),
    ).toMatch(/must be one of/)
    expect(
      previewText(
        previewChange(data, { kind: 'merge', ref: 'employees.department', from: ['Nope'], to: 'X' }),
      ),
    ).toBe('No rows would change.')
  })
})

describe('scopeText', () => {
  it('names the datasets a category-wide change reaches', () => {
    expect(scopeText('employees.department')).toBe('Employees, Requisitions, Job changes and Hiring plan')
    expect(scopeText('cases.channel')).toBe('HR cases')
    expect(scopeText('employees.name')).toBe('')
  })
})

describe('rowsChangedBy', () => {
  const AT = '2026-10-01T00:00:00.000Z'
  const mappings: ReferenceMapping[] = [
    {
      kind: 'merge',
      id: 'a',
      at: AT,
      by: null,
      ref: 'requisitions.department',
      from: ['DV'],
      to: 'Design Verification',
      scope: 'category',
    },
    {
      kind: 'move-department',
      id: 'b',
      at: AT,
      by: null,
      department: 'Design Verification',
      from: null,
      to: 'Systems',
    },
  ]

  it('counts only the rows each mapping changed itself, in order', () => {
    expect(rowsChangedBy(data, mappings, 'a')).toEqual([
      { dataset: 'requisitions', label: 'Requisitions', rows: [1, 2] },
    ])
    // The move reaches the requisitions the merge renamed, and every Silicon row of the department.
    expect(rowsChangedBy(data, mappings, 'b')).toEqual([
      { dataset: 'employees', label: 'Employees', rows: [0, 1, 2, 3, 8] },
      { dataset: 'requisitions', label: 'Requisitions', rows: [0, 1, 2] },
    ])
    expect(rowsChangedBy(data, mappings, 'nope')).toEqual([])
  })
})

describe('draftMapping', () => {
  it('turns the form into a mapping', () => {
    expect(draftMapping({ ...EMPTY_DRAFT, department: 'DV', to: ' Silicon ' })).toEqual({
      kind: 'move-department',
      department: 'DV',
      from: null,
      to: 'Silicon',
    })
    expect(
      draftMapping({
        ...EMPTY_DRAFT,
        kind: 'move-family',
        jobFamily: 'Firmware',
        from: 'Operations',
        to: 'Engineering',
      }),
    ).toEqual({
      kind: 'move-family',
      jobFamily: 'Firmware',
      from: 'Operations',
      to: 'Engineering',
    })
    expect(
      draftMapping({ ...EMPTY_DRAFT, kind: 'rename', values: ['A', 'B'], to: 'C', scope: 'field' }),
    ).toEqual({
      kind: 'rename',
      ref: 'employees.department',
      from: ['A'],
      to: 'C',
      scope: 'field',
    })
  })

  it('writes when a change was made', () => {
    expect(whenText('2026-10-03T14:05:00')).toBe('3 Oct 2026, 14:05')
    expect(whenText('nope')).toBe('nope')
  })
})
