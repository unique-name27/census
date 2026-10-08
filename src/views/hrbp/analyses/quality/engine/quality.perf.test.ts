/** Time budget for Quality of hire on the sample (docs/ANALYSES.md, 7.6). Perf files run one at a time. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { sampleCtx } from '@/views/hrbp/engine/fixtures'
import { qualityModel } from './model'

describe('Quality of hire on the sample company', () => {
  it('computes in under 100 ms, whole company and under a filter', () => {
    // Fresh contexts each run, so nothing is read from the per-context cache.
    const company = Array.from({ length: 4 }, () => sampleCtx())
    const scoped = Array.from({ length: 4 }, () => sampleCtx({ businessUnit: ['Silicon Engineering'] }))
    let i = 0
    let j = 0
    expect(bestCostMs(() => qualityModel(company[i++]))).toBeLessThan(100)
    expect(bestCostMs(() => qualityModel(scoped[j++]))).toBeLessThan(100)
  })
})
