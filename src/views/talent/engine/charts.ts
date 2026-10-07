/**
 * The four Talent charts added in the design refresh (docs/CHARTS.md, Talent):
 *
 *  - succession exposure: critical and key roles by the incumbent's risk of loss and the
 *    readiness of the best successor;
 *  - rating change: people rated in both of the last two annual cycles, prior rating by latest;
 *  - share rated 4-5 by reviewer, for calibration (HR only: it compares managers);
 *  - required training overdue at each month end, by course.
 *
 * Each recounts from the raw rows it reads and keeps the records behind every number, so a mark
 * opens exactly what it counts. Shares over fewer people than the anonymity minimum are null and
 * open nothing. Pure: no React, no DOM.
 */
import type { ISODate, LearningRecord, Review } from '@/data/schema'
import { type DrillExtra, type DrillSpec, drillSpec } from '@/drill/types'
import { daysBetween, formatDate, formatMonth } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { isActiveAt, isEmployee, monthPoints } from '@/lib/people'
import { median } from '@/lib/stats'
import { type Cycle, nameOf, normRating, pushTo, type TalentBase } from './base'
import { RATINGS, ratingLabel } from './performance'
import type { Coverage, RoleRow, SuccessionResult } from './succession'
import { COVERAGE_ORDER } from './succession'

/* ───────── succession exposure ───────── */

export type ExposureScope = 'All' | 'Critical'
export const RISK_OF_LOSS = ['High', 'Medium', 'Low', 'Not rated'] as const
export type RiskOfLoss = (typeof RISK_OF_LOSS)[number]

export interface ExposureCell {
  /** Readiness of the best successor still employed, or "No successor". */
  readiness: Coverage
  /** The incumbent's risk of loss recorded in the plan. */
  risk: RiskOfLoss
  roles: number
  /** The roles counted in the cell. */
  list: RoleRow[]
}

export interface Exposure {
  /** Every readiness by every risk, zeros included, in reading order. */
  cells: ExposureCell[]
  /** Roles counted. */
  total: number
  /** High risk of loss with no successor: the cell the chart is about. */
  exposed: number
  /** Roles whose plan records no risk of loss. */
  notRated: number
}

export function successionExposure(roles: readonly RoleRow[], scope: ExposureScope): Exposure {
  const counted = roles.filter((r) => scope === 'All' || r.criticality === 'Critical')
  const by = new Map<string, RoleRow[]>()
  for (const r of counted) pushTo(by, `${r.coverage}|${r.riskOfLoss ?? 'Not rated'}`, r)
  const cells: ExposureCell[] = COVERAGE_ORDER.flatMap((readiness) =>
    RISK_OF_LOSS.map((risk) => {
      const list = by.get(`${readiness}|${risk}`) ?? []
      return { readiness, risk, roles: list.length, list }
    }),
  )
  const at = (readiness: Coverage, risk: RiskOfLoss) =>
    cells.find((c) => c.readiness === readiness && c.risk === risk)?.roles ?? 0
  return {
    cells,
    total: counted.length,
    exposed: at('No successor', 'High'),
    notRated: counted.filter((r) => r.riskOfLoss == null).length,
  }
}

/* ───────── rating change since the last annual cycle ───────── */

/** Annual cycles: named so, or the cycles that assess potential (mid-year cycles do not). */
const ANNUAL = /annual|year[\s-]?end|focal/i

export interface RatingChangeCell {
  /** "3 Meets", the rating in the prior annual cycle (rows). */
  prior: string
  /** The rating in the latest annual cycle (columns). */
  latest: string
  priorRating: number
  latestRating: number
  people: number
  /** Share of the prior rating's row; null when that row has fewer people than the minimum. */
  rowShare: number | null
  /** The latest-cycle reviews of the people in the cell (one per person). */
  reviews: Review[]
}

export interface RatingChange {
  prior: Cycle | null
  latest: Cycle | null
  cells: RatingChangeCell[]
  /** People rated in both cycles. */
  people: number
  same: number
  up: number
  down: number
  /** Each person's rating in the prior cycle, for the drill's extra column. */
  priorOf: Map<string, number>
}

