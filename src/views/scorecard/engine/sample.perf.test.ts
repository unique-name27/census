/** Load budget for the People scorecard on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { VIEWS } from '@/views/registry'
import { buildScorecard } from './model'
import { computeScorecard, practiceViews, runSummary } from './schedule'
import { sampleContext } from './testkit'

describe('the scorecard on the sample', () => {
  it('computes every summary within the 400 ms load budget, and adds almost nothing itself', () => {
    // A fresh context each run, so every view computes its model from scratch. Best of five after
    // a warm-up, counting work rather than waiting.
    const contexts = Array.from({ length: 6 }, () => sampleContext())
    let i = 0
    expect(bestCostMs(() => computeScorecard(contexts[i++], VIEWS), 5)).toBeLessThan(400)
    // The scorecard's own share: judging, gating and ranking the summaries already computed.
    const ctx = sampleContext()
    const inputs = practiceViews(VIEWS).map((v) => runSummary(v, ctx))
    expect(bestCostMs(() => buildScorecard(ctx, inputs))).toBeLessThan(25)
  })
})
