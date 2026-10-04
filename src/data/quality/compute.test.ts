import { describe, expect, it } from 'vitest'
import type { ImportIssue } from '../import/types'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '../schema'
import { computeQuality, type VersionMap } from './compute'
import { FIELD_REFS } from './fieldRef'
import { emp, emptyDatasets, req, smallCompany } from './test-fixtures'
import type { DatasetVersion } from './types'
import { confirmVersion, makeCertification, makeVersion } from './versions'

const AS_OF = '2026-09-30'

function upload(
  key: DatasetKey,
  data: Datasets,
  issues: ImportIssue[] = [],
  rowsIn?: number,
): DatasetVersion {
  return makeVersion({
    dataset: key,
    source: 'upload',
    rows: data[key] as object[],
    versionId: `${key}-v1`,
    fileName: `${key}.xlsx`,
    importedAt: '2026-10-01T09:00:00.000Z',
    mapping: { employeeId: { header: 'ID', confidence: 'high', score: 1, reason: '' } },
    issues,
    rowsIn,
  })
}

const confirmed = (v: DatasetVersion) => confirmVersion(v, 'Jamie', '2026-10-02T10:00:00.000Z')

function certified(
  v: DatasetVersion,
  data: Datasets,
  totals = [] as { metric: 'activeHeadcount'; expected: number }[],
) {
  const c = confirmed(v)
  return {
    ...c,
    certification: makeCertification({
      version: c,
      data,
      asOf: AS_OF,
      at: '2026-10-03T10:00:00.000Z',
      input: {
        by: 'HRIS team',
        controlTotals: totals.map((t) => ({ label: 'Headcount per HRIS', tolerance: 0.005, ...t })),
      },
    }),
  }
}

const issue = (
  row: number,
  field: string,
  code: ImportIssue['code'],
  id: string | null = null,
): ImportIssue => ({
  row,
  id,
  field,
  label: field,
  value: 'x',
  code,
  issue: 'x',
  action: code === 'defaulted' ? 'defaulted' : 'left-blank',
})

