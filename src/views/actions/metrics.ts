/**
 * The Action center's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('actions', [...])`. The counts on the page (open, overdue, critical, due soon,
 * owners) and the two settings the page calculates with: how long a snooze lasts and how far
 * ahead "due soon" looks. Engines read them through `ctx.metrics` (see `engine/settings.ts`).
 *
 * Every item comes from another view's `actions(ctx)`, so the counts read the fields those items
 * read: `ITEM_USES` is their union, and a test checks it covers every item on the sample.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'

/** Metric ids, by what the page calls them. */
export const M = {
  open: 'actions.items.open',
  overdue: 'actions.items.overdue',
  dueSoon: 'actions.items.dueSoon',
  critical: 'actions.items.critical',
  owners: 'actions.owners.withOpen',
} as const

/** The settings, by the metric that holds them. */
export const P = {
  snoozeDays: { metricId: M.open, key: 'snoozeDays' },
  dueSoonDays: { metricId: M.dueSoon, key: 'days' },
  blockedDays: { metricId: M.critical, key: 'blockedDays' },
  escalationDays: { metricId: M.critical, key: 'escalationDays' },
} as const

/** Defaults, for tests and wording that names no number. */
export const DEFAULTS = { snoozeDays: 7, dueSoonDays: 7, blockedDays: 14, escalationDays: 14 } as const

/**
 * The fields the views' open items read (each item declares its own `uses`; this is their union
 * across Recruiting, Onboarding, People stats, Org chart, HR ops, Talent, Compensation,
 * Compliance and Listening).
 */
export const ITEM_USES: readonly FieldRef[] = [
  'candidates.applicationId',
  'candidates.appliedDate',
  'candidates.candidateName',
  'candidates.coordinator',
  'candidates.currentStage',
  'candidates.hiredDate',
  'candidates.hmDate',
  'candidates.nextEventDate',
  'candidates.offerDate',
  'candidates.onsiteDate',
  'candidates.recruiter',
  'candidates.rejectedDate',
  'candidates.reqId',
  'candidates.screenDate',
  'candidates.stageEnteredDate',
  'candidates.startDate',
  'candidates.status',
  'cases.category',
  'cases.openedAt',
  'cases.resolutionTargetHours',
  'cases.resolvedAt',
  'cases.status',
  'cases.team',
  'comp.baseSalary',
  'comp.employeeId',
  // Merit spend over budget is weighted by base in USD.
  'comp.fxToUsd',
  'comp.meritPct',
  'comp.rangeMax',
  'comp.rangeMid',
  'comp.rangeMin',
  'employees.businessUnit',
  'employees.country',
  'employees.department',
  'employees.employeeId',
  'employees.employmentType',
  'employees.hireDate',
  'employees.level',
  'employees.location',
  'employees.managerId',
  'employees.name',
  'employees.regrettable',
  'employees.terminationDate',
  'employees.terminationType',
  'jobChanges.changeType',
  'jobChanges.effectiveDate',
  'jobChanges.employeeId',
  'jobChanges.fromDepartment',
  'jobChanges.fromLevel',
  'jobChanges.fromManagerId',
  'jobChanges.toLevel',
  'jobChanges.toManagerId',
  // Hiring plan items for Finance (docs/ROLES-V2.md 5.14): not in the plan, behind it, no req.
  'hiringPlan.businessUnit',
  'hiringPlan.department',
  'hiringPlan.period',
  'hiringPlan.planVersion',
  'hiringPlan.plannedHires',
  'hiringPlan.reqId',
  // Required courses below their on-time target read the course category with the on-time base.
  'learning.category',
  'learning.completedDate',
  'learning.course',
  'learning.dueDate',
  'learning.employeeId',
  'learning.required',
  'onboardingTasks.applicationId',
  'onboardingTasks.completedDate',
  'onboardingTasks.dueDate',
  'onboardingTasks.employeeId',
  'onboardingTasks.owner',
  'onboardingTasks.status',
  'onboardingTasks.task',
  'requisitions.businessUnit',
  'requisitions.closedDate',
  'requisitions.department',
  'requisitions.filledDate',
  'requisitions.hiringManager',
  // Reqs past their time-to-fill target: the level's median when there is no target.
  'requisitions.level',
  'requisitions.openedDate',
  'requisitions.openings',
  'requisitions.recruiter',
  'requisitions.reqId',
  'requisitions.reqType',
  'requisitions.status',
  'reviews.cycle',
  'reviews.cycleDate',
  'reviews.employeeId',
  'reviews.potential',
  'reviews.rating',
  'rightToWork.employeeId',
  'rightToWork.expiryDate',
  'rightToWork.exportLicenseExpiry',
  'rightToWork.exportLicenseRequired',
  'rightToWork.exportLicenseStatus',
  'rightToWork.reverificationStartedDate',
  'succession.criticality',
  'succession.incumbentId',
  'succession.incumbentRiskOfLoss',
  'succession.readiness',
  'succession.roleId',
  'succession.successorId',
  'surveyResponses.item',
  'surveyResponses.reason',
  'surveyResponses.respondentKey',
  'surveyResponses.responseDate',
  'surveyResponses.scale',
  'surveyResponses.score',
  'surveyResponses.subjectKey',
  'surveyResponses.survey',
  'surveyResponses.wave',
  'transactions.completedDate',
  'transactions.dueDate',
  'transactions.effectiveDate',
  'transactions.employeeId',
  'transactions.expectedReturnDate',
  'transactions.type',
]

