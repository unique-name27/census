import { describe, expect, it } from 'vitest'
import { buildContext, qualityFor, referenceLayer } from './context'
import { confirmVersion, makeVersion } from './quality/versions'
import type { ReferenceMapping } from './reference/types'
import { generateSample, SAMPLE_AS_OF } from './sample'
import { DATASET_KEYS, type DatasetKey } from './schema'
import { DEFAULT_FILTERS } from './scope'
import type { SourceMeta } from './store'

const data = generateSample()
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
) as Record<DatasetKey, SourceMeta>
const base = { data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false }

const move: ReferenceMapping = {
  id: 'm1',
  kind: 'move-department',
  department: 'DFT',
  from: null,
  to: 'Operations',
  by: 'Jamie',
  at: '2026-10-01T00:00:00.000Z',
}

describe('analytics context', () => {
  it('keeps the old call shape: no mappings, bronze sample, the Everything standard', () => {
    const ctx = buildContext(base)
    expect(ctx.asOf).toBe(SAMPLE_AS_OF)
    expect(ctx.all).toBe(data)
    expect(ctx.standard).toBe('bronze')
    expect(ctx.reference).toEqual({ mappings: [], changes: {}, total: 0, skipped: [] })
    expect(ctx.quality.datasetTier('employees')).toBe('bronze')
    expect(ctx.quality.datasetTier('comp')).toBe('bronze')
  })

  it('applies reference mappings to data and all, before filters', () => {
    const ctx = buildContext({
      ...base,
      mappings: [move],
      filters: { ...DEFAULT_FILTERS, businessUnit: ['Operations'] },
    })
    const dft = ctx.all.employees.filter((e) => e.department === 'DFT')
    expect(dft.length).toBeGreaterThan(0)
    expect(dft.every((e) => e.businessUnit === 'Operations')).toBe(true)
    expect(ctx.data.employees.some((e) => e.department === 'DFT')).toBe(true)
    expect(ctx.reference.changes['employees.businessUnit']).toBe(dft.length)
    expect(ctx.quality.explain('employees.businessUnit')).toContain(
      `Business unit remapped by Jamie for ${dft.length} rows.`,
    )
    expect(ctx.data.employees.length).toBeLessThan(ctx.all.employees.length)
  })

  it('does not recompute quality when only the filters change', () => {
    const versions = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        confirmVersion(makeVersion({ dataset: k, source: 'sample', rows: data[k] }), 'x'),
      ]),
    )
    const applied = referenceLayer(data, [move])
    const quality = qualityFor(applied, versions, SAMPLE_AS_OF)
    const a = buildContext({ ...base, versions, applied, quality, standard: 'gold' })
    const b = buildContext({
      ...base,
      versions,
      applied,
      quality,
      standard: 'gold',
      filters: { ...DEFAULT_FILTERS, location: ['Munich'] },
    })
    expect(b.quality).toBe(a.quality)
    expect(b.all).toBe(a.all)
    expect(b.standard).toBe('gold')
    expect(a.quality.datasetTier('employees')).toBe('silver')
    // The same inputs give the same index even when the provider rebuilds it.
    expect(qualityFor(applied, versions, SAMPLE_AS_OF)).toBe(quality)
    // Without the provider's layers, repeated contexts over the same data share one index.
    expect(buildContext(base).quality).toBe(
      buildContext({ ...base, filters: { ...DEFAULT_FILTERS, level: ['L3'] } }).quality,
    )
  })
})
