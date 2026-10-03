/**
 * Who left, when, why, and from where. Rates are annualized exits ÷ average headcount
 * (`@/lib/people` conventions); groups under 5 average headcount are suppressed (null).
 */
import { type Employee, type ISODate, LEVELS, RATING_LABELS, VOLUNTARY_REASONS } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import {
  attrition,
  buildReviewIndex,
  exitsIn,
  isEmployee,
  reviewAt,
  TENURE_BANDS,
  tenureBand,
  tenureYears,
} from '@/lib/people'
import type { Prep } from './base'
import { quarterBlocks } from './base'
import { annualRate, exitsByGroup, leftInFirstYear } from './rates'
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
}

export interface RegrettedQuarterRow {
  quarterEnd: ISODate
  quarter: string
  series: string
  regretted: number
  avgHeadcount: number
  rate: number | null
}

export interface ReasonRow {
  reason: string
  exits: number
  share: number
}

export interface GroupRateRow {
  group: string
  avgHeadcount: number
  exits: number
  voluntary: number
  rate: number | null
  voluntaryRate: number | null
}

export interface TypedCountRow {
  group: string
  type: ExitType
  exits: number
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
}

export const SCOPE_SERIES = 'This scope'
export const COMPANY_SERIES = 'Company'
export const NOT_RATED = 'Not rated'

export const exitType = (e: Employee): ExitType =>
  e.terminationType === 'Voluntary' || e.terminationType === 'Involuntary'
    ? e.terminationType
    : 'Not recorded'

/** The cohort behind first-year attrition: employees hired 12 to 24 months before asOf (same bounds as `firstYearAttrition`). */
export function firstYearCohort(emps: readonly Employee[], asOf: ISODate): Employee[] {
  const from = addMonths(asOf, -24)
  const to = addMonths(asOf, -12)
  return emps.filter((e) => isEmployee(e) && e.hireDate > from && e.hireDate <= to)
}

export function cohortSummary(emps: readonly Employee[], asOf: ISODate): CohortSummary {
  const cohort = firstYearCohort(emps, asOf)
  const leavers = cohort.filter(leftInFirstYear).length
  return {
    rate: cohort.length >= 5 ? leavers / cohort.length : null,
    cohort: cohort.length,
    leavers,
    from: addMonths(asOf, -24),
    to: addMonths(asOf, -12),
  }
}

function groupRows(map: ReturnType<typeof exitsByGroup>, p: Prep, typed: boolean): GroupRateRow[] {
  return [...map.values()]
    .map((g) => ({
      group: g.key,
      avgHeadcount: g.avgHeadcount,
      exits: g.exits,
      voluntary: g.voluntary,
      rate: annualRate(g.exits, g.avgHeadcount, p.window),
      voluntaryRate: typed ? annualRate(g.voluntary, g.avgHeadcount, p.window) : null,
    }))
    .sort((a, b) => b.avgHeadcount - a.avgHeadcount)
}

