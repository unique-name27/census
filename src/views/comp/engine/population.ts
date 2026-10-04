/**
 * The compensation population: active employees at the as-of date who have a comp row, with
 * every ratio the view reports already derived. Amounts are converted to USD with fxToUsd; a row
 * without a rate keeps its ratios but has null USD amounts (and is counted in `noFx`).
 */
import type { CompRecord, Datasets, Employee, ISODate, Review } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { isNum } from '@/lib/format'
import {
  buildReviewIndex,
  isActiveAt,
  isEmployee,
  type ReviewIndex,
  reviewAt,
  type TenureBand,
  tenureBand,
  tenureYears,
} from '@/lib/people'

export const POSITIONS = ['Below minimum', 'Q1', 'Q2', 'Q3', 'Q4', 'Above maximum'] as const
export type Position = (typeof POSITIONS)[number]

export interface CompPerson {
  id: string
  /** The raw comp row behind this person: what a drill-down lists (kind 'comp'). */
  record: CompRecord
  name: string
  jobTitle: string
  /** Job family, falling back to department when the roster has none. */
  jobFamily: string
  businessUnit: string
  department: string
  location: string
  level: string | null
  hireDate: ISODate
  tenure: number
  tenureBand: TenureBand
  /** Hired in the 12 months to the as-of date. */
  hiredRecently: boolean
  /** Promoted (job change) in the 12 months to the as-of date. */
  promotedRecently: boolean
  currency: string
  fx: number | null
  base: number
  min: number | null
  mid: number | null
  max: number | null
  baseUsd: number | null
  minUsd: number | null
  maxUsd: number | null
  compa: number | null
  /** (base − min) ÷ (max − min), unclamped. */
  penetration: number | null
  position: Position | null
  marketRatio: number | null
  /** Market median ÷ range midpoint. */
  marketVsMid: number | null
  /** Latest rating on or before the as-of date (the one merit proposals are drafted against). */
  rating: number | null
  /** Rating in the latest annual cycle (bonus payouts follow it). */
  annualRating: number | null
  merit: number | null
  promotion: number | null
  targetBonusPct: number | null
  bonusPayout: number | null
  equityUsd: number | null
}

export interface Population {
  asOf: ISODate
  people: CompPerson[]
  /** Active employees in scope with no comp row. */
  missingComp: number
  /** Those employees, for the drill-down behind the count. */
  missing: Employee[]
  /** People whose comp row has no FX rate: left out of every amount total. */
  noFx: number
  /** Which optional fields exist in at least one row (missing columns give null, not 0). */
  has: {
    /** Some roster row has a job family (otherwise job family falls back to department for everyone). */
    jobFamily: boolean
    ranges: boolean
    market: boolean
    merit: boolean
    promotion: boolean
    bonusTarget: boolean
    bonusPayout: boolean
    equity: boolean
    reviews: boolean
  }
  latestCycle: string | null
  annualCycle: string | null
}

const positive = (v: unknown): number | null => (isNum(v) && v > 0 ? v : null)

/** Position in range from base, min and max. Base equal to min or max counts as inside the range. */
export function positionOf(base: number, min: number | null, max: number | null): Position | null {
  if (min == null || max == null || !(max > min)) return null
  if (base < min) return 'Below minimum'
  if (base > max) return 'Above maximum'
  const p = (base - min) / (max - min)
  return p < 0.25 ? 'Q1' : p < 0.5 ? 'Q2' : p < 0.75 ? 'Q3' : 'Q4'
}

/** Cycle names that mark an annual cycle; without one, the latest cycle that rated potential is used. */
export const ANNUAL_CYCLE = /annual|year[\s-]?end|focal/i

/** The latest annual cycle on or before d: named "Annual"/"Year-end", else the latest with potential. */
function latestAnnualCycle(idx: ReviewIndex, reviews: readonly Review[], d: ISODate): string | null {
  const closed = idx.cycles.filter((c) => c.cycleDate <= d)
  for (let i = closed.length - 1; i >= 0; i--) if (ANNUAL_CYCLE.test(closed[i].cycle)) return closed[i].cycle
  const withPotential = new Set(reviews.filter((r) => r.potential).map((r) => r.cycle))
  for (let i = closed.length - 1; i >= 0; i--) if (withPotential.has(closed[i].cycle)) return closed[i].cycle
  return null
}

