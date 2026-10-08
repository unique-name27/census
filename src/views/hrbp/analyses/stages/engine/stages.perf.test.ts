/**
 * Time budget for Engineering by stage on the sample (docs/ANALYSES.md, 7.6: each analysis model
 * computes in under 100 ms). Perf files run one at a time, after the unit tests.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx } from '@/ask/engine/testkit'
import { bestCostMs } from '@/lib/testBudget'
import { stagesModel, stagesModelFor } from './model'

describe('Engineering by stage on the sample company', () => {
  it('computes in under 100 ms, and a job family in under 50 ms more', () => {
    // A fresh context each run, so nothing is read from a cache (Onboarding's upcoming starts included).
    const contexts = Array.from({ length: 4 }, () => sampleCtx())
    let i = 0
    expect(bestCostMs(() => stagesModel(contexts[i++]))).toBeLessThan(100)
    let j = 0
    expect(bestCostMs(() => stagesModelFor(contexts[j++], 'Silicon Engineering'))).toBeLessThan(50)
  })
})
