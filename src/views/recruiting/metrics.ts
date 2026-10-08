/**
 * The recruiting view's metric dictionary entries (docs/METRICS.md): one per metric the view shows,
 * registered with `defineMetrics('recruiting', [...])` from '@/metrics/define'. The catalog imports
 * this file, so keep it to plain data: never React, '@/data/context', '@/data/store', the
 * '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'. (The lineage
 * groups in './engine/lineage' are plain data too.)
 *
 * Every KPI, figure and readout rule of the view points at one of these ids
 * (`./engine/metricLinks`). Definitions name a setting rather than quote its number, so your
 * wording stays true when a setting changes; the KPI popovers and figure definitions add the
 * values in force after it (`./engine/definitions`). The engine reads every setting through
 * `ctx.metrics` in one place (`./engine/settings`).
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, ParamDef, UsesWhen } from '@/metrics/types'
import {
  APP_DIM,
  COHORT,
  FILLED_REQ,
  HIRES,
  OWNER as NEXT_ACTION_OWNER,
  NEXT_STEP,
  OPEN_REQ,
  OUTCOME,
  REASON,
  REQ_DIM,
  REQ_JOIN,
  STAGE_DATES,
  STAGE_REACHED,
  START_DATE,
  uses,
} from './engine/lineage'

/** Every recruiting metric id, by what the view calls it. */
export const RM = {
  openReqs: 'recruiting.reqs.open',
  offersAccepted: 'recruiting.hires.offersAccepted',
  timeToFill: 'recruiting.reqs.timeToFill',
  timeToHire: 'recruiting.hires.timeToHire',
  offerAcceptance: 'recruiting.offers.acceptance',
  lackingNextStep: 'recruiting.pipeline.lackingNextStep',
  activeCandidates: 'recruiting.pipeline.activeCandidates',
  daysWaiting: 'recruiting.pipeline.daysWaiting',
  awaitingDecision: 'recruiting.pipeline.awaitingDecision',
  candidateFlow: 'recruiting.flow.reached',
  passRate: 'recruiting.flow.passRate',
  daysToNextStage: 'recruiting.flow.daysToNextStage',
  stepDaysByMonth: 'recruiting.flow.stepDaysByMonth',
  bottleneck: 'recruiting.flow.bottleneck',
  withdrawals: 'recruiting.flow.withdrawals',
  exitReasons: 'recruiting.flow.exitReasons',
  emptyFunnel: 'recruiting.reqs.emptyFunnel',
  reqAge: 'recruiting.reqs.age',
  openedFilled: 'recruiting.reqs.openedFilled',
  slowFill: 'recruiting.reqs.slowFill',
  recruiterLoad: 'recruiting.recruiters.load',
  sourceHireRate: 'recruiting.sources.hireRate',
  sourceApplications: 'recruiting.sources.applications',
  sourceDryingUp: 'recruiting.sources.dryingUp',
  bestSource: 'recruiting.sources.best',
  acceptanceByLocation: 'recruiting.offers.acceptanceByLocation',
  acceptanceDrop: 'recruiting.offers.acceptanceDrop',
  offersWaiting: 'recruiting.offers.waiting',
  declineReasons: 'recruiting.offers.declineReasons',
  reqMatch: 'recruiting.data.reqMatch',
} as const

export type RecruitingMetricId = (typeof RM)[keyof typeof RM]

/** Where time to fill stops: the offer accepted date, or the hire's start date when known. */
export type TtfEnd = 'accepted' | 'start'

const OWNER = 'People analytics'
const PERIOD = 'The period picker (default last 12 months).'
const SNAPSHOT = 'A snapshot on the as-of date.'

/* ───────── settings ───────── */

const count = (p: Omit<ParamDef, 'type' | 'step' | 'format'>): ParamDef => ({
  ...p,
  type: 'number',
  step: 1,
  format: 'int',
})
const multiple = (p: Omit<ParamDef, 'type' | 'format'>): ParamDef => ({
  step: 0.1,
  ...p,
  type: 'number',
  format: 'times',
})
const days = (p: Omit<ParamDef, 'type' | 'step'>): ParamDef => ({ ...p, type: 'days', step: 1 })
const share = (p: Omit<ParamDef, 'type'>): ParamDef => ({ step: 0.01, format: 'pct', ...p, type: 'percent' })
const points = (p: Omit<ParamDef, 'type' | 'format'>): ParamDef => ({
  step: 0.005,
  ...p,
  type: 'percent',
  format: 'pts',
})

