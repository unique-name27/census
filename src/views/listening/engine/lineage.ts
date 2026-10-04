/**
 * Lineage: the dataset fields behind every Listening number (docs/DATA-TIERS.md). A KPI, figure
 * or finding takes the lowest tier among the fields it lists, so each list names the fields it
 * reads: the answers, the joins that label a group and the population behind a response rate.
 *
 * The Survey items sheet is optional: its fields are listed only while it has rows, so a file
 * without one is judged on the answers alone. The same holds for the answers' own driver column.
 *
 * Plain data only: the metric registry (../metrics.ts) builds each metric's `uses` from these.
 */
import type { KnownFieldRef } from '@/data/quality'
import type { SurveyType } from '@/data/schema'

export type Refs = readonly KnownFieldRef[]

/** The groups' fields in first-seen order, each once. */
export const union = (...groups: readonly Refs[]): Refs => [...new Set(groups.flat())]

/** The group when `flag` holds, otherwise nothing. */
export const when = (flag: unknown, ...groups: readonly Refs[]): Refs => (flag ? union(...groups) : [])

/** Every grouped answer: which survey and wave, when, who (to count distinct people) and the score. */
export const ANSWER: Refs = [
  'surveyResponses.survey',
  'surveyResponses.wave',
  'surveyResponses.responseDate',
  'surveyResponses.respondentKey',
  'surveyResponses.score',
  'surveyResponses.scale',
]
/** Which survey and when, for counts of programs and waves. */
export const WAVE: Refs = ['surveyResponses.survey', 'surveyResponses.wave', 'surveyResponses.responseDate']
export const RESPONDENT: Refs = ['surveyResponses.respondentKey']
export const ITEM: Refs = ['surveyResponses.item']
export const REASON: Refs = ['surveyResponses.reason']
export const SUBJECT: Refs = ['surveyResponses.subjectKey']
export const TOUCHPOINT: Refs = ['surveyResponses.touchpoint']
/** The Survey items sheet: drivers for answers that leave theirs blank, and item targets. */
export const ITEMS_DRIVER: Refs = ['surveyItems.item', 'surveyItems.driver', 'surveyItems.survey']
export const ITEMS_TARGET: Refs = ['surveyItems.item', 'surveyItems.target', 'surveyItems.survey']

/** Respondent joins (employee respondents). */
export const EMP_ORG: Refs = ['employees.businessUnit', 'employees.department']
export const EMP_LOCATION: Refs = ['employees.location']
export const EMP_TENURE: Refs = ['employees.hireDate']
export const EMP_LEVEL: Refs = ['employees.level']
/** Candidate respondents join their application, then its req. */
export const CAND_REQ: Refs = ['candidates.reqId']
export const REQ_ORG: Refs = ['requisitions.businessUnit', 'requisitions.department']
export const REQ_LOCATION: Refs = ['requisitions.location']
export const CAND_SOURCE: Refs = ['candidates.source']
export const CAND_RECRUITER: Refs = ['candidates.recruiter', 'requisitions.recruiter']
/** Hiring manager answers name the req: its recruiter. */
export const REQ_RECRUITER: Refs = ['requisitions.reqId', 'requisitions.recruiter']

/** The invited population per program, when Census can know it. */
export const POPULATION: Partial<Record<SurveyType, Refs>> = {
  'Candidate experience': [
    'candidates.applicationId',
    'candidates.status',
    'candidates.screenDate',
    'candidates.hmDate',
    'candidates.onsiteDate',
    'candidates.hiredDate',
    'candidates.rejectedDate',
  ],
  'Hiring manager satisfaction': [
    'requisitions.status',
    'requisitions.filledDate',
    'requisitions.hiringManagerId',
  ],
  'Onboarding pulse day 30': ['employees.hireDate', 'employees.terminationDate', 'employees.employmentType'],
  'Onboarding pulse day 90': ['employees.hireDate', 'employees.terminationDate', 'employees.employmentType'],
  'Exit survey': ['employees.terminationDate', 'employees.terminationType', 'employees.employmentType'],
  'HR service survey': ['cases.resolvedAt', 'cases.requesterId', 'cases.category'],
  'Return to work': ['transactions.type', 'transactions.effectiveDate', 'transactions.employeeId'],
}

/** Operational ties named in the readout. */
export const LAPTOP_TASKS: Refs = [
  'onboardingTasks.employeeId',
  'onboardingTasks.task',
  'onboardingTasks.dueDate',
  'onboardingTasks.completedDate',
  'employees.hireDate',
  'employees.location',
]
export const RECRUITER_LOAD: Refs = [
  'requisitions.status',
  'requisitions.recruiter',
  'candidates.status',
  'candidates.reqId',
]
export const ONSITE_WAIT: Refs = [
  'candidates.status',
  'candidates.onsiteDate',
  'candidates.offerDate',
  'candidates.reqId',
  'requisitions.department',
]
export const HRIS_REASON: Refs = [
  'employees.terminationDate',
  'employees.terminationType',
  'employees.terminationReason',
  'employees.location',
]
export const REGRETTED: Refs = ['employees.regrettable', 'employees.terminationType']
export const MANAGER_JOIN: Refs = ['employees.employeeId', 'employees.managerId', 'employees.name']
export const MANAGER_EXITS: Refs = [
  'employees.managerId',
  'employees.terminationDate',
  'employees.terminationType',
  'employees.regrettable',
]
export const RETURN_TX: Refs = [
  'transactions.type',
  'transactions.employeeId',
  'transactions.effectiveDate',
  'transactions.dueDate',
  'transactions.completedDate',
]
export const CASE_JOIN: Refs = ['cases.caseId', 'cases.category', 'cases.channel']
export const COURSE: Refs = ['surveyResponses.subjectKey']

/** Every field any Listening metric reads, for the registry's catch-all entries. */
export const ALL_POPULATION: Refs = union(...Object.values(POPULATION))
