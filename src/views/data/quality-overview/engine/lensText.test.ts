import { describe, expect, it } from 'vitest'
import { explainsBetter } from '@/data/quality/compute'
import { DEFAULT_QUALITY_RULES } from '@/data/quality/rules'
import { datasetOfQualityRoute, QUALITY_LENS_KEY, qualityRoute, useQualityLens } from '../lens'
import { datasetHold, fillPhrase, limitPhrase } from './lensText'
import { gappyQuality } from './test-fixtures'

const q = gappyQuality()
const rules = DEFAULT_QUALITY_RULES

describe('what limits a number', () => {
  it('names a capped field with its fill rate', () => {
    const s = q.fieldStats('employees.terminationReason')
    const l = q.limitingOf(['employees.terminationReason', 'employees.hireDate'], [])
    expect(limitPhrase(s, l, rules, q.dataset('employees'))).toBe('Termination reason 70% filled')
  })

  it('names the dataset and what it still needs when the field itself is fine', () => {
    const l = q.limitingOf(['requisitions.openedDate'], [])
    expect(l.tier).toBe('silver')
    expect(limitPhrase(q.fieldStats('requisitions.openedDate'), l, rules, q.dataset('requisitions'))).toBe(
      'Requisitions: not certified',
    )
    expect(datasetHold(q.dataset('candidates'))).toBe('Candidates: no rows loaded')
    // A number that names no fields takes its dataset.
    const byDataset = q.limitingOf(undefined, ['requisitions'])
    expect(limitPhrase(null, byDataset, rules, q.dataset('requisitions'))).toBe('Requisitions: not certified')
  })

  it('at gold names the weakest field’s fill, never rounding across the bar', () => {
    const l = q.limitingOf(['employees.hireDate'], [])
    expect(l.tier).toBe('gold')
    expect(limitPhrase(q.fieldStats('employees.hireDate'), l, rules, q.dataset('employees'))).toBe(
      'Hire date 100% filled',
    )
    expect(fillPhrase({ label: 'Stage', coverage: 0.9496, blankOk: false }, rules)).toBe('Stage 94.9% filled')
  })

  it('puts field labels mid-sentence after "Limited by", and says when the share is company-wide', () => {
    const s = q.fieldStats('employees.terminationReason')
    const l = q.limitingOf(['employees.terminationReason'], [])
    expect(limitPhrase(s, l, rules, q.dataset('employees'), { mid: true })).toBe(
      'termination reason 70% filled',
    )
    expect(limitPhrase(s, l, rules, q.dataset('employees'), { mid: true, scope: 'company-wide' })).toBe(
      'termination reason 70% filled company-wide',
    )
    // A dataset keeps its name.
    const req = q.limitingOf(['requisitions.openedDate'], [])
    expect(
      limitPhrase(q.fieldStats('requisitions.openedDate'), req, rules, q.dataset('requisitions'), {
        mid: true,
      }),
    ).toBe('Requisitions: not certified')
  })

  it('never reads a field whose blanks are normal as missing data', () => {
    expect(fillPhrase({ label: 'Merit %', coverage: 0.9, blankOk: true }, rules)).toBe(
      'Merit % 90% filled; blanks are normal',
    )
    // At gold the lens names a field whose blanks are a gap before one whose blanks are normal.
    const merit = { capReason: null, coverage: 0.07, problemRate: 0, blankOk: true }
    const base = { capReason: null, coverage: 1, problemRate: 0, blankOk: false }
    expect(explainsBetter(base, merit)).toBe(true)
    expect(explainsBetter(merit, base)).toBe(false)
  })

  it('says when a field is blank in every row or values are not recognized', () => {
    const none = { ...q.fieldStats('employees.hireDate'), tier: 'none' as const }
    expect(limitPhrase(none, { dataset: 'employees', tier: 'none' }, rules, null)).toBe('Hire date: no data')
    const values = { ...q.fieldStats('employees.level'), capKind: 'values' as const, problemRate: 0.04 }
    expect(limitPhrase(values, { dataset: 'employees', tier: 'bronze' }, rules, null)).toBe(
      'Level: 4% not recognized',
    )
  })
})

describe('the lens switch and the Data quality address', () => {
  it('is off by default and turns on and off', () => {
    expect(useQualityLens.getState().on).toBe(false)
    useQualityLens.getState().setOn(true)
    expect(useQualityLens.getState().on).toBe(true)
    useQualityLens.getState().setOn(false)
    expect(useQualityLens.getState().on).toBe(false)
    expect(QUALITY_LENS_KEY).toBe('census:quality-lens')
  })

  it('addresses the tab at one dataset', () => {
    expect(qualityRoute()).toBe('quality')
    expect(qualityRoute('employees')).toBe('quality/employees')
    expect(datasetOfQualityRoute('quality/employees')).toBe('employees')
    expect(datasetOfQualityRoute('quality:cases')).toBe('cases')
    expect(datasetOfQualityRoute('quality')).toBeNull()
    expect(datasetOfQualityRoute('quality/people')).toBeNull()
    expect(datasetOfQualityRoute('metrics/comp/merit/spend')).toBeNull()
  })
})
