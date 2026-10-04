/**
 * The fields behind each onboarding number (docs/DATA-TIERS.md): a KPI, figure or finding is as
 * good as the lowest tier of the fields it reads. Plain data; `../metrics.ts` imports it.
 */
import type { KnownFieldRef } from '@/data/quality/fieldRef'

export type Refs = readonly KnownFieldRef[]

/** The union of field groups, each field once, in first-seen order. */
export function union(...groups: Refs[]): KnownFieldRef[] {
  return [...new Set(groups.flat())]
}

/** Pre-hire employee records: an Employees row whose hire date is after the as-of date. */
export const PREHIRE: Refs = [
  'employees.employeeId',
  'employees.name',
  'employees.hireDate',
  'employees.employmentType',
  'employees.department',
]

/** Accepted offers with a start date, joined to their requisition for org and de-duplication. */
export const ACCEPTED: Refs = [
  'candidates.applicationId',
  'candidates.candidateName',
  'candidates.reqId',
  'candidates.status',
  'candidates.hiredDate',
  'candidates.startDate',
  'requisitions.reqId',
  'requisitions.department',
]

/** Upcoming starts: pre-hires and accepted offers, de-duplicated by req and name. */
export const UPCOMING: Refs = union(PREHIRE, ACCEPTED)

/** Onboarding tasks and where each one stands. */
export const TASKS: Refs = [
  'onboardingTasks.employeeId',
  'onboardingTasks.applicationId',
  'onboardingTasks.task',
  'onboardingTasks.dueDate',
  'onboardingTasks.completedDate',
  'onboardingTasks.status',
]
export const TASK_OWNER: Refs = ['onboardingTasks.owner']

/** People who started: employees by hire date. */
export const STARTERS: Refs = ['employees.employeeId', 'employees.hireDate', 'employees.employmentType']

export const SITE: Refs = ['employees.location']
export const DEPARTMENT: Refs = ['employees.department']

/** Renege rate: accepted offers in the window and those later withdrawn. */
export const RENEGE: Refs = [
  'candidates.status',
  'candidates.hiredDate',
  'candidates.rejectedDate',
  'candidates.reqId',
  'requisitions.reqId',
  'requisitions.location',
]

export const ACCEPT_TO_START: Refs = [
  'candidates.status',
  'candidates.hiredDate',
  'candidates.startDate',
  'candidates.reqId',
  'requisitions.reqId',
  'requisitions.location',
]

export const TRAINING: Refs = union(STARTERS, [
  'learning.employeeId',
  'learning.required',
  'learning.assignedDate',
  'learning.completedDate',
])

export const ATTRITION_90: Refs = union(STARTERS, [
  'employees.terminationDate',
  'employees.terminationType',
  'employees.department',
])
export const MANAGER_AT_HIRE: Refs = [
  'employees.managerId',
  'jobChanges.employeeId',
  'jobChanges.effectiveDate',
  'jobChanges.fromManagerId',
]

export const NEW_HIRE_TX: Refs = [
  'transactions.type',
  'transactions.employeeId',
  'transactions.effectiveDate',
  'transactions.dueDate',
  'transactions.completedDate',
  'employees.location',
]

export const PULSE: Refs = [
  'surveyResponses.survey',
  'surveyResponses.item',
  'surveyResponses.driver',
  'surveyResponses.score',
  'surveyResponses.scale',
  'surveyResponses.responseDate',
  'surveyResponses.respondentKey',
  'employees.location',
]

export const PLAN: Refs = [
  'hiringPlan.period',
  'hiringPlan.businessUnit',
  'hiringPlan.department',
  'hiringPlan.plannedHires',
  'hiringPlan.planVersion',
]
export const PLAN_REQ: Refs = ['hiringPlan.reqId', 'requisitions.reqId', 'requisitions.status']
export const ACTUAL: Refs = union(STARTERS, ['employees.businessUnit', 'employees.department'])
export const OPEN_REQS: Refs = [
  'requisitions.reqId',
  'requisitions.status',
  'requisitions.businessUnit',
  'requisitions.department',
  'requisitions.openings',
]
/** The forecast: open reqs timed with Recruiting's time to fill and stage pass rates. */
export const FORECAST: Refs = union(OPEN_REQS, [
  'requisitions.openedDate',
  'requisitions.filledDate',
  'requisitions.location',
  'candidates.reqId',
  'candidates.status',
  'candidates.currentStage',
  'candidates.appliedDate',
  'candidates.hiredDate',
  'candidates.startDate',
])
