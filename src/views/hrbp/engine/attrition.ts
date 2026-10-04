/**
 * Who left, when, why, and from where. Rates are annualized exits ÷ average headcount
 * (`@/lib/people` conventions, with the People stats settings); groups under the anonymity
 * minimum (5) are suppressed (null), and every rate is null when no Employees row has a
 * termination date (an active-only roster).
 */
import { type Employee, type ISODate, LEVELS, RATING_LABELS, VOLUNTARY_REASONS } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addMonths } from '@/lib/dates'
import { buildReviewIndex, isEmployee, reviewAt, TENURE_BANDS, tenureBand, tenureYears } from '@/lib/people'
import type { Prep } from './base'
import { quarterBlocks } from './base'
import { attrition, type Counts, exitsIn, leftWithin } from './population'
import { exitsByGroup, type GroupOptions } from './rates'
import { defaultSettings } from './settings'
import { NO_LEVEL } from './workforce'

export type ExitType = 'Voluntary' | 'Involuntary' | 'Not recorded'
export const EXIT_TYPES: ExitType[] = ['Voluntary', 'Involuntary', 'Not recorded']

export interface QuarterExitRow {
  quarter: string
  start: ISODate
  end: ISODate
  type: ExitType
  exits: number
  avgHeadcount: number
  rate: number | null
  /** The leavers behind `exits`; empty when the rate is hidden (average headcount under 5). */
  records: Employee[]
}

export interface RegrettedQuarterRow {
  quarterEnd: ISODate
  quarter: string
  series: string
  regretted: number
  avgHeadcount: number
  rate: number | null
  /** The regretted leavers behind `regretted`; empty when the rate is hidden. */
  records: Employee[]
}

export interface ReasonRow {
  reason: string
  exits: number
  share: number
  /** The voluntary leavers who gave this reason. */
  records: Employee[]
}

export interface GroupRateRow {
  group: string
  avgHeadcount: number
  exits: number
  voluntary: number
  rate: number | null
  voluntaryRate: number | null
  /** Every leaver behind `exits` (voluntary ones are a subset); empty when the group's rates are hidden. */
  leavers: Employee[]
}

export interface TypedCountRow {
  group: string
  type: ExitType
  exits: number
  /** The leavers behind `exits`. */
  records: Employee[]
}

export interface LeaverRow {
  employeeId: string
  name: string
  department: string
  location: string
  level: string
  manager: string
  managerId: string
  exitDate: ISODate
  reason: string
  lastRating: number | null
  tenure: number
}

export interface CohortSummary {
  rate: number | null
  cohort: number
  leavers: number
  from: ISODate
  to: ISODate
}

export interface AttritionModel {
  quarters: QuarterExitRow[]
  regrettedByQuarter: RegrettedQuarterRow[]
  reasons: ReasonRow[]
  voluntaryExits: number
  byDepartment: GroupRateRow[]
  byLocation: GroupRateRow[]
  byLevel: GroupRateRow[]
  byTenure: TypedCountRow[]
  byRating: TypedCountRow[]
  regrettedLeavers: LeaverRow[]
  company: { all: number | null; voluntary: number | null; regretted: number | null }
  /** Every employee exit in the window (the Other rows of the group charts are drawn from it). */
  leavers: Employee[]
  /** Voluntary exits marked regrettable in the window, behind `regrettedLeavers`. */
  regretted: Employee[]
  /** Last rating before leaving, per leaver in the window (empty without Reviews). */
  lastRating: Map<string, number | null>
}

export type AttritionDim = 'department' | 'location' | 'level'

/** The group a leaver counts in on the group charts (their record at exit). */
export const leaverGroup: Record<AttritionDim, (e: Employee) => string> = {
  department: (e) => e.department || 'Not recorded',
  location: (e) => e.location || 'Not recorded',
  level: (e) => e.level ?? NO_LEVEL,
}

export const SCOPE_SERIES = 'This scope'
export const COMPANY_SERIES = 'Company'
export const NOT_RATED = 'Not rated'

export const exitType = (e: Employee): ExitType =>
  e.terminationType === 'Voluntary' || e.terminationType === 'Involuntary'
    ? e.terminationType
    : 'Not recorded'

/** The cohort behind first-year attrition: employees hired 12 to 24 months before asOf (same bounds as `firstYearAttrition`). */
export function firstYearCohort(
  emps: readonly Employee[],
  asOf: ISODate,
  counts: Counts = isEmployee,
): Employee[] {
  const from = addMonths(asOf, -24)
  const to = addMonths(asOf, -12)
  return emps.filter((e) => counts(e) && e.hireDate > from && e.hireDate <= to)
}

export interface CohortOptions {
  counts?: Counts
  /** First-year leaver test (default: left within the registry's first-year window). */
  leftFirstYear?: (e: Employee) => boolean
  /** The anonymity minimum (default 5). */
  minGroup?: number
}

