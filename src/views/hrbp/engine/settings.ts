/**
 * The calculation settings of People stats, read from the metric dictionary (`ctx.metrics`,
 * docs/METRICS.md) instead of constants. Each value is a getter that reads its setting when the
 * engine uses it, so a dictionary that records reads (`recordParamReads` in tests) sees exactly
 * which settings a calculation used, and a changed setting changes every number built on it.
 *
 * Helpers that tests call without settings fall back to `defaultSettings()`: the registry's own
 * defaults, so the defaults have one home (`../metrics.ts`).
 */
import type { Employee } from '@/data/schema'
import type { Window } from '@/data/scope'
import type { RateResult } from '@/lib/people'
import { defaultMetrics } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { type RegrettedRule, SET, type SettingRef } from '../metrics'
import { attrition, type Counts, countsFor, type ExitKind, type RateOptions } from './population'

export interface HrbpSettings {
  /** The anonymity minimum (`privacy.anonymity`): 5, or higher when raised. */
  readonly minGroup: number
  /** Contractors count as employees in headcount, flows and every rate. */
  readonly countContractors: boolean
  /** Turnover rates are scaled by 12 ÷ window months. */
  readonly annualize: boolean
  /** What counts as a regretted exit. */
  readonly regretted: RegrettedRule
  /** A first-year leaver left within this many days of their hire date. */
  readonly firstYearDays: number
  /** The reference tick of the engineering share meter (a fraction). */
  readonly engineeringReference: number
  /** A manager is new for this many months after they started managing (the Org chart's window). */
  readonly newManagerMonths: number
  readonly managerFlag: { readonly overloaded: number; readonly heavy: number; readonly light: number }
  /** A single-report chain needs this many people below the only report. */
  readonly chainMinBelow: number
  /** When a scorecard cell is materially off the company. */
  readonly offCompany: {
    readonly rateFloor: number
    readonly relative: number
    readonly spanFloor: number
    readonly minHeadcount: number
  }
  /** The floor a tile's change must clear to be colored: relative × |reference| + absolute. */
  readonly material: { readonly relative: number; readonly absolute: number }
  readonly regrettedCluster: {
    readonly minExits: number
    readonly criticalExits: number
    /** Stay conversations with the rest of the team are due this many days after the latest exit. */
    readonly stayWithinDays: number
  }
  readonly voluntaryAbove: {
    readonly gap: number
    readonly minAvgHeadcount: number
    readonly minExits: number
    readonly criticalRatio: number
    readonly criticalExits: number
  }
  readonly firstYearHigh: {
    readonly threshold: number
    readonly minHires: number
    readonly minLeavers: number
  }
  /** The Org chart's wide span (at or above) and narrow span (at or below). */
  readonly spanOutliers: { readonly wide: number; readonly narrow: number }
  readonly newManagers: { readonly minTeam: number; readonly warnTeam: number }
  /** People below the Org chart's deep-chain layer (the top is layer 1) are flagged. */
  readonly orgDepth: { readonly deepChain: number; readonly warnLayers: number }
  /** Department growth in 6 months that is flagged. */
  readonly rapidGrowth: number
  readonly newHires: { readonly share: number; readonly minTeam: number; readonly warnShare: number }
  readonly unevenGrowth: { readonly minGrowth: number; readonly minAdded: number }
}

/** An object whose every property is a getter: nothing is read until it is used. */
function lazy<T extends Record<string, () => unknown>>(
  getters: T,
): { readonly [K in keyof T]: ReturnType<T[K]> } {
  const out = {}
  for (const [key, get] of Object.entries(getters)) Object.defineProperty(out, key, { get, enumerable: true })
  return out as { readonly [K in keyof T]: ReturnType<T[K]> }
}

const cache = new WeakMap<MetricsApi, HrbpSettings>()

