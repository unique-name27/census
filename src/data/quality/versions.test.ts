import { describe, expect, it } from 'vitest'
import type { ParsedSheet } from '../import/types'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import {
  checkReferences,
  computeControlTotal,
  datesOutOfOrder,
  duplicateRows,
  freshness,
  reconciles,
} from './rules'
import { buildSampleState, mergeStoredSample } from './seed'
import { emp, req, smallCompany } from './test-fixtures'
import {
  confirmVersion,
  droppedVersions,
  isCertified,
  isVersion,
  makeCertification,
  makeVersion,
  pushHistory,
  sampleVersionId,
  toVersionMapping,
} from './versions'

describe('rules', () => {
  it('finds references that do not resolve', () => {
    const data = smallCompany()
    data.requisitions = [req(1), req(2, { hiringManagerId: 'E999' }), req(3, { hiringManagerId: null })]
    const r = checkReferences('requisitions', data)!
    expect(r.rows).toEqual([1])
    expect(r.withRef).toBe(2)
    expect(checkReferences('reviews', { ...data, employees: [] })?.targetEmpty).toBe(true)
  })

  it('finds dates out of order and duplicate keys', () => {
    const rows = [
      { appliedDate: '2026-01-01', screenDate: '2026-01-05', hmDate: '2026-01-03', applicationId: 'A1' },
      { appliedDate: '2026-01-01', screenDate: null, onsiteDate: '2026-02-01', applicationId: 'A2' },
      { appliedDate: '2026-03-01', rejectedDate: '2026-02-01', applicationId: 'A2' },
    ]
    expect(datesOutOfOrder('candidates', rows)).toEqual([0, 2])
    expect(duplicateRows('candidates', rows)).toEqual([2])
  })

  it('judges freshness from the latest event on or before the as-of date', () => {
    const rows = [emp(1, { hireDate: '2026-08-01' }), emp(2, { hireDate: '2026-12-01' })]
    expect(freshness('employees', rows, '2026-09-30')).toMatchObject({
      latest: '2026-08-01',
      ageDays: 60,
      fresh: true,
    })
    expect(freshness('employees', rows, '2027-06-30').fresh).toBe(false)
    // No event dated at all: not fresh.
    expect(freshness('employees', [], '2026-09-30').fresh).toBe(false)
  })

  it('judges a pay snapshot by the date it was taken, 45 d at most', () => {
    expect(freshness('comp', [], '2026-09-30', '2026-09-15')).toMatchObject({
      latest: '2026-09-15',
      ageDays: 15,
      what: 'pay extract',
      fresh: true,
    })
    expect(freshness('comp', [], '2026-09-30', '2026-08-01').fresh).toBe(false)
    // Taken after the as-of date: current for it.
    expect(freshness('comp', [], '2026-09-30', '2026-10-03T09:00')).toMatchObject({ ageDays: 0, fresh: true })
    // Nothing says when it was taken: it cannot be shown to be fresh.
    expect(freshness('comp', [], '2026-09-30')).toMatchObject({ latest: null, fresh: false })
  })

  it('computes control totals and reconciles within tolerance', () => {
    const data = smallCompany()
    expect(computeControlTotal('activeHeadcount', data, 'employees', '2026-09-30')).toBe(30)
    expect(computeControlTotal('activeHeadcount', data, 'employees', '2026-08-31')).toBe(29)
    expect(computeControlTotal('exits12m', data, 'employees', '2026-09-30')).toBe(10)
    expect(computeControlTotal('rows', data, 'requisitions', '2026-09-30')).toBe(2)
    expect(computeControlTotal('openReqs', data, 'employees', '2026-09-30')).toBeNull()
    expect(reconciles({ expected: 1452, tolerance: 0.005 }, 1446)).toBe(true)
    expect(reconciles({ expected: 1452, tolerance: 0.005 }, 1440)).toBe(false)
    expect(reconciles({ expected: 0, tolerance: 0.005 }, 0)).toBe(true)
    expect(reconciles({ expected: 10, tolerance: 0.005 }, null)).toBe(false)
  })
})

