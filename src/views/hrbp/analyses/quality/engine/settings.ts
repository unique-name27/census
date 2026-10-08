/**
 * Quality of hire's calculation settings, read from the metric dictionary (`ctx.metrics`) when the
 * model is built, never from constants (docs/ANALYSES.md, 2.4). The anonymity minimum floors every
 * minimum: a setting can be lowered to it and no further.
 */
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { QID, QSET, type Scoring } from './metrics'

export interface QualitySettings {
  /** Weights divided by their sum; both 0 reads as half each (`weightsDefaulted`). */
  wP: number
  wR: number
  weightsDefaulted: boolean
  retentionMonths: number
  regrettedSecondYear: boolean
  rifExcluded: boolean
  cohortMonths: number
  firstReviewMinDays: number
  firstReviewWithinMonths: number
  scoring: Scoring
  /** The anonymity minimum: any mean needs this many scored hires. */
  minGroup: number
  minUniversityHires: number
  minCellHires: number
  /** 0.8, 0.9 or 0.95. */
  interval: number
  /** The z value of the interval: 1.28, 1.645 or 1.96. */
  z: number
  minCell: number
  minGap: number
  /** The education coverage target (the target of Education recorded), or null when removed. */
  coverageTarget: number | null
}

const Z: Record<string, number> = { '0.8': 1.28, '0.9': 1.645, '0.95': 1.96 }

export function qualitySettings(m: MetricsApi): QualitySettings {
  const num = (r: { metricId: string; key: string }) => m.num(r.metricId, r.key)
  const flag = (r: { metricId: string; key: string }) => m.flag(r.metricId, r.key)
  const minGroup = minGroupOf(m)
  const rawP = num(QSET.performanceWeight)
  const rawR = num(QSET.retentionWeight)
  const weightsDefaulted = rawP + rawR <= 0
  const wP = weightsDefaulted ? 0.5 : rawP
  const wR = weightsDefaulted ? 0.5 : rawR
  const level = m.choice(QSET.interval.metricId, QSET.interval.key)
  const target = m.target(QID.education)
  return {
    wP,
    wR,
    weightsDefaulted,
    retentionMonths: num(QSET.retentionMonths),
    regrettedSecondYear: flag(QSET.regrettedSecondYear),
    rifExcluded: flag(QSET.rifExcluded),
    cohortMonths: num(QSET.cohortMonths),
    firstReviewMinDays: num(QSET.firstReviewMinDays),
    firstReviewWithinMonths: num(QSET.firstReviewWithinMonths),
    scoring: m.choice(QSET.scoring.metricId, QSET.scoring.key) === 'percentile' ? 'percentile' : 'scale',
    minGroup,
    minUniversityHires: Math.max(minGroup, num(QSET.minUniversityHires)),
    minCellHires: Math.max(minGroup, num(QSET.minCellHires)),
    interval: Number(level),
    z: Z[level] ?? 1.645,
    minCell: Math.max(minGroup, num(QSET.minCell)),
    minGap: num(QSET.minGap),
    coverageTarget: target ? target.value : null,
  }
}
