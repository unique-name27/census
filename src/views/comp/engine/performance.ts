/**
 * Pay for performance: compa-ratio and merit by rating, the rating × range-position merit
 * matrix against the guideline, differentiation (rating 4-5 merit ÷ rating 3 merit) and bonus
 * payout by rating. Pure.
 */
import { MIN_GROUP, RATING_LABELS } from '@/data/schema'
import { isNum } from '@/lib/format'
import { mean } from '@/lib/stats'
import { groupRows, safeMean, safeMedian, safeQuantile, values } from './groups'
import { type CompPerson, POSITIONS } from './population'
import { type CycleSettings, guidelineFor, RATINGS, type RatingKey, ratingKey } from './settings'

/** Departments whose 4-5 vs 3 merit ratio is below this show no real differentiation. */
export const DIFFERENTIATION_FLOOR = 1.15

/** Round a fraction-point gap to 0.1 pts, the precision it is read at (so −0.00004 isn't "−0.0 pts"). */
const toPoint = (d: number): number => Math.round(d * 1000) / 1000 || 0

export const ratingLabel = (r: RatingKey): string => `${r} ${RATING_LABELS[r]}`
/** Low to high, the order ratings read left to right. */
export const RATING_ORDER: readonly string[] = RATINGS.slice()
  .reverse()
  .map((r) => ratingLabel(r))

const byRating = (people: readonly CompPerson[], rating: (p: CompPerson) => number | null) => {
  const m = new Map<RatingKey, CompPerson[]>()
  for (const p of people) {
    const k = ratingKey(rating(p))
    if (k == null) continue
    const arr = m.get(k)
    if (arr) arr.push(p)
    else m.set(k, [p])
  }
  return [1, 2, 3, 4, 5]
    .filter((r) => m.has(r as RatingKey))
    .map((r) => ({ rating: r as RatingKey, rows: m.get(r as RatingKey)! }))
}

export interface CompaByRatingRow {
  rating: string
  n: number
  median: number | null
  p25: number | null
  p75: number | null
}

export function compaByRating(people: readonly CompPerson[]): CompaByRatingRow[] {
  return byRating(
    people.filter((p) => p.compa != null),
    (p) => p.rating,
  ).map(({ rating, rows }) => {
    const xs = values(rows, (p) => p.compa)
    return {
      rating: ratingLabel(rating),
      n: xs.length,
      median: safeMedian(xs),
      p25: safeQuantile(xs, 0.25),
      p75: safeQuantile(xs, 0.75),
    }
  })
}

export interface RatingDot {
  id: string
  name: string
  rating: string
  compa: number
}

/** One row per rated person with a compa-ratio, for the strip of compa-ratio by rating. */
export function ratingDots(people: readonly CompPerson[]): RatingDot[] {
  const out: RatingDot[] = []
  for (const p of people) {
    const k = ratingKey(p.rating)
    if (k == null || p.compa == null) continue
    out.push({ id: p.id, name: p.name, rating: ratingLabel(k), compa: p.compa })
  }
  return out
}

export interface MeritByRatingRow {
  rating: string
  n: number
  mean: number | null
  median: number | null
  guideline: number
  /** Mean merit minus guideline, in fraction points. */
  diff: number | null
}

/** Proposed merit (promotion increases excluded) against the guideline, per rating. */
export function meritByRating(people: readonly CompPerson[], s: CycleSettings): MeritByRatingRow[] {
  return byRating(
    people.filter((p) => p.merit != null),
    (p) => p.rating,
  ).map(({ rating, rows }) => {
    const xs = values(rows, (p) => p.merit)
    const m = safeMean(xs)
    const g = s.guideline[rating]
    return {
      rating: ratingLabel(rating),
      n: xs.length,
      mean: m,
      median: safeMedian(xs),
      guideline: g,
      diff: m == null ? null : toPoint(m - g),
    }
  })
}

export interface MatrixCell {
  rating: string
  position: string
  n: number
  mean: number | null
  guideline: number
  diff: number | null
}

/** Mean merit by rating and range position, against the guideline for the rating. */
export function meritMatrix(people: readonly CompPerson[], s: CycleSettings): MatrixCell[] {
  const out: MatrixCell[] = []
  for (const { rating, rows } of byRating(
    people.filter((p) => p.merit != null && p.position != null),
    (p) => p.rating,
  )) {
    for (const pos of POSITIONS) {
      const xs = values(
        rows.filter((p) => p.position === pos),
        (p) => p.merit,
      )
      if (!xs.length) continue
      const m = safeMean(xs)
      const g = s.guideline[rating]
      out.push({
        rating: ratingLabel(rating),
        position: pos,
        n: xs.length,
        mean: m,
        guideline: g,
        diff: m == null ? null : toPoint(m - g),
      })
    }
  }
  return out
}

export interface Differentiation {
  ratio: number | null
  merit45: number | null
  merit3: number | null
  n45: number
  n3: number
}

/** Mean merit of rating 4-5 ÷ mean merit of rating 3; null when either side has fewer than 5 people. */
export function differentiation(people: readonly CompPerson[]): Differentiation {
  const m45: number[] = []
  const m3: number[] = []
  for (const p of people) {
    if (!isNum(p.merit)) continue
    const k = ratingKey(p.rating)
    if (k === 4 || k === 5) m45.push(p.merit)
    else if (k === 3) m3.push(p.merit)
  }
  const a = m45.length >= MIN_GROUP ? mean(m45) : null
  const b = m3.length >= MIN_GROUP ? mean(m3) : null
  return {
    ratio: a != null && b != null && b > 0 ? a / b : null,
    merit45: a,
    merit3: b,
    n45: m45.length,
    n3: m3.length,
  }
}

export interface DifferentiationRow extends Differentiation {
  group: string
}

export function differentiationBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
): DifferentiationRow[] {
  const rated = people.filter((p) => p.merit != null && ratingKey(p.rating) != null)
  return groupRows(rated, key).map((g) => ({ group: g.label, ...differentiation(g.rows) }))
}

export interface BonusByRatingRow {
  rating: string
  n: number
  mean: number | null
  median: number | null
}

/** Last bonus payout (share of target) by the rating in the latest annual cycle. */
export function bonusByRating(people: readonly CompPerson[]): BonusByRatingRow[] {
  return byRating(
    people.filter((p) => p.bonusPayout != null),
    (p) => p.annualRating,
  ).map(({ rating, rows }) => {
    const xs = values(rows, (p) => p.bonusPayout)
    return { rating: ratingLabel(rating), n: xs.length, mean: safeMean(xs), median: safeMedian(xs) }
  })
}

export interface EquityByRatingRow {
  rating: string
  n: number
  /** Median annual equity as a share of base (both in USD). */
  median: number | null
}

export function equityByRating(people: readonly CompPerson[]): EquityByRatingRow[] {
  return byRating(
    people.filter((p) => p.equityUsd != null && p.baseUsd != null && p.baseUsd > 0),
    (p) => p.rating,
  ).map(({ rating, rows }) => {
    const xs = values(rows, (p) => p.equityUsd! / p.baseUsd!)
    return { rating: ratingLabel(rating), n: xs.length, median: safeMedian(xs) }
  })
}

/** The guideline as rows for exports and the definitions popover. */
export function guidelineRows(s: CycleSettings): { rating: string; guideline: number }[] {
  return RATINGS.map((r) => ({ rating: ratingLabel(r), guideline: guidelineFor(s, r)! }))
}