describe('dataset tiers', () => {
  it('is none for an empty dataset and bronze before the mapping is confirmed', () => {
    const data = smallCompany()
    const q = computeQuality(data, { employees: upload('employees', data) }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('candidates')).toBe('none')
    expect(q.datasetTier('employees')).toBe('bronze')
    expect(q.explain('employees')).toBe('Bronze: Employees mapping not yet confirmed.')
    expect(q.dataset('employees').missing).toEqual(['Mapping confirmed'])
  })

  it('is silver once confirmed with clean checks, and gold when certified, reconciled and fresh', () => {
    const data = smallCompany()
    const v = upload('employees', data)
    const silver = computeQuality(data, { employees: confirmed(v) }, undefined, { asOf: AS_OF })
    expect(silver.datasetTier('employees')).toBe('silver')
    expect(silver.explain('employees')).toBe(
      'Silver: Employees mapping confirmed 2 Oct by Jamie; not certified.',
    )

    const gold = computeQuality(
      data,
      { employees: certified(v, data, [{ metric: 'activeHeadcount', expected: 30 }]) },
      undefined,
      { asOf: AS_OF },
    )
    expect(gold.datasetTier('employees')).toBe('gold')
    expect(gold.explain('employees')).toBe('Gold: Employees certified 3 Oct by HRIS team.')
  })

  it('stays silver when control totals miss the 0.5% tolerance or the data is stale', () => {
    const data = smallCompany()
    const v = upload('employees', data)
    const off = computeQuality(
      data,
      { employees: certified(v, data, [{ metric: 'activeHeadcount', expected: 31 }]) },
      undefined,
      { asOf: AS_OF },
    )
    expect(off.datasetTier('employees')).toBe('silver')
    expect(off.checks('employees').find((r) => r.id === 'control-totals')?.pass).toBe(false)
    expect(off.explain('employees')).toContain('control totals do not reconcile')

    const stale = computeQuality(data, { employees: certified(v, data) }, undefined, { asOf: '2027-06-30' })
    expect(stale.datasetTier('employees')).toBe('silver')
    expect(stale.checks('employees').find((r) => r.id === 'fresh')?.pass).toBe(false)
  })

  it('does not carry a certification over to another version', () => {
    const data = smallCompany()
    const v = certified(upload('employees', data), data)
    const next = { ...v, versionId: 'employees-v2' }
    const q = computeQuality(data, { employees: next }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('employees')).toBe('silver')
    expect(q.checks('employees').find((r) => r.id === 'certified')?.detail).toBe(
      'Certified for an earlier version; this version is not certified.',
    )
  })

  it('needs the issue rate within 2% and no blocking issues', () => {
    const data = smallCompany()
    // 2 of 40 rows with an error is 5%.
    const errors = [issue(2, 'level', 'unknown-value', 'E001'), issue(3, 'level', 'unknown-value', 'E002')]
    const q = computeQuality(
      data,
      { employees: confirmed(upload('employees', data, errors)) },
      { employees: errors },
      {
        asOf: AS_OF,
      },
    )
    expect(q.datasetTier('employees')).toBe('bronze')
    const rate = q.checks('employees').find((r) => r.id === 'issue-rate')!
    expect(rate.pass).toBe(false)
    expect(rate.detail).toBe('5.0% of rows (2 of 40) had an import error; 2% is allowed.')
    expect(rate.rows).toEqual([0, 1])
    expect(q.explain('employees')).toBe(
      'Bronze: Employees mapping confirmed 2 Oct by Jamie, but 5.0% of rows (2 of 40) had an import error; 2% is allowed.',
    )

    const blocking: ImportIssue[] = [{ ...issue(0, 'hireDate', 'column-missing'), action: 'row-skipped' }]
    const b = computeQuality(data, { employees: confirmed(upload('employees', data, blocking)) }, undefined, {
      asOf: AS_OF,
    })
    expect(b.datasetTier('employees')).toBe('bronze')
    expect(b.checks('employees').find((r) => r.id === 'no-blocking')?.detail).toBe(
      '1 blocking issue remains.',
    )
  })

  it('needs references to resolve for all but 2% of rows', () => {
    const data = smallCompany()
    data.requisitions = Array.from({ length: 20 }, (_, i) =>
      req(i + 1, { hiringManagerId: i < 1 ? 'E999' : 'E001' }),
    )
    const v = confirmed(upload('requisitions', data))
    // 1 of 20 is 5%.
    const q = computeQuality(data, { requisitions: v }, undefined, { asOf: AS_OF })
    expect(q.datasetTier('requisitions')).toBe('bronze')
    const refs = q.checks('requisitions').find((r) => r.id === 'references')!
    expect(refs.rows).toEqual([0])
    expect(refs.detail).toBe('5% of rows (1) refer to records that are not in Employees.')
  })
})

