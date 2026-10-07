/**
 * Lineage for the Talent view: the dataset fields behind each KPI, figure and finding. A number's
 * tier is the lowest tier among its fields, so the fields that only pick the population (worker
 * type, hire and termination dates for "active at the as-of date") count as much as the field
 * being measured, and so do the fields a number is grouped or broken down by.
 *
 * What is listed: the fields a number is computed from, filtered by or grouped by. Descriptive
 * columns of people tables (name, job title, manager) only label a row, so they are not listed.
 * Optional fields the engine can do without are listed only when it reads them: the plan's own
 * risk of loss when the plans record one (else the flight-risk model stands in), and the inputs
 * of the flight-risk model that are switched on and carry values.
 *
 * Order matters: when several fields share the lowest tier, the tier explanation names the first
 * one, so each list leads with the field being measured and ends with the population fields.
 * Pure: no React, no DOM.
 */
import { isFilled, type KnownFieldRef, parseFieldRef } from '@/data/quality'
import type { Datasets } from '@/data/schema'
import type { FieldCoverage } from './base'
import { FACTORS, type FactorKey, type RiskModel } from './risk'

export type Refs = readonly KnownFieldRef[]

/** The fields of every group, once each, in first-seen order. */
export function uses(...groups: Refs[]): KnownFieldRef[] {
  return [...new Set(groups.flat())]
}

/* ───────── building blocks ───────── */

/** Someone in the roster: reviews, plans and assignments join to it on employee ID. */
const PERSON: Refs = ['employees.employeeId']

/** Employees (worker type Employee) active at a date: hired by then and not yet left. */
export const ACTIVE: Refs = [
  'employees.hireDate',
  'employees.terminationDate',
  'employees.employmentType',
  'employees.employeeId',
]

/** Still employed at a date, any worker type (named successors). */
const EMPLOYED: Refs = ['employees.hireDate', 'employees.terminationDate', 'employees.employeeId']

/** A rating in a review cycle; the latest cycle is the latest cycle date on or before the as-of date. */
export const RATING: Refs = ['reviews.rating', 'reviews.cycleDate', 'reviews.cycle', 'reviews.employeeId']

/** The latest rating on or before a date (read by date, not by cycle). */
const RATING_AT: Refs = ['reviews.rating', 'reviews.cycleDate', 'reviews.employeeId']

/** A potential rating; the annual cycle is the latest one that records potential. */
const POTENTIAL: Refs = ['reviews.potential', 'reviews.cycleDate', 'reviews.cycle', 'reviews.employeeId']

/** Ratings of people in scope (current and former), joined to the roster. */
const RATED: Refs = uses(RATING, PERSON)

/** Manager-proposed rating before calibration. */
const PROPOSED: Refs = ['reviews.preCalibrationRating']

/** Exits by type, employees only. */
const EXITS: Refs = [
  'employees.terminationType',
  'employees.terminationDate',
  'employees.employmentType',
  'employees.employeeId',
]

/** Voluntary exits marked regrettable. */
const REGRETTED: Refs = uses(['employees.regrettable'], EXITS)

/** Promotion history. */
const PROMOTIONS: Refs = ['jobChanges.changeType', 'jobChanges.effectiveDate', 'jobChanges.employeeId']

/**
 * Planned roles and their named successors, scoped by the incumbent, with successors who have
 * left taken off the bench.
 */
const BENCH: Refs = uses(
  ['succession.successorId', 'succession.criticality', 'succession.roleId', 'succession.incumbentId'],
  EMPLOYED,
)

/** Bench by readiness (ready now, in 1-2 years, in 3+ years). */
const READY: Refs = uses(['succession.readiness'], BENCH)

/** The folder-tab headline, critical roles covered: the same fields as its KPI tile. */
export const HEADLINE_USES: Refs = READY

/** Required assignments with a due date, for employees employed on the due date. */
const REQUIRED_DUE: Refs = uses(
  ['learning.completedDate', 'learning.dueDate', 'learning.required', 'learning.employeeId'],
  ACTIVE,
)

/** Breakdown dimensions of a person. */
const ORG = {
  businessUnit: ['employees.businessUnit'],
  department: ['employees.department'],
  location: ['employees.location'],
  level: ['employees.level'],
} as const satisfies Record<string, Refs>

