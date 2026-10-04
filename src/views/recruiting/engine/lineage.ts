/**
 * Lineage for the Recruiting view: the dataset fields behind each KPI, figure and finding. A
 * number's tier is the lowest tier among its fields, so the fields that only pick the population
 * (applied by the as-of date, the status, the date an application ended) count as much as the
 * field being measured.
 *
 * What is listed: the fields behind every number, the fields a number is grouped or broken down
 * by, and the descriptive columns a table figure shows. Record identifiers that only label a row
 * (application ID, candidate name) are not listed; `candidates.reqId` is, wherever a candidate is
 * read through its requisition (department, location, level, hiring manager).
 */
import type { FieldRef, KnownFieldRef } from '@/data/quality'

export type Refs = readonly KnownFieldRef[]

/** The fields of every group, once each, in first-seen order. */
export function uses<T extends FieldRef>(...groups: (readonly T[])[]): T[] {
  return [...new Set(groups.flat())]
}

/** A candidate read through its requisition: the join on req ID. */
export const REQ_JOIN: Refs = ['candidates.reqId', 'requisitions.reqId']

/** Open on a date: opened by then and not yet filled, closed or cancelled (on hold is set apart). */
export const OPEN_REQ: Refs = [
  'requisitions.openedDate',
  'requisitions.status',
  'requisitions.closedDate',
  'requisitions.filledDate',
]

/** Filled in a window (cancelled reqs excluded), and time to fill from opened date to filled date. */
export const FILLED_REQ: Refs = ['requisitions.openedDate', 'requisitions.filledDate', 'requisitions.status']

/** Applications received in a window (the cohort), by applied date. */
export const COHORT: Refs = ['candidates.appliedDate']

/** Hires: status Hired, counted on the hired date; time to hire runs from the applied date. */
export const HIRES: Refs = ['candidates.appliedDate', 'candidates.status', 'candidates.hiredDate']

/**
 * Where an application stands on the as-of date (active, hired, declined, rejected, withdrawn):
 * the status, and the hired or exit date that says whether it had ended by then.
 */
export const OUTCOME: Refs = [...HIRES, 'candidates.rejectedDate']

/** Every stage date, Applied to Hired: days per step and the usual days per stage. */
export const STAGE_DATES: Refs = [
  'candidates.appliedDate',
  'candidates.screenDate',
  'candidates.hmDate',
  'candidates.onsiteDate',
  'candidates.offerDate',
  'candidates.hiredDate',
]

/** The furthest stage reached: stage dates first, the current stage when its date is missing. */
export const STAGE_REACHED: Refs = uses(OUTCOME, STAGE_DATES, ['candidates.currentStage'])

/**
 * The next-step state of each active candidate (scheduled, needs decision, offer out, no step
 * booked) and its aging: the stage, when it was entered, the next event, and the usual days per
 * stage from every application's stage dates.
 */
export const NEXT_STEP: Refs = uses(STAGE_REACHED, [
  'candidates.stageEnteredDate',
  'candidates.nextEventDate',
])

/** Who owns the next action: the hiring manager, the coordinator or the recruiter. */
export const OWNER: Refs = uses(REQ_JOIN, [
  'candidates.recruiter',
  'requisitions.recruiter',
  'candidates.coordinator',
  'requisitions.hiringManager',
])

/** Why an application ended (rejection, withdrawal and decline reasons share one column). */
export const REASON: Refs = ['candidates.rejectionReason']

/** Breakdown dimensions of an application, read through its requisition where needed. */
export type AppDim = 'department' | 'location' | 'level' | 'hiringManager' | 'recruiter' | 'source'

export const APP_DIM: Record<AppDim, Refs> = {
  department: [...REQ_JOIN, 'requisitions.department'],
  location: [...REQ_JOIN, 'requisitions.location'],
  level: [...REQ_JOIN, 'requisitions.level'],
  hiringManager: [...REQ_JOIN, 'requisitions.hiringManager'],
  // The candidate's own recruiter first, the req's when it is blank.
  recruiter: [...REQ_JOIN, 'candidates.recruiter', 'requisitions.recruiter'],
  source: ['candidates.source'],
}

/** Breakdown dimensions of a requisition itself. */
export type ReqDim = 'department' | 'location' | 'level'

export const REQ_DIM: Record<ReqDim, Refs> = {
  department: ['requisitions.department'],
  location: ['requisitions.location'],
  level: ['requisitions.level'],
}

/** The fields of an application breakdown, or none when the finding names no segment. */
export const appDimUses = (dim: string | null | undefined): Refs =>
  dim && dim in APP_DIM ? APP_DIM[dim as AppDim] : []

/** The fields of a requisition breakdown, or none. */
export const reqDimUses = (dim: string | null | undefined): Refs =>
  dim && dim in REQ_DIM ? REQ_DIM[dim as ReqDim] : []

/* ───────── KPIs ───────── */

export const KPI_USES = {
  'open-reqs': OPEN_REQ,
  hires: HIRES,
  'time-to-fill': FILLED_REQ,
  'time-to-hire': HIRES,
  'offer-acceptance': OUTCOME,
  'lacking-next-step': NEXT_STEP,
} as const satisfies Record<string, Refs>

/* ───────── figures (keyed by Figure id) ───────── */

export const FIGURE_USES = {
  // Overview
  'recruiting-pipeline-today': NEXT_STEP,
  'recruiting-hires-by-month': HIRES,
  'recruiting-offer-acceptance-quarter': OUTCOME,
  'recruiting-open-reqs-department': uses(OPEN_REQ, REQ_DIM.department),
  'recruiting-time-to-fill-level': uses(FILLED_REQ, REQ_DIM.level),
  // Pipeline
  'recruiting-candidate-flow': uses(COHORT, STAGE_REACHED),
  'recruiting-action-queue': uses(NEXT_STEP, OWNER),
  'recruiting-stage-conversion': uses(COHORT, STAGE_REACHED),
  'recruiting-waiting-time': NEXT_STEP,
  'recruiting-speed-heatmap': STAGE_DATES,
  // Requisitions
  'recruiting-open-requisitions': uses(OPEN_REQ, REQ_JOIN, NEXT_STEP, [
    'requisitions.jobTitle',
    'requisitions.priority',
    'requisitions.department',
    'requisitions.location',
    'requisitions.level',
    'requisitions.hiringManager',
    'requisitions.recruiter',
  ]),
  'recruiting-open-req-age': uses(OPEN_REQ, ['requisitions.jobTitle', 'requisitions.department']),
  'recruiting-reqs-opened-filled': FILLED_REQ,
  'recruiting-time-to-fill-department': uses(FILLED_REQ, REQ_DIM.department),
  'recruiting-recruiter-load': uses(OPEN_REQ, NEXT_STEP, HIRES, APP_DIM.recruiter),
  // Sources & offers
  'recruiting-source-effectiveness': uses(COHORT, OUTCOME, APP_DIM.source),
  'recruiting-applications-source-month': uses(COHORT, APP_DIM.source),
  'recruiting-offer-acceptance-location': uses(OUTCOME, APP_DIM.location),
  'recruiting-decline-reasons': uses(OUTCOME, REASON),
  'recruiting-exit-reasons': uses(OUTCOME, STAGE_REACHED, REASON),
} as const satisfies Record<string, readonly FieldRef[]>

export type RecruitingFigureId = keyof typeof FIGURE_USES
