/**
 * Load budget for the Scorecard's chart band and for My team on the sample. Perf files run one at
 * a time, after the unit tests.
 */
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import { bestCostMs } from '@/lib/testBudget'
import { hrbpModel } from '@/views/hrbp/engine'
import { VIEWS } from '@/views/registry'
import { teamSources } from '@/views/team/engine'
import { attritionByQuarter, measureRows, practiceStanding, voluntaryByUnit } from './band'
import { computeScorecard } from './schedule'
import { sampleContext } from './testkit'

describe('the home pages on the sample', () => {
  it('adds the Scorecard band in well under the 400 ms budget, on the models the summaries built', () => {
    const ctx = sampleContext()
    const model = computeScorecard(ctx, VIEWS)
    const m = hrbpModel(ctx)
    expect(
      bestCostMs(() => {
        measureRows(model, 'gap')
        practiceStanding(model)
        voluntaryByUnit(m)
        attritionByQuarter(m)
      }, 5),
    ).toBeLessThan(40)
  })

  it("computes My team's models for a mid-size org in under 150 ms", () => {
    const hr = sampleCtx()
    const mid = leaderOptions(hr.org, hr.asOf, 3).find((l) => l.size >= 25 && l.size <= 90)!
    // A fresh context each run, so every producing view computes its model from scratch.
    const contexts = Array.from({ length: 6 }, () =>
      sampleCtx({ access: { mode: 'manager', managerId: mid.id } }),
    )
    let i = 0
    expect(bestCostMs(() => teamSources(contexts[i++]), 5)).toBeLessThan(150)
  })
})
