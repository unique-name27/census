/** Time budget for the HRBP engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { computeHrbp } from '.'
import { sampleCtx } from './fixtures'

describe('HRBP engine on the sample company', () => {
  it('runs in under 300 ms', () => {
    // A fresh context each run, so the model is computed from scratch rather than read from its cache.
    const contexts = Array.from({ length: 4 }, () => sampleCtx())
    let i = 0
    expect(bestCostMs(() => computeHrbp(contexts[i++]))).toBeLessThan(300)
  })
})
