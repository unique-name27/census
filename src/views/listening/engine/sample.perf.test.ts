/** Time budget for the Listening engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { compute } from './index'
import { sampleContext } from './testkit'

describe('Listening on the sample company', () => {
  it('runs in under 150 ms', () => {
    // A fresh context each run, so the model is computed from scratch rather than read from its cache.
    const contexts = Array.from({ length: 4 }, () => sampleContext())
    let i = 0
    expect(bestCostMs(() => compute(contexts[i++]))).toBeLessThan(150)
  })
})
