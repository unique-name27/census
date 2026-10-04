/**
 * The Action center's settings, read through the metric dictionary (never as constants), so a
 * changed snooze length or look-ahead applies everywhere at once.
 */
import type { MetricsApi } from '@/metrics/types'
import { P } from '../metrics'

export interface ActionSettings {
  /** How many days Snooze hides an item. */
  snoozeDays: number
  /** How many days after the as-of date count as due soon. */
  dueSoonDays: number
}

export function settingsOf(m: Pick<MetricsApi, 'num'>): ActionSettings {
  return {
    snoozeDays: m.num(P.snoozeDays.metricId, P.snoozeDays.key),
    dueSoonDays: m.num(P.dueSoonDays.metricId, P.dueSoonDays.key),
  }
}