/** Every dimension a concentration is looked for in (decomposeRate over `orgDims`). */
const ORG_DIMS: Refs = uses(ORG.businessUnit, ORG.department, ORG.location, ORG.level)

/* ───────── the flight-risk model ───────── */

/** What each factor of the flight-risk model reads, including the job history it reads back. */
export const FACTOR_USES: Record<FactorKey, Refs> = {
  promotionGap: uses(PROMOTIONS, ['jobChanges.fromLevel', 'employees.level', 'employees.hireDate']),
  highNoPromo: uses(RATING, PROMOTIONS, ['employees.level', 'employees.hireDate']),
  deptAttrition: uses(EXITS, ORG.department, ['jobChanges.fromDepartment'], ACTIVE),
  siteAttrition: uses(EXITS, ORG.location, ACTIVE),
  peersLeft: uses(['employees.managerId', 'jobChanges.fromManagerId'], EXITS),
  tenurePeak: ['employees.hireDate'],
  ratingDrop: RATING,
  lowCompa: ['comp.employeeId', 'comp.baseSalary', 'comp.rangeMid'],
  newManager: [
    'jobChanges.toManagerId',
    'jobChanges.fromManagerId',
    'jobChanges.effectiveDate',
    'jobChanges.employeeId',
  ],
}

/** Per dataset object: whether a field has a value in any row. */
const filledCache = new WeakMap<Datasets, Map<string, boolean>>()

/** True when the field has a value in at least one row. */
export function hasValues(data: Datasets, ref: KnownFieldRef): boolean {
  let byRef = filledCache.get(data)
  if (!byRef) {
    byRef = new Map()
    filledCache.set(data, byRef)
  }
  const known = byRef.get(ref)
  if (known != null) return known
  const p = parseFieldRef(ref)
  const rows = p ? (data[p.dataset] as readonly object[]) : []
  const field = p?.field ?? ''
  const any = rows.some((r) => isFilled((r as Record<string, unknown>)[field]))
  byRef.set(ref, any)
  return any
}

/**
 * The fields the flight-risk model reads: who is scored (employees active at the date), how
 * exits are counted to learn the points (voluntary exits when termination type is there), and the
 * inputs of every factor that is switched on. The model skips what the data does not carry, so a
 * field with no value in any row is left out. `today` adds pay against range, which only today's
 * score uses (pay history is not kept, so past scores and the back-test do without it).
 */
export function riskUses(
  model: Pick<RiskModel, 'off' | 'exitKind'>,
  data: Datasets,
  opts: { today: boolean },
): KnownFieldRef[] {
  const off = new Set(model.off.map((o) => o.key))
  const parts: Refs[] = []
  for (const f of FACTORS) {
    if (off.has(f.key) || (f.key === 'lowCompa' && !opts.today)) continue
    parts.push(FACTOR_USES[f.key])
  }
  parts.push(model.exitKind === 'voluntary' ? ['employees.terminationType'] : [], ACTIVE)
  return uses(...parts).filter((ref) => hasValues(data, ref))
}

/* ───────── KPIs, findings and figures ───────── */

export interface TalentLineageInput {
  has: Pick<FieldCoverage, 'successionRisk'>
  /** Today's flight-risk score (`riskUses(model, data, { today: true })`). */
  risk: Refs
  /** Past scores: the back-test and the points' evidence. */
  riskHistory: Refs
  /**
   * The flight-risk overlay on the 9-box meets the data standard (default true). Below it the
   * overlay is not drawn, so the 9-box does not read its fields.
   */
  riskOverlay?: boolean
}

/** KPI id → fields. */
export type KpiId =
  | 'talent-rated'
  | 'talent-high-performers'
  | 'talent-high-potentials'
  | 'talent-succession-coverage'
  | 'talent-regretted-high'
  | 'talent-training-on-time'
  | 'talent-key-talent-risk'

/** Finding kind (the id, or the id prefix for findings repeated per business unit) → fields. */
export type FindingKind =
  | 'talent-hipo-exits'
  | 'talent-succession-exposed'
  | 'talent-critical-not-ready'
  | 'talent-inflation'
  | 'talent-calibration'
  | 'talent-training-overdue'
  | 'talent-promotion-overdue'
  | 'talent-key-talent-risk'
  | 'talent-good-training'
  | 'talent-good-distribution'
  | 'talent-good-succession'

