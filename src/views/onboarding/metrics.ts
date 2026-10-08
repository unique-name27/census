/**
 * The onboarding view's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('onboarding', [...])`. Each entry is the single source of a number's wording
 * (KPI info popovers and Figure definitions read it through `ctx.metrics.def(id)`), its target and
 * the settings the engine calculates with (read through `ctx.metrics` in engine/settings.ts, never
 * as constants). Wording never quotes a number a setting or target governs.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. From the engine it imports only './engine/lineage' (plain data).
 */
import { SITES } from '@/data/schema'
import { defineMetrics, type MetricInput } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import {
  ACCEPT_TO_START,
  ACCEPTED,
  ACTUAL,
  ATTRITION_90,
  DEPARTMENT,
  FORECAST,
  MANAGER_AT_HIRE,
  NEW_HIRE_TX,
  OPEN_REQS,
  PLAN,
  PLAN_REQ,
  PULSE,
  RENEGE,
  SITE,
  STARTERS,
  TASK_OWNER,
  TASKS,
  TRAINING,
  UPCOMING,
  union,
} from './engine/lineage'

/** Metric ids, by what the view calls them. */
export const M = {
  starts: 'onboarding.upcoming.starts',
  dayMinus3: 'onboarding.upcoming.dayMinus3',
  contingencies: 'onboarding.upcoming.contingencies',
  acceptToStart: 'onboarding.upcoming.acceptToStart',
  renege: 'onboarding.upcoming.renegeRate',
  readiness: 'onboarding.upcoming.readiness',
  readinessByTask: 'onboarding.upcoming.readinessByTask',
  readinessByOwner: 'onboarding.upcoming.readinessByOwner',
  calendar: 'onboarding.upcoming.calendar',
  dayOne: 'onboarding.first90.dayOneReadiness',
  taskTiming: 'onboarding.first90.taskTiming',
  lateByPlace: 'onboarding.first90.lateTaskByPlace',
  i9: 'onboarding.first90.i9Section2',
  training: 'onboarding.first90.training30',
  checkIns: 'onboarding.first90.checkIns',
  probation: 'onboarding.first90.probation',
  attrition90: 'onboarding.first90.attrition90',
  newHireEntered: 'onboarding.first90.newHireEntered',
  pulse: 'onboarding.first90.pulseReady',
  vsPlan: 'onboarding.plan.vsPlan',
  vsPlanByMonth: 'onboarding.plan.vsPlanByMonth',
  committed: 'onboarding.plan.committed',
  forecast: 'onboarding.plan.forecast',
  gap: 'onboarding.plan.gap',
  quarter: 'onboarding.plan.quarterCoverage',
  noReq: 'onboarding.plan.noReq',
  notInPlan: 'onboarding.plan.notInPlan',
  lateTask: 'onboarding.readout.lateTask',
  concentration: 'onboarding.readout.concentration',
} as const

export type OnboardingMetricId = (typeof M)[keyof typeof M]

/** Recruiting's entries the forecast calculates with (its settings change the forecast). */
const RECRUITING_SOURCES = [
  'recruiting.reqs.timeToFill',
  'recruiting.flow.passRate',
  'recruiting.flow.daysToNextStage',
] as const

/* ───────────── settings ───────────── */

/** The registered defaults; engine/settings.ts reads the values in force through the registry. */
export const DEFAULTS = {
  dedupDays: 14,
  unknownLookbackDays: 90,
  dayMinus3Days: 14,
  contingencyBusinessDays: 10,
  trackedCountry: 'India',
  notReadyDays: 3,
  dueSoonBusinessDays: 5,
  readinessHorizonDays: 30,
  calendarWeeks: 13,
  i9BusinessDays: 3,
  trainingDays: 30,
  probationLeadBusinessDays: 10,
  probationDueSoonDays: 30,
  attritionDays: 90,
  onPlanBand: 0.1,
  minBehind: 3,
  lateMinGap: 0.15,
  lateMinCount: 5,
  concentrationMinGap: 0.1,
  dayOneTarget: 0.95,
  i9Target: 1,
  trainingTarget: 0.95,
  checkInsTarget: 0.9,
  attritionTarget: 0.02,
  renegeTarget: 0.03,
  pulseTarget: 4,
} as const