/** The cohort's size, its first-year leavers and the rate, null below the anonymity minimum. */
export function cohortSummary(
  emps: readonly Employee[],
  asOf: ISODate,
  opts: CohortOptions = {},
): CohortSummary {
  const left = opts.leftFirstYear ?? leftWithin(defaultSettings().firstYearDays)
  const minGroup = opts.minGroup ?? defaultSettings().minGroup
  const cohort = firstYearCohort(emps, asOf, opts.counts)
  const leavers = cohort.filter(left).length
  return {
    rate: cohort.length >= minGroup ? leavers / cohort.length : null,
    cohort: cohort.length,
    leavers,
    from: addMonths(asOf, -24),
    to: addMonths(asOf, -12),
  }
}

function groupRows(map: ReturnType<typeof exitsByGroup>, p: Prep, typed: boolean): GroupRateRow[] {
  const left = p.has.terminationDate
  const minGroup = p.set.minGroup
  return [...map.values()]
    .map((g) => ({
      group: g.key,
      avgHeadcount: g.avgHeadcount,
      exits: g.exits,
      voluntary: g.voluntary,
      rate: left ? p.rate(g.exits, g.avgHeadcount, p.window) : null,
      voluntaryRate: typed ? p.rate(g.voluntary, g.avgHeadcount, p.window) : null,
      // A group too small to show its rates has no records behind them either.
      leavers: g.avgHeadcount >= minGroup ? g.leavers : [],
    }))
    .sort((a, b) => b.avgHeadcount - a.avgHeadcount)
}

/** Who counts and what is regretted, for `exitsByGroup` inside the engine. */
export const groupOptions = (p: Prep): GroupOptions => ({ counts: p.counts, isRegretted: p.isRegretted })

/**
 * Voluntary exits and average headcount by department, counting each person in the department
 * they were in at each month end (transfers rebuilt from Job changes), as the level chart does.
 */
export function exitsByDepartment(
  emps: readonly Employee[],
  w: Window,
  deptAt: Prep['history']['deptAt'],
  opts: GroupOptions = {},
) {
  return exitsByGroup(emps, w, leaverGroup.department, (e, d) => deptAt(e, d) || 'Not recorded', opts)
}

