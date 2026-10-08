/** Time budget for the Level pyramid on the sample (docs/ANALYSES.md, 7.6). Perf files run one at a time. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { sampleCtx } from '../../../engine/fixtures'
import { pyramidModel } from '.'

describe('Level pyramid on the sample company', () => {
  it('computes its model in under 100 ms', () => {
    // A fresh context each run, so nothing is read from a cache.
    const contexts = Array.from({ length: 4 }, () => sampleCtx())
    let i = 0
    expect(bestCostMs(() => pyramidModel(contexts[i++]))).toBeLessThan(100)
  })

  it('stays under 100 ms under an org filter', () => {
    const contexts = Array.from({ length: 4 }, () => sampleCtx({ businessUnit: ['Silicon Engineering'] }))
    let i = 0
    expect(bestCostMs(() => pyramidModel(contexts[i++]))).toBeLessThan(100)
  })
})
