/**
 * Performance: rating distribution against the guideline, where ratings run high, how much
 * calibration moved them, how averages moved across cycles, and how ratings relate to exits.
 * Pure: no React, no DOM.
 */
import { type Employee, type ISODate, LEVELS, MIN_GROUP, RATING_LABELS, type Review } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { isEmployee } from '@/lib/people'
import { mean } from '@/lib/stats'
import { type Cycle, foldSmallGroups, normRating, pushTo, recordsByLabel, type TalentBase } from './base'
import { DEFAULT_GUIDELINE, DEFAULTS, guidelineAtOrAbove } from './settings'

export const RATINGS = [1, 2, 3, 4, 5] as const
export const ratingLabel = (r: number): string => `${r} ${RATING_LABELS[r] ?? ''}`.trim()
export const RATING_ORDER = RATINGS.map(ratingLabel)
/**
 * The default guideline share rated 4 or 5 (35%). The engines read the guideline and the high
 * performer rating in force from the metric dictionary (`base.settings.highGuideline`).
 */
export const HIGH_GUIDELINE = guidelineAtOrAbove(DEFAULT_GUIDELINE, DEFAULTS.highRating)

export interface DistributionRow {
  rating: number
  label: string
  people: number
  share: number | null
  guideline: number
  /** share − guideline */
  gap: number | null
}

export interface DistributionLong {
  rating: string
  series: 'Actual' | 'Guideline'
  share: number | null
}

export interface HighShareRow {
  group: string
  rated: number
  /** Null on a folded "Other (k)" row still under 5 people. */
  high: number | null
  share: number | null
  /** Groups under 5 people folded together ("Other (k)"). */
  other?: boolean
  /** How many groups a folded row holds. */
  groups?: number
}

export interface MixRow {
  businessUnit: string
  rated: number
  r1: number | null
  r2: number | null
  r3: number | null
  r4: number | null
  r5: number | null
}

export interface CalibrationRow {
  businessUnit: string
  /** People with both a proposed and a final rating. */
  n: number
  proposed: number | null
  final: number | null
  /** mean(proposed − final): positive means calibration lowered ratings. */
  shift: number | null
  /** Share of proposals moved down / up by calibration. */
  movedDown: number | null
  movedUp: number | null
}

export interface CycleRow {
  cycle: string
  cycleDate: ISODate
  businessUnit: string
  rated: number
  mean: number | null
}

export interface ExitByRatingRow {
  rating: string
  rated: number
  /** Null when fewer than 5 people had the rating (the rate is hidden too). */
  voluntary: number | null
  involuntary: number | null
  voluntaryRate: number | null
  involuntaryRate: number | null
  rate: number | null
}

export interface ExitByRatingLong {
  rating: string
  type: 'Voluntary' | 'Involuntary'
  rate: number | null
}

export interface InflationFlag {
  businessUnit: string
  rated: number
  high: number
  share: number
  /** Shares in the earlier cycles, oldest first. */
  history: { cycle: string; share: number | null }[]
  rest: number | null
}

/** The people rated at one rating in the exit cycle, and who of them left within 12 months. */
export interface ExitCohort {
  reviews: Review[]
  voluntary: Employee[]
  involuntary: Employee[]
}

/**
 * The reviews behind each Performance number, for drill-down. Groups whose numbers are hidden
 * (fewer than 5 people) carry no records, so a hidden number never opens its people.
 */
export interface PerformanceRecords {
  /** Scoped reviews with a rating in the latest cycle (the distribution's people). */
  rated: Review[]
  /** Rated reviews per rating, index rating − 1. */
  byRating: Review[][]
  /** One review per active employee rated in the latest cycle (the coverage numerator). */
  ratedActive: Review[]
  /** Rated reviews per row label of the folded breakdowns ("Other (k)" holds the folded groups). */
  byDepartment: Map<string, Review[]>
  byBusinessUnit: Map<string, Review[]>
  byLevel: Map<string, Review[]>
  /** Rated reviews per business unit of the rating mix (units with 5 or more rated). */
  mix: Map<string, Review[]>
  /** Reviews with a proposed and a final rating, per business unit with 5 or more of them. */
  calibration: Map<string, Review[]>
  /** Rated reviews per cycle and business unit (cycleKey), where the average is shown. */
  cycles: Map<string, Review[]>
  /** Per rating (index rating − 1) in the exit cycle; null when the rating is hidden. */
  exitCohort: (ExitCohort | null)[]
}