export function computeAttrition(p: Prep): AttritionModel {
  const { emps, window, asOf, ctx } = p
  const left = p.has.terminationDate
  const typed = left && p.has.terminationType
  const blocks = quarterBlocks(asOf, 8)
  const minGroup = p.set.minGroup
  const by = groupOptions(p)

  const quarters: QuarterExitRow[] = []
  const regrettedByQuarter: RegrettedQuarterRow[] = []
  const companyByQuarter = ctx.isCompany ? null : p.companyEmps
  const isRegretted = p.isRegretted
  for (const b of blocks) {
    const g = exitsByGroup(emps, b, () => 'all', undefined, by).get('all')
    const avg = g?.avgHeadcount ?? 0
    const exits = g?.leavers ?? []
    for (const type of EXIT_TYPES) {
      const records = exits.filter((e) => exitType(e) === type)
      if (type === 'Not recorded' && records.length === 0) continue
      const rate = left ? p.rate(records.length, avg, b) : null
      quarters.push({
        quarter: b.label,
        start: b.start,
        end: b.end,
        type,
        exits: records.length,
        avgHeadcount: avg,
        rate,
        records: avg >= minGroup ? records : [],
      })
    }
    if (p.regrettedReady) {
      const rate = p.rate(g?.regretted ?? 0, avg, b)
      regrettedByQuarter.push({
        quarterEnd: b.end,
        quarter: b.label,
        series: SCOPE_SERIES,
        regretted: g?.regretted ?? 0,
        avgHeadcount: avg,
        rate,
        records: rate == null ? [] : exits.filter(isRegretted),
      })
      if (companyByQuarter) {
        const c = exitsByGroup(companyByQuarter, b, () => 'all', undefined, by).get('all')
        const cRate = p.rate(c?.regretted ?? 0, c?.avgHeadcount ?? 0, b)
        regrettedByQuarter.push({
          quarterEnd: b.end,
          quarter: b.label,
          series: COMPANY_SERIES,
          regretted: c?.regretted ?? 0,
          avgHeadcount: c?.avgHeadcount ?? 0,
          rate: cRate,
          records: cRate == null ? [] : (c?.leavers ?? []).filter(isRegretted),
        })
      }
    }
  }

  const leavers = exitsIn(emps, window, p.counts)
  const voluntary = leavers.filter((e) => e.terminationType === 'Voluntary')
  const byReason = new Map<string, Employee[]>()
  for (const e of voluntary) {
    if (!e.terminationReason) continue
    const arr = byReason.get(e.terminationReason)
    if (arr) arr.push(e)
    else byReason.set(e.terminationReason, [e])
  }
  const withReason = [...byReason.values()].reduce((a, b) => a + b.length, 0)
  const taxonomy = VOLUNTARY_REASONS as readonly string[]
  const reasons: ReasonRow[] = [...byReason.entries()]
    .map(([reason, records]) => ({
      reason,
      exits: records.length,
      share: withReason ? records.length / withReason : 0,
      records,
    }))
    .sort((a, b) => b.exits - a.exits || taxonomy.indexOf(a.reason) - taxonomy.indexOf(b.reason))

  const byDepartment = groupRows(exitsByDepartment(emps, window, p.history.deptAt, by), p, typed)
  const byLocation = groupRows(exitsByGroup(emps, window, leaverGroup.location, undefined, by), p, typed)
  const levelOrder = new Map<string, number>(LEVELS.map((l, i) => [l, i]))
  const byLevel = groupRows(
    exitsByGroup(emps, window, leaverGroup.level, (e, d) => p.history.levelAt(e, d) ?? NO_LEVEL, by),
    p,
    typed,
  ).sort((a, b) => (levelOrder.get(a.group) ?? 99) - (levelOrder.get(b.group) ?? 99))

  const byTenure: TypedCountRow[] = []
  const anyUntyped = leavers.some((e) => exitType(e) === 'Not recorded')
  for (const band of TENURE_BANDS) {
    for (const type of EXIT_TYPES) {
      if (type === 'Not recorded' && !anyUntyped) continue
      const records = leavers.filter(
        (e) => exitType(e) === type && tenureBand(tenureYears(e, e.terminationDate as string)) === band,
      )
      byTenure.push({ group: band, type, exits: records.length, records })
    }
  }

  const reviews = buildReviewIndex(ctx.data.reviews)
  const lastRating = (e: Employee): number | null => {
    const r = reviewAt(reviews, e.employeeId, e.terminationDate ?? asOf)
    return r ? r.rating : null
  }
  const ratingLabel = (r: number | null) =>
    r == null || !RATING_LABELS[Math.round(r)]
      ? NOT_RATED
      : `${Math.round(r)} ${RATING_LABELS[Math.round(r)]}`
  const byRating: TypedCountRow[] = []
  const lastRatings = new Map<string, number | null>()
  if (p.has.reviews) {
    for (const e of leavers) lastRatings.set(e.employeeId, lastRating(e))
    const groups = [5, 4, 3, 2, 1].map((r) => ratingLabel(r)).concat(NOT_RATED)
    const labelled = leavers.map((e) => ({ e, label: ratingLabel(lastRatings.get(e.employeeId) ?? null) }))
    for (const group of groups) {
      for (const type of EXIT_TYPES) {
        if (type === 'Not recorded' && !anyUntyped) continue
        const records = labelled.filter((x) => x.label === group && exitType(x.e) === type).map((x) => x.e)
        byRating.push({ group, type, exits: records.length, records })
      }
    }
  }

  const regretted = leavers.filter(isRegretted)
  const regrettedLeavers: LeaverRow[] = regretted
    .map((e) => ({
      employeeId: e.employeeId,
      name: e.name,
      department: e.department,
      location: e.location,
      level: e.level ?? NO_LEVEL,
      manager: p.name(e.managerId),
      managerId: e.managerId ?? '',
      exitDate: e.terminationDate as string,
      reason: e.terminationReason ?? 'Not recorded',
      lastRating: lastRating(e),
      tenure: tenureYears(e, e.terminationDate as string),
    }))
    .sort((a, b) => (a.exitDate < b.exitDate ? 1 : -1))

  const companyRate = (kind: 'all' | 'voluntary' | 'regretted') =>
    attrition(p.companyEmps, window, kind, {
      counts: p.counts,
      annualize: p.set.annualize,
      regretted: p.set.regretted,
    }).rate
  return {
    quarters,
    regrettedByQuarter,
    reasons,
    voluntaryExits: voluntary.length,
    byDepartment,
    byLocation,
    byLevel,
    byTenure,
    byRating,
    regrettedLeavers,
    company: {
      all: left ? companyRate('all') : null,
      voluntary: typed ? companyRate('voluntary') : null,
      regretted: p.regrettedReady ? companyRate('regretted') : null,
    },
    leavers,
    regretted,
    lastRating: lastRatings,
  }
}

/** Leavers in the window counted in any of `groups` on a group chart: the records behind an "Other" fold. */
export function leaversIn(
  a: Pick<AttritionModel, 'leavers'>,
  dim: AttritionDim,
  groups: Iterable<string>,
): Employee[] {
  const keys = new Set(groups)
  return a.leavers.filter((e) => keys.has(leaverGroup[dim](e)))
}
