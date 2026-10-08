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
  /** How many days overdue an item a person waits on can be before it is critical. */
  blockedDays: number
  /** A critical item overdue more than this many days escalates (CHRO and HR homes). */
  escalationDays: number
}

export function settingsOf(m: Pick<MetricsApi, 'num'>): ActionSettings {
  return {
    snoozeDays: m.num(P.snoozeDays.metricId, P.snoozeDays.key),
    dueSoonDays: m.num(P.dueSoonDays.metricId, P.dueSoonDays.key),
    blockedDays: m.num(P.blockedDays.metricId, P.blockedDays.key),
    escalationDays: m.num(P.escalationDays.metricId, P.escalationDays.key),
  }
}
