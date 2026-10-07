/**
 * The Talent view's metric dictionary ids and the calculation settings its engines read.
 *
 * Every threshold a reader could want to change (the high performer rating, the rating
 * guideline, the flight-risk band shares, the readout thresholds) is a setting of a metric in
 * `../metrics.ts`. Engines never read the defaults below directly: `readSettings(ctx.metrics)`
 * reads each one through `ctx.metrics` once per computation, and the result travels on the base.
 * The defaults live here so the registry and the pure helpers' fallbacks share one source.
 *
 * A leaf module: no React, no context, no catalog, so `../metrics.ts` and every engine can
 * import it without a cycle.
 */
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi, MetricTarget, RatingKey, RatingMap } from '@/metrics/types'
import type { KpiId, TalentFigureId } from './lineage'

/** The People stats settings voluntary attrition is measured with (their one home). */
const PEOPLE_STATS = {
  countContractors: { metricId: 'hrbp.headcount.employees', key: 'countContractors' },
  annualize: { metricId: 'hrbp.attrition.all', key: 'annualize' },
} as const

/** Metric dictionary ids, one per KPI, figure measure and finding rule. */
export const TALENT_METRIC = {
  /* KPIs */
  ratedCoverage: 'talent.performance.ratedCoverage',
  highPerformers: 'talent.performance.highPerformers',
  highPotentials: 'talent.potential.highPotentials',
  criticalCoverage: 'talent.succession.criticalCoverage',
  regrettedHigh: 'talent.retention.regrettedHigh',
  requiredOnTime: 'talent.learning.requiredOnTime',
  keyTalent: 'talent.retention.keyTalent',
  /* Figure measures */
  ratingDistribution: 'talent.performance.ratingDistribution',
  calibrationShift: 'talent.performance.calibrationShift',
  averageRating: 'talent.performance.averageRating',
  exitByRating: 'talent.performance.exitByRating',
  ratingChange: 'talent.performance.ratingChange',
  byReviewer: 'talent.performance.byReviewer',
  nineBox: 'talent.potential.nineBox',
  bestReadiness: 'talent.succession.bestReadiness',
  exposure: 'talent.succession.exposure',
  roleStatus: 'talent.succession.roleStatus',
  bench: 'talent.succession.bench',
  riskBands: 'talent.retention.riskBands',
  flightRisk: 'talent.retention.flightRisk',
  backTest: 'talent.retention.backTest',
  riskDrivers: 'talent.retention.riskDrivers',
  promotionOverdue: 'talent.retention.promotionOverdue',
  completions: 'talent.learning.completions',
  overdue: 'talent.learning.overdue',
  overdueAtMonthEnd: 'talent.learning.overdueAtMonthEnd',
  hours: 'talent.learning.hours',
  /* Finding rules */
  hipoExitsRule: 'talent.finding.hipoExits',
  successionExposedRule: 'talent.finding.successionExposed',
  criticalNotReadyRule: 'talent.finding.criticalNotReady',
  inflationRule: 'talent.finding.ratingInflation',
  calibrationRule: 'talent.finding.calibration',
  trainingOverdueRule: 'talent.finding.trainingOverdue',
  promotionOverdueRule: 'talent.finding.promotionOverdue',
  keyTalentRule: 'talent.finding.keyTalent',
  goodTrainingRule: 'talent.finding.goodTraining',
  goodDistributionRule: 'talent.finding.goodDistribution',
  goodSuccessionRule: 'talent.finding.goodSuccession',
} as const

const M = TALENT_METRIC

/** The metric behind each KPI tile. */
export const KPI_METRIC: Record<KpiId, string> = {
  'talent-rated': M.ratedCoverage,
  'talent-high-performers': M.highPerformers,
  'talent-high-potentials': M.highPotentials,
  'talent-succession-coverage': M.criticalCoverage,
  'talent-regretted-high': M.regrettedHigh,
  'talent-training-on-time': M.requiredOnTime,
  'talent-key-talent-risk': M.keyTalent,
}

