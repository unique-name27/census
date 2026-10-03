import { describe, expect, it } from 'vitest'
import { type DatasetDef, datasetDef } from '@/data/schema'
import { fieldCoverage, isFilled, requirementOf } from './coverage'

const def: DatasetDef = {
  key: 'reviews',
  label: 'Test',
  sheet: 'Test',
  description: '',
  usedBy: ['talent'],
  rowKey: ['id'],
  fields: [
    { key: 'id', label: 'ID', type: 'id', required: true, synonyms: [], description: '' },
    { key: 'unit', label: 'Unit', type: 'string', recommended: true, synonyms: [], description: '' },
    { key: 'level', label: 'Level', type: 'level', recommended: true, synonyms: [], description: '' },
    { key: 'note', label: 'Note', type: 'string', synonyms: [], description: '' },
    { key: 'pay', label: 'Pay', type: 'money', synonyms: [], description: '', pay: true },
  ],
}

describe('isFilled', () => {
  it('treats blanks, NaN and the importer placeholder as empty', () => {
    expect(isFilled(null)).toBe(false)
    expect(isFilled(undefined)).toBe(false)
    expect(isFilled('')).toBe(false)
    expect(isFilled('  ')).toBe(false)
    expect(isFilled('Unknown')).toBe(false)
    expect(isFilled(Number.NaN)).toBe(false)
  })
  it('counts zero, false and text as filled', () => {
    expect(isFilled(0)).toBe(true)
    expect(isFilled(false)).toBe(true)
    expect(isFilled('Unknown site')).toBe(true)
    expect(isFilled('E1')).toBe(true)
  })
})

describe('fieldCoverage', () => {
  it('measures each field and averages required and recommended ones', () => {
    const rows = [
      { id: 'a', unit: 'X', level: 'L3', note: null, pay: 100 },
      { id: 'b', unit: 'Unknown', level: 'L4', note: 'n', pay: null },
      { id: 'c', unit: '', level: null, note: null, pay: 5 },
      { id: 'd', unit: 'Y', level: 'L1' },
    ]
    const c = fieldCoverage(def, rows)
    const by = Object.fromEntries(c.fields.map((f) => [f.key, f]))
    expect(c.rows).toBe(4)
    expect(by.id.share).toBe(1)
    expect(by.unit).toMatchObject({ filled: 2, expected: 4, share: 0.5, requirement: 'recommended' })
    expect(by.level.share).toBe(0.75)
    expect(by.note).toMatchObject({ filled: 1, share: 0.25, requirement: 'optional' })
    expect(by.pay.pay).toBe(true)
    // (1 + 0.5 + 0.75) / 3; optional fields do not count
    expect(c.core).toBeCloseTo(0.75, 10)
    expect(c.emptyCore).toEqual([])
  })

  it('lists required and recommended fields blank in every row', () => {
    const c = fieldCoverage(def, [{ id: 'a' }, { id: 'b', unit: 'Unknown' }])
    expect(c.emptyCore.map((f) => f.key)).toEqual(['unit', 'level'])
    expect(c.core).toBeCloseTo(1 / 3, 10)
  })

  it('is null, not zero, for an empty dataset', () => {
    const c = fieldCoverage(def, [])
    expect(c.core).toBeNull()
    expect(c.fields.every((f) => f.share === null && f.expected === 0)).toBe(true)
    expect(c.emptyCore).toEqual([])
  })

  it('counts a next interview date only for active candidates who are interviewing', () => {
    const cand = datasetDef('candidates')
    const rows = [
      { status: 'Active', currentStage: 'Onsite', nextEventDate: '2026-10-02' },
      { status: 'Active', currentStage: 'Screen', nextEventDate: null },
      { status: 'Active', currentStage: 'Applied', nextEventDate: null },
      { status: 'Rejected', currentStage: 'Onsite', nextEventDate: null },
    ]
    const f = fieldCoverage(cand, rows).fields.find((x) => x.key === 'nextEventDate')
    expect(f).toMatchObject({
      expected: 2,
      filled: 1,
      share: 0.5,
      scope: 'Active candidates in interview stages',
    })
  })
})

describe('requirementOf', () => {
  it('ranks required over recommended', () => {
    expect(requirementOf({ required: true, recommended: true })).toBe('required')
    expect(requirementOf({ recommended: true })).toBe('recommended')
    expect(requirementOf({})).toBe('optional')
  })
})