export function computeAttrition(p: Prep): AttritionModel {
  const { emps, window, asOf, ctx } = p
  const typed = p.has.terminationType
  const blocks = quarterBlocks(asOf, 8)

  const quarters: QuarterExitRow[] = []
  const regrettedByQuarter: RegrettedQuarterRow[] = []
  const companyByQuarter = ctx.isCompany ? null : p.companyEmps
  for (const b of blocks) {
    const g = exitsByGroup(emps, b, () => 'all').get('all')
    const avg = g?.avgHeadcount ?? 0
    const exits = exitsIn(emps, b)
    for (const type of EXIT_TYPES) {
      const n = exits.filter((e) => exitType(e) === type).length
      if (type === 'Not recorded' && n === 0) continue
      quarters.push({
        quarter: b.label,
        start: b.start,
        end: b.end,
        type,
        exits: n,
        avgHeadcount: avg,
        rate: annualRate(n, avg, b),
      })
    }
    if (typed && p.has.regrettable) {
      regrettedByQuarter.push({
        quarterEnd: b.end,
        quarter: b.label,
        series: SCOPE_SERIES,
        regretted: g?.regretted ?? 0,
        avgHeadcount: avg,
        rate: annualRate(g?.regretted ?? 0, avg, b),
      })
      if (companyByQuarter) {
        const c = exitsByGroup(companyByQuarter, b, () => 'all').get('all')
        regrettedByQuarter.push({
          quarterEnd: b.end,
          quarter: b.label,
          series: COMPANY_SERIES,
          regretted: c?.regretted ?? 0,
          avgHeadcount: c?.avgHeadcount ?? 0,
          rate: annualRate(c?.regretted ?? 0, c?.avgHeadcount ?? 0, b),
        })
      }
    }
  }

  const leavers = exitsIn(emps, window)
  const voluntary = leavers.filter((e) => e.terminationType === 'Voluntary')
  const reasonCounts = new Map<string, number>()
  for (const e of voluntary) {
    if (!e.terminationReason) continue
    reasonCounts.set(e.terminationReason, (reasonCounts.get(e.terminationReason) ?? 0) + 1)
  }
  const withReason = [...reasonCounts.values()].reduce((a, b) => a + b, 0)
  const taxonomy = VOLUNTARY_REASONS as readonly string[]
  const reasons: ReasonRow[] = [...reasonCounts.entries()]
    .map(([reason, n]) => ({ reason, exits: n, share: withReason ? n / withReason : 0 }))
    .sort((a, b) => b.exits - a.exits || taxonomy.indexOf(a.reason) - taxonomy.indexOf(b.reason))

  const byDepartment = groupRows(
    exitsByGroup(emps, window, (e) => e.department || 'Not recorded'),
    p,
    typed,
  )
  const byLocation = groupRows(
    exitsByGroup(emps, window, (e) => e.location || 'Not recorded'),
    p,
    typed,
  )
  const levelOrder = new Map<string, number>(LEVELS.map((l, i) => [l, i]))
  const byLevel = groupRows(
    exitsByGroup(
      emps,
      window,
      (e) => e.level ?? NO_LEVEL,
      (e, d) => p.history.levelAt(e, d) ?? NO_LEVEL,
    ),
    p,
    typed,
  ).sort((a, b) => (levelOrder.get(a.group) ?? 99) - (levelOrder.get(b.group) ?? 99))

  const byTenure: TypedCountRow[] = []
  for (const band of TENURE_BANDS) {
    for (const type of EXIT_TYPES) {
      const n = leavers.filter(
        (e) => exitType(e) === type && tenureBand(tenureYears(e, e.terminationDate as string)) === band,
      ).length
      if (type === 'Not recorded' && !leavers.some((e) => exitType(e) === 'Not recorded')) continue
      byTenure.push({ group: band, type, exits: n })
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
  if (p.has.reviews) {
    const groups = [5, 4, 3, 2, 1].map((r) => ratingLabel(r)).concat(NOT_RATED)
    const labelled = leavers.map((e) => ({ e, label: ratingLabel(lastRating(e)) }))
    for (const group of groups) {
      for (const type of EXIT_TYPES) {
        if (type === 'Not recorded' && !leavers.some((e) => exitType(e) === 'Not recorded')) continue
        byRating.push({
          group,
          type,
          exits: labelled.filter((x) => x.label === group && exitType(x.e) === type).length,
        })
      }
    }
  }

  const regrettedLeavers: LeaverRow[] = voluntary
    .filter((e) => e.regrettable === true)
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

  const companyRate = (kind: 'all' | 'voluntary' | 'regretted') => attrition(p.companyEmps, window, kind).rate
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
      all: companyRate('all'),
      voluntary: typed ? companyRate('voluntary') : null,
      regretted: typed && p.has.regrettable ? companyRate('regretted') : null,
    },
  }
}
