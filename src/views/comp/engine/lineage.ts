/**
 * Lineage: the dataset fields each Compensation number is computed from, so its tier (no data,
 * bronze, silver or gold) can be worked out (docs/DATA-TIERS.md). A field that only decides who is
 * counted still counts. An optional field with a fallback (job family, equity in the rewards mix)
 * is listed only when the data has it, so its absence never blanks a number that does not need it.
 * Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { type FieldRef, type KnownFieldRef, meetsStandard } from '@/data/quality'
import type { DatasetKey } from '@/data/schema'
import { ANNUAL_CYCLE, type Population } from './population'

type Part = FieldRef | readonly FieldRef[] | false | null | undefined

/** One list from groups and single fields, first mention first, no repeats. */
export function refs(...parts: Part[]): FieldRef[] {
  const out = new Set<FieldRef>()
  for (const p of parts) {
    if (!p) continue
    if (typeof p === 'string') out.add(p)
    else for (const r of p) out.add(r)
  }
  return [...out]
}

/**
 * Field lists checked against the record types at compile time. Each list leads with the fields
 * that define its measure: when several fields tie for the lowest tier, the first one explains
 * the badge, so "Range midpoint is 98% filled" beats "Employee ID is 100% filled".
 */
const known = (...r: KnownFieldRef[]): readonly FieldRef[] => r

/** Who is counted: active employees (headcount type) on the as-of date with a comp row and a base salary. */
export const POPULATION = known(
  'comp.baseSalary',
  'comp.employeeId',
  'employees.employeeId',
  'employees.employmentType',
  'employees.hireDate',
  'employees.terminationDate',
)
/** Compa-ratio: base salary ÷ range midpoint. */
export const COMPA = refs('comp.rangeMid', POPULATION)
/** Range position and penetration: base salary against the range minimum and maximum. */
export const POSITION = refs('comp.rangeMin', 'comp.rangeMax', POPULATION)
/** Market ratio: base salary ÷ market median. */
export const MARKET = refs('comp.marketP50', POPULATION)
/** How the ranges track the market: market median ÷ range midpoint. */
export const MARKET_VS_MID = known('comp.marketP50', 'comp.rangeMid')
/** Merit proposals. */
export const MERIT = refs('comp.meritPct', POPULATION)
export const PROMOTION: KnownFieldRef = 'comp.promotionPct'
/** Every USD amount and USD-weighted rate. */
export const FX: KnownFieldRef = 'comp.fxToUsd'
/** Each person's latest rating on or before the as-of date. */
export const RATING = known('reviews.employeeId', 'reviews.cycleDate', 'reviews.rating')
/** Promoted in the last 12 months, from job changes. */
export const PROMOTED = known('jobChanges.employeeId', 'jobChanges.changeType', 'jobChanges.effectiveDate')
/** Voluntary attrition, as `attrition()` in src/lib/people.ts counts it. */
export const VOLUNTARY_ATTRITION = known(
  'employees.hireDate',
  'employees.terminationDate',
  'employees.terminationType',
  'employees.employmentType',
)
/** Leavers who named pay as the reason. */
export const PAY_REASON: KnownFieldRef = 'employees.terminationReason'

/** The datasets the view reads (its fallback when a number names no fields). */
const COMP_DATASETS: readonly DatasetKey[] = ['comp', 'employees', 'reviews', 'jobChanges']

/** Whether a clause, column or segment may read these fields under the current data standard. */
export type Meets = (uses: FieldRef | readonly FieldRef[]) => boolean

/**
 * A secondary clause, column or segment that reads fields below the data standard is left out
 * (and said so) rather than hiding the whole number it sits beside. Everything shows them all.
 */
export function meetsFor(ctx: Pick<AnalyticsContext, 'quality' | 'standard'>): Meets {
  return (uses) =>
    ctx.standard === 'bronze' ||
    meetsStandard(ctx.quality.tierOf(typeof uses === 'string' ? [uses] : uses, COMP_DATASETS), ctx.standard)
}

/** The roster field behind each way the view groups people. */
export const BY = {
  location: 'employees.location',
  department: 'employees.department',
  businessUnit: 'employees.businessUnit',
  level: 'employees.level',
  tenureBand: 'employees.hireDate',
} as const satisfies Record<string, KnownFieldRef>

type Has = Pick<Population, 'has' | 'annualCycle'>

/** Job family, which falls back to department for people the roster gives none. */
export const familyUses = (pop: Pick<Population, 'has'>): FieldRef[] =>
  refs(pop.has.jobFamily && 'employees.jobFamily', BY.department)