/** The metric each Figure shows (its `metric` prop and the first row of its definitions). */
export const FIGURE_METRIC: Record<TalentFigureId, string> = {
  'talent-nine-box': M.nineBox,
  'talent-rating-distribution': M.ratingDistribution,
  'talent-succession-coverage': M.bestReadiness,
  'talent-key-talent-top': M.keyTalent,
  'talent-high-share-by-department': M.highPerformers,
  'talent-rating-mix': M.ratingDistribution,
  'talent-calibration-shift': M.calibrationShift,
  'talent-average-rating-by-cycle': M.averageRating,
  'talent-high-share-by-level': M.highPerformers,
  'talent-exit-by-rating': M.exitByRating,
  'talent-rating-change': M.ratingChange,
  'talent-rating-by-manager': M.byReviewer,
  'talent-succession-exposure': M.exposure,
  'talent-critical-roles': M.roleStatus,
  'talent-bench-strength': M.bench,
  'talent-high-potentials-by-level': M.highPotentials,
  'talent-high-potentials-by-unit': M.highPotentials,
  'talent-risk-bands': M.riskBands,
  'talent-risk-back-test': M.backTest,
  'talent-risk-drivers': M.riskDrivers,
  'talent-risk-factors': M.flightRisk,
  'talent-key-talent-at-risk': M.keyTalent,
  'talent-promotion-overdue': M.promotionOverdue,
  'talent-regretted-high-performers': M.regrettedHigh,
  'talent-overdue-trend': M.overdueAtMonthEnd,
  'talent-training-on-time-by-course': M.requiredOnTime,
  'talent-completions-by-month': M.completions,
  'talent-overdue-by-course': M.overdue,
  'talent-overdue-assignments': M.overdue,
  'talent-learning-hours': M.hours,
}

/** Setting keys, by metric. */
export const TALENT_PARAM = {
  highRating: { metricId: M.highPerformers, key: 'minRating' },
  guideline: { metricId: M.ratingDistribution, key: 'guideline' },
  highBand: { metricId: M.riskBands, key: 'highShare' },
  mediumBand: { metricId: M.riskBands, key: 'mediumShare' },
  sharedFactor: { metricId: M.riskDrivers, key: 'sharedShare' },
  promotionYears: { metricId: M.promotionOverdue, key: 'years' },
  hipoExitMonths: { metricId: M.hipoExitsRule, key: 'months' },
  notReadyCritical: { metricId: M.criticalNotReadyRule, key: 'criticalShare' },
  inflationPts: { metricId: M.inflationRule, key: 'abovePts' },
  inflationMinRated: { metricId: M.inflationRule, key: 'minRated' },
  calibrationShift: { metricId: M.calibrationRule, key: 'minShift' },
  calibrationMinRated: { metricId: M.calibrationRule, key: 'minRated' },
  overdueCriticalShare: { metricId: M.trainingOverdueRule, key: 'criticalShare' },
  overdueCriticalPeople: { metricId: M.trainingOverdueRule, key: 'criticalPeople' },
  promotionMinPeople: { metricId: M.promotionOverdueRule, key: 'minPeople' },
  goodTrainingMinDue: { metricId: M.goodTrainingRule, key: 'minDue' },
  goodDistributionTolerance: { metricId: M.goodDistributionRule, key: 'tolerance' },
  goodDistributionMinRated: { metricId: M.goodDistributionRule, key: 'minRated' },
  goodSuccessionCoverage: { metricId: M.goodSuccessionRule, key: 'minCoverage' },
  goodSuccessionMinCritical: { metricId: M.goodSuccessionRule, key: 'minCritical' },
} as const

/* ───────── defaults (the registry's, and the pure helpers' fallbacks) ───────── */

/** Target share of rated people at each rating. */
export const DEFAULT_GUIDELINE: RatingMap = { 1: 0.03, 2: 0.1, 3: 0.52, 4: 0.25, 5: 0.1 }
/** The required training on-time target. */
export const DEFAULT_ON_TIME_TARGET: MetricTarget = { value: 0.95, comparator: '>=' }

export const DEFAULTS = {
  highRating: 4,
  /** About the top 10% of flight-risk scores are High, and the next 25% Medium. */
  highBand: 0.1,
  mediumBand: 0.25,
  sharedFactor: 0.8,
  promotionYears: 3,
  hipoExitMonths: 6,
  notReadyCritical: 0.4,
  inflationPts: 0.08,
  inflationMinRated: 20,
  calibrationShift: 0.3,
  calibrationMinRated: 20,
  overdueCriticalShare: 0.25,
  overdueCriticalPeople: 10,
  promotionMinPeople: 3,
  goodTrainingMinDue: 20,
  goodDistributionTolerance: 0.03,
  goodDistributionMinRated: 100,
  goodSuccessionCoverage: 0.8,
  goodSuccessionMinCritical: 5,
} as const

/** The guideline share at or above a rating: 35% at 4 with the default guideline. */
export function guidelineAtOrAbove(guideline: Readonly<RatingMap>, minRating: number): number {
  let s = 0
  for (const r of [1, 2, 3, 4, 5] as const) if (r >= minRating) s += guideline[r] ?? 0
  return s
}

/* ───────── what the engines read ───────── */