/** Every Figure in the Talent view, by its id. */
export const TALENT_FIGURE_IDS = [
  // Overview
  'talent-nine-box',
  'talent-rating-distribution',
  'talent-succession-coverage',
  'talent-key-talent-top',
  // Performance
  'talent-high-share-by-department',
  'talent-rating-mix',
  'talent-calibration-shift',
  'talent-average-rating-by-cycle',
  'talent-high-share-by-level',
  'talent-exit-by-rating',
  'talent-rating-change',
  'talent-rating-by-manager',
  // Potential & succession
  'talent-succession-exposure',
  'talent-critical-roles',
  'talent-bench-strength',
  'talent-high-potentials-by-level',
  'talent-high-potentials-by-unit',
  // Retention risk
  'talent-risk-bands',
  'talent-risk-back-test',
  'talent-risk-drivers',
  'talent-risk-factors',
  'talent-key-talent-at-risk',
  'talent-promotion-overdue',
  'talent-regretted-high-performers',
  // Learning
  'talent-overdue-trend',
  'talent-training-on-time-by-course',
  'talent-completions-by-month',
  'talent-overdue-by-course',
  'talent-overdue-assignments',
  'talent-learning-hours',
] as const

export type TalentFigureId = (typeof TALENT_FIGURE_IDS)[number]

export interface TalentLineage {
  kpi: Record<KpiId, Refs>
  finding: Record<FindingKind, Refs>
  figure: Record<TalentFigureId, Refs>
}

