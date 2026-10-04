import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import type { Tier } from '@/data/quality'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { rowFormat } from '@/lib/export/columns'
import { VIEWS } from '@/views/registry'
import {
  buildManifest,
  COVERAGE_COLUMNS,
  coverageExportRows,
  feedsFromViews,
  feedsLine,
  feedsText,
  MANIFEST_COLUMNS,
  manifestExportRows,
  manifestSummary,
  sourceInfo,
  tierMixText,
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
      'Recruiting, HR business partners, HR ops, Talent, Compensation',
    )
    expect(feedsLine(['recruiting'])).toBe('Feeds Recruiting')
  })

  it('adds the datasets each view declares to the schema’s lists', () => {
    const feeds = feedsFromViews(VIEWS)
    const rows = buildManifest({
      data: generateSample(),
      sources: sampleSources(generateSample()),
      asOf: '2026-09-30',
      feeds,
    })
    const text = Object.fromEntries(rows.map((r) => [r.key, r.feedsText]))
    expect(text.jobChanges).toBe('HR business partners, Org chart, Talent, Compensation')
    expect(text.comp).toBe('Talent, Compensation')
    expect(text.requisitions).toBe('Recruiting, Org chart')
    expect(text.reviews).toBe('HR business partners, Org chart, Talent, Compensation')
    // Recruiting reads requisitions and candidates only.
    expect(text.employees).toBe('HR business partners, Org chart, HR ops, Talent, Compensation')
    // Every view's declared datasets are listed as feeding it.
    for (const v of VIEWS)
      for (const d of v.datasets) expect(rows.find((r) => r.key === d)?.feeds).toContain(v.key)
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
    // Which datasets are uploads is in the masthead and on each row, so the line doesn't repeat it.
    expect(manifestSummary([row('sample', 'good'), row('sample', 'info')]).text).toBe(
      '20 rows across 2 datasets',
    )
    const mixed = manifestSummary([row('upload', 'warning'), row('sample', 'good'), row('upload', 'info')])
    expect(mixed).toMatchObject({ uploaded: 2, needsLook: 1, totalRows: 30 })
    expect(mixed.text).toBe('30 rows across 3 datasets · 1 needs a look')
  })

  it('counts tiers, best first', () => {
    const row = (tier: Tier | null) =>
      ({ source: { kind: 'sample' }, status: 'good', rows: 1, tier }) as Parameters<
        typeof manifestSummary
      >[0][number]
    const s = manifestSummary([row('gold'), row('bronze'), row('gold'), row('none'), row(null)])
    expect(s.tiers).toEqual({ none: 1, bronze: 1, silver: 0, gold: 2 })
    expect(s.text).toBe('5 rows across 5 datasets · 2 gold, 1 bronze, 1 with no data')
    expect(tierMixText({ none: 0, bronze: 0, silver: 0, gold: 0 })).toBe('')
  })

  it('carries each dataset’s tier into the rows and the export', () => {
    const rows = buildManifest({
      data: generateSample(),
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 }]),
      ) as Parameters<typeof buildManifest>[0]['sources'],
      asOf: SAMPLE_AS_OF,
      tiers: { employees: 'gold' },
    })
    expect(rows.find((r) => r.key === 'employees')?.tier).toBe('gold')
    expect(rows.find((r) => r.key === 'comp')?.tier).toBeNull()
    expect(manifestExportRows(rows)[0].tier).toBe('Gold')
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
      employees: 2055,
      jobChanges: 1797,
      requisitions: 556,
      candidates: 9279,
      cases: 6676,
      transactions: 3526,
      reviews: 5169,
      succession: 90,
      learning: 10984,
      comp: 1450,
    })
    expect(manifestSummary(rows).text).toBe('41,582 rows across 10 datasets')
    expect(manifestSummary(rows).totalRows).toBe(41_582)
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

  it('measures fields that apply to some rows over those rows only', () => {
    const field = (key: string, f: string) =>
      rows.find((r) => r.key === key)?.coverage.fields.find((x) => x.key === f)
    expect(field('employees', 'terminationType')).toMatchObject({ expected: 497, filled: 497, share: 1 })
    expect(field('employees', 'terminationReason')).toMatchObject({ expected: 497, share: 1 })
    expect(field('employees', 'regrettable')).toMatchObject({ expected: 347, filled: 347, share: 1 })
    // The CEO has no manager by design.
    expect(field('employees', 'managerId')).toMatchObject({ expected: 2054, filled: 2054, share: 1 })
    expect(field('candidates', 'offerDate')).toMatchObject({ expected: 641, filled: 641 })
    expect(field('candidates', 'coordinator')).toMatchObject({ expected: 1800, filled: 1800 })
    expect(field('candidates', 'hiredDate')).toMatchObject({ expected: 525, filled: 525 })
    expect(field('candidates', 'rejectedDate')).toMatchObject({ expected: 8297, filled: 8297 })
    expect(field('requisitions', 'filledDate')).toMatchObject({ expected: 399, filled: 399 })
    expect(field('requisitions', 'closedDate')).toMatchObject({ expected: 427, filled: 427 })
    expect(field('jobChanges', 'fromManagerId')).toMatchObject({ expected: 1034, filled: 1034 })
    expect(field('succession', 'readiness')).toMatchObject({ expected: 84, filled: 84 })
    expect(rows.find((r) => r.key === 'employees')?.coverage.core).toBe(1)
  })

  it('warns when a roster has no termination type or regrettable flag', () => {
    const stripped = {
      ...data,
      employees: data.employees.map((e) => ({ ...e, terminationType: null, regrettable: null })),
    }
    const after = buildManifest({ data: stripped, sources: sampleSources(stripped), asOf: ctx.asOf })
    const emp = after.find((r) => r.key === 'employees')!
    expect(emp.status).toBe('warning')
    expect(emp.checks.map((c) => c.text)).toEqual([
      'Termination type is blank for all 497 leavers, so voluntary and regretted attrition can’t be shown.',
    ])
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
    // A share just short of whole keeps two decimals in exports instead of rounding to 100%.
    const col = MANIFEST_COLUMNS.find((c) => c.key === 'coverage')!
    expect(rowFormat(col, { coverage: 0.999937 })).toBe('pct2')
    expect(rowFormat(col, { coverage: 0.9546 })).toBe('pct')
    expect(rowFormat(col, { coverage: 1 })).toBe('pct')
  })
})
