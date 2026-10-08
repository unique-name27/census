/**
 * The metric dictionary entries the Special analyses tab leads with (docs/ANALYSES.md, 2.4, 3.4,
 * 4.5 and 5.3): one per analysis's lead number, plus the planned-starts count Manager mode hides
 * by id. People stats registers them with its own (`../metrics`), so they are People stats
 * metrics owned by People analytics.
 *
 * Each analysis's builder adds the rest of its entries here (or in its own engine folder,
 * appended to `ANALYSES_METRICS`), with the calculation settings its engine reads through
 * `ctx.metrics`; a setting is registered in the same change as the engine code that reads it.
 *
 * Plain data, like `../metrics`: never React, '@/data/context', '@/data/store' or the '@/metrics'
 * barrel.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, SettingRef } from '@/metrics/types'
import { DECLINES_METRICS, DM, DSET, OFFER_USES } from './declines/engine/metrics'
import { PYRAMID_METRIC, PYRAMID_METRICS, PYRAMID_SET } from './pyramid/engine/metrics'
import { QID, QSET, QUALITY_METRICS, QUALITY_USES } from './quality/engine/metrics'
import { PLANNED_USES, SID, STAGES_METRICS, STAGES_SET, STAGES_USES } from './stages/engine/metrics'

export { PLANNED_USES, QUALITY_USES, STAGES_USES }

/** The analyses' metric ids, by role. */
export const AID = {
  // Quality of hire registers its own (./quality/engine/metrics.ts).
  qualityScore: QID.score,
  qualityPerformance: QID.performance,
  qualityRetention: QID.retention,
  qualityCohort: QID.cohort,
  qualityEducation: QID.education,
  qualityExpected: QID.expected,
  qualityFindings: QID.findings,
  // Offer declines registers its own (./declines/engine/metrics.ts).
  declineRate: DM.rate,
  declineCount: DM.count,
  declineExpected: DM.expected,
  declineTiming: DM.timing,
  declineCompeting: DM.competing,
  declineRangePosition: DM.rangePosition,
  declineFindings: DM.findings,
  // Engineering by stage registers its own (./stages/engine/metrics.ts).
  stageCapacity: SID.capacity,
  stageHiring: SID.hiring,
  stagePlanned: SID.planned,
  stageRatios: SID.ratios,
  stageMapped: SID.mapped,
  stageFindings: SID.findings,
  // The Level pyramid registers its own (./pyramid/engine/metrics.ts).
  pyramidLevelMix: PYRAMID_METRIC.levelMix,
  pyramidRatioBelow: PYRAMID_METRIC.ratioBelow,
  pyramidLevelFlow: PYRAMID_METRIC.levelFlow,
  pyramidFindings: PYRAMID_METRIC.findings,
} as const

/**
 * Every calculation setting the analyses' engines read, registered on their own metrics. People
 * stats' settings check (`../engine/metrics.test.ts`) reads these beside its own `SET`; each
 * analysis adds its settings here.
 */
export const ANALYSES_SET: readonly SettingRef[] = [
  ...Object.values(PYRAMID_SET),
  ...Object.values(QSET),
  ...Object.values(DSET),
  ...Object.values(STAGES_SET),
]

export type AnalysesMetricId = (typeof AID)[keyof typeof AID]

/** Offer declines' lineage (3.4): the offers it counts. */
export const DECLINES_USES: readonly FieldRef[] = OFFER_USES

export const ANALYSES_METRICS: MetricDef[] = defineMetrics('hrbp', [
  // Quality of hire (docs/ANALYSES.md, 2.4).
  ...QUALITY_METRICS,
  // Offer declines (docs/ANALYSES.md, 3.4).
  ...DECLINES_METRICS,
  // Engineering by stage (docs/ANALYSES.md, 4.5).
  ...STAGES_METRICS,
  // Level pyramid (docs/ANALYSES.md, 5.3).
  ...PYRAMID_METRICS,
])
