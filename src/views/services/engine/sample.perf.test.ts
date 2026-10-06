/** Time budget for the HR ops engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { compute } from './index'
import { sampleContext } from './testkit'

describe('HR ops on the sample company', () => {
  it('runs in under 150 ms', () => {
    const ctx = sampleContext()
    expect(bestCostMs(() => compute(ctx))).toBeLessThan(150)
  })
})