export function buildPopulation(
  data: Pick<Datasets, 'employees' | 'comp' | 'reviews' | 'jobChanges'>,
  asOf: ISODate,
): Population {
  const yearAgo = addMonths(asOf, -12)
  const reviewIdx = buildReviewIndex(data.reviews)
  const latest = reviewIdx.cycles.filter((c) => c.cycleDate <= asOf).at(-1)?.cycle ?? null
  const annual = latestAnnualCycle(reviewIdx, data.reviews, asOf)
  const annualById = new Map<string, number>()
  if (annual) for (const r of data.reviews) if (r.cycle === annual) annualById.set(r.employeeId, r.rating)

  const promoted = new Set<string>()
  for (const j of data.jobChanges)
    if (j.changeType === 'Promotion' && j.effectiveDate > yearAgo && j.effectiveDate <= asOf)
      promoted.add(j.employeeId)

  const active = new Map(
    data.employees.filter((e) => isEmployee(e) && isActiveAt(e, asOf)).map((e) => [e.employeeId, e]),
  )
  const people: CompPerson[] = []
  const seen = new Set<string>()
  let noFx = 0
  let hasFamily = false
  for (const c of data.comp) {
    const e = active.get(c.employeeId)
    if (!e || seen.has(c.employeeId) || !isNum(c.baseSalary)) continue
    seen.add(c.employeeId)
    const fx = positive(c.fxToUsd)
    if (fx == null) noFx++
    if (e.jobFamily) hasFamily = true
    const min = positive(c.rangeMin)
    const mid = positive(c.rangeMid)
    const max = positive(c.rangeMax)
    const market = positive(c.marketP50)
    const usd = (v: number | null) => (v == null || fx == null ? null : v * fx)
    const tenure = tenureYears(e, asOf)
    people.push({
      id: e.employeeId,
      record: c,
      name: e.name,
      jobTitle: e.jobTitle,
      jobFamily: e.jobFamily || e.department,
      businessUnit: e.businessUnit,
      department: e.department,
      location: e.location,
      level: e.level,
      hireDate: e.hireDate,
      tenure,
      tenureBand: tenureBand(tenure),
      hiredRecently: e.hireDate > yearAgo,
      promotedRecently: promoted.has(e.employeeId),
      currency: c.currency,
      fx,
      base: c.baseSalary,
      min,
      mid,
      max,
      baseUsd: usd(c.baseSalary),
      minUsd: usd(min),
      maxUsd: usd(max),
      compa: mid == null ? null : c.baseSalary / mid,
      penetration: min != null && max != null && max > min ? (c.baseSalary - min) / (max - min) : null,
      position: positionOf(c.baseSalary, min, max),
      marketRatio: market == null ? null : c.baseSalary / market,
      marketVsMid: market == null || mid == null ? null : market / mid,
      rating: reviewAt(reviewIdx, e.employeeId, asOf)?.rating ?? null,
      annualRating: annualById.get(e.employeeId) ?? null,
      merit: isNum(c.meritPct) ? c.meritPct : null,
      promotion: isNum(c.promotionPct) ? c.promotionPct : null,
      targetBonusPct: isNum(c.targetBonusPct) ? c.targetBonusPct : null,
      bonusPayout: isNum(c.bonusPayoutPct) ? c.bonusPayoutPct : null,
      equityUsd: isNum(c.annualEquityUsd) ? c.annualEquityUsd : null,
    })
  }
  const some = (f: (p: CompPerson) => unknown) => people.some((p) => f(p) != null)
  const missing = [...active.values()].filter((e) => !seen.has(e.employeeId))
  return {
    asOf,
    people,
    missingComp: missing.length,
    missing,
    noFx,
    has: {
      jobFamily: hasFamily,
      ranges: people.some((p) => p.position != null),
      market: some((p) => p.marketRatio),
      merit: some((p) => p.merit),
      promotion: some((p) => p.promotion),
      bonusTarget: some((p) => p.targetBonusPct),
      bonusPayout: some((p) => p.bonusPayout),
      equity: some((p) => p.equityUsd),
      reviews: some((p) => p.rating),
    },
    latestCycle: latest,
    annualCycle: annual,
  }
}