/**
 * Probation length by country in months, where the Atlas has one (none in the United States).
 * The probation decision is due a lead time before it ends when the task has no due date.
 */
export const PROBATION_MONTHS: Readonly<Record<string, number>> = {
  India: 6,
  Germany: 6,
  China: 6,
  Taiwan: 3,
  Israel: 3,
  Canada: 3,
  Vietnam: 2,
  'United States': 0,
}

/** The setting key of a country's probation length: 'United States' → 'monthsUnitedStates'. */
export const probationKey = (country: string): string =>
  `months${country
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')}`

/** Countries with a site, in site order: the choices for the tracked renege country. */
export const COUNTRIES: readonly string[] = [...new Set(SITES.map((s) => s.country))]

const days = (key: string, label: string, description: string, value: number, max = 365): ParamDef => ({
  key,
  label,
  description,
  type: 'days',
  default: value,
  min: 1,
  max,
  step: 1,
})

const count = (key: string, label: string, description: string, value: number, max = 1000): ParamDef => ({
  key,
  label,
  description,
  type: 'number',
  default: value,
  min: 1,
  max,
  step: 1,
  format: 'int',
})

const share = (key: string, label: string, description: string, value: number): ParamDef => ({
  key,
  label,
  description,
  type: 'percent',
  default: value,
  min: 0.01,
  max: 1,
  step: 0.01,
  format: 'pct',
})

/* ───────────── the entries ───────────── */

const OWNER = 'People analytics'
const AS_OF = 'The as-of date and the days after it.'
const PERIOD = 'The period picker (default last 12 months).'
const PLAN_YEAR = 'The plan year of the latest plan version, to the as-of date.'