/** The last two annual cycles on or before the as-of date, oldest first. */
export function annualCycles(base: Pick<TalentBase, 'reviews' | 'asOf' | 'ctx'>): Cycle[] {
  const withPotential = new Set<string>()
  for (const r of base.ctx.all.reviews) if (r.potential) withPotential.add(r.cycle)
  return base.reviews.cycles
    .filter((c) => c.cycleDate <= base.asOf && (ANNUAL.test(c.cycle) || withPotential.has(c.cycle)))
    .slice(-2)
}

export function ratingChange(base: TalentBase): RatingChange {
  const { minGroup } = base.settings
  const [prior, latest] = annualCycles(base)
  const empty: RatingChange = {
    prior: prior ?? null,
    latest: latest ?? null,
    cells: [],
    people: 0,
    same: 0,
    up: 0,
    down: 0,
    priorOf: new Map(),
  }
  if (!prior || !latest) return { ...empty, prior: null, latest: latest ?? prior ?? null }
  const priorOf = new Map<string, number>()
  for (const r of base.ctx.all.reviews) {
    if (r.cycle !== prior.cycle || !base.scopeIds.has(r.employeeId)) continue
    const v = normRating(r.rating)
    if (v != null) priorOf.set(r.employeeId, v)
  }
  const cell = new Map<string, Review[]>()
  const seen = new Set<string>()
  for (const r of base.ctx.all.reviews) {
    if (r.cycle !== latest.cycle || seen.has(r.employeeId)) continue
    const p = priorOf.get(r.employeeId)
    const v = normRating(r.rating)
    if (p == null || v == null) continue
    seen.add(r.employeeId)
    pushTo(cell, `${p}|${v}`, r)
  }
  const rowTotal = new Map<number, number>()
  for (const [k, list] of cell) {
    const p = +k.split('|')[0]
    rowTotal.set(p, (rowTotal.get(p) ?? 0) + list.length)
  }
  let same = 0
  let up = 0
  let down = 0
  const cells: RatingChangeCell[] = []
  for (const p of [...RATINGS].reverse()) {
    for (const v of RATINGS) {
      const reviews = cell.get(`${p}|${v}`) ?? []
      const total = rowTotal.get(p) ?? 0
      if (v === p) same += reviews.length
      else if (v > p) up += reviews.length
      else down += reviews.length
      cells.push({
        prior: ratingLabel(p),
        latest: ratingLabel(v),
        priorRating: p,
        latestRating: v,
        people: reviews.length,
        rowShare: total >= minGroup ? reviews.length / total : null,
        reviews,
      })
    }
  }
  return { prior, latest, cells, people: same + up + down, same, up, down, priorOf }
}

/* ───────── share rated 4-5 by reviewer ───────── */

export interface ReviewerDot {
  reviewerId: string
  reviewer: string
  /** The reviewer's business unit on the roster ("Not in roster" when they are not on it). */
  businessUnit: string
  rated: number
  high: number
  share: number
  /**
   * Further from the guideline than chance explains for this many people: more than two standard
   * errors of a share, sqrt(g × (1 − g) ÷ rated), either way.
   */
  unusual: boolean
  /** The reviews behind the share, in the latest cycle. */
  reviews: Review[]
}

export interface ByReviewer {
  cycle: Cycle | null
  /** Reviewers with at least the anonymity minimum rated. */
  dots: ReviewerDot[]
  /** Business units in row order: the highest median share first. */
  units: string[]
  /** Reviewers left out with fewer rated than the minimum. */
  left: number
  /** Ratings in the latest cycle in scope with a reviewer ID. */
  withReviewer: number
  /** Some review in the data names a reviewer. */
  hasReviewer: boolean
}

