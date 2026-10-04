import { describe, expect, it } from 'vitest'
import type { ImportIssue } from '../import/types'
import { DATASETS } from '../schema'
import { datasetOfRef, FIELD_REFS, fieldRef, invalidRefs, isFieldRef, parseFieldRef } from './fieldRef'
import { summarizeImport } from './importSummary'
import { pctText, shortDate } from './text'
import { compareTiers, lowestTier, meetsStandard, minTier, TIERS, tierRank } from './tier'
import { isUnrecognized } from './vocab'

describe('tiers and the standard', () => {
  it('orders none < bronze < silver < gold', () => {
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2, 3])
    expect(minTier('gold', 'bronze')).toBe('bronze')
    expect(compareTiers('silver', 'gold')).toBe(-1)
    expect(lowestTier(['gold', 'silver', 'gold'])).toBe('silver')
    expect(lowestTier([])).toBe('bronze')
    expect(lowestTier([], 'none')).toBe('none')
  })

  it('shows a number when its tier meets the standard; no data never does', () => {
    expect(meetsStandard('gold', 'gold')).toBe(true)
    expect(meetsStandard('silver', 'gold')).toBe(false)
    expect(meetsStandard('silver', 'silver')).toBe(true)
    expect(meetsStandard('bronze', 'bronze')).toBe(true)
    expect(meetsStandard('none', 'bronze')).toBe(false)
  })
})

describe('field references', () => {
  it('validates against the schema', () => {
    expect(isFieldRef('employees.terminationDate')).toBe(true)
    expect(isFieldRef('employees.jobFunction')).toBe(true)
    expect(isFieldRef('employees.salary')).toBe(false)
    expect(isFieldRef('people.name')).toBe(false)
    expect(isFieldRef(42)).toBe(false)
    expect(parseFieldRef('candidates.currentStage')).toEqual({ dataset: 'candidates', field: 'currentStage' })
    expect(parseFieldRef('candidates.stage')).toBeNull()
    expect(datasetOfRef('candidates.stage')).toBe('candidates')
    expect(datasetOfRef('nope.stage')).toBeNull()
    expect(fieldRef('comp', 'meritPct')).toBe('comp.meritPct')
    expect(invalidRefs(['comp.meritPct', 'comp.merit'])).toEqual(['comp.merit'])
  })

  it('lists every schema field once', () => {
    const n = DATASETS.reduce((a, d) => a + d.fields.length, 0)
    expect(FIELD_REFS).toHaveLength(n)
    expect(new Set(FIELD_REFS).size).toBe(n)
  })
})

describe('job function in the schema', () => {
  it('has its own header names, no longer shared with job family', () => {
    const fields = DATASETS.find((d) => d.key === 'employees')!.fields
    const fam = fields.find((f) => f.key === 'jobFamily')!
    const fn = fields.find((f) => f.key === 'jobFunction')!
    expect(fam.synonyms).not.toContain('job function')
    expect(fam.synonyms).not.toContain('function')
    expect(fn.synonyms).toEqual(['job function', 'function', 'functional area', 'job function name'])
  })
})

describe('vocabularies', () => {
  it('flags values outside a field list; free text without a list is never flagged', () => {
    expect(isUnrecognized('candidates.currentStage', 'Phone screen')).toBe(true)
    expect(isUnrecognized('candidates.currentStage', 'Screen')).toBe(false)
    expect(isUnrecognized('employees.level', 'P4')).toBe(true)
    expect(isUnrecognized('cases.category', 'Badge request')).toBe(true)
    expect(isUnrecognized('employees.terminationReason', 'Base salary')).toBe(false)
    expect(isUnrecognized('employees.location', 'London')).toBe(false)
    expect(isUnrecognized('employees.department', 'Anything')).toBe(false)
    expect(isUnrecognized('employees.regrettable', true)).toBe(false)
  })
})

describe('import summary', () => {
  const issue = (p: Partial<ImportIssue>): ImportIssue => ({
    row: 2,
    id: 'E001',
    field: 'level',
    label: 'Level',
    value: 'x',
    code: 'unknown-value',
    issue: '',
    action: 'left-blank',
    ...p,
  })

  it('counts codes, fields, error rows, blocking issues, invalid and defaulted values', () => {
    const rows = [
      { employeeId: 'E001', employmentType: 'Employee', country: 'India', name: 'A' },
      { employeeId: 'E002', employmentType: 'Unknown', country: 'India', name: 'E002' },
      { employeeId: 'E003', employmentType: 'Employee', country: 'India', name: 'C' },
    ]
    const c = summarizeImport({
      dataset: 'employees',
      rows,
      issues: [
        issue({}),
        issue({ row: 3, id: 'E002', field: 'hireDate', code: 'unreadable' }),
        issue({ row: 5, id: 'E004', field: 'hireDate', code: 'missing-required', action: 'row-skipped' }),
        issue({ row: 2, id: 'E001', field: 'employmentType', code: 'defaulted', action: 'defaulted' }),
        // The default left "Unknown", which is blank anyway: not counted as defaulted.
        issue({ row: 3, id: 'E002', field: 'employmentType', code: 'defaulted', action: 'defaulted' }),
        issue({ row: 0, id: null, field: 'name', code: 'defaulted', action: 'defaulted' }),
        issue({ row: 0, id: null, field: '', code: 'manager-cycle', action: 'cleared' }),
      ],
      mapped: (f) => f !== 'name',
    })
    expect(c.rowsIn).toBe(4)
    expect(c.rowsOut).toBe(3)
    expect(c.total).toBe(7)
    expect(c.byCode).toMatchObject({ 'unknown-value': 1, unreadable: 1, defaulted: 3, 'manager-cycle': 1 })
    expect(c.rowsWithErrors).toBe(3)
    expect(c.blocking).toBe(1)
    expect(c.invalidByField).toEqual({ level: 1, hireDate: 1 })
    // name had no column: names built from other columns are derived; only the ID fallback is a default.
    expect(c.defaultedByField).toEqual({ employmentType: 1, name: 1 })
  })
})

describe('wording helpers', () => {
  it('never rounds a gap away', () => {
    expect(pctText(0.996)).toBe('99.6%')
    expect(pctText(0.003)).toBe('<1%')
    expect(pctText(0.6)).toBe('60%')
    expect(pctText(1)).toBe('100%')
  })

  it('drops the year in the reference year', () => {
    expect(shortDate('2026-10-02T10:00:00.000Z', '2026')).toBe('2 Oct')
    expect(shortDate('2025-01-15', '2026')).toBe('15 Jan 2025')
  })
})