describe('field tiers', () => {
  function goldRoster(mutate: (d: Datasets) => void, issues: ImportIssue[] = []) {
    const data = smallCompany()
    mutate(data)
    // 100 rows in the file, so one import error stays under the 2% issue rate.
    const v = certified(upload('employees', data, issues, 100), data)
    return { data, q: computeQuality(data, { employees: v }, { employees: issues }, { asOf: AS_OF }) }
  }

  it('caps a field at bronze when it is under 95% filled for the rows it applies to', () => {
    const { q } = goldRoster((d) => {
      // 4 of 10 leavers lose their termination type: 60% filled.
      for (const e of d.employees.slice(30, 34)) e.terminationType = null
    })
    expect(q.datasetTier('employees')).toBe('gold')
    expect(q.fieldTier('employees.terminationType')).toBe('bronze')
    expect(q.fieldTier('employees.terminationDate')).toBe('gold')
    const s = q.fieldStats('employees.terminationType')
    expect(s).toMatchObject({ applicableRows: 10, filled: 6, blank: 4, coverage: 0.6 })
    expect(q.explain('employees.terminationType')).toBe(
      'Bronze: Employees certified 3 Oct by HRIS team. Termination type is 60% filled for leavers; silver needs 95%.',
    )
    expect(q.fieldRows('employees.terminationType', 'blank')).toEqual([30, 31, 32, 33])
  })

  it('caps a field when over 2% of values were defaulted', () => {
    const { q } = goldRoster(() => {}, [issue(8, 'employmentType', 'defaulted', 'E008')])
    // 1 of 40 rows is 2.5%.
    expect(q.datasetTier('employees')).toBe('gold')
    expect(q.fieldStats('employees.employmentType')).toMatchObject({ defaulted: 1, problemRate: 0.025 })
    expect(q.fieldTier('employees.employmentType')).toBe('bronze')
    expect(q.fieldRows('employees.employmentType', 'defaulted')).toEqual([7])
  })

  it('knows which values not recognized the importer left blank, so a row is counted once', () => {
    const issues = [issue(34, 'terminationReason', 'unknown-value', 'E033')]
    const { data, q } = goldRoster((d) => {
      d.employees[32].terminationReason = null
    }, issues)
    const s = q.fieldStats('employees.terminationReason')
    expect(s).toMatchObject({ blank: 1, invalid: 1, invalidBlank: 1 })
    expect(q.fieldRows('employees.terminationReason', 'blank')).toEqual([32])
    expect(q.fieldRows('employees.terminationReason', 'invalid')).toEqual([32])
    // Without the import log the index can't name the row, so it takes as many as there are blanks.
    const v = certified(upload('employees', data, issues, 100), data)
    const noLog = computeQuality(data, { employees: v }, undefined, { asOf: AS_OF })
    expect(noLog.fieldStats('employees.terminationReason').invalidBlank).toBe(1)
  })

  it('gives each dataset the freshness its tier is judged by', () => {
    const { q } = goldRoster(() => {})
    const ds = q.dataset('employees')
    const fresh = ds.rules.find((r) => r.id === 'fresh')!
    expect(ds.freshness.fresh).toBe(fresh.pass)
    expect(ds.freshness.latest).not.toBeNull()
    expect(q.dataset('cases').freshness).toMatchObject({ latest: null, fresh: false })
  })

  it('ignores values outside the rows a field applies to', () => {
    const { q } = goldRoster((d) => {
      d.employees[5].terminationReason = 'Moved away'
    })
    expect(q.fieldStats('employees.terminationReason')).toMatchObject({ applicableRows: 10, invalid: 0 })
    expect(q.fieldTier('employees.terminationReason')).toBe('gold')
  })

  it('counts unrecognized values in the rows and blanked ones from the import log', () => {
    const { q } = goldRoster(
      (d) => {
        d.employees[31].terminationReason = 'Moved away'
      },
      [issue(34, 'terminationReason', 'unknown-value', 'E033')],
    )
    const s = q.fieldStats('employees.terminationReason')
    expect(s.invalid).toBe(2)
    expect(s.problemRate).toBeCloseTo(0.2)
    expect(s.tier).toBe('bronze')
    expect(q.fieldRows('employees.terminationReason', 'invalid')).toEqual([31, 32])
  })

  it('is none when the field is blank in every row, and none for an unknown field', () => {
    const { q } = goldRoster((d) => {
      for (const e of d.employees) e.costCenter = null
    })
    expect(q.fieldTier('employees.costCenter')).toBe('none')
    expect(q.explain('employees.costCenter')).toBe('No data: Cost center is blank in every row of Employees.')
    expect(q.fieldTier('employees.salary')).toBe('none')
    expect(q.explain('employees.salary')).toBe('No data: employees.salary is not a field Census knows.')
  })

  it('treats "Unknown" as blank and does not cap blank-ok fields on coverage', () => {
    const data = emptyDatasets()
    data.employees = Array.from({ length: 20 }, (_, i) =>
      emp(i + 1, { location: i < 3 ? 'Unknown' : 'San Jose' }),
    )
    const v = confirmed(upload('employees', data))
    const q = computeQuality(data, { employees: v }, undefined, { asOf: AS_OF })
    expect(q.fieldStats('employees.location')).toMatchObject({ filled: 17, coverage: 0.85 })
    expect(q.fieldTier('employees.location')).toBe('bronze')
  })

  it('names the dataset when a field had no column in the file', () => {
    const data = smallCompany()
    for (const e of data.employees) e.hrbp = null
    const v = confirmed(upload('employees', data))
    v.mapping.hrbp = { header: null, confidence: 'low', confirmed: true }
    const q = computeQuality(data, { employees: v }, undefined, { asOf: AS_OF })
    expect(q.explain('employees.hrbp')).toBe('No data: Employees had no column for HR business partner.')
  })

  it('explains a silver field with its fill rate and reference remaps', () => {
    const data = smallCompany()
    const v = confirmed(upload('employees', data))
    const q = computeQuality(data, { employees: v }, undefined, {
      asOf: AS_OF,
      reference: { changes: { 'employees.businessUnit': 14 }, by: { 'employees.businessUnit': null } },
    })
    expect(q.explain('employees.businessUnit')).toBe(
      'Silver: Employees mapping confirmed 2 Oct by Jamie; not certified. Business unit is 100% filled. Business unit remapped by you for 14 rows.',
    )
  })
})

