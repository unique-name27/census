/**
 * Metrics by view and tier (docs/CHARTS.md, Data room): how many of each practice's metrics stand
 * at each tier, from the metric impact rows, so the Data quality tab opens on a picture of how
 * much of each dashboard can be trusted today. Pure.
 */
import type { Tier } from '@/data/quality/tier'
import { TIER_LABEL } from '@/data/quality/tier'
import { METRIC_VIEW_LABEL } from '@/metrics/registry'
import type { MetricView } from '@/metrics/types'
import type { MetricTierRow } from './impact'

/** Tiers in the order the bars stack them: best first. */
export const TIER_SERIES: readonly Tier[] = ['gold', 'silver', 'bronze', 'none']

export interface ViewTierCell {
  view: MetricView
  viewLabel: string
  tier: Tier
  tierLabel: string
  metrics: number
  ids: string[]
}

/**
 * One cell per view and tier present, views in folder-tab order (then the Data room and the
 * Action center), tiers best first.
 */
export function metricTiersByView(
  rows: readonly Pick<MetricTierRow, 'id' | 'view' | 'tier'>[],
): ViewTierCell[] {
  const order = Object.keys(METRIC_VIEW_LABEL) as MetricView[]
  const views = order.filter((v) => rows.some((r) => r.view === v))
  return views.flatMap((view) =>
    TIER_SERIES.flatMap((tier) => {
      const ids = rows.filter((r) => r.view === view && r.tier === tier).map((r) => r.id)
      return ids.length
        ? [
            {
              view,
              viewLabel: METRIC_VIEW_LABEL[view],
              tier,
              tierLabel: TIER_LABEL[tier],
              metrics: ids.length,
              ids,
            },
          ]
        : []
    }),
  )
}
