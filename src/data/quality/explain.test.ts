/**
 * Explanations that never contradict their verdict, the field that explains a tie, a pay snapshot
 * judged by its date, and reference remaps made after a certification.
 */
import { describe, expect, it } from 'vitest'
import { qualityFor, referenceLayer } from '../context'
import type { ReferenceMapping } from '../reference/types'
import type { Datasets } from '../schema'
import { computeQuality, explainsBetter } from './compute'
import { emp, emptyDatasets, smallCompany } from './test-fixtures'
import { pctAgainst } from './text'
import type { DatasetVersion } from './types'
import { confirmVersion, makeCertification, makeVersion } from './versions'

const AS_OF = '2026-09-30'
const CERTIFIED_AT = '2026-10-03T10:00:00.000Z'

function version(
  key: 'employees' | 'comp',
  data: Datasets,
  importedAt: string | null = '2026-10-01T09:00:00.000Z',
) {
  return makeVersion({
    dataset: key,
    source: 'upload',
    rows: data[key] as object[],
    versionId: `${key}-v1`,
    fileName: `${key}.xlsx`,
    importedAt,
    mapping: { employeeId: { header: 'ID', confidence: 'high', score: 1, reason: '' } },
  })
}

const confirmed = (v: DatasetVersion) => confirmVersion(v, 'Jamie', '2026-10-02T10:00:00.000Z')

function certified(v: DatasetVersion, data: Datasets): DatasetVersion {
  const c = confirmed(v)
  return {
    ...c,
    certification: makeCertification({
      version: c,
      data,
      asOf: AS_OF,
      at: CERTIFIED_AT,
      input: { by: 'HRIS team' },
    }),
  }
}

describe('pctAgainst', () => {
  it('uses whole percents away from the threshold', () => {
    expect(pctAgainst(0.72, 0.95, 'min')).toBe('72%')
    expect(pctAgainst(0.04, 0.02, 'max')).toBe('4%')
  })

  it('uses one decimal near the threshold, rounded toward the side the share is on', () => {
    expect(pctAgainst(0.946, 0.95, 'min')).toBe('94.6%')
    expect(pctAgainst(0.9496, 0.95, 'min')).toBe('94.9%')
    expect(pctAgainst(0.95, 0.95, 'min')).toBe('95.0%')
    expect(pctAgainst(0.0247, 0.02, 'max')).toBe('2.5%')
    expect(pctAgainst(0.02001, 0.02, 'max')).toBe('2.1%')
    expect(pctAgainst(0.02, 0.02, 'max')).toBe('2.0%')
    expect(pctAgainst(0.0195, 0.02, 'max')).toBe('2.0%')
  })
})

describe('explanations at the thresholds', () => {
  it('never reads as passing when a field misses 95% by a fraction', () => {
    const data = emptyDatasets()
    // 53 of 56 locations filled: 94.6%.
    data.employees = Array.from({ length: 56 }, (_, i) =>
      emp(i + 1, { location: i < 3 ? 'Unknown' : 'San Jose' }),
    )
    const q = computeQuality(data, { employees: confirmed(version('employees', data)) }, undefined, {
      asOf: AS_OF,
    })
    expect(q.fieldTier('employees.location')).toBe('bronze')
    expect(q.fieldStats('employees.location').capReason).toBe('Location is 94.6% filled; silver needs 95%.')
  })

  it('never reads as within 2% when a field is over it by a fraction', () => {
    const data = emptyDatasets()
    // 1 of 40 employment types defaulted: 2.5%.
    data.employees = Array.from({ length: 40 }, (_, i) => emp(i + 1))
    const v = confirmed(version('employees', data))
    v.issues.defaultedByField.employmentType = 1
    const q = computeQuality(data, { employees: v }, undefined, { asOf: AS_OF })
    expect(q.fieldStats('employees.employmentType').capReason).toBe(
      '2.5% of employment type values are not recognized or defaulted; silver allows 2%.',
    )
  })
})

