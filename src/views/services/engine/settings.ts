/**
 * The settings the HR ops engine calculates with, read from the metric dictionary
 * (`ctx.metrics`, docs/METRICS.md) once per context. Every target and threshold the engine and
 * the UI use comes from here, so an edited setting recomputes every number that depends on it.
 *
 * `servicesSettings` reads every setting the view registers on every call (it builds the whole
 * object up front), so a test can show none is left unread.
 */
import { CASE_CATEGORIES, MIN_GROUP } from '@/data/schema'
import { formatParamNumber } from '@/metrics/params'
import { ANONYMITY } from '@/metrics/privacy'
import type { MetricsApi, MetricTarget } from '@/metrics/types'
import { categoryKey, DEFAULTS, levelMetric, M, metrics } from '../metrics'
import { SERVICE_LEVELS, type ServiceLevelDef, type ServiceLevelId } from './catalog'

/** Calendar-hour targets in force by case category name. */
export interface CaseTargets {
  response: ReadonlyMap<string, number>
  resolution: ReadonlyMap<string, number>
}

export interface AtRiskBands {
  /** Points below a percentage target. */
  pts: number
  /** Share above a day target. */
  daysShare: number
  /** Share above a ceiling target, relative to the target. */
  ceilingShare: number
}

export interface ServicesSettings {
  /** The anonymity minimum (privacy.anonymity): 5, or higher when raised. */
  minGroup: number
  caseTargets: CaseTargets
  /** Resolution SLA target (share of cases). */
  resolutionTarget: number
  /** Transactions on-time target (share). */
  onTimeTarget: number
  /** Open cases older than this many days are listed as aging. */
  agedDays: number
  spike: {
    factor: number
    minExtra: number
    baselineMonths: number
    minBase: number
    seasonalFactor: number
    slaFloor: number
    slaDrop: number
  }
  slow: { floor: number; critical: number; minCases: number }
  finalPay: { floor: number; minExits: number; minLate: number }
  newHire: {
    regionFloor: number
    regionGap: number
    siteFloor: number
    siteMinStarts: number
    minLate: number
  }
  csatGap: { gap: number; minResponses: number }
  reopen: { multiple: number; minResolved: number; minReopens: number }
  agedBacklog: { days: number; minCases: number }
  retro: { minChanges: number; warning: number }
  strongest: { floor: number; minCases: number }
  /** The target in force for each Atlas measure in the scorecard. */
  levelTargets: Readonly<Record<ServiceLevelId, number>>
  atRisk: AtRiskBands
  /** Leave & return: look-ahead, horizons and readout thresholds. */
  leave: LeaveSettings
}

export interface LeaveSettings {
  /** Planned returns within this many days after the as-of date are upcoming. */
  aheadDays: number
  /** An upcoming return this close without systems ready is critical. */
  urgentDays: number
  /** Months after a return a person must still be employed (retention cohort horizon). */
  retentionMonths: number
  /** Retention after return target (share). */
  retentionTarget: number
  /** An exit this many months or fewer after a return counts as soon after returning. */
  soonMonths: number
  /** Fewest returners in a group for the retention finding. */
  minReturners: number
  /** Share of soon leavers in one department, and the fewest leavers, for the concentration finding. */
  cluster: { minShare: number; minLeavers: number }
}

type Reader = Pick<MetricsApi, 'num' | 'target'>

/**
 * The settings in force; reads every setting the view registers. The SLA, on-time and service
 * level targets are the metrics' own targets (the dictionary's Target field): required, so they
 * are always there, with the registered value as a fallback for a dictionary without the metric.
 */
