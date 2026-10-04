/**
 * Every setting the Compensation engine calculates with, read once per dictionary through
 * `ctx.metrics` (docs/METRICS.md). Nothing in the engine or the tabs holds a threshold of its
 * own: the defaults live in `../metrics.ts`, and a change in Metric definitions reaches every
 * number, chart mark and readout sentence through this object. Pure.
 */
import { defaultMetrics } from '@/metrics/api'
import { cycleSettingsOf } from '@/metrics/compCycle'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { M } from '../metrics'
import type { CycleSettings } from './settings'

export interface CompRules {
  /** Merit budget, healthy compa-ratio band and merit guideline by rating. */
  cycle: CycleSettings
  /** The anonymity minimum: statistics over fewer people are hidden. */
  minGroup: number
  compaMedian: { material: number }
  inBand: { material: number; goodShare: number }
  lowCompa: { threshold: number; attritionGap: number }
  belowMin: { material: number; criticalShare: number; criticalCount: number }
  aboveMax: { material: number }
  increaseToMin: { largeGap: number }
  /** `minGroup` is never below the anonymity minimum. */
  compression: { minGroup: number; gap: number; findingMin: number }
  /** `material` colors the merit spend tile's gap to the budget. */
  overBudget: { material: number; flag: number; critical: number }
  exceptions: { topRatingFloor: number; lowRatingCap: number; outlierZ: number; outlierMinPeers: number }
  differentiation: { floor: number; strong: number; material: number }
  marketMedian: { material: number }
  /** `minFamily` is never below the anonymity minimum. */
  marketGap: { minFamily: number; jobWatch: number }
  belowMarket: { threshold: number; rangeGap: number }
}

export type ExceptionRules = CompRules['exceptions']

type Reader = Pick<MetricsApi, 'num' | 'range' | 'ratings'>

function read(m: Reader, cycle: CycleSettings | undefined): CompRules {
  const n = (id: string, key: string) => m.num(id, key)
  const minGroup = minGroupOf(m)
  return {
    cycle: cycle ?? cycleSettingsOf(m),
    minGroup,
    compaMedian: { material: n(M.compaMedian, 'material') },
    inBand: { material: n(M.inBand, 'material'), goodShare: n(M.inBand, 'goodShare') },
    lowCompa: { threshold: n(M.lowCompa, 'threshold'), attritionGap: n(M.lowCompa, 'attritionGap') },
    belowMin: {
      material: n(M.belowMin, 'material'),
      criticalShare: n(M.belowMin, 'criticalShare'),
      criticalCount: n(M.belowMin, 'criticalCount'),
    },
    aboveMax: { material: n(M.aboveMax, 'material') },
    increaseToMin: { largeGap: n(M.increaseToMin, 'largeGap') },
    compression: {
      minGroup: Math.max(minGroup, n(M.compression, 'minGroup')),
      gap: n(M.compression, 'gap'),
      findingMin: n(M.compression, 'findingMin'),
    },
    overBudget: {
      material: n(M.overBudget, 'material'),
      flag: n(M.overBudget, 'flag'),
      critical: n(M.overBudget, 'critical'),
    },
    exceptions: {
      topRatingFloor: n(M.exceptions, 'topRatingFloor'),
      lowRatingCap: n(M.exceptions, 'lowRatingCap'),
      outlierZ: n(M.exceptions, 'outlierZ'),
      outlierMinPeers: n(M.exceptions, 'outlierMinPeers'),
    },
    differentiation: {
      floor: n(M.differentiation, 'floor'),
      strong: n(M.differentiation, 'strong'),
      material: n(M.differentiation, 'material'),
    },
    marketMedian: { material: n(M.marketMedian, 'material') },
    marketGap: {
      minFamily: Math.max(minGroup, n(M.marketGap, 'minFamily')),
      jobWatch: n(M.marketGap, 'jobWatch'),
    },
    belowMarket: { threshold: n(M.belowMarket, 'threshold'), rangeGap: n(M.belowMarket, 'rangeGap') },
  }
}

const cache = new WeakMap<object, CompRules>()

/**
 * The settings in force. One object per dictionary, so models memoized on it stay put. `cycle`
 * replaces the three cycle settings (engine tests that pass their own); every other setting
 * still comes from the dictionary.
 */
export function compRulesOf(m: Reader, cycle?: CycleSettings): CompRules {
  if (cycle) return read(m, cycle)
  let r = cache.get(m)
  if (!r) {
    r = read(m, undefined)
    cache.set(m, r)
  }
  return r
}

/**
 * The registered defaults, for the pure helpers' default arguments (engine tests call them
 * directly). The model always passes the rules in force.
 */
export const defaultRules = (): CompRules => compRulesOf(defaultMetrics())

/** Two-decimal compa-ratio at or below the low threshold. */
export const lowCompaAt = (median: number | null | undefined, threshold: number): boolean =>
  median != null && Math.round(median * 100) / 100 <= threshold + 1e-9

/** The median market ratio at or below which a job family is below market. */
export const marketFlag = (r: Pick<CompRules, 'belowMarket'>): number => 1 - r.belowMarket.threshold
