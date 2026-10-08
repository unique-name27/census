import { describe, expect, it } from 'vitest'
import type { AccessInput } from '@/access/context'
import { sampleCtx } from '@/ask/engine/testkit'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { modeMeta } from '@/lib/export/modeMeta'
import {
  accessInputOf,
  buildExportMeta,
  companyLine,
  datasetNote,
  resolveTab,
  uploadedCount,
} from './exportMeta'

const sources = (uploaded: Partial<Record<DatasetKey, SourceMeta>> = {}) =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, uploaded[k] ?? { kind: 'sample', rowCount: 10 }])) as Record<
    DatasetKey,
    SourceMeta
  >

describe('provenance', () => {
  it('counts uploaded datasets out of all of them', () => {
    expect(uploadedCount(sources())).toEqual({ uploaded: 0, total: DATASET_KEYS.length })
    const s = sources({
      requisitions: { kind: 'upload', rowCount: 40, fileName: 'reqs.xlsx' },
      candidates: { kind: 'upload', rowCount: 900 },
    })
    expect(uploadedCount(s)).toEqual({ uploaded: 2, total: DATASET_KEYS.length })
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

  it('stamps no scope, window, as-of, standard or sample data for a view that reads no datasets', () => {
    const meta = buildExportMeta({
      viewLabel: 'AI in HR',
      tabLabel: 'Agents',
      scopeLabel: 'Whole company',
      window,
      asOf: '2026-09-30',
      isSample: true,
      sampleCompany: 'Northgate Semiconductor',
      standard: 'bronze',
      readsData: false,
    })
    expect(meta).toEqual({
      view: 'AI in HR',
      tab: 'Agents',
      scope: '',
      window: '',
      asOf: '',
      isSample: false,
      company: '',
    })
  })
})

describe('the mode a whole-view export renders in', () => {
  const hr = sampleCtx()
  const boss = [...hr.org.children.entries()].sort((a, b) => b[1].length - a[1].length)[1][0]
  const inputs: AccessInput[] = [
    { mode: 'hr' },
    { mode: 'finance' },
    { mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } },
    { mode: 'hrbp-region', picks: { region: 'APAC' } },
    { mode: 'recruiter', picks: { recruiter: { name: 'Agnieszka Nielsen', id: null } } },
    { mode: 'recruiter', picks: { recruiter: { name: '*', id: null } } },
    { mode: 'manager', picks: { managerId: boss } },
    // Picks that are missing or gone stay so: the off-screen tabs hold nobody too.
    { mode: 'hrbp-unit', picks: { unit: 'Nowhere' } },
    { mode: 'hrbp-region' },
    { mode: 'recruiter' },
  ]

  it('rebuilds the same mode and scope from the context on screen', () => {
    for (const input of inputs) {
      const ctx = sampleCtx({ access: input })
      const again = sampleCtx({ access: accessInputOf(ctx.access) })
      const label = JSON.stringify(input)
      expect(again.access.mode, label).toBe(ctx.access.mode)
      expect(again.access.unset, label).toBe(ctx.access.unset)
      expect(again.access.scope?.kind ?? null, label).toBe(ctx.access.scope?.kind ?? null)
      expect(again.access.scope?.label ?? null, label).toBe(ctx.access.scope?.label ?? null)
      expect(again.access.scope?.size ?? null, label).toBe(ctx.access.scope?.size ?? null)
      expect(again.data.employees.length, label).toBe(ctx.data.employees.length)
    }
  })
})

describe('the Action center list and My list exports', () => {
  // Export list and My list write through useExportMeta, which adds modeMeta(ctx.access).
  it('carry the mode and its scope in every mode but HR and Developer', () => {
    const cases: [AccessInput, RegExp | null][] = [
      [{ mode: 'hr' }, null],
      [{ mode: 'developer' }, null],
      [{ mode: 'chro' }, /^Made in CHRO mode\.$/],
      [
        { mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } },
        /^Made in HRBP mode for Silicon Engineering\.$/,
      ],
      [{ mode: 'hrbp-region', picks: { region: 'APAC' } }, /^Made in HRBP mode for APAC\.$/],
      [{ mode: 'compensation' }, /^Made in Compensation mode\.$/],
      [{ mode: 'talent-management' }, /^Made in Talent management mode\.$/],
      [{ mode: 'hr-ops' }, /^Made in HR ops mode\.$/],
      [
        { mode: 'recruiter', picks: { recruiter: { name: 'Agnieszka Nielsen', id: null } } },
        /^Made in Recruiter mode for Agnieszka Nielsen's reqs\.$/,
      ],
      [{ mode: 'finance' }, /^Made in Finance mode\.$/],
    ]
    for (const [input, line] of cases) {
      const meta = modeMeta(sampleCtx({ access: input }).access)
      if (line) expect(meta.modeLine, input.mode).toMatch(line)
      else expect(meta.modeLine, input.mode).toBeUndefined()
    }
  })
})
