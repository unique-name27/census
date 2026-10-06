/** Time budget for the Compliance engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { compute } from './index'
import { sampleContext } from './testkit'

describe('compliance on the sample company', () => {
  it('runs in well under the scorecard budget', () => {
    // Builds a fresh context each run, so the view is computed from scratch rather than read from its cache.
    const ms = bestCostMs(() =>
      compute(sampleContext({ filters: { businessUnit: ['Silicon Engineering'] } })),
    )
    expect(ms).toBeLessThan(400)
  })
})