describe('versions', () => {
  it('makes an unconfirmed, uncertified version from an import', () => {
    const rows = smallCompany().employees
    const v = makeVersion({
      dataset: 'employees',
      source: 'upload',
      rows,
      mapping: { employeeId: { header: 'Emp ID', confidence: 'high', score: 1, reason: 'exact' } },
      rowsIn: 45,
    })
    expect(v.versionId).toMatch(/^employees-/)
    expect(v.mapping).toEqual({ employeeId: { header: 'Emp ID', confidence: 'high', confirmed: false } })
    expect(v.issues.rowsIn).toBe(45)
    expect(v.rowCount).toBe(40)
    expect(v.mappingConfirmedAt).toBeNull()
    expect(isCertified(v)).toBe(false)
    expect(isVersion(v)).toBe(true)
    expect(isVersion({ versionId: 'x' })).toBe(false)
  })

  it('confirms every field and certifies with actual control totals', () => {
    const data = smallCompany()
    const v = confirmVersion(
      makeVersion({
        dataset: 'employees',
        source: 'upload',
        rows: data.employees,
        mapping: toVersionMapping({ name: { header: 'Name', confidence: 'low', confirmed: false } }),
      }),
      ' Jamie ',
      '2026-10-02T00:00:00.000Z',
    )
    expect(v.mapping.name.confirmed).toBe(true)
    expect(v.mappingConfirmedBy).toBe('Jamie')
    const c = makeCertification({
      version: v,
      data,
      asOf: '2026-09-30',
      input: {
        by: 'HRIS team',
        note: '  ',
        controlTotals: [
          { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 30, tolerance: Number.NaN },
        ],
      },
    })
    expect(c.versionId).toBe(v.versionId)
    expect(c.note).toBeUndefined()
    expect(c.controlTotals).toEqual([
      { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 30, tolerance: 0.005, actual: 30 },
    ])
    expect(isCertified({ ...v, certification: c })).toBe(true)
    expect(isCertified({ ...v, versionId: 'other', certification: c })).toBe(false)
  })

  it('keeps the last three earlier versions and says which dropped out', () => {
    const mk = (id: string) => makeVersion({ dataset: 'comp', source: 'upload', rows: [], versionId: id })
    let history = pushHistory([], mk('a'))
    history = pushHistory(history, mk('b'))
    history = pushHistory(history, mk('c'))
    const before = history
    history = pushHistory(history, mk('d'))
    expect(history.map((v) => v.versionId)).toEqual(['d', 'c', 'b'])
    expect(droppedVersions(before, history, mk('e'))).toEqual(['a'])
  })
})

describe('sample seed', () => {
  const base = generateSample()

  it('without a seed, every dataset is the plain sample with a fixed version ID', () => {
    const s = buildSampleState(base, null, SAMPLE_AS_OF)
    expect(s.data.employees).toBe(base.employees)
    expect(s.versions.employees.versionId).toBe(sampleVersionId('employees'))
    expect(s.versions.employees.mapping).toEqual({})
    expect(s.raws).toEqual([])
  })

  it('applies seeded rows, raw sheets, a starter confirmation and certification', () => {
    const sheet: ParsedSheet = {
      name: 'Workers',
      headerRow: 0,
      headers: ['ID'],
      rows: [{ ID: 'E1' }],
      rowNumbers: [2],
    }
    const s = buildSampleState(
      base,
      {
        candidates: {
          rows: base.candidates.slice(0, 10),
          raw: sheet,
          fileName: 'ATS export.csv',
          mapping: { applicationId: { header: 'ID', confidence: 'high', score: 1, reason: '' } },
        },
        jobChanges: { mappingConfirmed: { by: 'People analytics', at: '2026-09-15T00:00:00.000Z' } },
        employees: {
          certification: {
            by: 'HRIS team',
            at: '2026-09-20T00:00:00.000Z',
            controlTotals: [
              { label: 'HRIS headcount', metric: 'activeHeadcount', expected: 1450, tolerance: 0.005 },
            ],
          },
        },
      },
      SAMPLE_AS_OF,
    )
    expect(s.data.candidates).toHaveLength(10)
    expect(s.versions.candidates).toMatchObject({
      versionId: 'sample-candidates-raw',
      hasRaw: true,
      fileName: 'ATS export.csv',
    })
    expect(s.raws).toHaveLength(1)
    expect(s.versions.jobChanges.mappingConfirmedBy).toBe('People analytics')
    expect(s.versions.employees.mappingConfirmedBy).toBe('HRIS team')
    expect(s.versions.employees.certification?.controlTotals?.[0].actual).toBe(1450)
  })

  it('keeps your own decisions on a stored sample version', () => {
    const fresh = buildSampleState(base, null, SAMPLE_AS_OF).versions.reviews
    const stored = confirmVersion(fresh, 'You', '2026-10-01T00:00:00.000Z')
    expect(mergeStoredSample(fresh, stored).mappingConfirmedBy).toBe('You')
    expect(mergeStoredSample(fresh, { ...stored, versionId: 'other' }).mappingConfirmedBy).toBeNull()
  })
})