export interface TalentSettings {
  /** The anonymity minimum (privacy rule): smaller groups are hidden. */
  minGroup: number
  /** The lowest rating that counts as a high performer (4: rated 4 or 5). */
  highRating: number
  /** Target share at each rating. */
  guideline: Readonly<RatingMap>
  /** The guideline share at or above the high performer rating. */
  highGuideline: number
  /** Flight-risk bands: target shares of everyone scored in the high band and the medium band. */
  highBand: number
  mediumBand: number
  /** A factor this share of the high band carries is never a person's main reason when they have another. */
  sharedFactor: number
  /** High performers overdue for promotion: at least this many years here and since a promotion. */
  promotionYears: number
  /** Required training on-time target, or null when the metric has no target. */
  onTimeTarget: MetricTarget | null
  /**
   * How the flight-risk attrition factors measure voluntary attrition: the People stats settings
   * (who counts, annualized or not), so a rate quoted here matches People stats.
   */
  rates: { contractors: boolean; annualize: boolean }
  findings: {
    hipoExitMonths: number
    notReadyCritical: number
    inflationPts: number
    inflationMinRated: number
    calibrationShift: number
    calibrationMinRated: number
    overdueCriticalShare: number
    overdueCriticalPeople: number
    promotionMinPeople: number
    goodTrainingMinDue: number
    goodDistributionTolerance: number
    goodDistributionMinRated: number
    goodSuccessionCoverage: number
    goodSuccessionMinCritical: number
  }
}

type NumKey = Exclude<keyof typeof TALENT_PARAM, 'guideline'>

/**
 * Every Talent setting in force, read through the dictionary (`ctx.metrics`). Read once per
 * computation, up front, so a rule that does not fire still reads its settings.
 */
export function readSettings(m: MetricsApi): TalentSettings {
  const num = (k: NumKey) => m.num(TALENT_PARAM[k].metricId, TALENT_PARAM[k].key)
  const highRating = num('highRating')
  const guideline = m.ratings(TALENT_PARAM.guideline.metricId, TALENT_PARAM.guideline.key)
  return {
    minGroup: minGroupOf(m),
    highRating,
    guideline,
    highGuideline: guidelineAtOrAbove(guideline, highRating),
    highBand: num('highBand'),
    mediumBand: num('mediumBand'),
    sharedFactor: num('sharedFactor'),
    promotionYears: num('promotionYears'),
    onTimeTarget: m.target(M.requiredOnTime),
    rates: {
      contractors: m.flag(PEOPLE_STATS.countContractors.metricId, PEOPLE_STATS.countContractors.key),
      annualize: m.flag(PEOPLE_STATS.annualize.metricId, PEOPLE_STATS.annualize.key),
    },
    findings: {
      hipoExitMonths: num('hipoExitMonths'),
      notReadyCritical: num('notReadyCritical'),
      inflationPts: num('inflationPts'),
      inflationMinRated: num('inflationMinRated'),
      calibrationShift: num('calibrationShift'),
      calibrationMinRated: num('calibrationMinRated'),
      overdueCriticalShare: num('overdueCriticalShare'),
      overdueCriticalPeople: num('overdueCriticalPeople'),
      promotionMinPeople: num('promotionMinPeople'),
      goodTrainingMinDue: num('goodTrainingMinDue'),
      goodDistributionTolerance: num('goodDistributionTolerance'),
      goodDistributionMinRated: num('goodDistributionMinRated'),
      goodSuccessionCoverage: num('goodSuccessionCoverage'),
      goodSuccessionMinCritical: num('goodSuccessionMinCritical'),
    },
  }
}

/* ───────── wording that follows the settings ───────── */

/** "4 or 5" for a high performer rating of 4, "5" for 5, "3 to 5" for 3. */
export function highRatingText(min: number): string {
  if (min >= 5) return '5'
  if (min === 4) return '4 or 5'
  return `${min} to 5`
}

/** "4-5" for 4, "5" for 5, "3-5" for 3 (labels and column headers). */
export function highRangeText(min: number): string {
  return min >= 5 ? '5' : `${min}-5`
}

/** The ratings at or above the high performer rating, for counting. */
export const isHighRating = (rating: number | null | undefined, min: number): boolean =>
  rating != null && rating >= min

/** "3 years" / "1 year" / "2.5 years". */
export function yearsText(years: number): string {
  const v = +years.toFixed(1)
  return `${v} ${v === 1 ? 'year' : 'years'}`
}

/** Months in `years`, whole. */
export const monthsIn = (years: number): number => Math.round(years * 12)

/** A rating map's keys in order, low to high. */
export const RATING_KEYS_ASC: readonly RatingKey[] = [1, 2, 3, 4, 5]