export function buildLineage({
  has,
  risk,
  riskHistory,
  riskOverlay = true,
}: TalentLineageInput): TalentLineage {
  /** Today's flight-risk band and the latest rating (key talent = rated 4-5 in the high band). */
  const keyTalent = uses(RATING_AT, risk, ACTIVE)
  /** The plan's own risk of loss when it records one, else the flight-risk model's band. */
  const riskOfLoss: Refs = has.successionRisk ? ['succession.incumbentRiskOfLoss'] : risk
  /** Consistent high performers: active below executive level, 3+ years, rated 4-5 in the two annual cycles, no promotion in 3 years. */
  const promotionOverdue = uses(PROMOTIONS, RATING, ['reviews.potential'], ORG.level, ACTIVE)
  /** Average headcount per business unit, and hours from assignments completed in the period. */
  const hours = uses(
    ['learning.hours', 'learning.completedDate', 'learning.employeeId'],
    ORG.businessUnit,
    ACTIVE,
  )
  return {
    kpi: {
      'talent-rated': uses(RATING, ACTIVE),
      'talent-high-performers': RATED,
      'talent-high-potentials': uses(POTENTIAL, ACTIVE),
      'talent-succession-coverage': READY,
      'talent-regretted-high': uses(REGRETTED, RATING_AT),
      // The course category tells whether the two periods' courses differ (the delta's wording).
      'talent-training-on-time': uses(REQUIRED_DUE, ['learning.category']),
      'talent-key-talent-risk': keyTalent,
    },
    finding: {
      'talent-hipo-exits': uses(REGRETTED, ['reviews.potential'], RATING_AT),
      'talent-succession-exposed': uses(riskOfLoss, BENCH),
      'talent-critical-not-ready': READY,
      'talent-inflation': uses(RATED, ORG.businessUnit),
      'talent-calibration': uses(RATED, PROPOSED, ORG.businessUnit),
      // Severity depends on the course category (compliance and security courses are critical).
      'talent-training-overdue': uses(REQUIRED_DUE, ['learning.course', 'learning.category'], ORG_DIMS),
      'talent-promotion-overdue': uses(promotionOverdue, ORG_DIMS),
      'talent-key-talent-risk': uses(keyTalent, ORG_DIMS),
      'talent-good-training': REQUIRED_DUE,
      // Business units flagged for calibration are left out, so proposed ratings count too.
      'talent-good-distribution': uses(RATED, PROPOSED, ORG.businessUnit),
      'talent-good-succession': READY,
    },
    figure: {
      'talent-nine-box': uses(RATING, POTENTIAL, riskOverlay ? risk : [], ACTIVE),
      'talent-rating-distribution': RATED,
      'talent-succession-coverage': uses(READY, ORG.businessUnit),
      'talent-key-talent-top': keyTalent,
      'talent-high-share-by-department': uses(RATED, ORG.department),
      'talent-rating-mix': uses(RATED, ORG.businessUnit),
      'talent-calibration-shift': uses(RATED, PROPOSED, ORG.businessUnit),
      'talent-average-rating-by-cycle': uses(RATED, ORG.businessUnit),
      'talent-high-share-by-level': uses(RATED, ORG.level),
      'talent-exit-by-rating': uses(EXITS, RATED),
      // The two annual cycles are the latest that assess potential (or are named annual).
      'talent-rating-change': uses(RATED, ['reviews.potential']),
      // Grouped by the reviewer's business unit on the roster.
      'talent-rating-by-manager': uses(RATED, ['reviews.reviewerId'], ORG.businessUnit),
      // Without a risk of loss in the plans every role is "Not rated" (no field read).
      'talent-succession-exposure': uses(READY, has.successionRisk ? ['succession.incumbentRiskOfLoss'] : []),
      'talent-critical-roles': uses(READY, riskOfLoss, risk),
      'talent-bench-strength': uses(READY, ORG.businessUnit),
      'talent-high-potentials-by-level': uses(POTENTIAL, ORG.level, ACTIVE),
      'talent-high-potentials-by-unit': uses(POTENTIAL, ORG.businessUnit, ACTIVE),
      'talent-risk-bands': risk,
      'talent-risk-back-test': riskHistory,
      'talent-risk-drivers': risk,
      'talent-risk-factors': riskHistory,
      'talent-key-talent-at-risk': keyTalent,
      'talent-promotion-overdue': uses(promotionOverdue, risk),
      'talent-regretted-high-performers': uses(REGRETTED, RATING_AT),
      // Overdue on each month end: due before it, not completed by it, employee active that day.
      'talent-overdue-trend': uses(REQUIRED_DUE, ['learning.course']),
      'talent-training-on-time-by-course': uses(REQUIRED_DUE, ['learning.course', 'learning.category']),
      'talent-completions-by-month': ['learning.completedDate', 'learning.required'],
      'talent-overdue-by-course': uses(REQUIRED_DUE, ['learning.course'], ORG.department, ORG.location),
      'talent-overdue-assignments': uses(REQUIRED_DUE, ['learning.course']),
      'talent-learning-hours': hours,
    },
  }
}

/* ───────── the metric dictionary's lineage ───────── */

/** Every field the flight-risk model can read today, whichever factors the data switches on. */
const RISK_ALL: Refs = uses(...Object.values(FACTOR_USES), ['employees.terminationType'], ACTIVE)
/** The same for past scores (the back-test and the evidence): no pay against range. */
const RISK_HISTORY_ALL: Refs = uses(
  ...(Object.keys(FACTOR_USES) as FactorKey[]).filter((k) => k !== 'lowCompa').map((k) => FACTOR_USES[k]),
  ['employees.terminationType'],
  ACTIVE,
)

/**
 * The lineage the metric dictionary declares: the most each KPI, finding and figure can read,
 * with every flight-risk input and both sources of risk of loss (the plan's own, or the model's).
 * On screen, a number declares only what it reads with the data loaded (`buildLineage`).
 */
export function registryLineage(): TalentLineage {
  const a = buildLineage({ has: { successionRisk: true }, risk: RISK_ALL, riskHistory: RISK_HISTORY_ALL })
  const b = buildLineage({ has: { successionRisk: false }, risk: RISK_ALL, riskHistory: RISK_HISTORY_ALL })
  const merge = <K extends string>(x: Record<K, Refs>, y: Record<K, Refs>): Record<K, Refs> => {
    const out = {} as Record<K, Refs>
    for (const k of Object.keys(x) as K[]) out[k] = uses(x[k], y[k])
    return out
  }
  return { kpi: merge(a.kpi, b.kpi), finding: merge(a.finding, b.finding), figure: merge(a.figure, b.figure) }
}
