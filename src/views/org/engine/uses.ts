/**
 * The Org chart's field lists (its lineage), as plain data. The metric dictionary entries in
 * `../metrics.ts` and the engine's `lineage.ts` both read these, so a metric's registered fields and
 * the fields its tile or figure declares come from one place. Type imports only: the metric
 * catalog loads this file, so it must not pull in the engine.
 */
import type { FieldRef, KnownFieldRef } from '@/data/quality/fieldRef'
import type { ColorBy } from './colorBy'

/** Who is on the chart: everyone active on the as-of date, one card per employee ID. */
export const ACTIVE_USES = [
  'employees.employeeId',
  'employees.hireDate',
  'employees.terminationDate',
] as const satisfies readonly KnownFieldRef[]

/** Reporting lines on top of that: spans, layers and the org under a leader. */
export const REPORTING_USES = [
  ...ACTIVE_USES,
  'employees.managerId',
] as const satisfies readonly KnownFieldRef[]

/** "Managing since" for new-manager flags: the move from an individual contributor to a manager level. */
export const MANAGING_SINCE_USES = [
  'jobChanges.employeeId',
  'jobChanges.effectiveDate',
  'jobChanges.fromLevel',
  'jobChanges.toLevel',
] as const satisfies readonly KnownFieldRef[]

/** Open requisitions counted under their hiring manager. */
export const OPEN_ROLE_USES = [
  'requisitions.reqId',
  'requisitions.status',
  'requisitions.hiringManagerId',
  'requisitions.openedDate',
] as const satisfies readonly KnownFieldRef[]

/** Open-role cards on the chart also show the number of openings. */
export const REQ_CARD_USES = [
  ...OPEN_ROLE_USES,
  'requisitions.openings',
] as const satisfies readonly KnownFieldRef[]

/** The field each color key encodes (tenure is measured from the hire date). */
export const COLOR_USES: Record<ColorBy, readonly KnownFieldRef[]> = {
  department: ['employees.department'],
  businessUnit: ['employees.businessUnit'],
  jobFamily: ['employees.jobFamily'],
  jobFunction: ['employees.jobFunction'],
  location: ['employees.location'],
  level: ['employees.level'],
  tenure: ['employees.hireDate'],
  none: [],
}

/** Exits from a team: leavers whose manager in the data is the person, by termination date. */
export const TEAM_EXIT_USES = [
  'employees.employeeId',
  'employees.managerId',
  'employees.terminationDate',
] as const satisfies readonly KnownFieldRef[]

/** Regretted exits add the termination type and the regrettable mark. */
export const TEAM_REGRETTED_USES = [
  ...TEAM_EXIT_USES,
  'employees.terminationType',
  'employees.regrettable',
] as const satisfies readonly KnownFieldRef[]

/** The exit simulation's possible successors: ratings in the latest review cycle. */
export const BACKFILL_USES = [
  'reviews.employeeId',
  'reviews.cycle',
  'reviews.cycleDate',
  'reviews.rating',
  'reviews.potential',
] as const satisfies readonly KnownFieldRef[]

/** The lists joined, each field once, in first-seen order. */
export const refs = (...lists: readonly (readonly FieldRef[])[]): FieldRef[] => [...new Set(lists.flat())]

/** Flags: spans and chains from the reporting lines, new hires and new managers from dates. */
export const flagUses = (jobChanges: boolean): FieldRef[] =>
  refs(REPORTING_USES, jobChanges ? MANAGING_SINCE_USES : [])

/** The scenario's moves and span changes: who reported to whom before and after each step. */
export const SCENARIO_USES: readonly FieldRef[] = REPORTING_USES