/** Key of `PerformanceRecords.cycles`. */
export const cycleKey = (cycle: string, businessUnit: string): string => `${cycle}|${businessUnit}`

export interface PerformanceResult {
  cycle: Cycle | null
  /** Scoped reviews in the latest cycle. */
  rated: number
  /** Scoped active employees with a rating in the latest cycle. */
  ratedActive: number
  /** People rated in the latest cycle who have left since (they still count in the distribution). */
  ratedLeft: number
  activeCount: number
  coverage: number | null
  highShare: number | null
  distribution: DistributionRow[]
  distributionLong: DistributionLong[]
  /** Groups under 5 rated fold into a last "Other (k)" row. */
  byDepartment: HighShareRow[]
  byBusinessUnit: HighShareRow[]
  /** In level order, small levels folded into a last "Other (k)" row. */
  byLevel: HighShareRow[]
  mix: MixRow[]
  calibration: CalibrationRow[]
  calibrationCompany: CalibrationRow | null
  /**
   * Business units where calibration lowered ratings by more than the flag setting (0.3 by
   * default) on average, with the rest for comparison.
   */
  calibrationFlags: { row: CalibrationRow; rest: CalibrationRow }[]
  cycles: CycleRow[]
  /**
   * Business unit to emphasize on the cycle trend: the one flagged for rating inflation, else the
   * one whose average strays furthest from the company across cycles.
   */
  outlierUnit: string | null
  outlierWhy: 'inflation' | 'deviation' | null
  exitCycle: Cycle | null
  exitByRating: ExitByRatingRow[]
  exitByRatingLong: ExitByRatingLong[]
  inflation: InflationFlag[]
  /** Share rated 4-5 per cycle, company scope, for the KPI trend. */
  highTrend: { cycle: string; share: number | null }[]
  records: PerformanceRecords
}

/** k ÷ n, or null when n is under the anonymity minimum. */
const shareOf =
  (min: number) =>
  (k: number, n: number): number | null =>
    n >= min ? k / n : null

function ratedIn(base: TalentBase, cycle: string): Review[] {
  return base.allReviews.filter((r) => r.cycle === cycle && base.scopeIds.has(r.employeeId))
}

