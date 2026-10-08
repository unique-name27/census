/**
 * Load budget for the Action center's collection on the sample (docs/ACTION-CENTER-AUDIT.md 3.12
 * and part 6, Performance): it runs one view per idle slice, a cold run of any one view stays under
 * 400 ms of work, and a run stops at its next slice when a newer context is asked for. Perf files
 * run one at a time, after the unit tests.
 */
import { describe, expect, it } from 'vitest'
import { sampleCtx } from '@/ask/engine/testkit'
import { bestCostMs } from '@/lib/testBudget'
import { VIEWS } from '@/views/registry'
import { cachedCollect, collectPlan, type Idle, isSuperseded, runView, scheduleCollect } from './collect'
import { samplePicks } from './roleKit'

/** An idle that resolves at once and counts the slices. */
function countingIdle(): { idle: Idle; slices: () => number } {
  let n = 0
  return {
    idle: async () => {
      n++
    },
    slices: () => n,
  }
}

describe('collecting in idle slices', () => {
  it('runs every view cold within 400 ms of work, one view per slice', () => {
    for (const view of VIEWS.filter((v) => v.actions)) {
      // A fresh context each run, so the view computes its model from scratch.
      const ms = bestCostMs(() => runView(sampleCtx(), view), 2)
      expect(ms, view.key).toBeLessThan(400)
    }
  })

  it('takes one slice per view, the wide run of a scoped mode after the scoped one', async () => {
    const ctx = sampleCtx({ access: { mode: 'hrbp-unit', picks: samplePicks() } })
    const plan = collectPlan(ctx, VIEWS)
    const sources = VIEWS.filter((v) => v.actions).length
    expect(plan).toHaveLength(sources * 2)
    expect(plan.slice(0, sources).every((p) => p.ctx === ctx)).toBe(true)
    expect(plan.slice(sources).every((p) => p.ctx !== ctx)).toBe(true)
    const { idle, slices } = countingIdle()
    const c = await scheduleCollect(ctx, VIEWS, { idle, channel: 'perf-1' })
    expect(slices()).toBe(plan.length)
    expect(cachedCollect(ctx, VIEWS)).toBe(c)
    // Asked again: the same result at once.
    expect(await scheduleCollect(ctx, VIEWS, { idle, channel: 'perf-1' })).toBe(c)
    expect(slices()).toBe(plan.length)
  })

  it('stops a run for an older context at its next slice', async () => {
    const older = sampleCtx({ filters: { businessUnit: ['Operations'] } })
    const newer = sampleCtx({ filters: { businessUnit: ['Corporate'] } })
    const { idle } = countingIdle()
    const first = scheduleCollect(older, VIEWS, { idle, channel: 'perf-2' })
    const second = scheduleCollect(newer, VIEWS, { idle, channel: 'perf-2' })
    await expect(first).rejects.toSatisfy(isSuperseded)
    const c = await second
    expect(c.items.length).toBeGreaterThan(0)
    expect(cachedCollect(older, VIEWS)).toBeNull()
  })
})
