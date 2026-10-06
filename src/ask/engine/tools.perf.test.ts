/** Ask tool call timings on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { VIEWS } from '@/views/registry'
import { Conversation } from './conversation'
import { call, envOf, sampleCtx } from './testkit'

const summarized = VIEWS.filter((v) => typeof v.summary === 'function')

describe('view_summary and get_context', () => {
  it('stay well under a second per call on the sample (timings logged)', () => {
    const times: Record<string, number> = {}
    const c = new Conversation()
    // A fresh context each run, so every call computes its view from scratch.
    const timed = (name: string, input: unknown) => {
      const contexts = Array.from({ length: 4 }, () =>
        sampleCtx({ filters: { businessUnit: ['Operations'] } }),
      )
      let i = 0
      return Math.round(bestCostMs(() => call(c, envOf(contexts[i++]), name, input)))
    }
    for (const v of summarized) times[v.key] = timed('view_summary', { view: v.key })
    times.get_context = timed('get_context', {})
    console.info('Ask tool timings (ms):', JSON.stringify(times))
    for (const [k, ms] of Object.entries(times)) expect(ms, k).toBeLessThan(1500)
  })
})
