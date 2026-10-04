/**
 * Settings that moved to one home: the old place is no longer registered, the new one is, and a
 * value saved at the old place (in this browser or a settings file) arrives at the new one.
 */
import { describe, expect, it } from 'vitest'
import { metricsApi } from './api'
import { CATALOG } from './catalog'
import { importMetricsSection } from './imports'
import { MOVED_SETTINGS, moveSettings } from './moved'
import { EMPTY_METRICS, sanitizeMetricsState } from './overrides'

describe('moved settings', () => {
  it('are registered at their new home only', () => {
    for (const m of MOVED_SETTINGS) {
      const from = CATALOG.byId.get(m.from.metricId)
      expect(
        from?.params.some((p) => p.key === m.from.key) ?? false,
        `${m.from.metricId} ${m.from.key}`,
      ).toBe(false)
      expect(
        CATALOG.byId.get(m.to.metricId)?.params.some((p) => p.key === m.to.key),
        m.to.metricId,
      ).toBe(true)
    }
  })

  it('carry a saved value to the new home, the home winning when both are saved', () => {
    const saved = {
      overrides: {
        'hrbp.findings.spanOutliers': { text: {}, params: { wide: 10, narrow: 2 } },
        'hrbp.findings.orgDepth': { text: {}, params: { levels: 5, warnLayers: 12 } },
        'hrbp.org.newManager': { text: {}, params: { months: 6 } },
        'org.flags.newManager': { text: {}, params: { months: 9 } },
        'org.exit.backfills': { text: {}, params: { minRating: 5 } },
      },
      log: [],
    }
    const m = metricsApi(sanitizeMetricsState(saved, CATALOG))
    expect(m.num('org.flags.wideSpan', 'minDirects')).toBe(10)
    expect(m.num('org.flags.narrowSpan', 'maxDirects')).toBe(2)
    // "More than 5 levels below the top" is "below layer 6".
    expect(m.num('org.layers.count', 'deepChain')).toBe(6)
    expect(m.num('hrbp.findings.orgDepth', 'warnLayers')).toBe(12)
    expect(m.num('org.flags.newManager', 'months')).toBe(9)
    expect(m.num('talent.performance.highPerformers', 'minRating')).toBe(5)
    expect(m.state.overrides['hrbp.findings.spanOutliers']).toBeUndefined()
  })

  it('turn an HR ops "target" setting into the metric’s own target', () => {
    const saved = {
      overrides: {
        'services.cases.resolutionSla': { text: {}, params: { target: 0.95, payroll: 72 } },
        'services.levels.ds01-retro-share': { text: {}, params: { target: 0.03 } },
      },
      log: [],
    }
    const m = metricsApi(sanitizeMetricsState(saved, CATALOG))
    expect(m.target('services.cases.resolutionSla')).toEqual({ value: 0.95, comparator: '>=' })
    expect(m.num('services.cases.resolutionSla', 'payroll')).toBe(72)
    expect(m.target('services.levels.ds01-retro-share')).toEqual({ value: 0.03, comparator: '<' })
  })

  it('apply to a settings file too', () => {
    const r = importMetricsSection(
      { overrides: { 'hrbp.org.singleReportChains': { text: {}, params: { minBelow: 8 } } }, log: [] },
      EMPTY_METRICS,
      CATALOG,
      { at: '2026-10-01T00:00:00.000Z' },
    )
    if (!r.ok) throw new Error(r.error)
    expect(metricsApi(r.state).num('org.flags.singleReportChain', 'minBelow')).toBe(8)
    expect(r.report.rejected).toEqual([])
  })

  it('leave state with nothing to move as it is', () => {
    const raw = { overrides: { 'org.flags.wideSpan': { text: {}, params: { minDirects: 14 } } }, log: [] }
    expect(moveSettings(raw, CATALOG)).toBe(raw)
  })
})
