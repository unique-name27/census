/** Time budget for the Onboarding engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { computeOnboardingUncached } from './index'
import { sampleContext } from './testkit'

describe('Onboarding on the sample company', () => {
  it('runs inside its 400 ms budget', () => {
    const ctx = sampleContext()
    expect(bestCostMs(() => computeOnboardingUncached(ctx))).toBeLessThan(400)
  })
})
