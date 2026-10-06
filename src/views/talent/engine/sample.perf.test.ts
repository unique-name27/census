/** Time budget for the Talent engine on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DEFAULT_FILTERS } from '@/data/scope'
import { bestCostMs } from '@/lib/testBudget'
import { computeTalent } from './index'
import { sourcesFor } from './test-fixtures'

describe('Talent on the sample company', () => {
  it('runs in under 250 ms', () => {
    const data = generateSample()
    const ctx = buildContext({
      data,
      sources: sourcesFor(data, 'sample'),
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
    })
    // Most of it is the flight-risk model (24 month-ends learned, cached per dataset and as-of
    // date). The first run is cold, so it gets a generous bound; bestCostMs warms up first, so the
    // first run is timed on its own, as the smaller of wall-clock and this thread's CPU time.
    const cpu0 = process.threadCpuUsage()
    const t0 = performance.now()
    computeTalent(ctx)
    const wall = performance.now() - t0
    const cpu = process.threadCpuUsage(cpu0)
    expect(Math.min(wall, (cpu.user + cpu.system) / 1000)).toBeLessThan(1500)
    // The real budget: the best of a few reruns, each on fresh copies so the flight-risk cache misses.
    const best = bestCostMs(() => computeTalent({ ...ctx, data: { ...ctx.data }, all: { ...ctx.all } }))
    expect(best).toBeLessThan(250)
  })
})
