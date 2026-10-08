/**
 * Lineage: the dataset fields each Compensation number is computed from, so its tier (no data,
 * bronze, silver or gold) can be worked out (docs/DATA-TIERS.md). A field that only decides who is
 * counted still counts. An optional field with a fallback (job function, equity in the rewards mix)
 * is listed only when the data has it, so its absence never blanks a number that does not need it.
 * Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { type FieldRef, meetsStandard } from '@/data/quality'
import type { DatasetKey } from '@/data/schema'
import {
  BY,
  COMPA,
  FX,
  MARKET,
  MARKET_VS_MID,
  MERIT,
  PAY_REASON,
  POPULATION,
  POSITION,
  PROMOTED,
  PROMOTION,
  RATING,
  refs,
  VOLUNTARY_ATTRITION,
} from './fields'
import { ANNUAL_CYCLE, type Population } from './population'

export {
  BY,
  COMPA,
  FX,
  MARKET,
  MARKET_VS_MID,
  MERIT,
  PAY_REASON,
  POPULATION,
  POSITION,
  PROMOTED,
  PROMOTION,
  RATING,
  refs,
  VOLUNTARY_ATTRITION,
}

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

type Has = Pick<Population, 'has' | 'annualCycle'>

/** Job function (the job the market prices), which falls back to department for people the roster gives none. */
export const jobUses = (pop: Pick<Population, 'has'>): FieldRef[] =>
  refs(pop.has.jobFunction && 'employees.jobFunction', BY.department)

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
  'comp-pay-attrition',
  'comp-compa-location-level',
  'comp-penetration-by-level',
  'comp-compa-by-tenure',
  'comp-below-min-cause',
  'comp-below-minimum',
  'comp-above-maximum',
  'comp-compression',
  'comp-compa-by-rating',
  'comp-merit-by-rating',
  'comp-merit-matrix',
  'comp-differentiation-by-department',
  'comp-bonus-by-rating',
  'comp-equity-by-rating',
  'comp-market-vs-range',
  'comp-market-by-function',
  'comp-market-by-location',
  'comp-market-by-level',
  'comp-jobs-below-market',
  'comp-spend-by-bu',
  'comp-merit-distribution',
  'comp-guideline-exceptions',
  'comp-promotions',
  'comp-rewards-mix',
  'comp-cycle-progress',
  'comp-cost-by-unit',
  'comp-cost-by-cost-center',
  'comp-cost-by-level',
  'comp-cost-by-site',
  'comp-cost-merit-by-unit',
  'comp-cost-open-reqs',
  'comp-cost-budget-headcount',
  'comp-cost-budget-cost',
  'comp-cost-budget-trend',
  'comp-cost-budget-centers',
] as const
export type FigureId = (typeof FIGURE_IDS)[number]
export type FigureUses = Record<FigureId, readonly FieldRef[]>

/**
 * The fields behind every figure in the view: the chart and every column of its table. Pay
 * amount columns count only while pay amounts are shown.
 */
export function figureUses(m: { pop: Has; showPay: boolean; promotionsShown?: boolean }): FigureUses {
  const { pop, showPay, promotionsShown = true } = m
  const job = jobUses(pop)
  const people = [BY.department, BY.level, BY.location]
  // Compa-ratio tables also count who is below minimum and above maximum.
  const compaTable = refs(COMPA, POSITION)
  const market = refs(MARKET, MARKET_VS_MID)
  // Workforce cost: target cash reads the target bonus; equity only where the data has it.
  const cash = refs(POPULATION, FX, 'comp.targetBonusPct')
  const costParts = refs(cash, pop.has.equity && 'comp.annualEquityUsd')
  const budgetHeads = refs(
    'budget.period',
    'budget.businessUnit',
    'budget.budgetHeadcount',
    'employees.employmentType',
    'employees.hireDate',
    'employees.terminationDate',
    'employees.businessUnit',
  )
  // The run rate adds contractors at the range midpoint of their level and location.
  const budgetCost = refs(
    'budget.period',
    'budget.businessUnit',
    'budget.budgetCost',
    'budget.currency',
    cash,
    'comp.rangeMid',
    'employees.level',
    'employees.location',
  )
  return {
    'comp-compa-distribution': COMPA,
    'comp-position-by-bu': refs(POSITION, BY.businessUnit),
    'comp-compa-by-location': refs(compaTable, BY.location),
    'comp-compa-by-level': refs(compaTable, BY.level),
    'comp-compa-by-department': refs(compaTable, BY.department),
    // One dot per location or department (a switch): both dimensions are read.
    'comp-pay-attrition': refs(COMPA, VOLUNTARY_ATTRITION, BY.location, BY.department),
    'comp-compa-location-level': refs(COMPA, BY.location, BY.level),
    'comp-penetration-by-level': refs(POSITION, BY.level),
    'comp-compa-by-tenure': refs(COMPA, POSITION, BY.tenureBand),
    // Hired in the last 12 months reads the hire date; promoted reads Job changes when they meet the standard.
    'comp-below-min-cause': refs(POSITION, BY.location, BY.tenureBand, promotionsShown && PROMOTED),
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
    'comp-market-vs-range': refs(MARKET_VS_MID, COMPA, job),
    'comp-market-by-function': refs(market, job),
    'comp-market-by-location': refs(market, BY.location),
    'comp-market-by-level': refs(market, BY.level),
    'comp-jobs-below-market': refs(market, job, BY.level),
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
    'comp-cycle-progress': refs(MERIT, FX, BY.businessUnit),
    'comp-cost-by-unit': refs(costParts, BY.businessUnit),
    'comp-cost-by-cost-center': refs(costParts, 'employees.costCenter', BY.department),
    'comp-cost-by-level': refs(cash, BY.level),
    'comp-cost-by-site': refs(cash, BY.location),
    'comp-cost-merit-by-unit': refs(MERIT, FX, BY.businessUnit),
    'comp-cost-open-reqs': refs(
      'requisitions.status',
      'requisitions.level',
      'requisitions.location',
      'requisitions.openings',
      'requisitions.businessUnit',
      'comp.rangeMid',
      FX,
      BY.level,
      BY.location,
    ),
    'comp-cost-budget-headcount': budgetHeads,
    'comp-cost-budget-cost': budgetCost,
    'comp-cost-budget-trend': budgetHeads,
    'comp-cost-budget-centers': refs(budgetCost, budgetHeads, 'budget.costCenter', 'employees.costCenter'),
  }
}
