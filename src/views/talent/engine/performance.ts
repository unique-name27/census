/**
 * Performance: rating distribution against the guideline, where ratings run high, how much
 * calibration moved them, how averages moved across cycles, and how ratings relate to exits.
 * Pure: no React, no DOM.
 */
import { type ISODate, LEVELS, MIN_GROUP, RATING_GUIDELINE, RATING_LABELS, type Review } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { isEmployee } from '@/lib/people'
import { mean } from '@/lib/stats'
import { type Cycle, normRating, type TalentBase } from './base'

export const RATINGS = [1, 2, 3, 4, 5] as const
export const ratingLabel = (r: number): string => `${r} ${RATING_LABELS[r] ?? ''}`.trim()
export const RATING_ORDER = RATINGS.map(ratingLabel)
/** Guideline share rated 4 or 5. */
export const HIGH_GUIDELINE = (RATING_GUIDELINE[4] ?? 0) + (RATING_GUIDELINE[5] ?? 0)
/** A business unit is flagged when its share rated 4-5 is this far above the guideline. */
export const INFLATION_PTS = 0.08
export const INFLATION_MIN_N = 20
/** A business unit is flagged when calibration moved its ratings down by more than this. */
export const CALIBRATION_FLAG = 0.3

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
  high: number
  share: number | null
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
  voluntary: number
  involuntary: number
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

export interface PerformanceResult {
  cycle: Cycle | null
  /** Scoped reviews in the latest cycle. */
  rated: number
  /** Scoped active employees with a rating in the latest cycle. */
  ratedActive: number
  activeCount: number
  coverage: number | null
  highShare: number | null
  distribution: DistributionRow[]
  distributionLong: DistributionLong[]
  byDepartment: HighShareRow[]
  byBusinessUnit: HighShareRow[]
  /** In level order. */
  byLevel: HighShareRow[]
  mix: MixRow[]
  calibration: CalibrationRow[]
  calibrationCompany: CalibrationRow | null
  /** Business units where calibration lowered ratings by more than 0.3 on average, with the rest for comparison. */
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
}

const share = (k: number, n: number): number | null => (n >= MIN_GROUP ? k / n : null)

function ratedIn(base: TalentBase, cycle: string): Review[] {
  return base.ctx.all.reviews.filter((r) => r.cycle === cycle && base.scopeIds.has(r.employeeId))
}

function highShares(
  base: TalentBase,
  rows: Review[],
  key: 'department' | 'businessUnit' | 'level',
): HighShareRow[] {
  const groups = new Map<string, { rated: number; high: number }>()
  for (const r of rows) {
    const e = base.byId.get(r.employeeId)
    const rating = normRating(r.rating)
    if (!e || rating == null) continue
    const k = e[key] ?? 'Unknown'
    const g = groups.get(k) ?? { rated: 0, high: 0 }
    g.rated++
    if (rating >= 4) g.high++
    groups.set(k, g)
  }
  return [...groups.entries()]
    .map(([group, g]) => ({ group, rated: g.rated, high: g.high, share: share(g.high, g.rated) }))
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || b.rated - a.rated)
}

