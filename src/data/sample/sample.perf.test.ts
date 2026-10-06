/** Time budget for the sample generator. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { generateSample } from './index'

describe('generator', () => {
  it('runs in under 600 ms', () => {
    expect(bestCostMs(() => generateSample())).toBeLessThan(600)
  })
})