const POPULATION =
  'Items from every view in the current scope that the data standard shows. Items marked handled or snoozed in this browser are left out.'
const OWNER = 'People analytics'

export const metrics: MetricDef[] = defineMetrics('actions', [
  {
    id: M.open,
    name: 'Open items',
    definition:
      'Items from every view that wait on someone: a decision, a task, a deadline or a follow-up. Each view decides when an item opens, with its own settings.',
    formula: 'items from every view − handled − snoozed',
    population: POPULATION,
    window: 'A snapshot on the as-of date.',
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: P.snoozeDays.key,
        label: 'Snooze length',
        description:
          'How long Snooze hides an item. It comes back on its own when the time is up. Snoozes already set keep their end date.',
        type: 'days',
        default: DEFAULTS.snoozeDays,
        min: 1,
        max: 90,
      },
    ],
  },
  {
    id: M.overdue,
    name: 'Overdue items',
    definition: 'Open items whose due date is before the as-of date.',
    formula: 'open items with due date < as-of date',
    population: POPULATION,
    window: 'A snapshot on the as-of date.',
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
  },
  {
    id: M.dueSoon,
    name: 'Due soon',
    definition:
      'Open items due on the as-of date or within the look-ahead after it. Overdue items are not counted.',
    formula: 'open items with as-of date ≤ due date ≤ as-of date + look-ahead',
    population: POPULATION,
    window: 'From the as-of date to the end of the look-ahead.',
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: P.dueSoonDays.key,
        label: 'Look-ahead',
        description: 'How many days after the as-of date count as due soon, for the tile and the Due filter.',
        type: 'days',
        default: DEFAULTS.dueSoonDays,
        min: 1,
        max: 60,
      },
    ],
  },
  {
    id: M.critical,
    name: 'Critical items',
    definition:
      'Open items with legal or regulatory exposure (an I-9, an export license, a work authorization, final pay), a person blocked past the overdue limit (a candidate or a start waiting on a step), or an item its view rates critical by its own threshold, such as a critical role at high risk of loss.',
    formula:
      'open items with exposure, or blocking a person and overdue > overdue limit, or rated critical by their view',
    population: POPULATION,
    window: 'A snapshot on the as-of date.',
    unit: 'int',
    goodDirection: 'down',
    uses: ITEM_USES,
    owner: OWNER,
    params: [
      {
        key: P.blockedDays.key,
        label: 'Overdue limit for a waiting person',
        description:
          'How many days overdue an item can be before it is critical when a person waits on it: a candidate waiting on a review, an interview, a decision or an offer, or a start waiting on a day-one task. Below the limit it reads Watch.',
        type: 'days',
        default: DEFAULTS.blockedDays,
        min: 1,
        max: 90,
      },
      {
        key: P.escalationDays.key,
        label: 'Escalation after',
        description:
          'A critical item overdue more than this many days is an escalation: it joins legal exposure, critical roles at high risk of loss and regretted exit clusters on the CHRO and HR homes.',
        type: 'days',
        default: DEFAULTS.escalationDays,
        min: 1,
        max: 90,
      },
    ],
  },
  {
    id: M.owners,
    name: 'Owners with open items',
    definition:
      'People and teams with at least one open item. A person counts once across owner groups; a team without a named person counts as one owner.',
    formula: 'distinct owners of open items',
    population: POPULATION,
    window: 'A snapshot on the as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: ITEM_USES,
    owner: OWNER,
  },
])