const entries: MetricInput[] = [
  /* upcoming starts */
  {
    id: M.starts,
    name: 'Upcoming starts',
    definition:
      'People who start after the as-of date: pre-hire employee records and accepted offers with a start date. A candidate is dropped when a pre-hire with the same name starts in the same department within the matching window, so nobody counts twice.',
    formula: 'pre-hires + accepted offers with a future start date − matched duplicates',
    population:
      'Employees with a hire date after the as-of date, and candidates with status Hired and a start date after it. Accepted offers with no start date are counted separately as start date unknown.',
    window: 'The next 30, 60 and 90 days.',
    unit: 'int',
    goodDirection: null,
    uses: UPCOMING,
    owner: OWNER,
    params: [
      days(
        'dedupDays',
        'Matching window',
        'A candidate and a pre-hire with the same name and department are one person when their start dates are at most this many days apart.',
        DEFAULTS.dedupDays,
        90,
      ),
      days(
        'unknownLookbackDays',
        'Start date unknown look-back',
        'Accepted offers with no start date, and nobody in the roster yet, are counted as start date unknown when accepted within this many days.',
        DEFAULTS.unknownLookbackDays,
      ),
    ],
  },
  {
    id: M.dayMinus3,
    name: 'Day −3 tasks not done',
    definition:
      'Upcoming starts in the look-ahead with any onboarding task due three or more days before the start still open.',
    formula: 'starts in the look-ahead with an open task due on or before start − 3 days',
    population: 'Upcoming starts with onboarding tasks.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: union(UPCOMING, TASKS),
    dependsOn: [M.starts],
    owner: OWNER,
    params: [
      days(
        'days',
        'Look-ahead',
        'Starts within this many days of the as-of date are checked.',
        DEFAULTS.dayMinus3Days,
        90,
      ),
    ],
  },
  {
    id: M.contingencies,
    name: 'Open contingencies',
    definition:
      'Upcoming starts in the look-ahead whose background check or export-control screening is not done. This is the Atlas ON-01 weekly exception report.',
    formula: 'starts in the look-ahead with an open background check or export-control screening',
    population: 'Upcoming starts with onboarding tasks.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    target: { value: 0, comparator: '<=' },
    uses: union(UPCOMING, TASKS),
    dependsOn: [M.starts],
    owner: OWNER,
    params: [
      {
        key: 'businessDays',
        label: 'Look-ahead',
        description: 'Starts within this many business days of the as-of date are checked.',
        type: 'number',
        default: DEFAULTS.contingencyBusinessDays,
        min: 1,
        max: 60,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.acceptToStart,
    name: 'Offer accepted to start',
    definition:
      'Median days from the offer accepted date to the start date, for offers accepted in the period. Notice periods make this longer in some countries, so it is also shown by location.',
    formula: 'median(startDate − hiredDate)',
    population:
      'Accepted offers (status Hired) with both dates, accepted in the period. Internal moves are left out, since they have no notice period.',
    window: PERIOD,
    unit: 'days',
    goodDirection: 'down',
    uses: ACCEPT_TO_START,
    owner: OWNER,
  },
  {
    id: M.renege,
    name: 'Renege rate',
    // People stats > Special analyses, Offer declines shows the same rate (docs/ANALYSES.md, 3.4).
    views: ['hrbp'],
    definition:
      'Share of offers accepted in the period that were later withdrawn, so the person never started. One country is tracked on its own, since long notice periods leave more time for counteroffers.',
    formula: 'accepted then withdrawn ÷ accepted',
    population:
      'Candidates with an offer accepted date in the period: status Hired, or Withdrawn after accepting (a renege).',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    target: { value: DEFAULTS.renegeTarget, comparator: '<' },
    uses: RENEGE,
    owner: OWNER,
    params: [
      {
        key: 'trackedCountry',
        label: 'Country tracked separately',
        description: 'This country gets its own renege rate beside the company.',
        type: 'choice',
        default: DEFAULTS.trackedCountry,
        choices: COUNTRIES.map((c) => ({ value: c, label: c })),
      },
    ],
  },
  {
    id: M.readiness,
    name: 'Readiness for day one',
    definition:
      'For each upcoming start, the day-one tasks done (or not needed) out of those that apply. Ready when all are done, Not ready when the start is close and any is open, Behind when any is past due, else On track. The blocking item is the open task due first.',
    formula: 'done or not needed ÷ day-one tasks for the person',
    population:
      'Upcoming starts with onboarding tasks. Form I-9 tasks count only for US sites. Due dates come from the data, else from the Atlas checklist.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(UPCOMING, TASKS, TASK_OWNER),
    dependsOn: [M.starts],
    owner: OWNER,
    params: [
      days(
        'notReadyDays',
        'Not ready within',
        'A start this many days away or closer with any day-one task open is Not ready.',
        DEFAULTS.notReadyDays,
        30,
      ),
      {
        key: 'dueSoonBusinessDays',
        label: 'Action center look-ahead',
        description:
          'Open tasks due within this many business days are listed in the Action center for their owner.',
        type: 'number',
        default: DEFAULTS.dueSoonBusinessDays,
        min: 1,
        max: 30,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.readinessByTask,
    name: 'Readiness by task',
    definition:
      'For starts in the look-ahead, the share with each onboarding task done or not needed so far, with the count past due.',
    formula: 'starts with the task done or not needed ÷ starts with the task',
    population: 'Upcoming starts in the look-ahead with onboarding tasks.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(UPCOMING, TASKS),
    dependsOn: [M.starts],
    owner: OWNER,
    params: [
      days(
        'horizonDays',
        'Look-ahead',
        'Starts within this many days of the as-of date are included.',
        DEFAULTS.readinessHorizonDays,
        120,
      ),
    ],
  },
  {
    id: M.readinessByOwner,
    name: 'Readiness by owner',
    definition:
      'For starts in the look-ahead, the share of each owner’s onboarding tasks done or not needed so far, with the count past due. It shows which team is behind.',
    formula: 'tasks done or not needed ÷ tasks, by owner',
    population: 'Onboarding tasks of upcoming starts in the look-ahead.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    uses: union(UPCOMING, TASKS, TASK_OWNER),
    dependsOn: [M.readinessByTask],
    owner: OWNER,
  },
  {
    id: M.calendar,
    name: 'Start calendar',
    definition: 'Upcoming starts by the week they start (weeks begin on Monday), by business unit.',
    formula: 'count of upcoming starts per start week',
    population: 'Upcoming starts.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: union(UPCOMING, ['employees.businessUnit', 'requisitions.businessUnit']),
    dependsOn: [M.starts],
    owner: OWNER,
    params: [
      count('weeks', 'Weeks shown', 'How many weeks the calendar and the folder-tab spark cover.', 13, 52),
    ],
  },

  /* first 90 days */
  {
    id: M.dayOne,
    name: 'Day-one readiness',
    definition:
      'Share of people who started in the period with every day-one task completed (or not needed) on or before their start date. Atlas ON-01.',
    formula: 'starts with every readiness task done by the start date ÷ starts with readiness tasks',
    population: 'Employees who started in the period and have onboarding tasks.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: DEFAULTS.dayOneTarget, comparator: '>=' },
    targetRequired: true,
    uses: union(STARTERS, TASKS),
    readoutUses: union(SITE, ['employees.country']),
    owner: OWNER,
  },
  {
    id: M.i9,
    name: 'I-9 Section 2 on time',
    definition:
      'Share of US starts in the period whose Form I-9 Section 2 was completed within the allowed business days of the start. Atlas ON-02.',
    formula: 'completed ≤ addBusinessDays(start, allowed) ÷ US starts judged',
    population:
      'Employees at US sites who started in the period. One still open past the deadline counts as late; one not yet due is left out.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: DEFAULTS.i9Target, comparator: '>=' },
    targetRequired: true,
    uses: union(STARTERS, TASKS, SITE),
    owner: OWNER,
    params: [
      {
        key: 'businessDays',
        label: 'Allowed business days',
        description: 'Section 2 is on time when completed within this many business days of the start.',
        type: 'number',
        default: DEFAULTS.i9BusinessDays,
        min: 1,
        max: 30,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.training,
    name: 'Required training on time',
    definition:
      'Share of required Learning assignments made to people in their first weeks that were completed within the allowed days of the start. Atlas ON-04.',
    formula: 'completed ≤ start + allowed days ÷ required assignments judged',
    population:
      'Required assignments of employees who started in the period, assigned and due within the allowed days of the start. Assignments due later are judged in Talent; those still open before the deadline are left out.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: DEFAULTS.trainingTarget, comparator: '>=' },
    targetRequired: true,
    uses: TRAINING,
    owner: OWNER,
    params: [
      days(
        'days',
        'Allowed days',
        'Training counts when completed within this many days of the start.',
        30,
        120,
      ),
    ],
  },
  {
    id: M.taskTiming,
    name: 'When day-one tasks were finished',
    definition:
      'For one day-one task, the days from the start date to the date it was completed, for people who started in the period: negative is before the first day. The due day comes from the checklist. Tasks still open are counted, not placed.',
    formula: 'completed date − start date, by task',
    population:
      'Day-one tasks of employees who started in the period. Not needed is left out. Hidden when fewer starters than the anonymity minimum have the task.',
    window: PERIOD,
    unit: 'days',
    goodDirection: 'down',
    uses: union(STARTERS, TASKS),
    dependsOn: [M.dayOne],
    owner: OWNER,
  },
  {
    id: M.lateByPlace,
    name: 'Late day-one tasks by place',
    definition:
      'For one day-one task in one region or site, the share of people who started in the period whose task was done after its due date, or was still open past it on the as-of date.',
    formula: 'starts with the task late ÷ starts with the task, by task and place',
    population:
      'Day-one tasks of employees who started in the period. Not needed is left out. A place with fewer starters than the anonymity minimum is hidden.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: union(STARTERS, TASKS, SITE, ['employees.country']),
    dependsOn: [M.dayOne],
    owner: OWNER,
  },
  {
    id: M.checkIns,
    name: 'Check-ins on time',
    definition:
      'Share of 30, 60 and 90-day check-ins due in the period that were completed by their due date. Atlas ON-04.',
    formula: 'check-ins done by the due date ÷ check-ins due',
    population:
      'Check-in tasks of employees, due in the period and by the as-of date. Not needed is left out.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: DEFAULTS.checkInsTarget, comparator: '>=' },
    targetRequired: true,
    uses: union(STARTERS, TASKS),
    readoutUses: DEPARTMENT,
    owner: OWNER,
  },
  {
    id: M.probation,
    name: 'Probation decisions overdue',
    definition:
      'Probation decision tasks past their due date and not done, for people still employed. The decision is due a lead time before probation ends; a task with no due date takes it from the probation length for the country.',
    formula: 'probation decisions with due date < as-of date and not done',
    population: 'Employees who have started and are still employed, with a probation decision task.',
    window: 'The as-of date; decisions due in the look-ahead are listed as due soon.',
    unit: 'int',
    goodDirection: 'down',
    target: { value: 0, comparator: '<=' },
    uses: union(STARTERS, TASKS, ['employees.terminationDate', 'employees.country', 'employees.managerId']),
    readoutUses: union(DEPARTMENT, SITE),
    owner: OWNER,
    params: [
      {
        key: 'leadBusinessDays',
        label: 'Lead time',
        description: 'The decision is due this many business days before probation ends.',
        type: 'number',
        default: DEFAULTS.probationLeadBusinessDays,
        min: 0,
        max: 60,
        step: 1,
        format: 'int',
      },
      days(
        'dueSoonDays',
        'Due soon within',
        'Decisions due within this many days are listed as due soon.',
        DEFAULTS.probationDueSoonDays,
        120,
      ),
      ...Object.entries(PROBATION_MONTHS).map(
        ([country, months]): ParamDef => ({
          key: probationKey(country),
          label: `Probation length in ${country}`,
          description: `Months of probation for people in ${country}; 0 means no probation.`,
          type: 'months',
          default: months,
          min: 0,
          max: 24,
          step: 1,
        }),
      ),
    ],
  },
  {
    id: M.attrition90,
    name: 'Early voluntary attrition',
    definition:
      'Share of people who started in the period, and whose early exit window has passed, who resigned within that window. Shown by department and by the manager at hire; groups under the anonymity minimum are hidden.',
    formula: 'resigned within the window ÷ starts whose window has passed',
    population: 'Employees who started in the period; contractors and interns excluded.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    target: { value: DEFAULTS.attritionTarget, comparator: '<' },
    targetRequired: true,
    uses: ATTRITION_90,
    readoutUses: MANAGER_AT_HIRE,
    owner: OWNER,
    params: [
      days('days', 'Early exit window', 'Resignations within this many days of the start count.', 90, 365),
    ],
  },
  {
    id: M.newHireEntered,
    name: 'New hires entered by day −3',
    definition:
      'Share of New hire transactions completed in the HRIS by their due date, three business days before the start, by site. Atlas ON-03.',
    formula: 'completed on or before the due date ÷ new hire transactions due',
    population: 'New hire transactions whose start falls in the period. Open ones past due count as late.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: NEW_HIRE_TX,
    owner: OWNER,
  },
  {
    id: M.pulse,
    name: 'Day-30 "I had what I needed"',
    definition:
      'Mean score of the day-30 onboarding pulse item on week-1 readiness, answered in the period, on its 1 to 5 scale. The Survey items sheet’s target for the item wins over the target set here. Answers are grouped; groups under the anonymity minimum are hidden.',
    formula: 'mean(score) of the week-1 readiness item',
    population: 'Day-30 onboarding pulse answers given in the period.',
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    target: { value: DEFAULTS.pulseTarget, comparator: '>=' },
    uses: PULSE,
    owner: OWNER,
  },

  /* hiring plan */
  {
    id: M.vsPlan,
    name: 'Starts vs plan',
    definition:
      'People who started in the plan year to date as a share of the starts planned for those months. On plan when within the band of the plan, else Behind or Ahead.',
    formula: 'actual starts ÷ planned starts, plan year to date',
    population:
      'Plan lines of the latest plan version; employees (not contractors or interns) whose hire date falls in a plan month to the as-of date.',
    window: PLAN_YEAR,
    unit: 'pct',
    goodDirection: null,
    uses: union(PLAN, ACTUAL),
    owner: OWNER,
    params: [
      share(
        'onPlanBand',
        'On-plan band',
        'Actual starts within this share of the planned starts, above or below, are On plan.',
        DEFAULTS.onPlanBand,
      ),
    ],
  },
  {
    id: M.vsPlanByMonth,
    name: 'Starts against plan by month',
    definition:
      'For one business unit (or department, inside one unit) and one month of the plan year, the people who started that month minus the starts the plan lines put in it. Below zero is behind plan.',
    formula: 'actual starts − planned starts, by unit and month',
    population:
      'Plan lines of the latest plan version; employees (not contractors or interns) whose hire date falls in the month, to the as-of date.',
    window: PLAN_YEAR,
    unit: 'int',
    goodDirection: null,
    uses: union(PLAN, ACTUAL),
    dependsOn: [M.vsPlan],
    owner: OWNER,
  },
  {
    id: M.committed,
    name: 'Committed starts',
    definition: 'Accepted offers and pre-hires with a start date after the as-of date, inside the plan year.',
    formula: 'upcoming starts with a start date in the plan year',
    population: 'Upcoming starts, de-duplicated as for Upcoming starts.',
    window: PLAN_YEAR,
    unit: 'int',
    goodDirection: 'up',
    uses: union(PLAN, UPCOMING),
    dependsOn: [M.starts],
    owner: OWNER,
  },
  {
    id: M.forecast,
    name: 'Forecast starts',
    definition:
      'Expected starts from open reqs. The furthest candidate on a req is hired with the chance Recruiting’s stage pass rates give, after the median days left from that stage. The rest of the historical fill rate lands at the median time to fill. Both then add the median days from offer accepted to start.',
    formula:
      'Σ open reqs: openings × (P(lead candidate hired) at lead date + (fill rate − P)⁺ at opened + time to fill)',
    population:
      'Open reqs in scope, less openings already covered by an accepted offer. Fill rate = reqs filled ÷ reqs filled or cancelled in the period.',
    window: PLAN_YEAR,
    unit: 'int',
    goodDirection: 'up',
    uses: union(PLAN, FORECAST),
    dependsOn: [...RECRUITING_SOURCES, M.acceptToStart],
    owner: OWNER,
  },
  {
    id: M.gap,
    name: 'Gap to plan',
    definition:
      'Full-year planned starts not yet covered by actual starts, committed starts or the forecast. Negative means the plan is likely to be exceeded.',
    formula: 'full-year plan − (actual + committed + forecast)',
    population: 'The latest plan version, by business unit and department.',
    window: PLAN_YEAR,
    unit: 'int',
    goodDirection: 'down',
    uses: union(PLAN, ACTUAL, UPCOMING, FORECAST),
    dependsOn: [M.vsPlan, M.committed, M.forecast],
    owner: OWNER,
    params: [
      share(
        'behindCritical',
        'Critical gap',
        'A business unit or department behind plan is a critical Action center item when its full-year gap is at least this share of its full-year plan, and at least the critical starts below.',
        0.25,
      ),
      count(
        'behindCriticalMin',
        'Critical gap, starts',
        'A department behind plan is critical only when its full-year gap is at least this many starts; a smaller gap reads Watch, whatever its share.',
        3,
        100,
      ),
    ],
  },
  {
    id: M.quarter,
    name: 'Next-quarter roles not covered',
    definition:
      'Planned starts in the coming quarter with neither an accepted offer nor an open req behind them: plan lines with no req, or whose req is on hold or cancelled.',
    formula: 'Σ planned hires on next-quarter lines without an accepted offer or open req',
    population: 'Plan lines of the latest plan version in the coming quarter.',
    window: 'The quarter after the as-of date.',
    unit: 'int',
    goodDirection: 'down',
    uses: union(PLAN, PLAN_REQ, ACCEPTED),
    owner: OWNER,
    params: [
      count(
        'minBehind',
        'Readout from',
        'A business unit with at least this many uncovered planned starts gets a readout finding.',
        DEFAULTS.minBehind,
        100,
      ),
    ],
  },
  {
    id: M.noReq,
    name: 'Planned roles with no open req',
    definition:
      'Future plan lines with no requisition, or whose requisition is on hold or cancelled. Lines whose req already has an accepted offer are covered and left out.',
    formula: 'future plan lines without an open req or accepted offer',
    population: 'Plan lines of the latest plan version for months after the as-of date.',
    window: 'Months after the as-of date in the plan year.',
    unit: 'int',
    goodDirection: 'down',
    uses: union(PLAN, PLAN_REQ, ACCEPTED),
    owner: OWNER,
    params: [
      days(
        'soonDays',
        'Starting soon',
        'A planned role with no open req is a warning in the Action center when its planned month starts within this many days.',
        60,
      ),
    ],
  },
  {
    id: M.notInPlan,
    name: 'Open reqs not in the plan',
    definition:
      'Open requisitions whose ID is on no line of the latest plan version. Backfills are listed on their own, since they replace a leaver rather than add a role.',
    formula: 'open reqs − reqs named on a plan line',
    population: 'Open requisitions in scope.',
    window: 'The as-of date.',
    unit: 'int',
    goodDirection: 'down',
    uses: union(OPEN_REQS, ['hiringPlan.reqId', 'hiringPlan.planVersion', 'requisitions.reqType']),
    owner: OWNER,
  },

  /* readout rules */
  {
    id: M.lateTask,
    name: 'Late tasks in one place',
    definition:
      'A readout rule: one onboarding task finished after its due date for a much larger share of starts in one region, site or department than elsewhere.',
    formula: 'late share in the group − late share elsewhere ≥ minimum gap',
    population: 'Day-one tasks of employees who started in the period.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: union(STARTERS, TASKS, SITE, DEPARTMENT, ['employees.country']),
    owner: OWNER,
    params: [
      share(
        'minGap',
        'Minimum gap',
        'The group’s late share must exceed the rest by at least this much.',
        0.15,
      ),
      count('minLate', 'Minimum late tasks', 'The group needs at least this many late tasks.', 5, 500),
    ],
  },
  {
    id: M.concentration,
    name: 'Where a shortfall concentrates',
    definition:
      'A readout rule: day-one readiness and check-ins name the group where misses concentrate when its rate is below the rest by at least the minimum gap.',
    formula: 'rate elsewhere − rate in the group ≥ minimum gap',
    population: 'The starts and check-ins behind each measure.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: null,
    uses: union(STARTERS, TASKS, SITE, DEPARTMENT),
    dependsOn: [M.dayOne, M.checkIns],
    owner: OWNER,
    params: [share('minGap', 'Minimum gap', 'A group is named when it trails the rest by this much.', 0.1)],
  },
]

export const metrics: MetricDef[] = defineMetrics('onboarding', entries)
