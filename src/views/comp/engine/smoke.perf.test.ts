/** Time budget for the Compensation engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { bestCostMs } from '@/lib/testBudget'
import { computeComp } from './model'
import { DEFAULT_SETTINGS } from './settings'

describe('compensation on the sample company', () => {
  const data = generateSample()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  const ctx = buildContext({
    data,
    sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })

  it('runs in under 150 ms', () => {
    expect(bestCostMs(() => computeComp(ctx, DEFAULT_SETTINGS))).toBeLessThan(150)
  })
})