/** Share rated 4-5 per group, with the rated reviews behind each group. */
function highShares(
  base: TalentBase,
  rows: readonly Review[],
  key: 'department' | 'businessUnit' | 'level',
): { rows: HighShareRow[]; byGroup: Map<string, Review[]> } {
  const { highRating, minGroup } = base.settings
  const share = shareOf(minGroup)
  const byGroup = new Map<string, Review[]>()
  for (const r of rows) {
    const e = base.byId.get(r.employeeId)
    if (!e || normRating(r.rating) == null) continue
    pushTo(byGroup, e[key] ?? 'Unknown', r)
  }
  const out = [...byGroup.entries()]
    .map(([group, list]) => {
      const high = list.filter((r) => (normRating(r.rating) ?? 0) >= highRating).length
      return { group, rated: list.length, high, share: share(high, list.length) }
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.rated - a.rated)
  return { rows: out, byGroup }
}

/** A folded breakdown and the reviews behind each of its rows. */
function foldWithRecords(
  groups: { rows: HighShareRow[]; byGroup: Map<string, Review[]> },
  min: number,
  order?: (a: HighShareRow, b: HighShareRow) => number,
): { rows: HighShareRow[]; records: Map<string, Review[]> } {
  const rows = foldHighShares(order ? [...groups.rows].sort(order) : groups.rows, min)
  const records = recordsByLabel(rows, groups.byGroup, {
    label: (r) => r.group,
    folded: (r) => !!r.other,
    shown: (r) => r.high != null,
  })
  return { rows, records }
}

/**
 * Small groups folded into "Other (k)" so no count over fewer people than the anonymity minimum
 * (`min`, 5 by default) is exported.
 */
export function foldHighShares(rows: readonly HighShareRow[], min: number = MIN_GROUP): HighShareRow[] {
  const share = shareOf(min)
  return foldSmallGroups(
    rows,
    (r) => r.rated,
    (folded, label) => {
      const rated = folded.reduce((s, r) => s + r.rated, 0)
      const high = folded.reduce((s, r) => s + (r.high ?? 0), 0)
      return {
        group: label,
        rated,
        high: rated >= min ? high : null,
        share: share(high, rated),
        other: true,
        groups: folded.length,
      }
    },
    min,
  )
}

/** Reviews with both a manager-proposed and a final rating. */
const calibrated = (rows: readonly Review[]): Review[] =>
  rows.filter((r) => normRating(r.preCalibrationRating) != null && normRating(r.rating) != null)

function calibrationRow(businessUnit: string, rows: Review[], min: number): CalibrationRow {
  const pairs = calibrated(rows).map(
    (r) => [normRating(r.preCalibrationRating)!, normRating(r.rating)!] as const,
  )
  const n = pairs.length
  const ok = n >= min
  return {
    businessUnit,
    n,
    proposed: ok ? mean(pairs.map((p) => p[0])) : null,
    final: ok ? mean(pairs.map((p) => p[1])) : null,
    shift: ok ? mean(pairs.map((p) => p[0] - p[1])) : null,
    movedDown: ok ? pairs.filter((p) => p[0] > p[1]).length / n : null,
    movedUp: ok ? pairs.filter((p) => p[0] < p[1]).length / n : null,
  }
}

export function computePerformance(base: TalentBase): PerformanceResult {
  const { asOf } = base
  const { minGroup, highRating, guideline: guide, highGuideline, findings: rule } = base.settings
  const share = shareOf(minGroup)
  const cycle = base.latest
  const rows = cycle ? ratedIn(base, cycle.cycle) : []
  const rated = rows.filter((r) => normRating(r.rating) != null)
  const byRating: Review[][] = RATINGS.map(() => [])
  for (const r of rated) byRating[normRating(r.rating)! - 1].push(r)
  const n = rated.length
  const counts = byRating.map((list) => list.length)
  const distribution: DistributionRow[] = RATINGS.map((r, i) => {
    const s = share(counts[i], n)
    const guideline = guide[r] ?? 0
    return {
      rating: r,
      label: ratingLabel(r),
      people: counts[i],
      share: s,
      guideline,
      gap: s == null ? null : s - guideline,
    }
  })
  const distributionLong: DistributionLong[] = distribution.flatMap((d) => [
    { rating: d.label, series: 'Actual' as const, share: d.share },
    { rating: d.label, series: 'Guideline' as const, share: d.guideline },
  ])
  const high = byRating.reduce((s, list, i) => s + (i + 1 >= highRating ? list.length : 0), 0)
  // One review per active employee rated in the cycle (any rating value, as before).
  const reviewOf = new Map(rows.map((r) => [r.employeeId, r]))
  const ratedActiveReviews = base.active.flatMap((e) => reviewOf.get(e.employeeId) ?? [])
  const ratedActive = ratedActiveReviews.length
  const ratedLeft = rated.filter((r) => {
    const t = base.byId.get(r.employeeId)?.terminationDate
    return !!t && t <= asOf
  }).length

  // Rating mix by business unit.
  const byUnit = new Map<string, Review[]>()
  for (const r of rows) {
    const e = base.byId.get(r.employeeId)
    if (e) pushTo(byUnit, e.businessUnit, r)
  }
  const mixRecords = new Map<string, Review[]>()
  const mix: MixRow[] = [...byUnit.entries()]
    .map(([businessUnit, list]) => {
      const valid = list.filter((r) => normRating(r.rating) != null)
      if (valid.length >= minGroup) mixRecords.set(businessUnit, valid)
      const s = (k: number) => share(valid.filter((r) => normRating(r.rating) === k).length, valid.length)
      return { businessUnit, rated: valid.length, r1: s(1), r2: s(2), r3: s(3), r4: s(4), r5: s(5) }
    })
    .sort((a, b) => b.rated - a.rated)

  const calibrationRecords = new Map<string, Review[]>()
  for (const [bu, list] of byUnit) {
    const pairs = calibrated(list)
    if (pairs.length >= minGroup) calibrationRecords.set(bu, pairs)
  }
  const calibration = [...byUnit.entries()]
    .map(([bu, list]) => calibrationRow(bu, list, minGroup))
    .filter((c) => c.n > 0)
    .sort((a, b) => (b.shift ?? -9) - (a.shift ?? -9))
  const calibrationCompany =
    rows.length && base.has.preCalibration ? calibrationRow('All business units', rows, minGroup) : null
  const calibrationFlags = calibration
    .filter((c) => c.shift != null && c.shift > rule.calibrationShift && c.n >= rule.calibrationMinRated)
    .map((row) => ({
      row,
      rest: calibrationRow(
        'Rest of scope',
        rows.filter((r) => base.byId.get(r.employeeId)?.businessUnit !== row.businessUnit),
        minGroup,
      ),
    }))
    .filter((f) => f.rest.shift != null)

  // Average rating by cycle and business unit (scoped, every cycle up to asOf).
  const pastCycles = base.reviews.cycles.filter((c) => c.cycleDate <= asOf)
  const cycles: CycleRow[] = []
  const companyMean = new Map<string, number | null>()
  const highTrend: { cycle: string; share: number | null }[] = []
  const cycleRecords = new Map<string, Review[]>()
  for (const c of pastCycles) {
    const list = ratedIn(base, c.cycle)
    const groups = new Map<string, Review[]>()
    const allRatings: number[] = []
    for (const r of list) {
      const e = base.byId.get(r.employeeId)
      const v = normRating(r.rating)
      if (!e || v == null) continue
      allRatings.push(v)
      pushTo(groups, e.businessUnit, r)
    }
    companyMean.set(c.cycle, mean(allRatings))
    highTrend.push({
      cycle: c.cycle,
      share: share(allRatings.filter((v) => v >= highRating).length, allRatings.length),
    })
    for (const [bu, reviews] of groups) {
      const shown = reviews.length >= minGroup
      if (shown) cycleRecords.set(cycleKey(c.cycle, bu), reviews)
      cycles.push({
        cycle: c.cycle,
        cycleDate: c.cycleDate,
        businessUnit: bu,
        rated: reviews.length,
        mean: shown ? mean(reviews.map((r) => normRating(r.rating)!)) : null,
      })
    }
  }
  let outlierUnit: string | null = null
  let worst = 0
  for (const bu of new Set(cycles.map((c) => c.businessUnit))) {
    const devs = cycles
      .filter((c) => c.businessUnit === bu && c.mean != null && c.rated >= rule.inflationMinRated)
      .map((c) => Math.abs((c.mean ?? 0) - (companyMean.get(c.cycle) ?? 0)))
    const dev = mean(devs)
    if (dev != null && devs.length >= 2 && dev > worst) {
      worst = dev
      outlierUnit = bu
    }
  }

  // Exit rate within 12 months of a rating: the latest cycle with a full 12 months of follow-up.
  const exitCycle = [...pastCycles].reverse().find((c) => addMonths(c.cycleDate, 12) <= asOf) ?? null
  const exitByRating: ExitByRatingRow[] = []
  const exitCohort: (ExitCohort | null)[] = []
  if (exitCycle) {
    const end = addMonths(exitCycle.cycleDate, 12)
    const groups: ExitCohort[] = RATINGS.map(() => ({ reviews: [], voluntary: [], involuntary: [] }))
    for (const r of ratedIn(base, exitCycle.cycle)) {
      const e = base.byId.get(r.employeeId)
      const v = normRating(r.rating)
      if (!e || v == null || !isEmployee(e)) continue
      const g = groups[v - 1]
      g.reviews.push(r)
      const t = e.terminationDate
      if (t && t > exitCycle.cycleDate && t <= end) {
        if (e.terminationType === 'Voluntary') g.voluntary.push(e)
        else if (e.terminationType === 'Involuntary') g.involuntary.push(e)
      }
    }
    const hasType = base.has.terminationType
    RATINGS.forEach((r, i) => {
      const g = groups[i]
      const ratedN = g.reviews.length
      const shown = ratedN >= minGroup
      exitCohort.push(shown ? g : null)
      exitByRating.push({
        rating: ratingLabel(r),
        rated: ratedN,
        voluntary: shown ? g.voluntary.length : null,
        involuntary: shown ? g.involuntary.length : null,
        voluntaryRate: hasType ? share(g.voluntary.length, ratedN) : null,
        involuntaryRate: hasType ? share(g.involuntary.length, ratedN) : null,
        rate: hasType ? share(g.voluntary.length + g.involuntary.length, ratedN) : null,
      })
    })
  }
  const exitByRatingLong: ExitByRatingLong[] = exitByRating.flatMap((r) => [
    { rating: r.rating, type: 'Voluntary' as const, rate: r.voluntaryRate },
    { rating: r.rating, type: 'Involuntary' as const, rate: r.involuntaryRate },
  ])

  // Rating inflation: a business unit's share of high performers more than the inflation setting
  // (8 pts by default) above the guideline share at those ratings.
  const units = highShares(base, rated, 'businessUnit')
  const inflation: InflationFlag[] = []
  for (const g of units.rows) {
    if (
      g.share == null ||
      g.high == null ||
      g.rated < rule.inflationMinRated ||
      g.share - highGuideline <= rule.inflationPts
    )
      continue
    const restRated = n - g.rated
    const restHigh = high - g.high
    inflation.push({
      businessUnit: g.group,
      rated: g.rated,
      high: g.high,
      share: g.share,
      history: pastCycles
        .filter((c) => c.cycle !== cycle?.cycle)
        .map((c) => {
          const list = ratedIn(base, c.cycle).filter(
            (r) => base.byId.get(r.employeeId)?.businessUnit === g.group,
          )
          const vals = list.map((r) => normRating(r.rating)).filter((v): v is number => v != null)
          return { cycle: c.cycle, share: share(vals.filter((v) => v >= highRating).length, vals.length) }
        }),
      rest: share(restHigh, restRated),
    })
  }

  const flagged = inflation[0]?.businessUnit ?? null
  const byDepartment = foldWithRecords(highShares(base, rated, 'department'), minGroup)
  const byLevel = foldWithRecords(
    highShares(base, rated, 'level'),
    minGroup,
    (a, b) => levelRank(a.group) - levelRank(b.group),
  )
  const byBusinessUnit = foldWithRecords(units, minGroup)
  return {
    cycle,
    rated: n,
    ratedActive,
    ratedLeft,
    activeCount: base.active.length,
    coverage: base.active.length ? ratedActive / base.active.length : null,
    highShare: share(high, n),
    distribution,
    distributionLong,
    byDepartment: byDepartment.rows,
    byLevel: byLevel.rows,
    byBusinessUnit: byBusinessUnit.rows,
    mix,
    calibration,
    calibrationCompany,
    calibrationFlags,
    cycles,
    outlierUnit: flagged ?? outlierUnit,
    outlierWhy: flagged ? 'inflation' : outlierUnit ? 'deviation' : null,
    exitCycle,
    exitByRating,
    exitByRatingLong,
    inflation,
    highTrend,
    records: {
      rated,
      byRating,
      ratedActive: ratedActiveReviews,
      byDepartment: byDepartment.records,
      byBusinessUnit: byBusinessUnit.records,
      byLevel: byLevel.records,
      mix: mixRecords,
      calibration: calibrationRecords,
      cycles: cycleRecords,
      exitCohort,
    },
  }
}

const levelRank = (l: string) => {
  const i = (LEVELS as readonly string[]).indexOf(l)
  return i < 0 ? LEVELS.length : i
}
