import { describe, expect, it } from 'vitest'
import { LEGACY_KEYS, SETTINGS_KEY } from '@/data/settings'
import { metricsApi } from './api'
import { CATALOG } from './catalog'
import { COMP_CYCLE, compCycleOf } from './compCycle'
import { applyEdits, EMPTY_METRICS } from './overrides'
import { loadMetrics, METRICS_KEY, saveMetrics } from './persist'
import { FIXTURE } from './test-fixtures'

class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

describe('persistence', () => {
  it('saves overrides and the change log, and reads them back the same', () => {
    const st = new MemoryStorage()
    const { state } = applyEdits(
      EMPTY_METRICS,
      FIXTURE,
      [
        { metricId: 'comp.merit.spend', field: 'params.healthyBand', value: [0.85, 1.15] },
        { metricId: 'hrbp.attrition.voluntary', field: 'owner', value: 'HRBP team' },
        { metricId: 'hrbp.attrition.voluntary', field: 'target', value: null },
      ],
      { by: 'Jamie', at: '2026-10-02T10:00:00.000Z' },
    )
    saveMetrics(state, st)
    expect(JSON.parse(st.getItem(METRICS_KEY)!).version).toBe(1)
    const back = loadMetrics(FIXTURE, st)
    expect(back).toEqual(state)
    expect(metricsApi(back, FIXTURE).param('comp.merit.spend', 'healthyBand')).toEqual([0.85, 1.15])
  })

  it('drops stored values that no longer pass, such as a lowered anonymity minimum', () => {
    const st = new MemoryStorage()
    st.setItem(
      METRICS_KEY,
      JSON.stringify({
        version: 1,
        overrides: { 'privacy.anonymity': { text: {}, params: { minGroup: 2 } } },
        log: [],
      }),
    )
    expect(loadMetrics(FIXTURE, st)).toEqual({ overrides: {}, log: [] })
    expect(loadMetrics(FIXTURE, null)).toBe(EMPTY_METRICS)
  })
})

describe('migrating Settings > Compensation cycle', () => {
  const cycle = {
    meritBudgetPct: 0.04,
    healthyBand: [0.85, 1.15],
    guideline: { 5: 0.07, 4: 0.05, 3: 0.03, 2: 0.01, 1: 0 },
  }

  it('moves saved cycle values into the comp metrics once, logged and saved', () => {
    const st = new MemoryStorage()
    st.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark', compCycle: cycle }))
    const s = loadMetrics(CATALOG, st)
    expect(compCycleOf(metricsApi(s))).toEqual(cycle)
    expect(s.log.map((c) => [c.metricId, c.field, c.kind])).toEqual([
      [COMP_CYCLE.guideline.metricId, `params.${COMP_CYCLE.guideline.key}`, 'migration'],
      [COMP_CYCLE.healthyBand.metricId, `params.${COMP_CYCLE.healthyBand.key}`, 'migration'],
      [COMP_CYCLE.meritBudget.metricId, `params.${COMP_CYCLE.meritBudget.key}`, 'migration'],
    ])
    expect(st.getItem(METRICS_KEY)).not.toBeNull()
    // Once saved, the old value is never read again.
    st.setItem(SETTINGS_KEY, JSON.stringify({ compCycle: { ...cycle, meritBudgetPct: 0.09 } }))
    expect(compCycleOf(metricsApi(loadMetrics(CATALOG, st))).meritBudgetPct).toBe(0.04)
  })

  it('reads the older key in the comp engine shape when Settings were never saved', () => {
    const st = new MemoryStorage()
    st.setItem(LEGACY_KEYS.compCycle, JSON.stringify({ meritBudget: 0.03, bandLow: 0.9, bandHigh: 1.1 }))
    const s = loadMetrics(CATALOG, st)
    expect(s.overrides).toEqual({
      [COMP_CYCLE.meritBudget.metricId]: { text: {}, params: { [COMP_CYCLE.meritBudget.key]: 0.03 } },
    })
  })

  it('changes and saves nothing when the cycle was at its defaults, and ignores invalid values', () => {
    const st = new MemoryStorage()
    st.setItem(
      SETTINGS_KEY,
      JSON.stringify({ compCycle: { meritBudgetPct: 0.035, healthyBand: [1.2, 0.8], guideline: { 5: 9 } } }),
    )
    expect(loadMetrics(CATALOG, st)).toEqual(EMPTY_METRICS)
    expect(st.getItem(METRICS_KEY)).toBeNull()
  })
})
