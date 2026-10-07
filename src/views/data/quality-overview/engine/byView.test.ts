/**
 * Metrics by view and tier (engine/byView.ts): every judged metric is counted once, under its home
 * view and tier, views in folder-tab order and tiers best first.
 */
import { describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { CATALOG } from '@/metrics/catalog'
import { DATA_METRIC } from '../../roomMetrics'
import { metricTiersByView, TIER_SERIES } from './byView'
import type { MetricTierRow } from './impact'

const row = (id: string, view: MetricTierRow['view'], tier: MetricTierRow['tier']) => ({ id, view, tier })

describe('metrics by view and tier', () => {
  it('counts each metric once by home view and tier, in folder-tab and tier order', () => {
    const rows = [
      row('talent.a', 'talent', 'bronze'),
      row('hrbp.a', 'hrbp', 'gold'),
      row('hrbp.b', 'hrbp', 'bronze'),
      row('hrbp.c', 'hrbp', 'gold'),
      row('talent.b', 'talent', 'none'),
    ]
    const cells = metricTiersByView(rows)
    expect(cells.map((c) => [c.viewLabel, c.tierLabel, c.metrics])).toEqual([
      ['People stats', 'Gold', 2],
      ['People stats', 'Bronze', 1],
      ['Talent', 'Bronze', 1],
      ['Talent', 'No data', 1],
    ])
    expect(cells.reduce((a, c) => a + c.metrics, 0)).toBe(rows.length)
    expect(cells[0].ids).toEqual(['hrbp.a', 'hrbp.c'])
    expect(TIER_SERIES).toEqual(['gold', 'silver', 'bronze', 'none'])
  })

  it('is registered, and hidden with the Data room in Manager mode', () => {
    const views = (id: string) => CATALOG.byId.get(id)?.views
    expect(CATALOG.byId.get(DATA_METRIC.metricTiers)?.views).toEqual(['data'])
    expect(
      decide('manager', `metric:${DATA_METRIC.metricTiers}`, undefined, { metricViews: views }).access,
    ).toBe('hidden')
    expect(decide('manager', 'figure:data-quality-metrics-by-view').access).toBe('hidden')
  })
})
