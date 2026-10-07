/**
 * Lineage for the HR business partner view: the dataset fields behind every KPI, figure and
 * finding. A number's tier is the lowest tier among the fields it lists (docs/DATA-TIERS.md), so
 * a field that only narrows the population (employment type, an org filter) counts as well.
 *
 * A lineage has fields it needs and optional groups. An optional group is a refinement the
 * number makes only when the data is there: job history rebuilds a past level or department and
 * otherwise falls back to today's; an active-only roster (no termination dates anywhere) still
 * has a headcount. A group counts only when every field in it holds data somewhere, so a number
 * never declares a field it did not read.
 *
 * Every reference is typed `KnownFieldRef`, so tsc rejects a field the schema does not have.
 */
import type { FieldRef, KnownFieldRef } from '@/data/quality'
import type { DatasetKey } from '@/data/schema'
import type { Filters } from '@/data/scope'
import type { RegrettedRule } from '../metrics'

type Ref = KnownFieldRef

/** The datasets the view reads; a number that names no field takes their lowest tier. */
export const HRBP_DATASETS: readonly DatasetKey[] = ['employees', 'jobChanges', 'reviews']

export interface Lineage {
  /** Fields the number cannot do without. */
  readonly need: readonly Ref[]
  /** Groups the number reads only when every field in the group holds data. */
  readonly optional: readonly (readonly Ref[])[]
}

export const need = (...refs: Ref[]): Lineage => ({ need: refs, optional: [] })

/** One optional group: used only when all of its fields hold data. */
export const optional = (...refs: Ref[]): Lineage => ({ need: [], optional: [refs] })

/** Everything in the parts; a field needed by any part is needed. */
export function all(...parts: Lineage[]): Lineage {
  return {
    need: parts.flatMap((l) => l.need),
    optional: parts.flatMap((l) => l.optional),
  }
}

/** The lineage of a column or clause that is left out when its data is missing. */
export const ifPresent = (l: Lineage): Lineage => ({
  need: [],
  optional: [...(l.need.length ? [l.need] : []), ...l.optional],
})

/** Contributes nothing (for a branch that reads no field). */
export const NONE: Lineage = { need: [], optional: [] }

/**
 * The fields a lineage resolves to, deduplicated in first-seen order. `present` says whether a
 * field holds data in at least one row (its tier is not "none").
 */
export function resolveLineage(l: Lineage, present: (ref: FieldRef) => boolean): FieldRef[] {
  const out = new Set<FieldRef>(l.need)
  for (const group of l.optional) if (group.every(present)) for (const r of group) out.add(r)
  return [...out]
}

/** Every field a lineage can declare, whatever data is loaded (for tests). */
export const allRefs = (l: Lineage): Ref[] => [...new Set([...l.need, ...l.optional.flat()])]

/*
 * Order matters for the explanation, not the tier: when several fields share the lowest tier,
 * the badge names the first. So each block lists the field most characteristic of its number
 * first (termination type for voluntary attrition, change type for promotions).
 */

/* ───────── the population ───────── */

/** Only employees count in headcount and rates; contractors and interns are reported apart. */
const EMPLOYEES_ONLY = need('employees.employmentType')

/**
 * Employees on a date: hired by then and not yet terminated. A roster without any termination
 * date is read as active-only, and everyone hired counts.
 */
export const HEADCOUNT = all(
  EMPLOYEES_ONLY,
  need('employees.hireDate'),
  optional('employees.terminationDate'),
)

/** Headcount at past dates: honest only when the roster keeps its leavers. */
export const PAST_HEADCOUNT = all(need('employees.terminationDate', 'employees.hireDate'), EMPLOYEES_ONLY)

/** Active workers of every type (spans of control count contractors and interns). */
export const WORKERS = all(need('employees.hireDate'), optional('employees.terminationDate'))

export const HIRES = all(need('employees.hireDate'), EMPLOYEES_ONLY)
export const EXITS = all(need('employees.terminationDate'), EMPLOYEES_ONLY)
export const TENURE = need('employees.hireDate')

/** Exits ÷ average headcount, annualized (every exit rate and first-year attrition). */
export const ATTRITION = PAST_HEADCOUNT
export const EXIT_TYPE = need('employees.terminationType')
export const VOLUNTARY = all(EXIT_TYPE, ATTRITION)
export const REGRETTED = all(need('employees.regrettable'), VOLUNTARY)
export const FIRST_YEAR = PAST_HEADCOUNT
export const REASON = need('employees.terminationReason')
/** Regretted leavers as a list (no rate): voluntary exits marked regrettable. */
export const REGRETTED_EXITS = all(need('employees.regrettable'), EXIT_TYPE, EXITS)
/** Regretted attrition when any exit marked regrettable counts: termination type is not read. */
export const REGRETTED_ANY = all(need('employees.regrettable'), ATTRITION)
/** Regretted leavers as a list when any exit marked regrettable counts. */
export const REGRETTED_EXITS_ANY = all(need('employees.regrettable'), EXITS)

