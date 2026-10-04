/**
 * The thresholds the Org chart calculates with, read from the metric dictionary (`ctx.metrics`)
 * instead of constants, so a changed setting changes every number, label and warning that uses it:
 * the flags, the Layers tile, the detail panel, the exit simulation and the reorg sandbox.
 *
 * Counts compare against whole numbers, so a setting of 12.5 direct reports behaves like 13 (and
 * the labels say 13+): "at least" thresholds round up, "at most" thresholds round down.
 */
import { defaultMetrics } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { ORG_PARAM } from '../metrics'

export interface OrgRules {
  /** Wide span: this many direct reports or more. */
  wideSpan: number
  /** Narrow span: at least one direct report and no more than this many. */
  narrowSpan: number
  /** Single-report chain: the only report leads this many people or more. */
  chainMinBelow: number
  /** New manager: started managing within this many months of the as-of date. */
  newManagerMonths: number
  /** ...with this many direct reports or more. */
  largeTeam: number
  /** New hire: hired within this many days of the as-of date. */
  newHireDays: number
  /** Deep chain: people below this layer (the top of the org is layer 1). */
  deepChain: number
  /** The detail panel counts exits over this many months. */
  exitMonths: number
  /** The exit simulation lists direct reports rated at least this. */
  backfillRating: number
  /** The anonymity minimum: averages over fewer people are hidden. */
  minGroup: number
}

type NumReader = Pick<MetricsApi, 'num'>

const cache = new WeakMap<NumReader, OrgRules>()

/** The rules in force for a dictionary (yours, or the defaults). One object per dictionary. */
export function orgRules(m: NumReader): OrgRules {
  const hit = cache.get(m)
  if (hit) return hit
  const num = (p: { metricId: string; key: string }) => m.num(p.metricId, p.key)
  const atLeast = (p: { metricId: string; key: string }) => Math.ceil(num(p) - 1e-9)
  const atMost = (p: { metricId: string; key: string }) => Math.floor(num(p) + 1e-9)
  const rules: OrgRules = Object.freeze({
    wideSpan: atLeast(ORG_PARAM.wideSpan),
    narrowSpan: atMost(ORG_PARAM.narrowSpan),
    chainMinBelow: atLeast(ORG_PARAM.chainMinBelow),
    newManagerMonths: Math.round(num(ORG_PARAM.newManagerMonths)),
    largeTeam: atLeast(ORG_PARAM.largeTeam),
    newHireDays: Math.round(num(ORG_PARAM.newHireDays)),
    deepChain: atMost(ORG_PARAM.deepChain),
    exitMonths: Math.round(num(ORG_PARAM.exitMonths)),
    backfillRating: atLeast(ORG_PARAM.backfillRating),
    minGroup: Math.ceil(minGroupOf(m) - 1e-9),
  })
  cache.set(m, rules)
  return rules
}

/** The rules at the dictionary defaults (engine calls and tests made without a context). */
export const defaultOrgRules = (): OrgRules => orgRules(defaultMetrics())

/* ───────── wording that carries the values in force ───────── */

/** "4 or 5", "5", "3 to 5": the ratings at or above a minimum, on the 1-5 scale. */
export function ratingsFrom(min: number): string {
  if (min >= 5) return '5'
  if (min === 4) return '4 or 5'
  return `${Math.max(1, min)} to 5`
}

/** "Span of 1", or "Span of 2 or fewer" when the narrow-span setting is raised. */
export const narrowSpanLabel = (r: Pick<OrgRules, 'narrowSpan'>): string =>
  r.narrowSpan <= 1 ? 'Span of 1' : `Span of ${r.narrowSpan} or fewer`

/** "Wide span (12+)". */
export const wideSpanLabel = (r: Pick<OrgRules, 'wideSpan'>): string => `Wide span (${r.wideSpan}+)`

/** "months" with its number: "12 months", "1 month". */
export const monthsText = (n: number): string => `${n} ${n === 1 ? 'month' : 'months'}`
