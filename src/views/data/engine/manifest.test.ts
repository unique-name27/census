import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import {
  buildManifest,
  COVERAGE_COLUMNS,
  coverageExportRows,
  feedsLine,
  feedsText,
  MANIFEST_COLUMNS,
  manifestExportRows,
  manifestSummary,
  sourceInfo,
} from './manifest'

const sampleSources = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

describe('labels', () => {
  it('names the views a dataset feeds, in folder-tab order', () => {
    expect(feedsText(['talent', 'hrbp'])).toBe('HR business partners, Talent')
    const all = ['comp', 'services', 'talent', 'org', 'hrbp', 'recruiting'] as const
    expect(feedsText(all)).toBe('All six views')
    expect(feedsLine(all)).toBe('Feeds all six views')
    expect(feedsText(['comp', 'services', 'talent', 'hrbp', 'recruiting'])).toBe(
      'Recruiting, HR business partners, Employee services, Talent, Compensation',
    )
    expect(feedsLine(['recruiting'])).toBe('Feeds Recruiting')
  })

  it('describes where a dataset came from', () => {
    expect(sourceInfo({ kind: 'sample', rowCount: 3 })).toEqual({
      kind: 'sample',
      label: 'Sample',
      detail: null,
    })
    expect(
      sourceInfo({
        kind: 'upload',
        rowCount: 3,
        fileName: 'hr.xlsx',
        sheetName: 'Roster',
        importedAt: '2026-10-03T09:00:00.000Z',
      }),
    ).toEqual({ kind: 'upload', label: 'hr.xlsx', detail: 'Roster sheet · 3 Oct 2026' })
    // A CSV has no sheet worth naming.
    expect(sourceInfo({ kind: 'upload', rowCount: 3, fileName: 'roster.csv' })).toEqual({
      kind: 'upload',
      label: 'roster.csv',
      detail: null,
    })
  })

  it('summarizes the manifest in one line', () => {
    const row = (kind: 'sample' | 'upload', status: 'good' | 'warning' | 'info') =>
      ({ source: { kind }, status, rows: 10 }) as Parameters<typeof manifestSummary>[0][number]
    expect(manifestSummary([row('sample', 'good'), row('sample', 'info')]).text).toBe(
      'All 2 datasets are sample data',
    )
    const mixed = manifestSummary([row('upload', 'warning'), row('sample', 'good'), row('upload', 'info')])
    expect(mixed).toMatchObject({ uploaded: 2, needsLook: 1, totalRows: 30 })
    expect(mixed.text).toBe('2 of 3 datasets are your uploads, the rest are sample data · 1 needs a look')
    expect(manifestSummary([row('upload', 'good'), row('sample', 'good')]).text).toBe(
      '1 of 2 datasets is your upload, the rest are sample data',
    )
  })
})

describe('the sample company in the Data room', () => {
  const data = generateSample()
  const ctx = buildContext({
    data,
    sources: sampleSources(data),
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })

  it('builds the manifest well inside the time budget', () => {
    buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf })
    const t = performance.now()
    buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf })
    expect(performance.now() - t).toBeLessThan(150)
  })

  const rows = buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf })

  it('lists all ten datasets with their sample row counts', () => {
    expect(rows.map((r) => r.key)).toEqual(DATASET_KEYS)
    expect(Object.fromEntries(rows.map((r) => [r.key, r.rows]))).toEqual({
      employees: 2004,
      jobChanges: 1795,
      requisitions: 556,
      candidates: 9279,
      cases: 6645,
      transactions: 3506,
      reviews: 5155,
      succession: 90,
      learning: 10964,
      comp: 1450,
    })
    expect(manifestSummary(rows).text).toBe('All 10 datasets are sample data')
    expect(manifestSummary(rows).totalRows).toBe(41_444)
  })

  it('finds every required field filled and nothing to flag', () => {
    for (const r of rows) {
      for (const f of r.coverage.fields.filter((x) => x.requirement === 'required'))
        expect(f.share, `${r.key}.${f.key}`).toBe(1)
      expect(r.checks, r.key).toEqual([])
      expect(r.status).toBe('good')
      expect(r.source.kind).toBe('sample')
    }
  })

  it('reports coverage as a finite share for every dataset', () => {
    for (const r of rows) {
      expect(Number.isFinite(r.coverage.core)).toBe(true)
      expect(r.coverage.core).toBeGreaterThan(0.9)
      expect(r.coverage.core).toBeLessThanOrEqual(1)
    }
    // Candidates sit below 100% only because 36% of interviewing candidates have no next step booked.
    const cand = rows.find((r) => r.key === 'candidates')!
    const next = cand.coverage.fields.find((f) => f.key === 'nextEventDate')!
    expect(next).toMatchObject({ expected: 226, filled: 144 })
    expect(cand.coverage.core).toBeCloseTo((7 + 144 / 226) / 8, 6)
  })

  it('flags rows that no longer link once the roster changes', () => {
    const shrunk = { ...data, employees: data.employees.slice(0, 1000) }
    const sources = {
      ...sampleSources(shrunk),
      reviews: { kind: 'upload', rowCount: data.reviews.length } as SourceMeta,
    }
    const after = buildManifest({ data: shrunk, sources, asOf: ctx.asOf })
    const reviews = after.find((r) => r.key === 'reviews')!
    expect(reviews.status).toBe('warning')
    expect(reviews.checks[0].text).toMatch(
      /^[\d,]+ rows \(\d+%\) refer to people who are not in Employees\. Employees is still the sample; upload yours as well\.$/,
    )
  })

  it('exports the manifest and every field without values', () => {
    const m = manifestExportRows(rows)
    expect(m).toHaveLength(10)
    expect(Object.keys(m[0])).toEqual(MANIFEST_COLUMNS.map((c) => c.key))
    const cov = coverageExportRows(rows)
    expect(cov).toHaveLength(rows.reduce((a, r) => a + r.coverage.fields.length, 0))
    expect(Object.keys(cov[0])).toEqual(COVERAGE_COLUMNS.map((c) => c.key))
    for (const c of cov) expect(c.share === null || Number.isFinite(c.share)).toBe(true)
  })
})