const LACKING_PARAMS: readonly ParamDef[] = [
  multiple({
    key: 'watchMultiple',
    label: 'Watch point',
    description:
      'A candidate with no step booked is flagged to watch (amber) after this multiple of the usual days for their stage.',
    default: 1.5,
    min: 1,
    max: 10,
  }),
  multiple({
    key: 'overdueMultiple',
    label: 'Overdue point',
    description:
      'A candidate with no step booked is flagged overdue (red) after this multiple of the usual days for their stage.',
    default: 2.5,
    min: 1,
    max: 20,
  }),
  days({
    key: 'decisionWatchDays',
    label: 'Decision wait',
    description: 'Days after an interview with no decision before the candidate is flagged to watch.',
    default: 2,
    min: 1,
    max: 60,
  }),
  days({
    key: 'decisionOverdueDays',
    label: 'Decision overdue',
    description: 'Days after an interview with no decision before the candidate is flagged overdue.',
    default: 5,
    min: 1,
    max: 90,
  }),
  days({
    key: 'offerWatchDays',
    label: 'Offer wait',
    description:
      'Days an offer can be out without an answer before it is flagged to watch. The readout lists offers out longer than this as waiting on an answer.',
    default: 5,
    min: 1,
    max: 90,
  }),
  days({
    key: 'offerOverdueDays',
    label: 'Offer overdue',
    description:
      'Days an offer can be out without an answer before it is flagged overdue. Past this, offers waiting on an answer are critical in the readout.',
    default: 10,
    min: 1,
    max: 120,
  }),
  multiple({
    key: 'farOutMultiple',
    label: 'Far-out point',
    description:
      'A step booked further away than this multiple of the usual days for the stage is flagged to watch.',
    default: 1.5,
    min: 1,
    max: 20,
  }),
  days({
    key: 'fallbackNormDays',
    label: 'Usual days without history',
    description: 'The usual days for a stage when too few completed steps exist to measure it from the data.',
    default: 14,
    min: 1,
    max: 120,
  }),
  count({
    key: 'minNormSteps',
    label: 'Steps to measure a stage',
    description:
      'Completed steps a stage needs before its usual days come from the data: the median days to the next stage.',
    default: 5,
    min: 1,
    max: 500,
  }),
  count({
    key: 'criticalCount',
    label: 'Critical from',
    description:
      'The readout calls this finding critical from this many candidates, or from the critical share of active candidates when that is more.',
    default: 8,
    min: 1,
    max: 1000,
  }),
  share({
    key: 'criticalShare',
    label: 'Critical share',
    description: 'The share of active candidates from which the readout calls this finding critical.',
    default: 0.25,
    min: 0.01,
    max: 1,
  }),
  days({
    key: 'staleDays',
    label: 'No activity for',
    description:
      'An application whose last activity date is more than this many days before the as-of date is left out of the Action center: it is more likely a record nobody closed than a candidate waiting on a step. The action queue on Pipeline still lists it. Without a last activity date nothing is left out.',
    default: 90,
    min: 14,
    max: 730,
  }),
]

const TTF_END: ParamDef = {
  key: 'endEvent',
  label: 'Clock stops at',
  description:
    'When time to fill ends: the date the offer was accepted, or the hire’s start date from the Employees data. Reqs whose hire has no start date on or before the as-of date keep the offer accepted date.',
  type: 'choice',
  default: 'accepted' satisfies TtfEnd,
  choices: [
    { value: 'accepted' satisfies TtfEnd, label: 'Offer accepted' },
    { value: 'start' satisfies TtfEnd, label: 'Start date when known' },
  ],
}

/* ───────── lineage that depends on settings or on what a finding names ───────── */

/** Every breakdown an application finding can name (a finding declares the one it shows). */
const ANY_APP_DIM = uses(...Object.values(APP_DIM))
/** Every breakdown a requisition finding can name. */
const ANY_REQ_DIM = uses(...Object.values(REQ_DIM))
/** Time to fill that stops at the start date also reads how each hire is found in Employees. */
const AT_START: UsesWhen = {
  setting: { metricId: RM.timeToFill, key: 'endEvent' },
  value: 'start',
  uses: START_DATE,
}

