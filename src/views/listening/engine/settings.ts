/**
 * The targets and thresholds in force, read once per context from the metric dictionary
 * (`ctx.metrics`), so an edited setting recomputes the whole view and nothing reads a constant.
 */
import type { SurveyType } from '@/data/schema'
import { surveyMinimumsOf } from '@/metrics/privacy'
import type { MetricsApi, MetricTarget } from '@/metrics/types'
import { M, P, scoreMetric } from '../metrics'
import { PROGRAMS } from './catalog'

export interface ListeningSettings {
  /** The anonymity minimum (5, or higher). */
  minGroup: number
  /** Survey manager cuts: 10 or more distinct respondents. */
  minManager: number
  /** Quarters pooled for a manager cut. */
  quarters: number
  /** Per survey: the smallest group shown, never below the anonymity minimum. */
  minOf: Record<SurveyType, number>
  /** Per survey: the headline target in force, or null when it was removed. */
  targetOf: Record<SurveyType, MetricTarget | null>
  responseTarget: MetricTarget | null
  readinessTarget: MetricTarget | null
  wouldReturnTarget: MetricTarget | null
  /** Driver target on 1-5 when the Survey items sheet gives none. */
  defaultTarget: number
  watchMean: number
  watchNps: number
  material: number
  materialNps: number
  stageGap: number
  recruiterGap: number
  regionGap: number
  riskShare: number
  exitShare: number
  lowManager: number
  returnGap: number
  lowCourse: number
}

export function listeningSettings(m: MetricsApi): ListeningSettings {
  const { minGroup, minManager, quarters } = surveyMinimumsOf(m)
  const minOf = {} as Record<SurveyType, number>
  const targetOf = {} as Record<SurveyType, MetricTarget | null>
  for (const p of PROGRAMS) {
    const id = scoreMetric(p)
    minOf[p.survey] = Math.max(minGroup, m.num(id, P.minRespondents))
    targetOf[p.survey] = m.target(id)
  }
  return {
    minGroup,
    minManager,
    quarters,
    minOf,
    targetOf,
    responseTarget: m.target(M.responseRate),
    readinessTarget: m.target(M.readiness),
    wouldReturnTarget: m.target(M.wouldReturn),
    defaultTarget: m.num(M.driverScore, P.defaultTarget),
    watchMean: m.num(M.status, P.watchMean),
    watchNps: m.num(M.status, P.watchNps),
    material: m.num(M.change, P.material),
    materialNps: m.num(M.change, P.materialNps),
    stageGap: m.num(M.stageNps, P.gap),
    recruiterGap: m.num(M.byRecruiter, P.gap),
    regionGap: m.num(M.readiness, P.gap),
    riskShare: m.num(M.topRisk, P.share),
    exitShare: m.num(M.exitReasons, P.share),
    lowManager: m.num(M.upward, P.lowScore),
    returnGap: m.num(M.returnTiming, P.gap),
    lowCourse: m.num(M.byCourse, P.lowScore),
  }
}

export type Status = 'met' | 'watch' | 'missed' | 'none'

/** Met, Watch (within the margin) or Missed against a target; 'none' without a value or target. */
export function statusOf(value: number | null, target: MetricTarget | null, margin: number): Status {
  if (value == null || !target) return 'none'
  const meets =
    target.comparator === '>='
      ? value >= target.value - 1e-9
      : target.comparator === '<='
        ? value <= target.value + 1e-9
        : value < target.value
  if (meets) return 'met'
  const miss = target.comparator === '>=' ? target.value - value : value - target.value
  return miss <= margin + 1e-9 ? 'watch' : 'missed'
}

export const STATUS_WORD: Record<Status, string> = {
  met: 'Met',
  watch: 'Watch',
  missed: 'Missed',
  none: 'No target',
}
