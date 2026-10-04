/**
 * The calculation settings and targets in force, read through the metric dictionary
 * (`ctx.metrics`) so an edited setting changes every number it governs. Never constants.
 */

import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { M, P } from '../metrics'

export interface ComplianceSettings {
  /** The anonymity minimum: rates over fewer people are hidden. */
  minGroup: number
  headlineDays: number
  horizonDays: number
  leadDays: number
  i9Days: number
  pendingDays: number
  policyDays: number
  deadlineDays: number
  overdueCriticalDays: number
  i9CriticalShare: number
  clusterMin: number
  clusterShare: number
  reverifyNotice: number
  /** Targets in force (null when someone removed an optional one). */
  targets: {
    reverification: number | null
    i9: number | null
    i9Section1: number | null
    policyAcks: number | null
  }
}

const num = (m: MetricsApi, p: { metricId: string; key: string }) => m.num(p.metricId, p.key)
const targetOf = (m: MetricsApi, id: string): number | null => m.target(id)?.value ?? null

export function readSettings(m: MetricsApi): ComplianceSettings {
  return {
    minGroup: minGroupOf(m),
    headlineDays: num(m, P.headlineDays),
    horizonDays: num(m, P.horizonDays),
    leadDays: num(m, P.leadDays),
    i9Days: num(m, P.i9Days),
    pendingDays: num(m, P.pendingDays),
    policyDays: num(m, P.policyDays),
    deadlineDays: num(m, P.deadlineDays),
    overdueCriticalDays: num(m, P.overdueCriticalDays),
    i9CriticalShare: num(m, P.i9CriticalShare),
    clusterMin: num(m, P.clusterMin),
    clusterShare: num(m, P.clusterShare),
    reverifyNotice: num(m, P.reverifyNotice),
    targets: {
      reverification: targetOf(m, M.reverificationOnTime),
      i9: targetOf(m, M.i9Section2),
      i9Section1: targetOf(m, M.i9Section1),
      policyAcks: targetOf(m, M.policyAcks),
    },
  }
}