/* ───────── entries ───────── */

export const metrics: MetricDef[] = defineMetrics('recruiting', [
  /* KPIs */
  {
    id: RM.openReqs,
    name: 'Open reqs',
    definition:
      'Requisitions open on the as-of date: opened by then and not yet filled, closed or cancelled. Reqs on hold are counted separately.',
    formula: 'reqs opened on or before the as-of date and not filled, closed or cancelled by then',
    population: 'Requisitions in scope. Reqs on hold are left out because their hold dates are unknown.',
    window: `${SNAPSHOT} The change compares with the end of the prior period.`,
    unit: 'int',
    goodDirection: null,
    uses: OPEN_REQ,
    owner: OWNER,
  },
  {
    id: RM.offersAccepted,
    name: 'Offers accepted',
    definition:
      'Candidates with status Hired whose offer was accepted (hired date) in the period. People stats counts hires by start date in the Employees data, so the two numbers can differ.',
    formula: 'applications with status Hired and a hired date in the period',
    population: 'Applications received by the as-of date, scoped by their requisition.',
    window: `${PERIOD} By month, the 24 months to the end of the period.`,
    unit: 'int',
    goodDirection: null,
    uses: HIRES,
    owner: OWNER,
  },
  {
    id: RM.timeToFill,
    name: 'Median time to fill',
    definition:
      'Median days from the date a req opened to the day its clock stops, for reqs filled (offer accepted) in the period. The clock stops when the offer is accepted, or at the hire’s start date when the setting says so.',
    formula: 'median(clock stop date − opened date)',
    population:
      'Reqs filled in the period; cancelled reqs are left out. Groups smaller than the anonymity minimum show no median.',
    window: `${PERIOD} Reqs count in the period of their filled date.`,
    unit: 'days',
    goodDirection: 'down',
    // A common benchmark for professional roles; the Scorecard judges the median against it.
    target: { value: 45, comparator: '<=' },
    uses: FILLED_REQ,
    usesWhen: [AT_START],
    owner: OWNER,
    params: [TTF_END],
  },
  {
    id: RM.timeToHire,
    name: 'Median time to hire',
    definition: 'Median days from application to offer accepted, for offers accepted in the period.',
    formula: 'median(hired date − applied date)',
    population: 'Applications with status Hired and a hired date in the period.',
    window: PERIOD,
    unit: 'days',
    goodDirection: 'down',
    uses: HIRES,
    owner: OWNER,
  },
  {
    id: RM.offerAcceptance,
    name: 'Offer acceptance',
    definition:
      'Offers accepted ÷ offers accepted or declined, for offers resolved in the period (hired date or decline date).',
    formula: 'hired ÷ (hired + declined)',
    population:
      'Offers resolved in the period. Rates over fewer offers than the anonymity minimum are hidden.',
    window: `${PERIOD} By quarter, the last 8 quarters.`,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.85, comparator: '>=' },
    uses: OUTCOME,
    owner: OWNER,
    params: [
      points({
        key: 'materialPts',
        label: 'Change worth color',
        description:
          'The change from the prior period is colored only when it is at least this many points and both periods have enough offers.',
        default: 0.05,
        min: 0.005,
        max: 0.5,
      }),
      count({
        key: 'minOffers',
        label: 'Offers for color',
        description: 'Offers resolved in each period before the change from the prior period is colored.',
        default: 10,
        min: 1,
        max: 1000,
      }),
    ],
  },
  {
    id: RM.lackingNextStep,
    name: 'Candidates lacking a next step',
    definition:
      'Active candidates who lack a timely next step on the as-of date: no step booked for longer than the watch point for their stage, an interview decision pending longer than the decision wait, an offer out longer than the offer wait, or a step booked further out than the far-out point. "No step booked" on its own is a state, not this alarm. These candidates, less those with a step booked, make up the action queue.',
    formula: 'active candidates flagged to watch (amber) or overdue (red)',
    population:
      'Applications open on the as-of date. The usual days for a stage is the median days to the next stage over every application with both dates.',
    window: SNAPSHOT,
    unit: 'int',
    goodDirection: 'down',
    uses: NEXT_STEP,
    // The readout names who owns the next action and where the items concentrate.
    readoutUses: uses(NEXT_ACTION_OWNER, ANY_APP_DIM),
    owner: OWNER,
    params: LACKING_PARAMS,
  },

  /* live pipeline */
  {
    id: RM.activeCandidates,
    name: 'Active candidates',
    definition:
      'Applications still open on the as-of date, by the stage they wait in and their next-step state: scheduled, needs decision, offer extended or no step booked.',
    formula:
      'applications received by the as-of date and not hired, rejected, withdrawn or declined by then, by stage and next-step state',
    population: 'Applications received by the as-of date and not yet hired, rejected, withdrawn or declined.',
    window: SNAPSHOT,
    unit: 'int',
    goodDirection: null,
    uses: NEXT_STEP,
    owner: OWNER,
  },
  {
    id: RM.daysWaiting,
    name: 'Days waiting',
    definition:
      'Days since the interview for decisions, since the offer for offers out, otherwise days in the current stage.',
    formula:
      'as-of date − the date the wait started: the interview (needs decision), the offer (offer extended), else the date the current stage was entered',
    population: 'Active candidates on the as-of date.',
    window: SNAPSHOT,
    unit: 'days',
    goodDirection: 'down',
    uses: NEXT_STEP,
    owner: OWNER,
  },
  {
    id: RM.awaitingDecision,
    name: 'Interview decisions waiting',
    definition:
      'Active candidates whose interview happened and whose stage has not moved since, by the hiring manager on the req. The decision is the hiring manager’s to make. A wait past the decision wait is to watch, past the decision overdue point it is overdue (both settings of Candidates lacking a next step).',
    formula: 'active candidates in the needs decision state, by the hiring manager of their req',
    population:
      'Applications open on the as-of date whose last interview date is on or before it, with no later stage date.',
    window: SNAPSHOT,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(NEXT_STEP, APP_DIM.hiringManager, ['requisitions.hiringManagerId']),
    dependsOn: [RM.lackingNextStep],
    owner: OWNER,
  },

  /* candidate flow */
  {
    id: RM.candidateFlow,
    name: 'Applications by furthest stage',
    definition:
      'Applications received in the period, by the furthest stage reached and where they stand on the as-of date: advanced, still active, rejected, withdrawn or declined. A stage counts as reached with its date or a later one, so skipped stages count as passed.',
    formula:
      'applications received in the period with furthest stage ≥ the stage, by advanced, active, rejected, withdrawn or declined',
    population: 'Applications with an applied date in the period (the cohort).',
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: uses(COHORT, STAGE_REACHED),
    owner: OWNER,
  },
  {
    id: RM.passRate,
    name: 'Stage pass rate',
    definition:
      'Of candidates who reached a stage and are no longer waiting there, the share who advanced. Still-active candidates don’t count against it.',
    formula: 'advanced ÷ (advanced + rejected + withdrawn + declined)',
    population: 'Applications received in the period.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: uses(COHORT, STAGE_REACHED),
    owner: OWNER,
  },
  {
    id: RM.daysToNextStage,
    name: 'Median days to the next stage',
    definition:
      'Median days between a stage date and the next stage date, for applications received in the period with both dates. The change compares with applications received in the prior period.',
    formula: 'median(next stage date − stage date)',
    population:
      'Applications received in the period with both dates. The change shows when both periods reach the anonymity minimum.',
    window: PERIOD,
    unit: 'days',
    goodDirection: 'down',
    uses: STAGE_DATES,
    owner: OWNER,
  },
  {
    id: RM.stepDaysByMonth,
    name: 'Days per step by month',
    definition:
      'Median days from one stage date to the next, for steps completed that month (the date of the later stage). Grouping by completion month keeps slow steps in the month they finished, so a recent slowdown shows.',
    formula: 'median(next stage date − stage date), by month of the next stage date',
    population:
      'Steps completed in the 12 months to the end of the period. Cells with fewer steps than the anonymity minimum are left blank.',
    window: 'The 12 months to the end of the period.',
    unit: 'days',
    goodDirection: 'down',
    uses: STAGE_DATES,
    owner: OWNER,
  },
  {
    id: RM.bottleneck,
    name: 'Stage bottleneck',
    definition:
      'A step whose median days over the recent window are at least the bottleneck factor times the comparison, and longer by at least the minimum gap. The comparison is the same step everywhere else (by department, location, level, hiring manager or recruiter), or the other steps.',
    formula: 'median days for the step ÷ median days for the comparison',
    population: 'Steps completed in the recent window, for transitions with enough completed steps.',
    window: 'The recent window (the last 3 months by default), within the period.',
    unit: 'times',
    goodDirection: 'down',
    uses: uses(NEXT_STEP, ANY_APP_DIM),
    owner: OWNER,
    params: [
      multiple({
        key: 'factor',
        label: 'Bottleneck factor',
        description: 'How many times slower than the comparison a step must run to be a bottleneck.',
        default: 2,
        min: 1.1,
        max: 10,
      }),
      days({
        key: 'minGapDays',
        label: 'Minimum gap',
        description: 'How many days longer than the comparison a step must take to be a bottleneck.',
        default: 5,
        min: 0,
        max: 90,
      }),
      {
        key: 'recentMonths',
        label: 'Recent window',
        description:
          'The months of completed steps the check reads, counting back from the end of the period.',
        type: 'months',
        default: 3,
        min: 1,
        max: 12,
        step: 1,
      },
      count({
        key: 'minSteps',
        label: 'Steps to measure',
        description: 'Completed steps a transition needs in the recent window before it is measured.',
        default: 10,
        min: 2,
        max: 1000,
      }),
      multiple({
        key: 'criticalFactor',
        label: 'Critical factor',
        description: 'From this many times slower than the comparison, the bottleneck is critical.',
        default: 3,
        min: 1.1,
        max: 20,
      }),
      count({
        key: 'minCriticalSteps',
        label: 'Steps for critical',
        description:
          'A bottleneck in one department, location, level or person is critical only over at least this many completed steps.',
        default: 10,
        min: 1,
        max: 1000,
      }),
    ],
  },
  {
    id: RM.withdrawals,
    name: 'Withdrawal share',
    definition:
      'Withdrawals as a share of candidate exits (rejections and withdrawals) dated in the period. The readout flags it at the share to flag or above, or when it rose by at least the rise to flag from the prior period.',
    formula: 'withdrawals ÷ (rejections + withdrawals)',
    population: 'Rejections and withdrawals dated in the period.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: OUTCOME,
    owner: OWNER,
    params: [
      share({
        key: 'flagShare',
        label: 'Share to flag',
        description: 'The readout flags withdrawals at this share of candidate exits or above.',
        default: 0.15,
        min: 0.01,
        max: 1,
      }),
      points({
        key: 'risePts',
        label: 'Rise to flag',
        description: 'The readout also flags a rise of at least this many points from the prior period.',
        default: 0.05,
        min: 0.005,
        max: 1,
      }),
      count({
        key: 'minExits',
        label: 'Exits to measure',
        description: 'Rejections and withdrawals a period needs before its share is read.',
        default: 10,
        min: 1,
        max: 10000,
      }),
    ],
  },
  {
    id: RM.exitReasons,
    name: 'Why candidates left',
    definition:
      'Rejections and withdrawals dated in the period, by the recorded reason and the furthest stage reached before leaving.',
    formula: 'rejections and withdrawals dated in the period, by recorded reason and furthest stage reached',
    population: 'Applications rejected or withdrawn in the period.',
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: uses(OUTCOME, STAGE_REACHED, REASON),
    owner: OWNER,
  },

  /* requisitions */
  {
    id: RM.emptyFunnel,
    name: 'Empty funnel',
    definition:
      'An open req where no candidate has ever reached the hiring manager stage, open longer than the empty-funnel age.',
    formula: 'open reqs older than the empty-funnel age with nobody past the screen',
    population:
      'Reqs open on the as-of date. Not checked when Candidates is empty or most of its rows match no req ID.',
    window: SNAPSHOT,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(OPEN_REQ, REQ_JOIN, STAGE_REACHED),
    // The readout names the req and where the empty reqs concentrate, with the slow time-to-fill story.
    readoutUses: uses(['requisitions.jobTitle', 'requisitions.priority'], FILLED_REQ, ANY_REQ_DIM),
    usesWhen: [AT_START],
    dependsOn: [RM.timeToFill, RM.slowFill],
    owner: OWNER,
    params: [
      days({
        key: 'days',
        label: 'Empty-funnel age',
        description:
          'An open req with nobody past the screen is an empty funnel once it has been open longer than this.',
        default: 30,
        min: 1,
        max: 730,
      }),
    ],
  },
  {
    id: RM.reqAge,
    name: 'Open req age',
    definition: 'As-of date minus the date the req opened, for reqs open on the as-of date.',
    formula: 'as-of date − opened date',
    population: 'Reqs open on the as-of date; reqs on hold are left out.',
    window: SNAPSHOT,
    unit: 'days',
    goodDirection: 'down',
    uses: OPEN_REQ,
    owner: OWNER,
    params: [
      days({
        key: 'oldDays',
        label: 'Old req',
        description:
          'Open reqs by department marks a department amber when its oldest open req has been open longer than this.',
        default: 120,
        min: 1,
        max: 1095,
      }),
      multiple({
        key: 'agingMultiple',
        label: 'Past target without a target',
        description:
          'Without a time-to-fill target, a req is past target once it has been open this multiple of the median time to fill for its level (last 12 months, 5 or more reqs filled). It becomes an Action center item for its recruiter.',
        default: 1.5,
        min: 1,
        max: 10,
      }),
      multiple({
        key: 'agingCritical',
        label: 'Critical past target',
        description:
          'A req past target is critical once it has been open this multiple of the time-to-fill target (or of its level’s median).',
        default: 2.5,
        min: 1,
        max: 20,
      }),
    ],
  },
  {
    id: RM.openedFilled,
    name: 'Reqs opened and filled',
    definition:
      'Reqs by the month they opened, and by the month their (last) offer was accepted. Cancelled reqs are not counted as filled.',
    formula: 'reqs by month opened; reqs by month filled, cancelled reqs left out',
    population:
      'Requisitions in scope: every req with an opened date counts as opened, cancelled ones included; reqs with a filled date count as filled unless cancelled.',
    window: 'The 12 months to the end of the period.',
    unit: 'int',
    goodDirection: null,
    uses: FILLED_REQ,
    owner: OWNER,
  },
  {
    id: RM.slowFill,
    name: 'Slow time to fill',
    definition:
      'A department, level or location whose median time to fill is at least the slow factor times the median for every req filled in the period.',
    formula: 'group median time to fill ÷ overall median time to fill',
    population:
      'Reqs filled in the period, once enough are filled to compare. Groups smaller than the anonymity minimum are not compared.',
    window: PERIOD,
    unit: 'times',
    goodDirection: 'down',
    uses: FILLED_REQ,
    // The readout names the levels and departments that fill slowly.
    readoutUses: ANY_REQ_DIM,
    usesWhen: [AT_START],
    dependsOn: [RM.timeToFill],
    owner: OWNER,
    params: [
      multiple({
        key: 'factor',
        label: 'Slow factor',
        description:
          'A group fills slowly at this multiple of the overall median time to fill. Time to fill by department marks those bars amber.',
        default: 1.5,
        min: 1.05,
        max: 10,
        step: 0.05,
      }),
      count({
        key: 'minFilled',
        label: 'Reqs filled to compare',
        description: 'Reqs filled in the period before groups are compared.',
        default: 10,
        min: 2,
        max: 10000,
      }),
    ],
  },
  {
    id: RM.recruiterLoad,
    name: 'Recruiter load',
    definition:
      'Open reqs and active candidates per recruiter on the as-of date, offers accepted on their reqs in the period, and the median days their active candidates have waited in stage. A recruiter is flagged for a heavy load or long waits above the flag factor times the team median.',
    formula:
      'per recruiter: open reqs, active candidates, offers accepted and median days in stage; flagged above flag factor × team median',
    population: 'Team medians are over named recruiters; unassigned work is listed but never flagged.',
    window: `${SNAPSHOT} Offers accepted use the period picker.`,
    unit: 'int',
    goodDirection: null,
    uses: uses(OPEN_REQ, NEXT_STEP, HIRES, APP_DIM.recruiter),
    owner: OWNER,
    params: [
      multiple({
        key: 'flagFactor',
        label: 'Flag factor',
        description:
          'Open reqs, active candidates or median wait above this multiple of the team median flag a recruiter.',
        default: 1.5,
        min: 1.05,
        max: 10,
        step: 0.05,
      }),
    ],
  },

  /* sources and offers */
  {
    id: RM.sourceHireRate,
    name: 'Source hire rate',
    definition:
      'Applications from the source that ended in a hire. Candidates still in process count as not hired yet, so short or recent periods read low.',
    formula: 'hired ÷ applications',
    population:
      'Applications received in the period. Sources with fewer applications than the anonymity minimum show no rate.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: uses(COHORT, OUTCOME, APP_DIM.source),
    owner: OWNER,
  },
  {
    id: RM.sourceApplications,
    name: 'Applications by source',
    definition:
      'Applications by the month they were received, by source. The highlighted source is the one whose change in volume differs most from the change in all applications.',
    formula:
      'applications by source and month applied; highlighted: max |source change − overall change|, sources with ≥ prior applications to highlight',
    population: 'Applications received in the 24 months to the end of the period.',
    window: 'The 24 months to the end of the period; the change compares the period with the prior one.',
    unit: 'int',
    goodDirection: null,
    uses: uses(COHORT, APP_DIM.source),
    owner: OWNER,
    params: [
      count({
        key: 'minPrior',
        label: 'Prior applications to highlight',
        description: 'A source needs this many applications in the prior period to be highlighted.',
        default: 30,
        min: 1,
        max: 100000,
      }),
    ],
  },
  {
    id: RM.sourceDryingUp,
    name: 'Source drying up',
    definition:
      'A source whose applications fell by at least the drop to flag from the prior period, and by at least the gap more than all other sources together.',
    formula: 'applications ÷ prior applications − 1',
    population: 'Sources with enough applications in the prior period.',
    window: PERIOD,
    unit: 'deltaPct',
    goodDirection: 'up',
    uses: uses(COHORT, APP_DIM.source),
    owner: OWNER,
    params: [
      share({
        key: 'drop',
        label: 'Drop to flag',
        description: 'The readout flags a source whose applications fell by at least this share.',
        default: 0.4,
        min: 0.05,
        max: 1,
      }),
      points({
        key: 'gapPts',
        label: 'Gap to other sources',
        description: 'The source must also fall by at least this many points more than all other sources.',
        default: 0.2,
        min: 0.01,
        max: 1,
      }),
      count({
        key: 'minPrior',
        label: 'Prior applications',
        description: 'Applications a source needs in the prior period to be checked.',
        default: 30,
        min: 1,
        max: 100000,
      }),
      share({
        key: 'minPriorShare',
        label: 'Prior share',
        description: 'The share of all prior applications a source needs to be checked.',
        default: 0.05,
        min: 0,
        max: 1,
        step: 0.005,
      }),
    ],
  },
  {
    id: RM.bestSource,
    name: 'Best source',
    definition:
      'The source with the highest hire rate, when it is at least the hire rate factor times the overall rate, over enough applications and hires.',
    formula: 'source hire rate ÷ overall hire rate',
    population: 'Applications received in the period, when the period is long enough to read hire rates.',
    window: PERIOD,
    unit: 'times',
    goodDirection: 'up',
    uses: uses(COHORT, OUTCOME, APP_DIM.source),
    owner: OWNER,
    params: [
      multiple({
        key: 'factor',
        label: 'Hire rate factor',
        description: 'The source’s hire rate must be at least this multiple of the overall rate.',
        default: 1.5,
        min: 1.05,
        max: 10,
        step: 0.05,
      }),
      count({
        key: 'minApplications',
        label: 'Applications',
        description: 'Applications a source, and the period, need before hire rates are compared.',
        default: 30,
        min: 1,
        max: 100000,
      }),
      count({
        key: 'minHires',
        label: 'Hires',
        description: 'Hires a source needs before it can be called the best.',
        default: 5,
        min: 1,
        max: 10000,
      }),
      {
        key: 'minMonths',
        label: 'Shortest period',
        description:
          'Over shorter periods hire rates mostly measure how many applications are still open, so no best source is named.',
        type: 'months',
        default: 6,
        min: 1,
        max: 36,
        step: 1,
      },
    ],
  },
  {
    id: RM.acceptanceByLocation,
    name: 'Offer acceptance by location',
    definition:
      'Offers accepted ÷ offers accepted or declined, by the req’s location and the date each offer was resolved. A location at least the gap to mark below the company for the same period is marked amber.',
    formula: 'hired ÷ (hired + declined)',
    population:
      'Offers resolved in the period or the latest quarter. Sites under the anonymity minimum fold into Other; a row still under it shows only its offer count.',
    window: 'The period picker, or the latest quarter of it.',
    unit: 'pct',
    goodDirection: 'up',
    uses: uses(OUTCOME, APP_DIM.location),
    owner: OWNER,
    params: [
      points({
        key: 'gapPts',
        label: 'Gap to mark',
        description: 'A location this many points or more below the company is marked amber.',
        default: 0.1,
        min: 0.005,
        max: 1,
      }),
    ],
  },
  {
    id: RM.acceptanceDrop,
    name: 'Offer acceptance drop',
    definition:
      'Offer acceptance fell by at least the drop to flag: the latest quarter against the quarter before, or else the period against the prior period, with enough resolved offers on each side.',
    formula: 'earlier offer acceptance − latest offer acceptance',
    population: 'Offers resolved in the two quarters or periods compared.',
    window: 'The latest two quarters of the period, else the period and the prior period.',
    unit: 'pts',
    goodDirection: 'down',
    // The readout names where the drop concentrates, the decline reasons and the offers waiting.
    uses: uses(OUTCOME, ANY_APP_DIM, REASON, NEXT_STEP),
    dependsOn: [RM.lackingNextStep],
    owner: OWNER,
    params: [
      points({
        key: 'dropPts',
        label: 'Drop to flag',
        description: 'The readout flags a fall of at least this many points.',
        default: 0.05,
        min: 0.005,
        max: 1,
      }),
      points({
        key: 'criticalPts',
        label: 'Critical drop',
        description: 'A fall of at least this many points is critical.',
        default: 0.1,
        min: 0.005,
        max: 1,
      }),
      count({
        key: 'minOffers',
        label: 'Offers each side',
        description: 'Offers resolved in each of the two quarters or periods before they are compared.',
        default: 10,
        min: 1,
        max: 10000,
      }),
    ],
  },
  {
    id: RM.offersWaiting,
    name: 'Offers waiting on an answer',
    definition:
      'Offers out longer than the offer wait with no answer on the as-of date. The offer wait and the overdue point are settings of Candidates lacking a next step.',
    formula: 'offers out with as-of date − offer date > offer wait; listed from offers to flag',
    population: 'Active candidates at the offer stage whose offer date is on or before the as-of date.',
    window: SNAPSHOT,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(NEXT_STEP, APP_DIM.recruiter),
    dependsOn: [RM.lackingNextStep],
    owner: OWNER,
    params: [
      count({
        key: 'minOffers',
        label: 'Offers to flag',
        description: 'The readout lists offers waiting on an answer from this many offers.',
        default: 2,
        min: 1,
        max: 1000,
      }),
    ],
  },
  {
    id: RM.declineReasons,
    name: 'Offer decline reasons',
    // People stats > Special analyses, Offer declines leads with the same reasons (docs/ANALYSES.md, 3.4).
    views: ['hrbp'],
    definition:
      'The rejection reason recorded on applications with status Declined, for offers declined in the period.',
    formula: 'declined offers in the period by recorded reason; share = reason ÷ declined offers',
    population: 'Offers declined in the period.',
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: uses(OUTCOME, REASON),
    owner: OWNER,
  },

  /* data */
  {
    id: RM.reqMatch,
    name: 'Applications matching a req',
    definition:
      'The share of candidate rows whose req ID exists in Requisitions. Below the matching share, req health and candidate breakdowns by department, location and level are not read.',
    formula: 'candidate rows with a known req ID ÷ candidate rows',
    population: 'Every loaded candidate row, whatever the filters.',
    window: 'Every loaded row, whatever the period or as-of date.',
    unit: 'pct',
    goodDirection: 'up',
    uses: REQ_JOIN,
    owner: OWNER,
    params: [
      share({
        key: 'minShare',
        label: 'Matching share',
        description: 'Below this share of applications matching a req ID, req health is not checked.',
        default: 0.5,
        min: 0.05,
        max: 1,
      }),
    ],
  },
])
