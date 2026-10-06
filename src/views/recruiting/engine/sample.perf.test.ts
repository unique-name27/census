/** Time budget for the Recruiting engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { bestCostMs } from '@/lib/testBudget'
import { computeRecruitingUncached } from '.'

const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: 0 } satisfies SourceMeta]),
) as Record<DatasetKey, SourceMeta>

describe('sample company, whole company, last 12 months', () => {
  it('runs in under 150 ms', () => {
    const data = generateSample()
    const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    expect(bestCostMs(() => computeRecruitingUncached(ctx))).toBeLessThan(150)
  })
})
