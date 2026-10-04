/**
 * The calculation settings and targets in force, read once per dictionary from `ctx.metrics`
 * (docs/METRICS.md). Engines never hard-code a threshold: they read it from here.
 */

import { minGroupOf, surveyMinimumsOf } from '@/metrics/privacy'
import type { MetricsApi, MetricTarget } from '@/metrics/types'
import { M, PROBATION_MONTHS, probationKey } from '../metrics'

export interface OnboardingSettings {
  /** The anonymity minimum (groups under it are hidden). */
  minGroup: number
  /** Survey groups need this many distinct respondents. */
  surveyMin: number
  dedupDays: number
  unknownLookbackDays: number
  dayMinus3Days: number
  contingencyBusinessDays: number
  trackedCountry: string
  notReadyDays: number
  dueSoonBusinessDays: number
  readinessHorizonDays: number
  calendarWeeks: number
  i9BusinessDays: number
  trainingDays: number
  probationLeadBusinessDays: number
  probationDueSoonDays: number
  /** Probation months by country (0 = none). */
  probationMonths: Readonly<Record<string, number>>
  attritionDays: number
  onPlanBand: number
  minBehind: number
  lateMinGap: number
  lateMinCount: number
  concentrationMinGap: number
  targets: {
    dayOne: MetricTarget | null
    i9: MetricTarget | null
    training: MetricTarget | null
    checkIns: MetricTarget | null
    attrition90: MetricTarget | null
    renege: MetricTarget | null
    pulse: MetricTarget | null
    contingencies: MetricTarget | null
    probation: MetricTarget | null
  }
}

const cache = new WeakMap<MetricsApi, OnboardingSettings>()

/** The settings in force in a dictionary (memoized per dictionary object). */
export function onboardingSettings(m: MetricsApi): OnboardingSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const probationMonths: Record<string, number> = {}
  for (const country of Object.keys(PROBATION_MONTHS))
    probationMonths[country] = m.num(M.probation, probationKey(country))
  const s: OnboardingSettings = {
    minGroup: minGroupOf(m),
    surveyMin: surveyMinimumsOf(m).minGroup,
    dedupDays: m.num(M.starts, 'dedupDays'),
    unknownLookbackDays: m.num(M.starts, 'unknownLookbackDays'),
    dayMinus3Days: m.num(M.dayMinus3, 'days'),
    contingencyBusinessDays: m.num(M.contingencies, 'businessDays'),
    trackedCountry: m.choice(M.renege, 'trackedCountry'),
    notReadyDays: m.num(M.readiness, 'notReadyDays'),
    dueSoonBusinessDays: m.num(M.readiness, 'dueSoonBusinessDays'),
    readinessHorizonDays: m.num(M.readinessByTask, 'horizonDays'),
    calendarWeeks: m.num(M.calendar, 'weeks'),
    i9BusinessDays: m.num(M.i9, 'businessDays'),
    trainingDays: m.num(M.training, 'days'),
    probationLeadBusinessDays: m.num(M.probation, 'leadBusinessDays'),
    probationDueSoonDays: m.num(M.probation, 'dueSoonDays'),
    probationMonths,
    attritionDays: m.num(M.attrition90, 'days'),
    onPlanBand: m.num(M.vsPlan, 'onPlanBand'),
    minBehind: m.num(M.quarter, 'minBehind'),
    lateMinGap: m.num(M.lateTask, 'minGap'),
    lateMinCount: m.num(M.lateTask, 'minLate'),
    concentrationMinGap: m.num(M.concentration, 'minGap'),
    targets: {
      dayOne: m.target(M.dayOne),
      i9: m.target(M.i9),
      training: m.target(M.training),
      checkIns: m.target(M.checkIns),
      attrition90: m.target(M.attrition90),
      renege: m.target(M.renege),
      pulse: m.target(M.pulse),
      contingencies: m.target(M.contingencies),
      probation: m.target(M.probation),
    },
  }
  cache.set(m, s)
  return s
}
