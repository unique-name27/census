/**
 * Engineering by stage's calculation settings, read from the metric dictionary (`ctx.metrics`)
 * when the engine uses them, never from constants (docs/METRICS.md). Each value is a getter, so a
 * dictionary that records reads (`recordParamReads` in tests) sees exactly which settings a number
 * used, and the same dictionary always gives the same object.
 */
import { defaultMetrics } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { STAGES_SET as SET } from './metrics'

export interface StagesSettings {
  /** The anonymity minimum (`privacy.anonymity`): 5, or higher when raised. */
  readonly minGroup: number
  /** Interns count with employees (headcount, FTE, ratios); off: listed in the table only. */
  readonly countInterns: boolean
  /** Months of hiring plan starts that count as planned, from the month after the as-of date. */
  readonly planMonths: number
  /** Contractors count in both stages of every ratio. */
  readonly ratioContractors: boolean
  /** Each ratio's reference; 0 is none. */
  readonly references: {
    readonly verification: number
    readonly dft: number
    readonly physical: number
    readonly postSilicon: number
    readonly software: number
  }
  /** The readout's thresholds (fractions). */
  readonly findings: {
    readonly belowBy: number
    readonly concentration: number
    readonly contractorShare: number
    readonly unmappedShare: number
    readonly attritionGap: number
  }
}

function lazy<T extends Record<string, () => unknown>>(
  getters: T,
): { readonly [K in keyof T]: ReturnType<T[K]> } {
  const out = {}
  for (const [key, get] of Object.entries(getters)) Object.defineProperty(out, key, { get, enumerable: true })
  return out as { readonly [K in keyof T]: ReturnType<T[K]> }
}

const cache = new WeakMap<MetricsApi, StagesSettings>()

export function stagesSettings(m: MetricsApi): StagesSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const num = (r: { metricId: string; key: string }) => () => m.num(r.metricId, r.key)
  const flag = (r: { metricId: string; key: string }) => () => m.flag(r.metricId, r.key)
  const s: StagesSettings = lazy({
    minGroup: () => minGroupOf(m),
    countInterns: flag(SET.countInterns),
    planMonths: num(SET.planMonths),
    ratioContractors: flag(SET.ratioContractors),
    references: () =>
      lazy({
        verification: num(SET.verificationReference),
        dft: num(SET.dftReference),
        physical: num(SET.physicalReference),
        postSilicon: num(SET.postSiliconReference),
        software: num(SET.softwareReference),
      }),
    findings: () =>
      lazy({
        belowBy: num(SET.belowBy),
        concentration: num(SET.concentration),
        contractorShare: num(SET.contractorShare),
        unmappedShare: num(SET.unmappedShare),
        attritionGap: num(SET.attritionGap),
      }),
  })
  cache.set(m, s)
  return s
}

/** The registry's defaults, for helpers called without a context. */
export const defaultStagesSettings = (): StagesSettings => stagesSettings(defaultMetrics())
