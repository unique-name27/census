/**
 * computeComp(ctx, settings): every number the Compensation view shows, computed once per
 * analytics context and settings. Pure (no React, no DOM).
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { BELOW_STANDARD_TEXT } from '@/data/quality'
import { SAMPLE_AS_OF } from '@/data/sample'
import { type ISODate, LEVELS } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
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
import { buildFindings } from './findings'
import { safeMedian, values } from './groups'
import { buildCycleKpis, buildKpis } from './kpis'
import { type FigureUses, figureUses, meetsFor, PROMOTED } from './lineage'
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
  settings: CycleSettings
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
  }
  ranges: {
    penetration: PenetrationRow[]
    below: OutsideRangeRow[]
    above: OutsideRangeRow[]
    costToMin: { usd: number; skipped: number }
    tenure: TenureDot[]
    compression: CompressionRow[]
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
    byFamily: MarketRow[]
    /** The 15 families furthest below market plus Other, for the chart. */
    familyChart: MarketRow[]
    byLocation: MarketRow[]
    byLevel: MarketRow[]
    jobs: JobMarketRow[]
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

export function computeComp(ctx: AnalyticsContext, settings: CycleSettings): CompModel {
  const pop = buildPopulation(ctx.data, ctx.asOf)
  const payAsOf = payAsOfDate(ctx)
  const payStale = payAsOf != null && Math.abs(daysBetween(payAsOf, ctx.asOf)) > PAY_SNAPSHOT_TOLERANCE
  const company = ctx.isCompany ? pop : buildPopulation(ctx.all, ctx.asOf)
  const people = pop.people
  const s = settings

  const compas = values(people, (p) => p.compa)
  const histDomain = binDomain(compas, COMPA_STEP)
  const merits = values(people, (p) => p.merit)
  const meritDomain = binDomain(merits, MERIT_STEP)
  const valued = people.filter((p) => p.compa != null)
  const proposed = people.filter((p) => p.merit != null)
  const below = belowMinimum(people)

  const performance = {
    compaByRating: compaByRating(people),
    ratingDots: ratingDots(people),
    meritByRating: meritByRating(people, s),
    matrix: meritMatrix(people, s),
    differentiation: differentiation(people),
    companyDifferentiation: ctx.isCompany ? differentiation(people) : differentiation(company.people),
    byDepartment: differentiationBy(people, (p) => p.department),
    bonus: bonusByRating(people),
    equity: equityByRating(people),
  }
  const spend = meritSpend(people, s)
  const companySpend = ctx.isCompany ? spend : meritSpend(company.people, s)
  const cycle = {
    spend,
    companySpend,
    byBu: spendBy(people, (p) => p.businessUnit, s),
    hist: meritDomain ? binBy(proposed, (p) => p.merit!, meritDomain[0], meritDomain[1], MERIT_STEP) : [],
    histDomain: meritDomain,
    exceptions: guidelineExceptions(people, s, ratingPeerStats(company.people)),
    promotions: promotions(people),
    mix: rewardsMix(people, pop.has.equity),
  }
  const ranges = {
    penetration: penetrationByLevel(people),
    below,
    above: aboveMaximum(people),
    costToMin: costToMinimum(below),
    tenure: tenureDots(people),
    compression: compression(people),
  }
  const market = {
    total: marketTotal(people),
    byFamily: marketBy(people, (p) => p.jobFamily),
    familyChart: marketLowest(people, (p) => p.jobFamily, 15),
    byLocation: marketBy(people, (p) => p.location),
    byLevel: marketByLevel(people),
    jobs: jobsBelowMarket(people),
  }
  const overview = {
    hist: histDomain ? binBy(valued, (p) => p.compa!, histDomain[0], histDomain[1], COMPA_STEP) : [],
    histDomain,
    median: safeMedian(compas),
    companyMedian: safeMedian(values(company.people, (p) => p.compa)),
    people: personRows(people),
    positionByBu: positionMix(people, (p) => p.businessUnit),
    positionAll: positionTotal(people, ctx.isCompany ? 'Whole company' : ctx.scopeLabel),
    byLocation: compaBy(people, (p) => p.location, s),
    byLevel: compaBy(people, (p) => p.level, s, LEVELS),
    byDepartment: compaBy(people, (p) => p.department, s),
  }

  const scopeLabel = ctx.isCompany ? 'Whole company' : ctx.scopeLabel
  const cycleModel = {
    ...cycle,
    kpis: buildCycleKpis(pop, cycle, { scopeLabel, asOf: ctx.asOf, settings: s, pop }),
  }
  const core = {
    settings: s,
    asOf: ctx.asOf,
    payAsOf,
    payStale,
    scopeLabel,
    pop,
    company,
    isCompany: ctx.isCompany,
    showPay: ctx.showPay,
    promotionsShown: meetsFor(ctx)(PROMOTED),
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
    findings: buildFindings(ctx, core),
    uses: figureUses(core),
  }
}

/** Folder-tab headline: median compa-ratio of the scope. Cheap: one pass over comp rows. */
export function compaHeadline(ctx: AnalyticsContext): number | null {
  const pop = buildPopulation(
    { employees: ctx.data.employees, comp: ctx.data.comp, reviews: [], jobChanges: [] },
    ctx.asOf,
  )
  return safeMedian(values(pop.people, (p) => p.compa))
}