describe('lineage', () => {
  it('takes the lowest tier among the fields used, or among the fallback datasets', () => {
    const data = smallCompany()
    for (const e of data.employees.slice(30, 34)) e.terminationType = null
    const versions: VersionMap = { employees: certified(upload('employees', data), data) }
    const q = computeQuality(data, versions, undefined, { asOf: AS_OF })
    expect(q.tierOf(['employees.terminationDate'], [])).toBe('gold')
    expect(q.tierOf(['employees.terminationDate', 'employees.terminationType'], [])).toBe('bronze')
    expect(q.limitingOf(['employees.terminationDate', 'employees.terminationType'], [])).toEqual({
      tier: 'bronze',
      dataset: 'employees',
      ref: 'employees.terminationType',
    })
    expect(q.tierOf(undefined, ['employees'])).toBe('gold')
    expect(q.tierOf([], ['employees', 'requisitions'])).toBe('bronze')
    expect(q.tierOf(undefined, ['employees', 'candidates'])).toBe('none')
    expect(q.tierOf(undefined, [])).toBe('bronze')
    expect(q.explainOf(undefined, ['requisitions'])).toBe('Bronze: Requisitions mapping not yet confirmed.')
  })
})

describe('memo and the sample', () => {
  it('returns the same index for the same inputs', () => {
    const data = smallCompany()
    const versions: VersionMap = {}
    const a = computeQuality(data, versions, undefined, { asOf: AS_OF })
    expect(computeQuality(data, versions, undefined, { asOf: AS_OF })).toBe(a)
    expect(computeQuality(data, {}, undefined, { asOf: AS_OF })).not.toBe(a)
  })

  it('evaluates every dataset and field of the sample quickly with finite numbers', () => {
    const data = generateSample()
    const versions = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        confirmed(makeVersion({ dataset: k, source: 'sample', rows: data[k] as object[] })),
      ]),
    ) as VersionMap
    const t0 = performance.now()
    const q = computeQuality(data, versions, undefined, { asOf: SAMPLE_AS_OF })
    for (const k of DATASET_KEYS) q.datasetTier(k)
    const tiersMs = performance.now() - t0
    for (const ref of FIELD_REFS) q.fieldTier(ref)
    const allMs = performance.now() - t0
    expect(tiersMs).toBeLessThan(60)
    expect(allMs).toBeLessThan(400)
    for (const ref of FIELD_REFS) {
      const s = q.fieldStats(ref)
      if (s.coverage != null) expect(Number.isFinite(s.coverage)).toBe(true)
      expect(q.explain(ref).length).toBeGreaterThan(10)
    }
    // The clean sample with confirmed mappings is silver everywhere, and rules all pass; a
    // dataset the sample leaves empty is No data, never a tier it has not earned.
    for (const k of DATASET_KEYS) expect(q.datasetTier(k), k).toBe(data[k].length ? 'silver' : 'none')
    expect(q.fieldTier('employees.terminationDate')).toBe('silver')
  })
})
