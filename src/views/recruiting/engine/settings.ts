/**
 * The recruiting engine's calculation settings, read through the metric dictionary
 * (`ctx.metrics`) in one place. Every threshold the view used to hard-code lives on a metric in
 * `../metrics.ts`; the engine reads the values in force here, once per dictionary, and passes them
 * down. Pure functions that run without a context (unit tests) default to the registered values.
 */
import { defaultMetrics } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { RM, type TtfEnd } from '../metrics'

/** When a candidate lacks a timely next step (the aging flags of `agingTier`). */
export interface AgingRules {
  /** No step booked: watch (amber) past this multiple of the stage's usual days. */
  watch: number
  /** No step booked: overdue (red) past this multiple. */
  overdue: number
  /** Scheduled: watch when the step is booked further away than this multiple. */
  farOut: number
  decisionWatchDays: number
  decisionOverdueDays: number
  offerWatchDays: number
  offerOverdueDays: number
}

/** How the usual days per stage are measured (`stageNorms`). */
export interface NormRules {
  /** The usual days when a stage has too few completed steps to measure. */
  fallbackDays: number
  /** Completed steps a stage needs before its usual days come from the data. */
  minSteps: number
}

export interface RecruitingSettings {
  /** The anonymity minimum: rates and medians over smaller groups are hidden. */
  minGroup: number
  aging: AgingRules
  norms: NormRules
  /**
   * An application with no activity for more than this many days (its last activity date) is left
   * out of the Action center's items (docs/ACTION-CENTER-AUDIT.md 4.2); the action queue keeps it.
   */
  staleDays: number
  /** The lacking-a-next-step finding is critical from this count or share of active candidates. */
  lackingCritical: { count: number; share: number }
  ttfEnd: TtfEnd
  /** Offer acceptance tile: color a change of at least `pts` with `minOffers` on each side. */
  acceptanceColor: { pts: number; minOffers: number }
  acceptanceDrop: { pts: number; criticalPts: number; minOffers: number }
  /** The readout lists offers waiting on an answer from this many offers. */
  offersWaitingMin: number
  emptyFunnelDays: number
  oldReqDays: number
  /**
   * A req past its time-to-fill target (an Action center item): without a target, past this
   * multiple of its level's median time to fill; critical past `critical` times the target.
   */
  pastTarget: { multiple: number; critical: number }
  slowFill: { factor: number; minFilled: number }
  bottleneck: {
    factor: number
    minGapDays: number
    recentMonths: number
    minSteps: number
    criticalFactor: number
    minCriticalSteps: number
  }
  withdrawals: { share: number; risePts: number; minExits: number }
  dryingUp: { drop: number; gapPts: number; minPrior: number; minPriorShare: number }
  bestSource: { factor: number; minApplications: number; minHires: number; minMonths: number }
  /** Applications by source highlights a source only with this many prior applications. */
  highlightMinPrior: number
  /** Offer acceptance by location marks a site this many points below the company. */
  locationGapPts: number
  recruiterFlagFactor: number
  /** Below this share of applications matching a req ID, req health is not read. */
  joinMinShare: number
}

const cache = new WeakMap<MetricsApi, RecruitingSettings>()

/** The settings in force in a dictionary (memoized per dictionary object). */
export function recruitingSettings(m: MetricsApi): RecruitingSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const lack = (key: string) => m.num(RM.lackingNextStep, key)
  const s: RecruitingSettings = {
    minGroup: minGroupOf(m),
    aging: {
      watch: lack('watchMultiple'),
      overdue: lack('overdueMultiple'),
      farOut: lack('farOutMultiple'),
      decisionWatchDays: lack('decisionWatchDays'),
      decisionOverdueDays: lack('decisionOverdueDays'),
      offerWatchDays: lack('offerWatchDays'),
      offerOverdueDays: lack('offerOverdueDays'),
    },
    norms: { fallbackDays: lack('fallbackNormDays'), minSteps: lack('minNormSteps') },
    staleDays: lack('staleDays'),
    lackingCritical: { count: lack('criticalCount'), share: lack('criticalShare') },
    ttfEnd: m.choice(RM.timeToFill, 'endEvent') === 'start' ? 'start' : 'accepted',
    acceptanceColor: {
      pts: m.num(RM.offerAcceptance, 'materialPts'),
      minOffers: m.num(RM.offerAcceptance, 'minOffers'),
    },
    acceptanceDrop: {
      pts: m.num(RM.acceptanceDrop, 'dropPts'),
      criticalPts: m.num(RM.acceptanceDrop, 'criticalPts'),
      minOffers: m.num(RM.acceptanceDrop, 'minOffers'),
    },
    offersWaitingMin: m.num(RM.offersWaiting, 'minOffers'),
    emptyFunnelDays: m.num(RM.emptyFunnel, 'days'),
    oldReqDays: m.num(RM.reqAge, 'oldDays'),
    pastTarget: { multiple: m.num(RM.reqAge, 'agingMultiple'), critical: m.num(RM.reqAge, 'agingCritical') },
    slowFill: { factor: m.num(RM.slowFill, 'factor'), minFilled: m.num(RM.slowFill, 'minFilled') },
    bottleneck: {
      factor: m.num(RM.bottleneck, 'factor'),
      minGapDays: m.num(RM.bottleneck, 'minGapDays'),
      recentMonths: m.num(RM.bottleneck, 'recentMonths'),
      minSteps: m.num(RM.bottleneck, 'minSteps'),
      criticalFactor: m.num(RM.bottleneck, 'criticalFactor'),
      minCriticalSteps: m.num(RM.bottleneck, 'minCriticalSteps'),
    },
    withdrawals: {
      share: m.num(RM.withdrawals, 'flagShare'),
      risePts: m.num(RM.withdrawals, 'risePts'),
      minExits: m.num(RM.withdrawals, 'minExits'),
    },
    dryingUp: {
      drop: m.num(RM.sourceDryingUp, 'drop'),
      gapPts: m.num(RM.sourceDryingUp, 'gapPts'),
      minPrior: m.num(RM.sourceDryingUp, 'minPrior'),
      minPriorShare: m.num(RM.sourceDryingUp, 'minPriorShare'),
    },
    bestSource: {
      factor: m.num(RM.bestSource, 'factor'),
      minApplications: m.num(RM.bestSource, 'minApplications'),
      minHires: m.num(RM.bestSource, 'minHires'),
      minMonths: m.num(RM.bestSource, 'minMonths'),
    },
    highlightMinPrior: m.num(RM.sourceApplications, 'minPrior'),
    locationGapPts: m.num(RM.acceptanceByLocation, 'gapPts'),
    recruiterFlagFactor: m.num(RM.recruiterLoad, 'flagFactor'),
    joinMinShare: m.num(RM.reqMatch, 'minShare'),
  }
  cache.set(m, s)
  return s
}

let defaults: RecruitingSettings | null = null

/** The registered defaults, for pure helpers called without a context (tests and fixtures). */
export function defaultSettings(): RecruitingSettings {
  defaults ??= recruitingSettings(defaultMetrics())
  return defaults
}