describe('the field that explains a tie', () => {
  it('prefers a capped field, then the lowest fill, then the most problem values', () => {
    const base = { capReason: null, coverage: 1, problemRate: 0, blankOk: false }
    expect(explainsBetter({ ...base, capReason: 'x' }, { ...base, coverage: 0.5 })).toBe(true)
    expect(explainsBetter({ ...base, coverage: 0.92 }, base)).toBe(true)
    expect(explainsBetter(base, { ...base, coverage: 0.92 })).toBe(false)
    expect(explainsBetter({ ...base, problemRate: 0.04 }, base)).toBe(true)
    // Blanks that are normal do not make a field the weakest.
    expect(explainsBetter({ ...base, coverage: 0.1, blankOk: true }, base)).toBe(false)
    // A full tie keeps the field declared first.
    expect(explainsBetter(base, base)).toBe(false)
  })

  it('names the least filled field when every field shares the dataset tier', () => {
    const data = emptyDatasets()
    data.employees = Array.from({ length: 20 }, (_, i) =>
      emp(i + 1, { location: i < 3 ? 'Unknown' : 'San Jose' }),
    )
    // Bronze: the mapping is not confirmed, so no field is capped and all of them tie.
    const q = computeQuality(data, { employees: version('employees', data) }, undefined, { asOf: AS_OF })
    expect(q.limitingOf(['employees.hireDate', 'employees.location'], []).ref).toBe('employees.location')
    expect(q.explainOf(['employees.hireDate', 'employees.location'], [])).toBe(
      'Bronze: Employees mapping not yet confirmed. Location is 85% filled.',
    )
  })
})

describe('a pay snapshot is judged by its date', () => {
  function comp(importedAt: string | null) {
    const data = smallCompany()
    data.comp = data.employees.map((e) => ({
      employeeId: e.employeeId,
      baseSalary: 100000,
      currency: 'USD',
      fxToUsd: 1,
    })) as unknown as Datasets['comp']
    const versions = {
      employees: certified(version('employees', data), data),
      comp: certified(version('comp', data, importedAt), data),
    }
    return computeQuality(data, versions, undefined, { asOf: AS_OF })
  }

  it('keeps a recent extract gold and drops a stale one to silver', () => {
    const fresh = comp('2026-09-20T09:00:00.000Z')
    expect(fresh.checks('comp').find((r) => r.id === 'fresh')).toMatchObject({
      pass: true,
      detail: 'The latest pay extract is dated 20 Sep, 10 d before the as-of date.',
    })
    const stale = comp('2026-07-01T09:00:00.000Z')
    expect(stale.datasetTier('comp')).toBe('silver')
    expect(stale.checks('comp').find((r) => r.id === 'fresh')?.detail).toBe(
      'The latest pay extract is dated 1 Jul, 91 d before the as-of date; 45 d is the limit.',
    )
    expect(stale.explain('comp')).toBe(
      'Silver: Compensation mapping confirmed 2 Oct by Jamie; certified, but the data is not fresh.',
    )
  })

  it('treats an extract loaded after the as-of date as current', () => {
    const q = comp('2026-10-01T09:00:00.000Z')
    expect(q.checks('comp').find((r) => r.id === 'fresh')).toMatchObject({
      pass: true,
      detail: 'The pay extract is dated 1 Oct, after the as-of date.',
    })
  })
})

describe('reference remaps and certification', () => {
  const move = (at: string): ReferenceMapping => ({
    id: 'm1',
    by: 'Jamie',
    at,
    kind: 'move-department',
    department: 'Design Verification',
    from: null,
    to: 'Software Engineering',
  })

  function remapped(at: string) {
    const data = smallCompany()
    const versions = { employees: certified(version('employees', data), data) }
    const applied = referenceLayer(data, [move(at)])
    return qualityFor(applied, versions, AS_OF)
  }

  it('caps a gold field at silver when it was remapped after the certification', () => {
    const q = remapped('2026-10-04T09:00:00.000Z')
    expect(q.datasetTier('employees')).toBe('gold')
    expect(q.fieldTier('employees.businessUnit')).toBe('silver')
    expect(q.fieldTier('employees.department')).toBe('gold')
    expect(q.explain('employees.businessUnit')).toBe(
      'Silver: Employees certified 3 Oct by HRIS team. Business unit remapped by Jamie for 40 rows after certification; gold needs a new certification.',
    )
    expect(q.fieldStats('employees.businessUnit').capKind).toBe('remapped')
  })

  it('keeps it gold when the remap was in place before the certification', () => {
    const q = remapped('2026-10-01T09:00:00.000Z')
    expect(q.fieldTier('employees.businessUnit')).toBe('gold')
    expect(q.explain('employees.businessUnit')).toContain('Business unit remapped by Jamie for 40 rows.')
  })
})
