/**
 * The dataset table's issues include what the quality index knows: the messy sample's raw
 * extracts carry their planted problems, so none of them reads "None" while it sits at bronze.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { LINKS as QUALITY_LINKS } from '@/data/quality/rules'
import { buildSampleState } from '@/data/quality/seed'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { buildMessySample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { LINKS } from './checks'
import { buildManifest, type ManifestRow, manifestSummary } from './manifest'

let rows: ManifestRow[]

beforeAll(() => {
  const base = generateSample()
  const state = buildSampleState(base, buildMessySample(base).seed, SAMPLE_AS_OF)
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: state.data[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  const ctx = buildContext({
    data: state.data,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
    versions: state.versions,
  })
  rows = buildManifest({ data: ctx.all, sources, asOf: ctx.asOf, quality: ctx.quality })
}, 60_000)

const texts = (key: DatasetKey) => rows.find((r) => r.key === key)!.checks.map((c) => c.text)

describe('issues from the quality index', () => {
  it('names the fields that hold a raw extract at bronze', () => {
    expect(texts('candidates')).toContain(
      '4% of source values are not recognized or defaulted; silver allows 2%.',
    )
    const cases = texts('cases')
    expect(cases.some((t) => /^2\.5% of category values are not recognized/.test(t))).toBe(true)
    expect(cases.some((t) => /^First response is 92% filled/.test(t))).toBe(true)
  })

  it('reports import errors the sample extracts logged', () => {
    for (const key of ['jobChanges', 'requisitions', 'transactions', 'learning'] as const)
      expect(
        texts(key).some((t) => /had an import error; 2% is allowed\.$/.test(t)),
        key,
      ).toBe(true)
  })

  it('leaves no bronze dataset reading "None", and counts them as needing a look', () => {
    for (const r of rows) if (r.tier === 'bronze') expect(r.checks.length, r.key).toBeGreaterThan(0)
    expect(manifestSummary(rows).needsLook).toBeGreaterThanOrEqual(3)
  })
})

describe('reference links', () => {
  it('are the quality rule’s links, less a dataset’s links to itself', () => {
    for (const [key, link] of Object.entries(QUALITY_LINKS))
      expect(LINKS[key as DatasetKey], key).toEqual(link!.target === key ? undefined : link)
  })
})
