/**
 * Time budget for Offer declines on the sample (docs/ANALYSES.md, 7.6): the model computes in under
 * 100 ms, for the whole company and under an org filter (which adds the company's benchmarks).
 * Perf files run one at a time, after the unit tests.
 */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { bestCostMs } from '@/lib/testBudget'
import { declinesModel } from './model'

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

describe('Offer declines on the sample company', () => {
  const data = generateSample()

  it('computes in under 100 ms for the whole company', () => {
    const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    expect(bestCostMs(() => declinesModel(ctx))).toBeLessThan(100)
  })

  it('computes in under 100 ms under an org filter', () => {
    const ctx = buildContext({
      data,
      sources,
      filters: { ...DEFAULT_FILTERS, location: ['Bengaluru'] },
      asOfOverride: null,
      showPay: false,
    })
    expect(bestCostMs(() => declinesModel(ctx))).toBeLessThan(100)
  })
})
