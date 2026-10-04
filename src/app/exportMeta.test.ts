import { describe, expect, it } from 'vitest'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { buildExportMeta, companyLine, datasetNote, resolveTab, uploadedCount } from './exportMeta'

const sources = (uploaded: Partial<Record<DatasetKey, SourceMeta>> = {}) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, uploaded[k] ?? { kind: 'sample', rowCount: 10 }])) as Record<
    DatasetKey,
    SourceMeta
  >

describe('provenance', () => {
  it('counts uploaded datasets out of ten', () => {
    expect(uploadedCount(sources())).toEqual({ uploaded: 0, total: 10 })
    const s = sources({
      requisitions: { kind: 'upload', rowCount: 40, fileName: 'reqs.xlsx' },
      candidates: { kind: 'upload', rowCount: 900 },
    })
    expect(uploadedCount(s)).toEqual({ uploaded: 2, total: 10 })
  })

  it('says "Sample data" when every dataset a view reads is sample', () => {
    const note = datasetNote(['requisitions', 'candidates'], sources())
    expect(note.text).toBe('Sample data')
    expect(note.allSample).toBe(true)
    expect(note.datasets.map((d) => d.label)).toEqual(['Requisitions', 'Candidates'])
  })

  it('says how many of the view datasets were uploaded', () => {
    const s = sources({ cases: { kind: 'upload', rowCount: 1200, fileName: 'cases.csv' } })
    const note = datasetNote(['cases', 'transactions', 'employees'], s)
    expect(note.text).toBe('Uploaded 1 of 3 datasets')
    expect(note.allSample).toBe(false)
    expect(note.datasets[0]).toEqual({
      key: 'cases',
      label: 'HR cases',
      kind: 'upload',
      rowCount: 1200,
      fileName: 'cases.csv',
    })
  })

  it('names the company only for sample data', () => {
    expect(companyLine(true, 'Northgate Semiconductor')).toBe('Northgate Semiconductor')
    expect(companyLine(false, 'Northgate Semiconductor')).toBe('Your data')
  })
})

describe('resolveTab', () => {
  const tabs = [{ key: 'overview' }, { key: 'pipeline' }]
  it('keeps a known tab and falls back to the first', () => {
    expect(resolveTab(tabs, 'pipeline')).toBe('pipeline')
    expect(resolveTab(tabs, '')).toBe('overview')
    expect(resolveTab(tabs, 'nope')).toBe('overview')
    expect(resolveTab([], 'x')).toBe('')
  })
})

describe('buildExportMeta', () => {
  const window = { start: '2025-10-01', end: '2026-09-30', months: 12, label: '1 Oct 2025 – 30 Sep 2026' }
  it('stamps view, tab, scope, window and as-of', () => {
    const meta = buildExportMeta({
      viewLabel: 'Recruiting',
      tabLabel: 'Pipeline',
      scopeLabel: 'Whole company',
      window,
      asOf: '2026-09-30',
      isSample: true,
      sampleCompany: 'Northgate Semiconductor',
    })
    expect(meta).toEqual({
      view: 'Recruiting',
      tab: 'Pipeline',
      scope: 'Whole company',
      window: '1 Oct 2025 – 30 Sep 2026',
      asOf: '2026-09-30',
      isSample: true,
      company: 'Northgate Semiconductor',
    })
  })

  it('does not name the sample company on uploaded data', () => {
    const meta = buildExportMeta({
      viewLabel: 'Compensation',
      scopeLabel: 'Hsinchu',
      window,
      asOf: '2026-09-30',
      isSample: false,
      sampleCompany: 'Northgate Semiconductor',
    })
    expect(meta.company).toBe('Company data')
    expect(meta.tab).toBeUndefined()
  })

  it('carries the data standard when given', () => {
    const base = {
      viewLabel: 'Talent',
      scopeLabel: 'Whole company',
      window,
      asOf: '2026-09-30',
      isSample: true,
      sampleCompany: 'Northgate Semiconductor',
    }
    expect(buildExportMeta({ ...base, standard: 'gold' }).standard).toBe('gold')
    expect('standard' in buildExportMeta(base)).toBe(false)
  })
})