export function servicesSettings(m: Reader): ServicesSettings {
  const n = (id: string, key: string) => m.num(id, key)
  const t = (id: string, fallback: number) => m.target(id)?.value ?? fallback
  const byCategory = (id: string) =>
    new Map(CASE_CATEGORIES.map((c) => [c.category, n(id, categoryKey(c.category))] as const))
  return {
    minGroup: n(ANONYMITY.metricId, ANONYMITY.key),
    caseTargets: { response: byCategory(M.responseSla), resolution: byCategory(M.resolutionSla) },
    resolutionTarget: t(M.resolutionSla, DEFAULTS.resolutionTarget),
    onTimeTarget: t(M.onTime, DEFAULTS.onTimeTarget),
    agedDays: n(M.aged, 'days'),
    spike: {
      factor: n(M.spike, 'factor'),
      minExtra: n(M.spike, 'minExtra'),
      baselineMonths: n(M.spike, 'baselineMonths'),
      minBase: n(M.spike, 'minBase'),
      seasonalFactor: n(M.spike, 'seasonalFactor'),
      slaFloor: n(M.spike, 'slaFloor'),
      slaDrop: n(M.spike, 'slaDrop'),
    },
    slow: { floor: n(M.slow, 'floor'), critical: n(M.slow, 'critical'), minCases: n(M.slow, 'minCases') },
    finalPay: {
      floor: n(M.finalPayLate, 'floor'),
      minExits: n(M.finalPayLate, 'minExits'),
      minLate: n(M.finalPayLate, 'minLate'),
    },
    newHire: {
      regionFloor: n(M.newHireGap, 'regionFloor'),
      regionGap: n(M.newHireGap, 'regionGap'),
      siteFloor: n(M.newHireGap, 'siteFloor'),
      siteMinStarts: n(M.newHireGap, 'siteMinStarts'),
      minLate: n(M.newHireGap, 'minLate'),
    },
    csatGap: { gap: n(M.csatGap, 'gap'), minResponses: n(M.csatGap, 'minResponses') },
    reopen: {
      multiple: n(M.reopenHotspot, 'multiple'),
      minResolved: n(M.reopenHotspot, 'minResolved'),
      minReopens: n(M.reopenHotspot, 'minReopens'),
    },
    agedBacklog: { days: n(M.agedBacklog, 'days'), minCases: n(M.agedBacklog, 'minCases') },
    retro: { minChanges: n(M.retroOver, 'minChanges'), warning: n(M.retroOver, 'warning') },
    strongest: { floor: n(M.strongest, 'floor'), minCases: n(M.strongest, 'minCases') },
    levelTargets: Object.fromEntries(
      SERVICE_LEVELS.map((d) => [d.id, t(levelMetric(d.id), d.target)]),
    ) as Record<ServiceLevelId, number>,
    atRisk: {
      pts: n(M.levelStatus, 'atRiskPts'),
      daysShare: n(M.levelStatus, 'atRiskDaysShare'),
      ceilingShare: n(M.levelStatus, 'atRiskCeilingShare'),
    },
    leave: {
      aheadDays: n(M.returnsSoon, 'aheadDays'),
      urgentDays: n(M.returnsSoon, 'urgentDays'),
      retentionMonths: n(M.retention, 'months'),
      retentionTarget: t(M.retention, DEFAULTS.retentionTarget),
      soonMonths: n(M.exitsAfterReturn, 'months'),
      minReturners: n(M.retentionLow, 'minReturners'),
      cluster: { minShare: n(M.exitCluster, 'minShare'), minLeavers: n(M.exitCluster, 'minLeavers') },
    },
  }
}

/** A registered default, for engine functions called without a context (tests, helpers). */
function registeredDefault(id: string, key: string): number {
  if (id === ANONYMITY.metricId && key === ANONYMITY.key) return MIN_GROUP
  const v = metrics.find((d) => d.id === id)?.params.find((p) => p.key === key)?.default
  if (typeof v !== 'number') throw new Error(`No numeric setting "${key}" on "${id}".`)
  return v
}

/** A registered target, for the same callers. */
const registeredTarget = (id: string): MetricTarget | null => metrics.find((d) => d.id === id)?.target ?? null

let defaults: ServicesSettings | null = null

/**
 * The settings at their registered defaults. Only for engine functions called on their own; the
 * view's `compute(ctx)` always reads the dictionary in force.
 */
export function defaultSettings(): ServicesSettings {
  defaults ??= servicesSettings({ num: registeredDefault, target: registeredTarget })
  return defaults
}

/* ───────────── wording ───────────── */

/** A share in words with as many decimals as it needs: "90%", "97.5%". */
export const pctWords = (v: number): string => formatParamNumber(v, { type: 'percent' })

/** A scorecard target as a reader sees it: "≥ 95%", "100%", "< 2% of changes", "≤ 30 d". */
export function levelTargetText(
  def: Pick<ServiceLevelDef, 'unit' | 'direction' | 'strict' | 'targetNoun'>,
  target: number,
): string {
  if (def.unit === 'days')
    return `${def.direction === 'max' ? '≤' : '≥'} ${formatParamNumber(target, { type: 'days' })}`
  const noun = def.targetNoun ? ` ${def.targetNoun}` : ''
  if (def.direction === 'max') return `${def.strict ? '<' : '≤'} ${pctWords(target)}${noun}`
  return target >= 1 ? `${pctWords(target)}${noun}` : `≥ ${pctWords(target)}${noun}`
}

/** The service level with the target in force. */
export function levelDef(def: ServiceLevelDef, cfg: Pick<ServicesSettings, 'levelTargets'>): ServiceLevelDef {
  const target = cfg.levelTargets[def.id] ?? def.target
  return target === def.target ? def : { ...def, target, targetText: levelTargetText(def, target) }
}