export function ratingByReviewer(base: TalentBase, cycle: Cycle | null): ByReviewer {
  const { minGroup, highRating, highGuideline: g } = base.settings
  const hasReviewer = base.ctx.all.reviews.some((r) => !!r.reviewerId)
  const by = new Map<string, Review[]>()
  if (cycle)
    for (const r of base.ctx.all.reviews) {
      if (r.cycle !== cycle.cycle || !r.reviewerId || !base.scopeIds.has(r.employeeId)) continue
      if (normRating(r.rating) == null) continue
      pushTo(by, r.reviewerId, r)
    }
  const dots: ReviewerDot[] = []
  let left = 0
  let withReviewer = 0
  for (const [reviewerId, reviews] of by) {
    withReviewer += reviews.length
    if (reviews.length < minGroup) {
      left++
      continue
    }
    const high = reviews.filter((r) => (normRating(r.rating) ?? 0) >= highRating).length
    const share = high / reviews.length
    dots.push({
      reviewerId,
      reviewer: nameOf(base, reviewerId),
      businessUnit: base.byId.get(reviewerId)?.businessUnit || 'Not in roster',
      rated: reviews.length,
      high,
      share,
      unusual: Math.abs(share - g) > 2 * Math.sqrt((g * (1 - g)) / reviews.length),
      reviews,
    })
  }
  const unitMedian = new Map<string, number>()
  const byUnit = new Map<string, number[]>()
  for (const d of dots) pushTo(byUnit, d.businessUnit, d.share)
  for (const [u, xs] of byUnit) unitMedian.set(u, median(xs) ?? 0)
  const units = [...byUnit.keys()].sort(
    (a, b) => (unitMedian.get(b) ?? 0) - (unitMedian.get(a) ?? 0) || a.localeCompare(b),
  )
  dots.sort((a, b) => b.share - a.share || b.rated - a.rated || a.reviewer.localeCompare(b.reviewer))
  return { cycle, dots, units, left, withReviewer, hasReviewer }
}

/* ───────── required training overdue at each month end ───────── */

/** Courses named on the chart; the rest fold into "Other (k)". */
export const OVERDUE_COURSES_SHOWN = 5

export interface OverdueMonthRow {
  /** "YYYY-MM" of the month end. */
  month: string
  /** The month end (the as-of date for the last point). */
  date: ISODate
  course: string
  overdue: number
  /** The assignments overdue on that date. */
  records: LearningRecord[]
}

export interface OverdueTrend {
  rows: OverdueMonthRow[]
  /** Series in legend order, "Other (k)" last. */
  courses: string[]
  /** Every assignment overdue at each date, by month. */
  totals: { month: string; date: ISODate; overdue: number; records: LearningRecord[] }[]
  /** The courses folded into "Other (k)". */
  folded: string[]
}

/**
 * Required assignments past due and not completed on each of the last 12 month ends (the as-of
 * date for the last point), for employees active that day. At the as-of date this is the
 * "Overdue now" count.
 */
export function overdueTrend(base: TalentBase): OverdueTrend {
  const dates = monthPoints(base.asOf, 12)
  const required = base.ctx.data.learning.filter((l) => l.required === true && !!l.dueDate)
  const perDate = dates.map(() => new Map<string, LearningRecord[]>())
  for (const l of required) {
    const e = base.byId.get(l.employeeId)
    if (!e || !isEmployee(e)) continue
    dates.forEach((d, i) => {
      if (l.dueDate! >= d) return
      if (l.completedDate && l.completedDate <= d) return
      if (!isActiveAt(e, d)) return
      pushTo(perDate[i], l.course, l)
    })
  }
  const peak = new Map<string, number>()
  for (const m of perDate) for (const [c, list] of m) peak.set(c, Math.max(peak.get(c) ?? 0, list.length))
  const ranked = [...peak.keys()].sort(
    (a, b) => (peak.get(b) ?? 0) - (peak.get(a) ?? 0) || a.localeCompare(b),
  )
  // One course past the cut keeps its name: folding it into "Other (1)" hides nothing.
  const named = ranked.length <= OVERDUE_COURSES_SHOWN + 1 ? ranked : ranked.slice(0, OVERDUE_COURSES_SHOWN)
  const folded = ranked.filter((c) => !named.includes(c))
  const other = folded.length ? `Other (${folded.length})` : null
  const courses = other ? [...named, other] : named
  const rows: OverdueMonthRow[] = []
  const totals: OverdueTrend['totals'] = []
  dates.forEach((date, i) => {
    const month = date.slice(0, 7)
    const all: LearningRecord[] = []
    for (const c of named) {
      const records = perDate[i].get(c) ?? []
      all.push(...records)
      rows.push({ month, date, course: c, overdue: records.length, records })
    }
    if (other) {
      const records = folded.flatMap((c) => perDate[i].get(c) ?? [])
      all.push(...records)
      rows.push({ month, date, course: other, overdue: records.length, records })
    }
    totals.push({ month, date, overdue: all.length, records: all })
  })
  return { rows, courses, totals, folded }
}

