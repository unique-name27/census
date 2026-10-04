/**
 * "Edit definition": open the Metric definitions tab at a metric, or filtered to a view (the
 * Compensation "Cycle settings" button and Settings > Compensation cycle). Whatever sheet is open
 * (the drill panel, Settings) closes first, as when a tier badge opens a dataset.
 */
import { goTo, routeHash } from '@/components/navigation'
import { closeSettings } from '@/data/store'
import { useDrillStore } from '@/drill/store'
import type { MetricView } from '@/metrics/types'
import { metricsTab } from './links'

/** The link to a metric in the dictionary, for an `href`: "#data.metrics/comp/merit/spend". */
export const metricHref = (metricId: string): string => routeHash('data', metricsTab({ metric: metricId }))

/** Open the dictionary: at one metric, filtered to one view, or both. */
export function openMetricDefinitions(opts: { metric?: string | null; view?: MetricView | null } = {}): void {
  useDrillStore.getState().close()
  closeSettings()
  goTo('data', metricsTab(opts))
}

/** Open the dictionary at one metric. */
export const openMetricDefinition = (metricId: string): void => openMetricDefinitions({ metric: metricId })