/** Regretted attrition under the setting in force (what counts as regretted). */
export const regrettedLineage = (rule: RegrettedRule = 'voluntaryFlagged'): Lineage =>
  rule === 'anyFlagged' ? REGRETTED_ANY : REGRETTED

/** Regretted leavers under the setting in force. */
export const regrettedExitsLineage = (rule: RegrettedRule = 'voluntaryFlagged'): Lineage =>
  rule === 'anyFlagged' ? REGRETTED_EXITS_ANY : REGRETTED_EXITS

export const BUSINESS_UNIT = need('employees.businessUnit')
export const DEPARTMENT = need('employees.department')
export const LOCATION = need('employees.location')
export const LEVEL = need('employees.level')
export const NAME = need('employees.name')
export const JOB_TITLE = need('employees.jobTitle')
export const MANAGER = need('employees.managerId')

/* ───────── reporting lines ───────── */

/** Active workers and who they report to: spans, layers, managers. */
export const ORG = all(need('employees.managerId', 'employees.employeeId'), WORKERS)

/* ───────── job history ───────── */

/** Job changes count when their person is on the roster as an employee. */
const CHANGE_JOIN: Ref[] = [
  'jobChanges.effectiveDate',
  'jobChanges.employeeId',
  'employees.employeeId',
  'employees.employmentType',
]

/** Promotions, transfers, lateral moves and demotions from Job changes. */
export const MOVES = need('jobChanges.changeType', ...CHANGE_JOIN)
/** Promotion events (or moves) ÷ average headcount, not annualized. */
export const PROMOTION_RATE = all(MOVES, HEADCOUNT)

/** Level on a past date: rebuilt from level changes, else today's level. */
export const LEVEL_AT = all(LEVEL, optional('jobChanges.fromLevel', 'jobChanges.toLevel', ...CHANGE_JOIN))

/** Department on a past date: rebuilt from transfers, else today's department. */
export const DEPARTMENT_AT = all(
  DEPARTMENT,
  optional('jobChanges.fromDepartment', 'jobChanges.toDepartment', ...CHANGE_JOIN),
)

/** When someone started managing: a promotion from an individual level, else their hire date. */
export const MANAGER_SINCE = all(
  need('employees.hireDate'),
  optional('jobChanges.changeType', 'jobChanges.fromLevel', 'jobChanges.toLevel', ...CHANGE_JOIN),
)

/* ───────── reviews ───────── */

/** The last rating on or before a date. */
export const LAST_RATING = need(
  'reviews.rating',
  'reviews.cycleDate',
  'reviews.employeeId',
  'employees.employeeId',
)

/* ───────── the org filters ───────── */

/** What each org filter reads to narrow the roster (a leader's org is walked down reporting lines). */
const FILTER_LINEAGE = {
  leaderId: need('employees.employeeId', 'employees.managerId'),
  businessUnit: BUSINESS_UNIT,
  department: DEPARTMENT,
  location: LOCATION,
  level: LEVEL,
} satisfies Record<string, Lineage>

/** The fields the active org filters read. Every scoped number depends on them. */
export function scopeLineage(f: Filters): Lineage {
  return all(
    f.leaderId ? FILTER_LINEAGE.leaderId : NONE,
    f.businessUnit.length ? FILTER_LINEAGE.businessUnit : NONE,
    f.department.length ? FILTER_LINEAGE.department : NONE,
    f.location.length ? FILTER_LINEAGE.location : NONE,
    f.level.length ? FILTER_LINEAGE.level : NONE,
  )
}

/* ───────── figures ───────── */

/** How the sub-org scorecard groups its rows. */
export type ScoreDim = 'leader' | 'businessUnit' | 'department' | 'location'

const SCORE_GROUP: Record<ScoreDim, Lineage> = {
  leader: FILTER_LINEAGE.leaderId,
  businessUnit: BUSINESS_UNIT,
  department: DEPARTMENT,
  location: LOCATION,
}

/**
 * Lineage of every figure in the view, by figure. Columns that show "—" without their data are
 * optional, so a missing Regrettable column does not take the whole scorecard down with it. In
 * the tables of people, the fields that pick the rows are needed and the descriptive columns
 * (name, title, department …) are optional.
 */
