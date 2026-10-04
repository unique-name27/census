import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { emptyDatasets, roster } from '@/data/quality/test-fixtures'
import type { DatasetVersion } from '@/data/quality/types'
import { confirmVersion, makeCertification, makeVersion } from '@/data/quality/versions'
import type { Datasets } from '@/data/schema'
import { drillTier } from './tier'

function certify(data: Datasets): DatasetVersion {
  const v = confirmVersion(
    makeVersion({
      dataset: 'employees',
      source: 'upload',
      rows: data.employees,
      versionId: 'employees-v1',
      fileName: 'employees.xlsx',
      importedAt: '2026-10-01T09:00:00.000Z',
    }),
    'Jamie',
    '2026-10-02T10:00:00.000Z',
  )
  const at = '2026-10-03T10:00:00.000Z'
  return {
    ...v,
    certification: makeCertification({
      version: v,
      data,
      asOf: '2026-09-30',
      at,
      input: { by: 'HRIS team' },
    }),
  }
}

describe('drillTier', () => {
  const data = emptyDatasets()
  data.employees = roster()
  // 4 of 10 leavers without a termination reason: the field is bronze on a gold roster.
  for (const e of data.employees.slice(30, 34)) e.terminationReason = null
  const q = computeQuality(data, { employees: certify(data) }, undefined, { asOf: '2026-09-30' })

  it('shows the drilled number’s tier when the spec names its fields', () => {
    const t = drillTier(q, {
      kind: 'employees',
      uses: ['employees.terminationDate', 'employees.terminationReason'],
    })
    expect(t).toMatchObject({ tier: 'bronze', dataset: 'employees', ofDataset: false })
    expect(t.explain).toMatch(/^Bronze: .*Termination reason is 60% filled for leavers/)
  })

  it('falls back to the records’ dataset, and says so', () => {
    expect(drillTier(q, { kind: 'employees' })).toMatchObject({ tier: 'gold', ofDataset: true })
  })
})
