/**
 * The fields behind every quality of hire number (its lineage, docs/DATA-TIERS.md), in the People
 * stats lineage form: fields a number needs, and optional groups it reads only when their data is
 * loaded. A number's tier is the lowest of the fields it resolves to.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import {
  all,
  BUSINESS_UNIT,
  ifPresent,
  LEVEL_AT,
  type Lineage,
  LOCATION,
  need,
  optional,
  resolveLineage,
  scopeLineage,
} from '@/views/hrbp/engine/lineage'

/** Employees hired in the cohort window. */
const COHORT = need('employees.hireDate', 'employees.employmentType')

/** Stayed a year: any exit before the mark, regretted exits in the second year, reductions in force. */
export const RETENTION = all(
  COHORT,
  need('employees.terminationDate'),
  optional('employees.regrettable', 'employees.terminationType'),
  optional('employees.terminationReason'),
)

/** The first full review. */
export const PERFORMANCE = all(COHORT, need('reviews.rating', 'reviews.cycleDate', 'reviews.cycle'))

/** Quality of hire: both parts. */
export const SCORE = all(RETENTION, PERFORMANCE)

/** The expected score: site and level band at hire. */
export const MIX = all(LOCATION, LEVEL_AT)

export const UNIVERSITY = need('employees.university')
export const DEGREE = need('employees.degreeLevel')
export const FIELD = need('employees.fieldOfStudy')

/** Education recorded: a university or a degree level. */
export const EDUCATION = all(COHORT, optional('employees.university'), optional('employees.degreeLevel'))

/** Source of hire: the hired application, matched by name and start date. */
export const SOURCE = need(
  'candidates.source',
  'candidates.hiredDate',
  'candidates.candidateName',
  'employees.name',
)

/** The parts figure: every cut it holds, each only when its data is there. */
export const PARTS = all(
  SCORE,
  ifPresent(DEGREE),
  ifPresent(FIELD),
  ifPresent(SOURCE),
  BUSINESS_UNIT,
  LOCATION,
)

export { BUSINESS_UNIT, ifPresent, LOCATION }

/** The fields a lineage resolves to in this context, with the fields the active org filters read. */
export function usesIn(
  ctx: Pick<AnalyticsContext, 'quality' | 'filters'>,
  ...parts: Lineage[]
): readonly FieldRef[] {
  const present = (ref: FieldRef) => ctx.quality.fieldTier(ref) !== 'none'
  return resolveLineage(all(...parts, scopeLineage(ctx.filters)), present)
}
