import { describe, expect, it } from 'vitest'
import type { FieldStats } from '@/data/quality'
import { datasetDef } from '@/data/schema'
import {
  cappedFields,
  nextTierText,
  qualityExportRows,
  qualityRows,
  ruleExportRows,
  tierCounts,
} from './qualityTable'

const stat = (field: string, extra: Partial<FieldStats> = {}): FieldStats => ({
  ref: `employees.${field}`,
  label: field,
  rows: 10,
  applicableRows: 10,
  filled: 10,
  blank: 0,
  coverage: 1,
  invalid: 0,
  defaulted: 0,
  problemRate: 0,
  scope: null,
  blankOk: false,
  remapped: 0,
  tier: 'gold',
  capReason: null,
  ...extra,
})

const def = datasetDef('employees')

describe('qualityRows', () => {
  it('orders required fields first and keeps schema order within each', () => {
    const stats = def.fields.map((f) => stat(f.key))
    const rows = qualityRows(def, stats)
    expect(rows).toHaveLength(def.fields.length)
    const ranks = rows.map((r) => ({ required: 0, recommended: 1, optional: 2 })[r.requirement])
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    expect(rows[0].field).toBe(def.fields.find((f) => f.required)?.key)
  })

  it('drops refs the schema does not know', () => {
    expect(qualityRows(def, [stat('nope')])).toEqual([])
  })
})

describe('tiers', () => {
  const rows = qualityRows(def, [
    stat('employeeId'),
    stat('terminationReason', {
      tier: 'bronze',
      capReason: 'Termination reason is 72% filled for leavers; silver needs 95%.',
    }),
    stat('jobFunction', { tier: 'none', filled: 0, coverage: 0 }),
  ])

  it('counts fields per tier', () => {
    expect(tierCounts(rows)).toEqual({ none: 1, bronze: 1, silver: 0, gold: 1 })
  })

  it('finds the fields below the dataset', () => {
    expect(
      cappedFields(rows, 'gold')
        .map((r) => r.field)
        .sort(),
    ).toEqual(['jobFunction', 'terminationReason'])
    expect(cappedFields(rows, 'bronze').map((r) => r.field)).toEqual(['jobFunction'])
  })

  it('exports one row per field with its tier and reason', () => {
    const out = qualityExportRows(rows)
    expect(out.find((r) => r.field === 'terminationReason')).toMatchObject({
      tier: 'Bronze',
      why: 'Termination reason is 72% filled for leavers; silver needs 95%.',
      scope: 'All rows',
    })
  })
})

describe('ruleExportRows', () => {
  it('words gates and results', () => {
    expect(
      ruleExportRows([
        { label: 'Mapping confirmed', gate: 'silver', pass: false, detail: 'Not reviewed.', count: 0 },
        { label: 'Dates in order', gate: null, pass: true, detail: 'Fine.', count: 0 },
      ]),
    ).toEqual([
      { check: 'Mapping confirmed', needed: 'Silver', result: 'Fail', detail: 'Not reviewed.', rows: 0 },
      { check: 'Dates in order', needed: 'Information', result: 'Pass', detail: 'Fine.', rows: 0 },
    ])
  })
})

describe('nextTierText', () => {
  it('names the checks the next tier needs', () => {
    expect(nextTierText('bronze', ['Mapping confirmed', 'References resolve'])).toBe(
      'To reach silver: mapping confirmed and references resolve.',
    )
    expect(nextTierText('silver', ['Certified for this version', 'Control totals reconcile', 'Fresh'])).toBe(
      'To reach gold: certified for this version, control totals reconcile and fresh.',
    )
    expect(nextTierText('gold', [])).toBeNull()
    expect(nextTierText('none', [])).toBe('Load rows to reach bronze.')
  })
})
