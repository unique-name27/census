import { describe, expect, it } from 'vitest'
import { bestCostMs } from './testBudget'

/** A fixed amount of work, so the result doesn't depend on how busy the machine is. */
const work = (n: number) => {
  let x = 0
  for (let i = 0; i < n; i++) x = (x * 31 + i) % 1_000_003
  return x
}

describe('bestCostMs', () => {
  it('measures the work of a call', () => {
    const heavy = bestCostMs(() => work(30_000_000))
    const light = bestCostMs(() => work(10))
    expect(Number.isFinite(heavy)).toBe(true)
    expect(light).toBeGreaterThanOrEqual(0)
    expect(heavy).toBeGreaterThan(light)
  })

  it('warms up once and then takes the best of the runs', () => {
    let calls = 0
    bestCostMs(() => calls++, 4)
    expect(calls).toBe(5)
  })
})