/* ───────── the charts together ───────── */

export interface TalentCharts {
  exposure: Record<ExposureScope, Exposure>
  ratingChange: RatingChange
  byReviewer: ByReviewer
  overdueTrend: OverdueTrend
}

export function computeCharts(base: TalentBase, succession: Pick<SuccessionResult, 'roles'>): TalentCharts {
  return {
    exposure: {
      All: successionExposure(succession.roles, 'All'),
      Critical: successionExposure(succession.roles, 'Critical'),
    },
    ratingChange: ratingChange(base),
    byReviewer: ratingByReviewer(base, base.latest),
    overdueTrend: overdueTrend(base),
  }
}

/* ───────── drills (reviews and learning; role cells use the view's role list) ───────── */

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')

/** The people in one rating-change cell: their latest annual review, with the prior rating beside it. */
export function ratingChangeDrill(
  base: Pick<TalentBase, 'ctx'>,
  rc: RatingChange,
  cell: RatingChangeCell,
): DrillSpec<'reviews'> | null {
  if (!cell.reviews.length || !rc.prior || !rc.latest) return null
  const prior = rc.prior.cycle
  const extra: DrillExtra<Review> = {
    columns: [
      { key: 'priorRating', label: `Rating in ${prior}`, format: 'int' },
      { key: 'ratingChange', label: 'Change', format: 'text' },
    ],
    values: (r) => {
      const p = rc.priorOf.get(r.employeeId) ?? null
      const v = normRating(r.rating)
      return {
        priorRating: p,
        ratingChange:
          p == null || v == null ? null : v === p ? 'Same' : v > p ? `Up ${v - p}` : `Down ${p - v}`,
      }
    },
  }
  const move =
    cell.latestRating === cell.priorRating
      ? `stayed at ${cell.latest}`
      : `went from ${cell.prior} to ${cell.latest}`
  return drillSpec({
    kind: 'reviews',
    title: `Rated ${cell.prior} in ${prior}, ${cell.latest} in ${rc.latest.cycle}`,
    subtitle: join(`${prior} to ${rc.latest.cycle}`, base.ctx.scopeLabel),
    rows: cell.reviews,
    extra,
    note: `${fmt(cell.people, 'int')} people rated in both annual cycles ${move}.`,
  })
}

/** One reviewer's ratings in the latest cycle. */
export function reviewerDrill(
  base: Pick<TalentBase, 'ctx' | 'settings'>,
  b: ByReviewer,
  dot: ReviewerDot,
): DrillSpec<'reviews'> | null {
  if (!dot.reviews.length) return null
  return drillSpec({
    kind: 'reviews',
    title: `Rated by ${dot.reviewer} in ${b.cycle?.cycle ?? 'the latest cycle'}`,
    subtitle: join(b.cycle?.cycle, base.ctx.scopeLabel),
    rows: dot.reviews,
    note: `Share rated ${base.settings.highRating} or higher = ${fmt(dot.high, 'int')} ÷ ${fmt(dot.rated, 'int')} rated (${fmt(dot.share, 'pct')}).`,
  })
}

/** The assignments overdue on one month end: one course, or every course (`course` null). */
export function overdueMonthDrill(
  base: Pick<TalentBase, 'ctx'>,
  t: OverdueTrend,
  month: string,
  course: string | null,
): DrillSpec<'learning'> | null {
  const point = t.totals.find((x) => x.month === month)
  if (!point) return null
  const records =
    course == null
      ? point.records
      : (t.rows.find((r) => r.month === month && r.course === course)?.records ?? [])
  if (!records.length) return null
  const date = point.date
  const extra: DrillExtra<LearningRecord> = {
    columns: [{ key: 'daysOverdueThen', label: `Days overdue on ${formatDate(date)}`, format: 'days' }],
    values: (l) => ({ daysOverdueThen: l.dueDate ? daysBetween(l.dueDate, date) : null }),
  }
  const what = course == null ? 'Required training overdue' : `${course}: overdue`
  return drillSpec({
    kind: 'learning',
    title: `${what} on ${formatDate(date)}`,
    subtitle: join(formatMonth(`${month}-01`), base.ctx.scopeLabel),
    rows: [...records].sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1)),
    extra,
    note: `Required assignments due before ${formatDate(date)} and not completed by then, for employees active that day.`,
  })
}
