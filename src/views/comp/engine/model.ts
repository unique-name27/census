/**
 * computeComp(ctx): every number the Compensation view shows, computed once per analytics
 * context. Every threshold and setting comes from the metric dictionary (`ctx.metrics`, read in
 * `rules.ts`), and the KPI and figure wording from its definitions (`definitions.ts`). Pure (no
 * React, no DOM).
 */
import type { Definition } from '@/charts/types'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { BELOW_STANDARD_TEXT } from '@/data/quality'
import { SAMPLE_AS_OF } from '@/data/sample'
import { type ISODate, LEVELS } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { minGroupOf } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import {
  type BelowCause,
  belowMinByCause,
  type CompaGrid,
  compaGrid,
  type JobPosition,
  jobMarketPosition,
  type PayAttrition,
  payAttrition,
} from './charts'
import {
  type Bin,
  binBy,
  binDomain,
  type ExceptionRow,
  guidelineExceptions,
  meritSpend,
  type PromotionRow,
  promotions,
  type RewardsMixRow,
  ratingPeerStats,
  rewardsMix,
  type SpendRow,
  type SpendSummary,
  spendBy,
} from './cycle'
import { figureDefinitions } from './definitions'
import { tagFindings } from './drillUses'
import { buildFindings } from './findings'
import { tagDim } from './groupFilter'
import { safeMedian, values } from './groups'
import { buildCycleKpis, buildKpis } from './kpis'
import { type FigureId, type FigureUses, figureUses, meetsFor, PROMOTED } from './lineage'
import {
  type JobMarketRow,
  jobsBelowMarket,
  type MarketRow,
  marketBy,
  marketByLevel,
  marketLowest,
  marketTotal,
} from './market'
import {
  type BonusByRatingRow,
  bonusByRating,
  type CompaByRatingRow,
  compaByRating,
  type Differentiation,
  type DifferentiationRow,
  differentiation,
  differentiationBy,
  type EquityByRatingRow,
  equityByRating,
  type MatrixCell,
  type MeritByRatingRow,
  meritByRating,
  meritMatrix,
  type RatingDot,
  ratingDots,
} from './performance'
import { buildPopulation, type CompPerson, type Population } from './population'
import {
  aboveMaximum,
  belowMinimum,
  type CompaGroupRow,
  type CompressionRow,
  compaBy,
  compression,
  costToMinimum,
  type OutsideRangeRow,
  type PenetrationRow,
  type PositionMixRow,
  penetrationByLevel,
  positionMix,
  positionTotal,
  type TenureDot,
  tenureDots,
} from './ranges'
import { type CompRules, compRulesOf } from './rules'
import type { CycleSettings } from './settings'

export interface PersonRow {
  id: string
  name: string
  department: string
  level: string
  location: string
  compa: number | null
  position: string
}

export interface CompModel {
  /** The cycle settings in force (merit budget, healthy band, guideline): `rules.cycle`. */
  settings: CycleSettings
  /** Every setting in force, from the metric dictionary. */
  rules: CompRules
  /** The metric dictionary the wording comes from (with your changes). */
  metrics: Pick<MetricsApi, 'def'>
  /** Each figure's definitions panel, from the dictionary. */
  definitions: Record<FigureId, Definition[]>
  asOf: string
  /**
   * The date the pay data describes, when known: the sample's reference date, or the day the
   * Compensation file was imported. Comp rows carry no effective date of their own.
   */
  payAsOf: ISODate | null
  /** People are counted on a date more than a month away from the pay data (an as-of override, or an old upload). */
  payStale: boolean
  /** "Whole company", or the filters in words: the scope line of every drill-down. */
  scopeLabel: string
  pop: Population
  /** The whole company (the same object when no org filter is set). */
  company: Population
  isCompany: boolean
  showPay: boolean
  /**
   * Job changes meet the data standard, so "promoted in the last 12 months" may be read into
   * gold numbers. Below it, the promoted column and segment drop out and say why.
   */
  promotionsShown: boolean
  /** "Not yet confirmed for production": why a clause or column below the standard is left out. */
  belowStandard: string
  kpis: Kpi[]
  findings: Finding[]
  /** The dataset fields behind each figure, by figure id (for its tier). */
  uses: FigureUses
  overview: {
    hist: Bin<CompPerson>[]
    histDomain: [number, number] | null
    median: number | null
    /** Company median, for the reference rule when a filter is on. */
    companyMedian: number | null
    people: PersonRow[]
    positionByBu: PositionMixRow[]
    positionAll: PositionMixRow
    byLocation: CompaGroupRow[]
    byLevel: CompaGroupRow[]
    byDepartment: CompaGroupRow[]
    /** Median compa-ratio against voluntary attrition, per location and per department. */
    payAttrition: { location: PayAttrition; department: PayAttrition }
    /** Median compa-ratio by location and level group. */
    compaGrid: CompaGrid
  }
  ranges: {
    penetration: PenetrationRow[]
    below: OutsideRangeRow[]
    above: OutsideRangeRow[]
    costToMin: { usd: number; skipped: number }
    tenure: TenureDot[]
    compression: CompressionRow[]
    /** Below minimum by location and cause (promoted, hired, neither). */
    belowCause: BelowCause
  }
  performance: {
    compaByRating: CompaByRatingRow[]
    ratingDots: RatingDot[]
    meritByRating: MeritByRatingRow[]
    matrix: MatrixCell[]
    differentiation: Differentiation
    companyDifferentiation: Differentiation
    byDepartment: DifferentiationRow[]
    bonus: BonusByRatingRow[]
    equity: EquityByRatingRow[]
  }
  market: {
    total: MarketRow
    /** By job function (department where the roster has none). */
    byJob: MarketRow[]
    /** The 15 job functions furthest below market plus Other, for the chart. */
    jobChart: MarketRow[]
    byLocation: MarketRow[]
    byLevel: MarketRow[]
    jobs: JobMarketRow[]
    /** Job functions: market median ÷ midpoint against median compa-ratio. */
    jobPosition: JobPosition
  }
  cycle: {
    kpis: Kpi[]
    spend: SpendSummary
    companySpend: SpendSummary
    byBu: SpendRow[]
    hist: Bin<CompPerson>[]
    histDomain: [number, number] | null
    exceptions: ExceptionRow[]
    promotions: { rows: PromotionRow[]; share: number | null; median: number | null }
    mix: RewardsMixRow[]
  }
}