function calibrationRow(businessUnit: string, rows: Review[]): CalibrationRow {
  const pairs = rows
    .map((r) => [normRating(r.preCalibrationRating), normRating(r.rating)] as const)
    .filter((p): p is readonly [number, number] => p[0] != null && p[1] != null)
  const n = pairs.length
  const ok = n >= MIN_GROUP
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
  const cycle = base.latest
  const rows = cycle ? ratedIn(base, cycle.cycle) : []
  const ratings = rows.map((r) => normRating(r.rating)).filter((r): r is number => r != null)
  const n = ratings.length
  const counts = RATINGS.map((r) => ratings.filter((x) => x === r).length)
  const distribution: DistributionRow[] = RATINGS.map((r, i) => {
    const s = share(counts[i], n)
    const guideline = RATING_GUIDELINE[r] ?? 0
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
  const high = ratings.filter((r) => r >= 4).length
  const ratedIds = new Set(rows.map((r) => r.employeeId))
  const ratedActive = base.active.filter((e) => ratedIds.has(e.employeeId)).length

  // Rating mix by business unit.
  const byUnit = new Map<string, Review[]>()
  for (const r of rows) {
    const e = base.byId.get(r.employeeId)
    if (!e) continue
    const arr = byUnit.get(e.businessUnit)
    if (arr) arr.push(r)
    else byUnit.set(e.businessUnit, [r])
  }
  const mix: MixRow[] = [...byUnit.entries()]
    .map(([businessUnit, list]) => {
      const rs = list.map((r) => normRating(r.rating)).filter((r): r is number => r != null)
      const s = (k: number) => share(rs.filter((x) => x === k).length, rs.length)
      return { businessUnit, rated: rs.length, r1: s(1), r2: s(2), r3: s(3), r4: s(4), r5: s(5) }
    })
    .sort((a, b) => b.rated - a.rated)

  const calibration = [...byUnit.entries()]
    .map(([bu, list]) => calibrationRow(bu, list))
    .filter((c) => c.n > 0)
    .sort((a, b) => (b.shift ?? -9) - (a.shift ?? -9))
  const calibrationCompany =
    rows.length && base.has.preCalibration ? calibrationRow('All business units', rows) : null
  const calibrationFlags = calibration
    .filter((c) => c.shift != null && c.shift > CALIBRATION_FLAG && c.n >= INFLATION_MIN_N)
    .map((row) => ({
      row,
      rest: calibrationRow(
        'Rest of scope',
        rows.filter((r) => base.byId.get(r.employeeId)?.businessUnit !== row.businessUnit),
      ),
    }))
    .filter((f) => f.rest.shift != null)

  // Average rating by cycle and business unit (scoped, every cycle up to asOf).
  const pastCycles = base.reviews.cycles.filter((c) => c.cycleDate <= asOf)
  const cycles: CycleRow[] = []
  const companyMean = new Map<string, number | null>()
  const highTrend: { cycle: string; share: number | null }[] = []
  for (const c of pastCycles) {
    const list = ratedIn(base, c.cycle)
    const groups = new Map<string, number[]>()
    const allRatings: number[] = []
    for (const r of list) {
      const e = base.byId.get(r.employeeId)
      const v = normRating(r.rating)
      if (!e || v == null) continue
      allRatings.push(v)
      const g = groups.get(e.businessUnit) ?? []
      g.push(v)
      groups.set(e.businessUnit, g)
    }
    companyMean.set(c.cycle, mean(allRatings))
    highTrend.push({
      cycle: c.cycle,
      share: share(allRatings.filter((v) => v >= 4).length, allRatings.length),
    })
    for (const [bu, vals] of groups) {
      cycles.push({
        cycle: c.cycle,
        cycleDate: c.cycleDate,
        businessUnit: bu,
        rated: vals.length,
        mean: vals.length >= MIN_GROUP ? mean(vals) : null,
      })
    }
  }
  let outlierUnit: string | null = null
  let worst = 0
  for (const bu of new Set(cycles.map((c) => c.businessUnit))) {
    const devs = cycles
      .filter((c) => c.businessUnit === bu && c.mean != null && c.rated >= INFLATION_MIN_N)
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
  if (exitCycle) {
    const end = addMonths(exitCycle.cycleDate, 12)
    const groups = RATINGS.map(() => ({ rated: 0, voluntary: 0, involuntary: 0 }))
    for (const r of ratedIn(base, exitCycle.cycle)) {
      const e = base.byId.get(r.employeeId)
      const v = normRating(r.rating)
      if (!e || v == null || !isEmployee(e)) continue
      const g = groups[v - 1]
      g.rated++
      const t = e.terminationDate
      if (t && t > exitCycle.cycleDate && t <= end) {
        if (e.terminationType === 'Voluntary') g.voluntary++
        else if (e.terminationType === 'Involuntary') g.involuntary++
      }
    }
    const hasType = base.has.terminationType
    RATINGS.forEach((r, i) => {
      const g = groups[i]
      exitByRating.push({
        rating: ratingLabel(r),
        rated: g.rated,
        voluntary: g.voluntary,
        involuntary: g.involuntary,
        voluntaryRate: hasType ? share(g.voluntary, g.rated) : null,
        involuntaryRate: hasType ? share(g.involuntary, g.rated) : null,
        rate: hasType ? share(g.voluntary + g.involuntary, g.rated) : null,
      })
    })
  }
  const exitByRatingLong: ExitByRatingLong[] = exitByRating.flatMap((r) => [
    { rating: r.rating, type: 'Voluntary' as const, rate: r.voluntaryRate },
    { rating: r.rating, type: 'Involuntary' as const, rate: r.involuntaryRate },
  ])

  // Rating inflation: a business unit's share rated 4-5 more than 8 pts above the guideline.
  const byBusinessUnit = highShares(base, rows, 'businessUnit')
  const inflation: InflationFlag[] = []
  for (const g of byBusinessUnit) {
    if (g.share == null || g.rated < INFLATION_MIN_N || g.share - HIGH_GUIDELINE <= INFLATION_PTS) continue
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
          return { cycle: c.cycle, share: share(vals.filter((v) => v >= 4).length, vals.length) }
        }),
      rest: share(restHigh, restRated),
    })
  }

  const flagged = inflation[0]?.businessUnit ?? null
  return {
    cycle,
    rated: n,
    ratedActive,
    activeCount: base.active.length,
    coverage: base.active.length ? ratedActive / base.active.length : null,
    highShare: share(high, n),
    distribution,
    distributionLong,
    byDepartment: highShares(base, rows, 'department'),
    byLevel: highShares(base, rows, 'level').sort((a, b) => levelRank(a.group) - levelRank(b.group)),
    byBusinessUnit,
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
  }
}

const levelRank = (l: string) => {
  const i = (LEVELS as readonly string[]).indexOf(l)
  return i < 0 ? LEVELS.length : i
}