export const FIGURE = {
  /* overview */
  /** The promotion column shows only when Job changes meet the data standard. */
  scorecard: (dim: ScoreDim, withPromotions = true, rule: RegrettedRule = 'voluntaryFlagged') =>
    all(
      SCORE_GROUP[dim],
      HEADCOUNT,
      ORG,
      ifPresent(PAST_HEADCOUNT),
      ifPresent(VOLUNTARY),
      ifPresent(regrettedLineage(rule)),
      withPromotions ? ifPresent(PROMOTION_RATE) : NONE,
    ),
  headcountTrend: PAST_HEADCOUNT,
  /** Attrition over the trailing 12 months at each month end, voluntary or regretted. */
  attritionTrailing: (kind: 'voluntary' | 'regretted', rule: RegrettedRule = 'voluntaryFlagged') =>
    kind === 'voluntary' ? VOLUNTARY : regrettedLineage(rule),
  hiresExits: all(HIRES, EXITS),
  bridge: all(PAST_HEADCOUNT, need('employees.employeeId')),

  /* workforce */
  /** Headcount at past month ends by the scorecard's groups (a leader's direct reports' orgs, units …). */
  headcountByOrg: (dim: ScoreDim) => all(PAST_HEADCOUNT, SCORE_GROUP[dim]),
  byDepartment: all(HEADCOUNT, DEPARTMENT),
  byLocation: all(HEADCOUNT, LOCATION),
  byLevel: all(HEADCOUNT, LEVEL),
  tenure: all(HEADCOUNT, TENURE),
  workerMix: (dim: 'location' | 'businessUnit') =>
    all(WORKERS, need('employees.employmentType'), dim === 'location' ? LOCATION : BUSINESS_UNIT),
  /** Growth groups by business unit, or by department when the scope sits inside one unit. */
  growth: (by: 'businessUnit' | 'department') =>
    all(PAST_HEADCOUNT, BUSINESS_UNIT, by === 'department' ? DEPARTMENT : NONE),
  engineeringShare: all(HEADCOUNT, DEPARTMENT, BUSINESS_UNIT),

  /* attrition */
  attritionByQuarter: all(ATTRITION, ifPresent(EXIT_TYPE)),
  regrettedByQuarter: (rule: RegrettedRule = 'voluntaryFlagged') => regrettedLineage(rule),
  exitReasons: all(EXITS, EXIT_TYPE, REASON),
  attritionByGroup: (dim: 'department' | 'location') =>
    all(ATTRITION, dim === 'department' ? DEPARTMENT_AT : LOCATION, ifPresent(EXIT_TYPE)),
  exitsByTenure: all(EXITS, TENURE, ifPresent(EXIT_TYPE)),
  /** Hire cohorts still employed at checkpoints after the hire date. */
  cohortRetention: PAST_HEADCOUNT,
  attritionByLevel: all(ATTRITION, LEVEL_AT, ifPresent(EXIT_TYPE)),
  exitsByRating: all(EXITS, LAST_RATING, ifPresent(EXIT_TYPE)),
  /** The reason column shows only when exit reasons meet the data standard. */
  regrettedLeavers: (withReason: boolean, rule: RegrettedRule = 'voluntaryFlagged') =>
    all(
      regrettedExitsLineage(rule),
      TENURE,
      ...[NAME, DEPARTMENT, LOCATION, LEVEL, MANAGER, LAST_RATING].map(ifPresent),
      withReason ? ifPresent(REASON) : NONE,
    ),

  /* movement */
  promotionsByQuarter: PROMOTION_RATE,
  promotionsByLevel: all(PROMOTION_RATE, LEVEL_AT, optional('jobChanges.fromLevel')),
  movesByDepartment: all(MOVES, DEPARTMENT, optional('jobChanges.toDepartment')),
  timeSincePromotion: all(HEADCOUNT, MOVES),
  /** Today's employees with a manager change (or a transfer to a new manager) in the last 12 months. */
  managerChanges: (dim: ScoreDim) =>
    all(HEADCOUNT, SCORE_GROUP[dim], MOVES, optional('jobChanges.fromManagerId', 'jobChanges.toManagerId')),
  internalMoves: all(
    MOVES,
    ifPresent(NAME),
    optional('jobChanges.fromLevel'),
    optional('jobChanges.toLevel'),
    optional('jobChanges.fromDepartment'),
    optional('jobChanges.toDepartment'),
  ),

  /* org design */
  spanOfControl: ORG,
  layersByBusinessUnit: all(ORG, BUSINESS_UNIT),
  managers: (rule: RegrettedRule = 'voluntaryFlagged') =>
    all(
      ORG,
      MANAGER_SINCE,
      // Level flags executives; regretted exits fill their own column.
      ...[NAME, JOB_TITLE, DEPARTMENT, LOCATION, LEVEL, regrettedExitsLineage(rule)].map(ifPresent),
    ),
  singleReportChains: all(ORG, ...[NAME, JOB_TITLE, DEPARTMENT].map(ifPresent)),
} as const