/** Histogram bin width: 0.02 keeps every edge exact at the two decimals compa-ratios are read at. */
export const COMPA_STEP = 0.02
/** Pay data this many days away from the as-of date is called out in every note. */
export const PAY_SNAPSHOT_TOLERANCE = 31

/** The date the Compensation data describes, or null when nothing says. */
export function payAsOfDate(ctx: Pick<AnalyticsContext, 'sources'>): ISODate | null {
  const src = ctx.sources?.comp
  if (!src) return null
  if (src.kind === 'sample') return SAMPLE_AS_OF
  return src.importedAt && /^\d{4}-\d{2}-\d{2}/.test(src.importedAt) ? src.importedAt.slice(0, 10) : null
}
export const MERIT_STEP = 0.0025

function personRows(people: readonly CompPerson[]): PersonRow[] {
  return people
    .filter((p) => p.compa != null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level ?? '',
      location: p.location,
      compa: p.compa,
      position: p.position ?? '',
    }))
}

/**
 * Every number the view shows. The settings come from `ctx.metrics`; `settings`, when given,
 * replaces only the three cycle settings (engine tests that pass their own).
 */
export function computeComp(ctx: AnalyticsContext, settings?: CycleSettings): CompModel {
  const pop = buildPopulation(ctx.data, ctx.asOf)
  const payAsOf = payAsOfDate(ctx)
  const payStale = payAsOf != null && Math.abs(daysBetween(payAsOf, ctx.asOf)) > PAY_SNAPSHOT_TOLERANCE
  const company = ctx.isCompany ? pop : buildPopulation(ctx.all, ctx.asOf)
  const people = pop.people
  const rules = compRulesOf(ctx.metrics, settings)
  const s = rules.cycle
  const min = rules.minGroup

  const compas = values(people, (p) => p.compa)
  const histDomain = binDomain(compas, COMPA_STEP)
  const merits = values(people, (p) => p.merit)
  const meritDomain = binDomain(merits, MERIT_STEP)
  const valued = people.filter((p) => p.compa != null)
  const proposed = people.filter((p) => p.merit != null)
  const below = belowMinimum(people)
  const promotionsShown = meetsFor(ctx)(PROMOTED)
  const companyMedian = safeMedian(
    values(company.people, (p) => p.compa),
    min,
  )

  const performance = {
    compaByRating: compaByRating(people, min),
    ratingDots: ratingDots(people),
    meritByRating: meritByRating(people, s, min),
    matrix: meritMatrix(people, s, min),
    differentiation: differentiation(people, min),
    companyDifferentiation: ctx.isCompany
      ? differentiation(people, min)
      : differentiation(company.people, min),
    byDepartment: tagDim(
      'department',
      differentiationBy(people, (p) => p.department, min),
    ),
    bonus: bonusByRating(people, min),
    equity: equityByRating(people, min),
  }
  const spend = meritSpend(people, s, min)
  const companySpend = ctx.isCompany ? spend : meritSpend(company.people, s, min)
  const cycle = {
    spend,
    companySpend,
    byBu: tagDim(
      'businessUnit',
      spendBy(people, (p) => p.businessUnit, s, min),
    ),
    hist: meritDomain ? binBy(proposed, (p) => p.merit!, meritDomain[0], meritDomain[1], MERIT_STEP) : [],
    histDomain: meritDomain,
    exceptions: guidelineExceptions(people, s, ratingPeerStats(company.people), rules.exceptions),
    promotions: promotions(people, min),
    mix: rewardsMix(people, pop.has.equity, min),
  }
  const ranges = {
    penetration: penetrationByLevel(people, min),
    below,
    above: aboveMaximum(people),
    costToMin: costToMinimum(below),
    tenure: tenureDots(people),
    compression: compression(people, rules.compression.minGroup, rules.compression.gap),
    belowCause: belowMinByCause(people, promotionsShown),
  }
  const market = {
    total: marketTotal(people, 'All', min),
    byJob: marketBy(people, (p) => p.job, undefined, min),
    jobChart: marketLowest(people, (p) => p.job, 15, rules.marketGap.minFunction, min),
    byLocation: tagDim(
      'location',
      marketBy(people, (p) => p.location, undefined, min),
    ),
    byLevel: tagDim('level', marketByLevel(people, min)),
    jobs: jobsBelowMarket(people, 15, min),
    jobPosition: jobMarketPosition(people, min),
  }
  const overview = {
    hist: histDomain ? binBy(valued, (p) => p.compa!, histDomain[0], histDomain[1], COMPA_STEP) : [],
    histDomain,
    median: safeMedian(compas, min),
    companyMedian,
    people: personRows(people),
    positionByBu: tagDim(
      'businessUnit',
      positionMix(people, (p) => p.businessUnit, undefined, min),
    ),
    positionAll: positionTotal(people, ctx.isCompany ? 'Whole company' : ctx.scopeLabel, min),
    // Breakdowns by an org filter carry it, so their records offer "Filter to" the group.
    byLocation: tagDim(
      'location',
      compaBy(people, (p) => p.location, s, undefined, min),
    ),
    byLevel: tagDim(
      'level',
      compaBy(people, (p) => p.level, s, LEVELS, min),
    ),
    byDepartment: tagDim(
      'department',
      compaBy(people, (p) => p.department, s, undefined, min),
    ),
    payAttrition: {
      location: payAttrition(ctx, people, 'location', min, companyMedian),
      department: payAttrition(ctx, people, 'department', min, companyMedian),
    },
    compaGrid: compaGrid(people, min),
  }

  const scopeLabel = ctx.isCompany ? 'Whole company' : ctx.scopeLabel
  const cycleModel = {
    ...cycle,
    kpis: buildCycleKpis(
      pop,
      cycle,
      { scopeLabel, asOf: ctx.asOf, settings: s, pop },
      { rules, metrics: ctx.metrics },
    ),
  }
  const core = {
    settings: s,
    rules,
    metrics: ctx.metrics,
    definitions: figureDefinitions(ctx.metrics, rules),
    asOf: ctx.asOf,
    payAsOf,
    payStale,
    scopeLabel,
    pop,
    company,
    isCompany: ctx.isCompany,
    showPay: ctx.showPay,
    promotionsShown,
    belowStandard: BELOW_STANDARD_TEXT[ctx.standard],
    overview,
    ranges,
    performance,
    market,
    cycle: cycleModel,
  }
  return {
    ...core,
    kpis: buildKpis(core, spend),
    findings: tagFindings(buildFindings(ctx, core)),
    uses: figureUses(core),
  }
}

const cache = new WeakMap<AnalyticsContext, CompModel>()

/**
 * The model for an analytics context with the settings in force, built once per context (the
 * view, the Scorecard and the Action center share it).
 */
export function compModel(ctx: AnalyticsContext): CompModel {
  let m = cache.get(ctx)
  if (!m) {
    m = computeComp(ctx)
    cache.set(ctx, m)
  }
  return m
}

/** Folder-tab headline: median compa-ratio of the scope. Cheap: one pass over comp rows. */
export function compaHeadline(ctx: AnalyticsContext): number | null {
  const pop = buildPopulation(
    { employees: ctx.data.employees, comp: ctx.data.comp, reviews: [], jobChanges: [] },
    ctx.asOf,
  )
  return safeMedian(
    values(pop.people, (p) => p.compa),
    minGroupOf(ctx.metrics),
  )
}
