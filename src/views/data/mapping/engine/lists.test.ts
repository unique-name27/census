import { describe, expect, it } from 'vitest'
import { isFilled } from '@/data/quality/applicability'
import type { FieldRef } from '@/data/quality/fieldRef'
import { emp, emptyDatasets } from '@/data/quality/test-fixtures'
import { CATEGORIES, categoryById, inventory, type ValueMapping } from '@/data/reference'
import type { HrCase } from '@/data/schema'
import {
  extraColumns,
  fieldLabel,
  fieldOptionLabel,
  groupInventories,
  inventorySummary,
  LIST_GROUPS,
  matchRows,
  remapSpellings,
  unlistedValues,
  valueAliases,
  valueRows,
} from './lists'

const AT = '2026-10-01T00:00:00.000Z'
const merge = (id: string, from: string[], to: string, ref = 'employees.department'): ValueMapping => ({
  kind: 'merge',
  id,
  at: AT,
  by: null,
  ref: ref as FieldRef,
  from,
  to,
  scope: 'category',
})

describe('LIST_GROUPS', () => {
  it('names only categories that exist, each once', () => {
    const ids = LIST_GROUPS.flatMap((g) => g.categories)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(categoryById(id)).toBeDefined()
  })

  it('covers every categorical field', () => {
    const ids = new Set(LIST_GROUPS.flatMap((g) => g.categories))
    for (const c of CATEGORIES) expect(ids.has(c.id)).toBe(true)
  })
})

describe('valueAliases', () => {
  it('follows later changes to the final value', () => {
    const alias = valueAliases('employees.department', [
      merge('1', ['DV'], 'Design verif.'),
      merge('2', ['Design verif.', 'Verification'], 'Design Verification'),
    ])
    expect(Object.fromEntries(alias)).toEqual({
      DV: 'Design Verification',
      'Design verif.': 'Design Verification',
      Verification: 'Design Verification',
    })
  })

  it('reaches every field of the category, skips other fields and skipped changes', () => {
    const m = merge('1', ['DV'], 'Design Verification')
    expect(valueAliases('requisitions.department', [m]).get('DV')).toBe('Design Verification')
    expect(valueAliases('employees.jobFamily', [m]).size).toBe(0)
    expect(valueAliases('employees.department', [m], new Set(['1'])).size).toBe(0)
    expect(valueAliases('requisitions.department', [{ ...m, scope: 'field' }]).size).toBe(0)
  })

  it('drops a value renamed back to itself', () => {
    const alias = valueAliases('employees.department', [merge('1', ['A'], 'B'), merge('2', ['B'], 'A')])
    expect(alias.has('A')).toBe(false)
    expect(alias.get('B')).toBe('A')
  })
})

describe('remapSpellings', () => {
  it('points raw spellings at the value your change turned them into', () => {
    const out = remapSpellings(
      {
        'employees.department': [
          { raw: 'dv', value: 'DV', count: 3 },
          { raw: '???', value: null, count: 1 },
        ],
      },
      [merge('1', ['DV'], 'Design Verification')],
    )
    expect(out['employees.department']).toEqual([
      { raw: 'dv', value: 'Design Verification', count: 3 },
      { raw: '???', value: null, count: 1 },
    ])
  })
})

