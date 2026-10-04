import { describe, expect, it, vi } from 'vitest'
import type { FieldRef } from '@/data/quality/fieldRef'
import { cachedScorecard, type Idle, isSuperseded, scheduleScorecard, scorecardNow } from './schedule'
import { kpi, practice, sampleContext } from './testkit'

const HIRE: readonly FieldRef[] = ['employees.hireDate']

/** An idle queue the test drains by hand, so we can see what runs before the first paint. */
function manualIdle() {
  const waiting: (() => void)[] = []
  const idle: Idle = () => new Promise<void>((resolve) => waiting.push(resolve))
  const step = async () => {
    waiting.shift()?.()
    // Let the awaiting code run up to its next wait.
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  return { idle, step, pending: () => waiting.length }
}

function counted(key: 'recruiting' | 'hrbp') {
  const summary = vi.fn(() => ({
    kpis: [kpi({ id: 'vol', metricId: 'hrbp.attrition.voluntary', value: 0.05, uses: HIRE })],
    findings: [],
  }))
  const v = practice(key, { kpis: [], findings: [] })
  return { view: { ...v, summary }, summary }
}

describe('scheduling the scorecard', () => {
  it('runs nothing before the first idle moment, then one practice per idle slice', async () => {
    const ctx = sampleContext()
    const a = counted('recruiting')
    const b = counted('hrbp')
    const { idle, step, pending } = manualIdle()
    const onReady = vi.fn()
    const done = scheduleScorecard(ctx, [a.view, b.view], { idle, onReady })
    expect(a.summary).not.toHaveBeenCalled()
    expect(cachedScorecard(ctx)).toBeNull()
    await step()
    expect(a.summary).toHaveBeenCalledOnce()
    expect(b.summary).not.toHaveBeenCalled()
    expect(pending()).toBe(1)
    await step()
    const model = await done
    expect(b.summary).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledWith(model)
    expect(cachedScorecard(ctx)).toBe(model)
    expect(model.headline.value).toBe('2 of 2')
  })

  it('shares one computation per context, and reuses it once stored', async () => {
    const ctx = sampleContext()
    const a = counted('recruiting')
    const { idle, step } = manualIdle()
    const first = scheduleScorecard(ctx, [a.view], { idle })
    const second = scheduleScorecard(ctx, [a.view], { idle })
    expect(second).toBe(first)
    await step()
    const model = await first
    expect(await scheduleScorecard(ctx, [a.view], { idle })).toBe(model)
    expect(scorecardNow(ctx, [a.view])).toBe(model)
    expect(a.summary).toHaveBeenCalledOnce()
    // Another scope or period is another context: it is computed on its own.
    const other = sampleContext({ filters: { businessUnit: ['Silicon Engineering'] } })
    expect(cachedScorecard(other)).toBeNull()
  })

  it('stops a run for an older context when a newer one is asked for', async () => {
    const old = sampleContext()
    const now = sampleContext()
    const a = counted('recruiting')
    const b = counted('hrbp')
    const { idle, step } = manualIdle()
    const stale = scheduleScorecard(old, [a.view, b.view], { idle })
    const caught = stale.catch((err) => err)
    await step()
    expect(a.summary).toHaveBeenCalledOnce()
    const fresh = scheduleScorecard(now, [a.view, b.view], { idle })
    await step()
    expect(isSuperseded(await caught)).toBe(true)
    expect(cachedScorecard(old)).toBeNull()
    await step()
    await step()
    expect((await fresh).practices).toHaveLength(2)
    // The old run stopped before its second practice, so that one ran for the new context only.
    expect(b.summary).toHaveBeenCalledOnce()
    expect(a.summary).toHaveBeenCalledTimes(2)
  })

  it('computes on the spot where there is no first paint to protect', () => {
    const ctx = sampleContext()
    const a = counted('recruiting')
    const model = scorecardNow(ctx, [a.view])
    expect(cachedScorecard(ctx)).toBe(model)
    expect(a.summary).toHaveBeenCalledOnce()
  })
})
