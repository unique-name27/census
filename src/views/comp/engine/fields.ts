/**
 * The dataset fields behind the Compensation numbers, as plain data: the building blocks of the
 * view's lineage (`./lineage`) and of its metric dictionary entries (`../metrics.ts`). Only type
 * imports, so the metric catalog can load this without pulling in the quality index.
 */
import type { FieldRef, KnownFieldRef } from '@/data/quality/fieldRef'

type Part = FieldRef | readonly FieldRef[] | false | null | undefined

/** One list from groups and single fields, first mention first, no repeats. */
export function refs(...parts: Part[]): FieldRef[] {
  const out = new Set<FieldRef>()
  for (const p of parts) {
    if (!p) continue
    if (typeof p === 'string') out.add(p)
    else for (const r of p) out.add(r)
  }
  return [...out]
}

/**
 * Field lists checked against the record types at compile time. Each list leads with the fields
 * that define its measure: when several fields tie for the lowest tier, the first one explains
 * the badge, so "Range midpoint is 98% filled" beats "Employee ID is 100% filled".
 */
const known = (...r: KnownFieldRef[]): readonly FieldRef[] => r

/** Who is counted: active employees (headcount type) on the as-of date with a comp row and a base salary. */
export const POPULATION = known(
  'comp.baseSalary',
  'comp.employeeId',
  'employees.employeeId',
  'employees.employmentType',
  'employees.hireDate',
  'employees.terminationDate',
)
/** Compa-ratio: base salary ÷ range midpoint. */
export const COMPA = refs('comp.rangeMid', POPULATION)
/** Range position and penetration: base salary against the range minimum and maximum. */
export const POSITION = refs('comp.rangeMin', 'comp.rangeMax', POPULATION)
/** Market ratio: base salary ÷ market median. */
export const MARKET = refs('comp.marketP50', POPULATION)
/** How the ranges track the market: market median ÷ range midpoint. */
export const MARKET_VS_MID = known('comp.marketP50', 'comp.rangeMid')
/** Merit proposals. */
export const MERIT = refs('comp.meritPct', POPULATION)
export const PROMOTION: KnownFieldRef = 'comp.promotionPct'
/** Every USD amount and USD-weighted rate. */
export const FX: KnownFieldRef = 'comp.fxToUsd'
/** Each person's latest rating on or before the as-of date. */
export const RATING = known('reviews.employeeId', 'reviews.cycleDate', 'reviews.rating')
/** Promoted in the last 12 months, from job changes. */
export const PROMOTED = known('jobChanges.employeeId', 'jobChanges.changeType', 'jobChanges.effectiveDate')
/** Voluntary attrition, as `attrition()` in src/lib/people.ts counts it. */
export const VOLUNTARY_ATTRITION = known(
  'employees.hireDate',
  'employees.terminationDate',
  'employees.terminationType',
  'employees.employmentType',
)
/** Leavers who named pay as the reason. */
export const PAY_REASON: KnownFieldRef = 'employees.terminationReason'

/** The roster field behind each way the view groups people. */
export const BY = {
  location: 'employees.location',
  department: 'employees.department',
  businessUnit: 'employees.businessUnit',
  level: 'employees.level',
  tenureBand: 'employees.hireDate',
} as const satisfies Record<string, KnownFieldRef>