describe('valueRows', () => {
  const d = emptyDatasets()
  d.employees = [
    emp(1, { department: 'Design Verification' }),
    emp(2, { department: 'Design Verification' }),
    emp(3, { department: 'Firmware' }),
    emp(4, { department: '' }),
  ]
  d.cases = [
    { caseId: 'C1', category: 'Payroll' } as HrCase,
    { caseId: 'C2', category: 'Payrol' } as HrCase,
    { caseId: 'C3', category: null } as unknown as HrCase,
  ]

  it('lists values with counts, shares, spellings and blanks', () => {
    const [inv] = inventory(d, {
      categories: ['department'],
      spellings: { 'employees.department': [{ raw: 'DV', value: 'Design Verification', count: 2 }] },
    })
    const rows = valueRows(inv, [merge('1', ['Design Verif'], 'Design Verification')])
    const dv = rows.find((r) => r.value === 'Design Verification')!
    expect(dv.count).toBe(2)
    expect(dv.share).toBeCloseTo(2 / 3)
    expect(dv.spellings).toBe('DV, Design Verif (your change)')
    expect(dv.status).toBe('open')
    expect(dv.match).toEqual({ by: 'value', value: 'Design Verification' })
    const blank = rows.at(-1)!
    expect(blank).toMatchObject({ value: '(Blank)', count: 1, status: 'blank', share: null })
    expect(inventorySummary(inv)).toEqual({ used: 2, unrecognized: 0, blank: 1, total: 4 })
  })

  it('marks values outside the known list, unused known values and import gaps', () => {
    const [inv] = inventory(d, {
      categories: ['caseCategory'],
      issues: {
        cases: [
          {
            row: 9,
            id: 'C3',
            field: 'category',
            label: 'Category',
            value: 'Benefts',
            code: 'unknown-value',
            issue: 'Not recognized',
            action: 'cleared',
          },
        ],
      },
    })
    const rows = valueRows(inv)
    expect(rows.find((r) => r.value === 'Payroll')).toMatchObject({
      status: 'listed',
      process: 'PY-05',
      team: 'Payroll',
    })
    expect(rows.find((r) => r.value === 'Payrol')?.status).toBe('unlisted')
    expect(rows.find((r) => r.value === 'Benefits')).toMatchObject({
      status: 'unused',
      count: 0,
      match: null,
    })
    expect(rows.find((r) => r.value === 'Benefts')).toMatchObject({
      status: 'import',
      count: 1,
      share: null,
      match: { by: 'import', value: 'Benefts' },
    })
  })

  it('adds the columns some categories carry', () => {
    expect(extraColumns('caseCategory').map((c) => c.key)).toEqual(['process', 'team'])
    expect(extraColumns('transactionType').map((c) => c.label)).toEqual(['Atlas process'])
    expect(extraColumns('terminationReason').map((c) => c.key)).toEqual(['type'])
    expect(extraColumns('stage')).toEqual([])
  })
})

describe('labels', () => {
  it('names a field by dataset, or by field when one dataset has two', () => {
    const dept = categoryById('department')!
    expect(fieldOptionLabel('employees.department', dept)).toBe('Employees')
    expect(fieldOptionLabel('jobChanges.fromDepartment', dept)).toBe('From department')
    expect(fieldLabel('requisitions.department')).toBe('Requisitions: Department')
  })
})

describe('groupInventories', () => {
  it('returns the group’s categories with their fields in order', () => {
    const invs = inventory(emptyDatasets())
    const people = groupInventories(LIST_GROUPS[0], invs)
    expect(people.map((g) => g.category.id)).toEqual(LIST_GROUPS[0].categories)
    expect(people[0].fields.map((f) => f.ref)).toEqual(categoryById('level')!.refs)
  })
})

describe('matchRows', () => {
  it('finds rows by value or blank', () => {
    const rows = [{ x: 'A' }, { x: 'B' }, { x: '' }, { x: 'Unknown' }, { x: 'A' }]
    expect(matchRows(rows, 'x', { by: 'value', value: 'A' }, isFilled)).toEqual([0, 4])
    expect(matchRows(rows, 'x', { by: 'blank' }, isFilled)).toEqual([2, 3])
    expect(matchRows(rows, 'x', { by: 'import', value: 'A' }, isFilled)).toEqual([])
  })
})

describe('unlistedValues', () => {
  it('lists values outside their known list with the value they most likely mean', () => {
    const d = emptyDatasets()
    d.cases = [
      { caseId: 'C1', category: 'Payroll', channel: 'E-mail' } as HrCase,
      { caseId: 'C2', category: 'Payroll questions', channel: 'E-mail' } as HrCase,
      { caseId: 'C3', category: 'Holiday calendar', channel: 'Portal' } as HrCase,
    ]
    const out = unlistedValues(inventory(d, { categories: ['caseCategory', 'caseChannel'] }))
    expect(out.map((u) => [u.ref, u.value, u.count, u.suggestion])).toEqual([
      ['cases.channel', 'E-mail', 2, 'Email'],
      ['cases.category', 'Holiday calendar', 1, null],
      ['cases.category', 'Payroll questions', 1, 'Payroll'],
    ])
  })
})