/** The settings in force in a dictionary; the same dictionary always gives the same object. */
export function settingsOf(m: MetricsApi): HrbpSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const num = (r: SettingRef) => () => m.num(r.metricId, r.key)
  const flag = (r: SettingRef) => () => m.flag(r.metricId, r.key)
  const s: HrbpSettings = lazy({
    minGroup: () => minGroupOf(m),
    countContractors: flag(SET.countContractors),
    annualize: flag(SET.annualize),
    regretted: (): RegrettedRule =>
      m.choice(SET.regrettedRule.metricId, SET.regrettedRule.key) === 'anyFlagged'
        ? 'anyFlagged'
        : 'voluntaryFlagged',
    firstYearDays: num(SET.firstYearDays),
    engineeringReference: num(SET.engineeringReference),
    newManagerMonths: num(SET.newManagerMonths),
    managerFlag: () =>
      lazy({
        // Overloaded is the Org chart's wide span: one threshold, one home.
        overloaded: num(SET.wideSpan),
        heavy: num(SET.flagHeavy),
        light: num(SET.flagLight),
      }),
    chainMinBelow: num(SET.chainMinBelow),
    offCompany: () =>
      lazy({
        rateFloor: num(SET.offRateFloor),
        relative: num(SET.offRelative),
        spanFloor: num(SET.offSpanFloor),
        minHeadcount: num(SET.offMinHeadcount),
      }),
    material: () => lazy({ relative: num(SET.materialRelative), absolute: num(SET.materialAbsolute) }),
    regrettedCluster: () =>
      lazy({
        minExits: num(SET.clusterMinExits),
        criticalExits: num(SET.clusterCriticalExits),
        stayWithinDays: num(SET.clusterStayDays),
      }),
    voluntaryAbove: () =>
      lazy({
        gap: num(SET.aboveGap),
        minAvgHeadcount: num(SET.aboveMinAvgHeadcount),
        minExits: num(SET.aboveMinExits),
        criticalRatio: num(SET.aboveCriticalRatio),
        criticalExits: num(SET.aboveCriticalExits),
      }),
    firstYearHigh: () =>
      lazy({
        threshold: num(SET.firstYearThreshold),
        minHires: num(SET.firstYearMinHires),
        minLeavers: num(SET.firstYearMinLeavers),
      }),
    spanOutliers: () => lazy({ wide: num(SET.wideSpan), narrow: num(SET.narrowSpan) }),
    newManagers: () => lazy({ minTeam: num(SET.newManagersMinTeam), warnTeam: num(SET.newManagersWarnTeam) }),
    orgDepth: () => lazy({ deepChain: num(SET.deepChain), warnLayers: num(SET.depthWarnLayers) }),
    rapidGrowth: num(SET.rapidGrowth),
    newHires: () =>
      lazy({
        share: num(SET.newHiresShare),
        minTeam: num(SET.newHiresMinTeam),
        warnShare: num(SET.newHiresWarnShare),
      }),
    unevenGrowth: () => lazy({ minGrowth: num(SET.unevenMinGrowth), minAdded: num(SET.unevenMinAdded) }),
  })
  cache.set(m, s)
  return s
}

/** The registry's defaults, for helpers called without a context (tests, pure utilities). */
export const defaultSettings = (): HrbpSettings => settingsOf(defaultMetrics())

/** Who People stats counts in headcount and every rate (employees, plus contractors when switched on). */
export const peopleStatsCounts = (m: MetricsApi): Counts => countsFor(settingsOf(m).countContractors)

/**
 * Attrition as People stats measures it, with its population, annualizing and regretted
 * settings, for another tab that quotes it (the Compensation readout): the same number, whatever
 * the settings, on every tab.
 */
export function peopleStatsAttrition(
  m: MetricsApi,
  employees: readonly Employee[],
  w: Window,
  kind: ExitKind,
  opts: Pick<RateOptions, 'exitDataPresent'> = {},
): RateResult {
  const s = settingsOf(m)
  return attrition(employees, w, kind, {
    counts: countsFor(s.countContractors),
    annualize: s.annualize,
    // Read only when it matters, so a voluntary rate depends on no regretted setting.
    ...(kind === 'regretted' ? { regretted: s.regretted } : {}),
    ...opts,
  })
}