/**
 * The rating in the latest annual cycle. The cycle is found by its name; when no cycle is named
 * annual, by the latest cycle that rated potential.
 */
export function annualRatingUses(annualCycle: string | null): FieldRef[] {
  const byPotential = annualCycle == null || !ANNUAL_CYCLE.test(annualCycle)
  return refs(RATING, 'reviews.cycle', byPotential && 'reviews.potential')
}

/** A grouping dimension a finding names ("41 are in Bengaluru", "were promoted"). */
export function dimUses(dim: string | undefined): readonly FieldRef[] {
  if (dim === 'promoted') return PROMOTED
  return dim && dim in BY ? [BY[dim as keyof typeof BY]] : []
}

export const FIGURE_IDS = [
  'comp-compa-distribution',
  'comp-position-by-bu',
  'comp-compa-by-location',
  'comp-compa-by-level',
  'comp-compa-by-department',
  'comp-penetration-by-level',
  'comp-compa-by-tenure',
  'comp-below-minimum',
  'comp-above-maximum',
  'comp-compression',
  'comp-compa-by-rating',
  'comp-merit-by-rating',
  'comp-merit-matrix',
  'comp-differentiation-by-department',
  'comp-bonus-by-rating',
  'comp-equity-by-rating',
  'comp-market-by-family',
  'comp-market-by-location',
  'comp-market-by-level',
  'comp-jobs-below-market',
  'comp-spend-by-bu',
  'comp-merit-distribution',
  'comp-guideline-exceptions',
  'comp-promotions',
  'comp-rewards-mix',
] as const
export type FigureId = (typeof FIGURE_IDS)[number]
export type FigureUses = Record<FigureId, readonly FieldRef[]>

/**
 * The fields behind every figure in the view: the chart and every column of its table. Pay
 * amount columns count only while pay amounts are shown.
 */
export function figureUses(m: { pop: Has; showPay: boolean; promotionsShown?: boolean }): FigureUses {
  const { pop, showPay, promotionsShown = true } = m
  const family = familyUses(pop)
  const people = [BY.department, BY.level, BY.location]
  // Compa-ratio tables also count who is below minimum and above maximum.
  const compaTable = refs(COMPA, POSITION)
  const market = refs(MARKET, MARKET_VS_MID)
  return {
    'comp-compa-distribution': COMPA,
    'comp-position-by-bu': refs(POSITION, BY.businessUnit),
    'comp-compa-by-location': refs(compaTable, BY.location),
    'comp-compa-by-level': refs(compaTable, BY.level),
    'comp-compa-by-department': refs(compaTable, BY.department),
    'comp-penetration-by-level': refs(POSITION, BY.level),
    'comp-compa-by-tenure': refs(COMPA, POSITION, BY.tenureBand),
    // The "Promoted in last 12 months" column drops out when Job changes are below the standard.
    'comp-below-minimum': refs(POSITION, 'comp.rangeMid', people, promotionsShown && PROMOTED, showPay && FX),
    'comp-above-maximum': refs(POSITION, 'comp.rangeMid', people, BY.tenureBand, showPay && FX),
    'comp-compression': refs(COMPA, BY.department, BY.level, BY.tenureBand),
    'comp-compa-by-rating': refs(COMPA, RATING),
    'comp-merit-by-rating': refs(MERIT, RATING),
    'comp-merit-matrix': refs(MERIT, RATING, POSITION),
    'comp-differentiation-by-department': refs(MERIT, RATING, BY.department),
    'comp-bonus-by-rating': refs('comp.bonusPayoutPct', annualRatingUses(pop.annualCycle), POPULATION),
    'comp-equity-by-rating': refs('comp.annualEquityUsd', FX, RATING, POPULATION),
    'comp-market-by-family': refs(market, family),
    'comp-market-by-location': refs(market, BY.location),
    'comp-market-by-level': refs(market, BY.level),
    'comp-jobs-below-market': refs(market, family, BY.level),
    'comp-spend-by-bu': refs(MERIT, FX, BY.businessUnit),
    'comp-merit-distribution': MERIT,
    'comp-guideline-exceptions': refs(MERIT, RATING, BY.department, BY.level, PROMOTION),
    'comp-promotions': refs(PROMOTION, 'comp.meritPct', RATING, BY.department, BY.level, POPULATION),
    'comp-rewards-mix': refs(
      'comp.targetBonusPct',
      pop.has.equity && 'comp.annualEquityUsd',
      FX,
      BY.level,
      POPULATION,
    ),
  }
}
