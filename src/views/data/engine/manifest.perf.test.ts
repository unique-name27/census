/** Time budget for the Data room manifest on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { bestCostMs } from '@/lib/testBudget'
import { buildManifest } from './manifest'

describe('the sample company in the Data room', () => {
  it('builds the manifest well inside the time budget', () => {
    const data = generateSample()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    const ms = bestCostMs(() => buildManifest({ data: ctx.all, sources: ctx.sources, asOf: ctx.asOf }))
    expect(ms).toBeLessThan(150)
  })
})
