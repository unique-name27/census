/**
 * The Listening view's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('listening', [...])`: one per survey headline (its target and minimum
 * respondents), one per figure measure and the readout thresholds, all read through
 * `ctx.metrics` in engine/settings.ts, never as constants.
 *
 * Wording never quotes a number a setting governs: the target or threshold in force is added
 * where the number is shown, so an edited setting can't leave stale text behind.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. From the engine it imports only './engine/catalog' and
 * './engine/lineage', which import nothing but plain data.
 */
import { defineMetrics, type MetricInput } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import { PROGRAMS, type ProgramMeta } from './engine/catalog'
import {
  ANSWER,
  CAND_RECRUITER,
  CAND_REQ,
  CAND_SOURCE,
  CASE_JOIN,
  COURSE,
  EMP_LEVEL,
  EMP_LOCATION,
  EMP_ORG,
  EMP_TENURE,
  HRIS_REASON,
  ITEM,
  LAPTOP_TASKS,
  MANAGER_EXITS,
  MANAGER_JOIN,
  ONSITE_WAIT,
  POPULATION,
  REASON,
  RECRUITER_LOAD,
  REGRETTED,
  REQ_LOCATION,
  REQ_ORG,
  REQ_RECRUITER,
  RESPONDENT,
  RETURN_TX,
  SUBJECT,
  TOUCHPOINT,
  union,
  WAVE,
} from './engine/lineage'

/** Metric ids, by what the view calls them. */
export const M = {
  active: 'listening.programs.active',
  respondents: 'listening.programs.respondents',
  responseRate: 'listening.programs.responseRate',
  status: 'listening.programs.status',
  calendar: 'listening.programs.calendar',
  driverScore: 'listening.drivers.score',
  heat: 'listening.drivers.heat',
  change: 'listening.drivers.change',
  trend: 'listening.drivers.trend',
  stageNps: 'listening.candidates.stageNps',
  declines: 'listening.candidates.declineReasons',
  byRecruiter: 'listening.candidates.byRecruiter',
  readiness: 'listening.onboarding.readiness',
  topRisk: 'listening.stay.topRisk',
  exitReasons: 'listening.exit.reasons',
  exitVsRecord: 'listening.exit.reasonsVsRecord',
  wouldReturn: 'listening.exit.wouldReturn',
  driverGap: 'listening.exit.driverGap',
  upward: 'listening.managers.upward',
  serviceCuts: 'listening.services.byCategory',
  returnTiming: 'listening.services.returnTiming',
  byCourse: 'listening.services.byCourse',
  engagementByOrg: 'listening.engagement.byOrg',
} as const

/** The headline metric of a survey program: 'listening.score.candidateExperience'. */
export const scoreMetric = (p: Pick<ProgramMeta, 'key'>): string => `listening.score.${p.key}`

/** Setting keys, so the engine and the registry agree. */
export const P = {
  minRespondents: 'minRespondents',
  defaultTarget: 'defaultTarget',
  watchMean: 'watchMean',
  watchNps: 'watchNps',
  material: 'material',
  materialNps: 'materialNps',
  gap: 'gap',
  share: 'share',
  lowScore: 'lowScore',
} as const

const OWNER = 'People analytics'
const PERIOD = 'The period picker (default last 12 months).'
const LATEST = 'The latest wave on or before the as-of date.'
const GROUPED =
  'Groups with fewer respondents than the minimum are hidden. Survey numbers drill to grouped counts, never to one person’s answers.'
const ANSWERED =
  'Answers in scope with a valid score, dated on or before the as-of date. Engagement answers count only while Engagement surveys is on in Settings.'

const num = (
  key: string,
  label: string,
  description: string,
  value: number,
  o: { min: number; max: number; step: number; format?: ParamDef['format'] },
): ParamDef => ({ key, label, description, type: 'number', default: value, format: 'num2', ...o })

const share = (key: string, label: string, description: string, value: number): ParamDef => ({
  key,
  label,
  description,
  type: 'percent',
  default: value,
  min: 0.05,
  max: 1,
  step: 0.05,
  format: 'pct',
})

const minRespondents = (): ParamDef => ({
  key: P.minRespondents,
  label: 'Smallest group shown',
  description:
    'Fewest distinct people a result of this survey needs before it shows. It can be raised, never lowered below the anonymity minimum.',
  type: 'number',
  default: 5,
  min: 5,
  max: 100,
  step: 1,
  format: 'int',
  locked: 'raiseOnly',
})

const ANSWERS = union(ANSWER, ITEM)

/** One headline metric per survey program: its target and its minimum respondents. */
function programEntry(p: ProgramMeta): MetricInput {
  const nps = p.headline === 'nps'
  return {
    id: scoreMetric(p),
    name: p.name,
    definition: `${p.definition} ${nps ? 'Promoters answer 9 or 10, detractors 0 to 6.' : 'Answers are on a 1 to 5 scale.'}`,
    formula: nps ? '% promoters (9-10) − % detractors (0-6)' : 'mean of the 1-5 answers',
    population: `Answers to this survey in the wave. ${GROUPED}`,
    window: LATEST,
    unit: nps ? 'int' : 'num2',
    goodDirection: 'up',
    target: { value: p.target, comparator: '>=' },
    targetUsed: true,
    uses: ANSWERS,
    owner: OWNER,
    params: [minRespondents()],
  }
}

const ANY_ORG = union(EMP_ORG, EMP_LOCATION, EMP_TENURE, CAND_REQ, REQ_ORG, REQ_LOCATION)

const ENTRIES: MetricInput[] = [
  {
    id: M.active,
    name: 'Survey programs running',
    definition: 'Survey programs with at least one answer in the last 12 months to the as-of date.',
    formula: 'count of programs with an answer dated in the last 12 months',
    population: ANSWERED,
    window: 'The 12 months to the as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: WAVE,
    owner: OWNER,
  },
  {
    id: M.respondents,
    name: 'Survey respondents',
    definition:
      'Distinct people who answered any survey in the period. A person who answered two surveys counts once.',
    formula: 'distinct respondent keys with an answer in the period',
    population: `${ANSWERED} Who answered is never listed, only counted by program.`,
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: union(WAVE, RESPONDENT),
    owner: OWNER,
  },
  {
    id: M.responseRate,
    name: 'Survey response rate',
    definition:
      'People invited in the period who answered at least once, as a share of everyone invited. Only programs whose invited population Census can work out count: candidate experience, hiring manager satisfaction, the onboarding pulses, the exit survey, the HR service survey and return to work.',
    formula: 'invited people who answered ÷ invited people',
    population:
      'Candidates who reached a stage, hiring managers of filled reqs, starters at day 30 and day 90, people who left by choice, people whose case was resolved and people back from leave, in the period.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.6, comparator: '>=' },
    targetUsed: true,
    uses: union(WAVE, RESPONDENT, ...Object.values(POPULATION)),
    owner: OWNER,
  },
  {
    id: M.status,
    name: 'Survey status',
    definition:
      'Met when a survey’s headline reaches its target, Watch when it misses by less than the watch margin, Missed beyond it.',
    formula:
      'Met: headline meets target · Watch: miss ≤ watch margin on 1-5, or watch margin for NPS · Missed: beyond it',
    population: `Each program's headline answers in its latest wave. ${GROUPED}`,
    window: LATEST,
    unit: 'text',
    goodDirection: null,
    uses: ANSWER,
    owner: OWNER,
    params: [
      num(
        P.watchMean,
        'Watch margin on 1-5',
        'How far below its target a 1-5 score may be and still show Watch rather than Missed.',
        0.2,
        {
          min: 0,
          max: 1,
          step: 0.05,
        },
      ),
      num(
        P.watchNps,
        'Watch margin for NPS',
        'How many NPS points below its target a score may be and still show Watch.',
        10,
        {
          min: 0,
          max: 50,
          step: 1,
          format: 'int',
        },
      ),
    ],
  },
  {
    id: M.calendar,
    name: 'Survey waves',
    definition:
      'When each wave of each survey ran: from its first answer to its last, with the people who answered.',
    formula: 'per survey wave: first answer date to last answer date, and distinct respondents',
    population: ANSWERED,
    window: 'Waves that ended in the 12 months to the as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: union(WAVE, RESPONDENT),
    owner: OWNER,
  },
  {
    id: M.driverScore,
    name: 'Score by driver',
    definition:
      'Mean score of each driver in the latest wave against its target. A driver’s target is the Survey items target of its items when the sheet gives one, else the default target.',
    formula: 'mean of the answers to the driver’s items',
    population: `Answers on the 1 to 5 scale in the latest wave. ${GROUPED}`,
    window: LATEST,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, ['surveyResponses.driver']),
    owner: OWNER,
    params: [
      num(
        P.defaultTarget,
        'Default driver target',
        'The target on a 1 to 5 scale for drivers whose items have no target in the Survey items sheet.',
        4,
        {
          min: 1,
          max: 5,
          step: 0.1,
        },
      ),
    ],
  },
  {
    id: M.heat,
    name: 'Driver heat table',
    definition:
      'Mean score of each driver by business unit, location or tenure band (stage for candidates), pooled over the period. Cells with fewer respondents than the minimum are blank.',
    formula: 'mean of the answers per driver and group',
    population: `Answers on the 1 to 5 scale in the period. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, ['surveyResponses.driver'], ANY_ORG),
    owner: OWNER,
  },
  {
    id: M.change,
    name: 'Change since the last wave',
    definition:
      'The latest wave’s score less the wave before it, per driver. No change shows when either wave has fewer respondents than the minimum.',
    formula: 'latest wave mean − prior wave mean',
    population: `Answers in the two waves compared, per driver on the 1 to 5 scale and for the headline. A survey about managers compares waves for the whole company only. ${GROUPED}`,
    window: 'The latest wave on or before the as-of date and the one before it.',
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, ['surveyResponses.driver']),
    owner: OWNER,
    params: [
      num(
        P.material,
        'Material change on 1-5',
        'Smallest change in a 1-5 score that the readout and the change chart treat as real.',
        0.2,
        {
          min: 0.05,
          max: 2,
          step: 0.05,
        },
      ),
      num(P.materialNps, 'Material change in NPS', 'Smallest change in NPS points treated as real.', 10, {
        min: 1,
        max: 100,
        step: 1,
        format: 'int',
      }),
    ],
  },
  {
    id: M.stageNps,
    name: 'Candidate NPS by stage and department',
    definition:
      'Candidate NPS for each furthest stage reached, by the req’s department, in the latest wave. The readout flags a department whose NPS at a stage sits well below the other departments at the same stage.',
    formula: '% promoters − % detractors per stage and department',
    population: `Candidate experience answers in the latest wave. ${GROUPED}`,
    window: LATEST,
    unit: 'int',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, TOUCHPOINT, CAND_REQ, REQ_ORG),
    readoutUses: ONSITE_WAIT,
    owner: OWNER,
    params: [
      num(
        P.gap,
        'Stage gap',
        'How many NPS points below the other departments at the same stage a department must be before the readout flags it.',
        20,
        {
          min: 5,
          max: 100,
          step: 1,
          format: 'int',
        },
      ),
    ],
  },
  {
    id: M.declines,
    name: 'Why candidates declined',
    definition:
      'The reason candidates who declined an offer chose in the candidate survey, counted once per candidate.',
    formula: 'distinct candidates per reason',
    population: `Candidate experience answers in the period that give a decline reason, the first one per candidate. ${GROUPED}`,
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: union(WAVE, RESPONDENT, REASON),
    owner: OWNER,
  },
  {
    id: M.byRecruiter,
    name: 'Hiring manager satisfaction by recruiter',
    definition:
      'Mean hiring manager score for the reqs each recruiter filled, pooled over the period. The readout flags a recruiter well below the others.',
    formula: 'mean of the answers per recruiter of the filled req',
    population: `Hiring manager answers in the period, joined to the req they rate. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, SUBJECT, REQ_RECRUITER),
    readoutUses: RECRUITER_LOAD,
    owner: OWNER,
    params: [
      num(
        P.gap,
        'Recruiter gap',
        'How far below the other recruiters, on 1 to 5, a recruiter’s score must be before the readout flags it.',
        0.5,
        {
          min: 0.1,
          max: 2,
          step: 0.05,
        },
      ),
    ],
  },
  {
    id: M.readiness,
    name: 'Day-30 readiness',
    definition:
      'Mean answer of new employees, 30 days in, to "In my first week I had what I needed to do my job". The readout compares regions and names the late laptops behind a gap.',
    formula: 'mean of the week-1 readiness answers',
    population: `Day-30 onboarding pulse answers in the period. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    target: { value: 4.2, comparator: '>=' },
    targetUsed: true,
    uses: union(ANSWER, ITEM, ['surveyResponses.driver'], EMP_LOCATION),
    readoutUses: LAPTOP_TASKS,
    owner: OWNER,
    params: [
      num(
        P.gap,
        'Region gap',
        'How far below the rest of the company, on 1 to 5, a region must be before the readout flags it.',
        0.5,
        {
          min: 0.1,
          max: 2,
          step: 0.05,
        },
      ),
    ],
  },
  {
    id: M.topRisk,
    name: 'Top stay risk',
    definition:
      'The reason key talent name most often as what would make them leave, as a share of their stay interviews. The readout flags a department and career band where one reason dominates.',
    formula: 'stay interviews naming the reason ÷ stay interviews',
    population: `Stay interviews in the period, counted once per person and wave. ${GROUPED}`,
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'down',
    uses: union(WAVE, RESPONDENT, REASON, EMP_ORG, EMP_LEVEL),
    owner: OWNER,
    params: [
      share(
        P.share,
        'Dominant reason share',
        'Share of a group’s stay interviews one reason must reach before the readout flags it.',
        0.5,
      ),
    ],
  },
  {
    id: M.exitReasons,
    name: 'Exit survey reasons',
    definition:
      'The primary reason people leaving by choice give in the exit survey, counted once per person. The readout flags a location whose top reason differs from the company’s.',
    formula: 'distinct leavers per reason',
    population: `Exit survey answers in the period. ${GROUPED}`,
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: union(WAVE, RESPONDENT, REASON, EMP_LOCATION),
    readoutUses: HRIS_REASON,
    owner: OWNER,
    params: [
      share(
        P.share,
        'Top reason share',
        'Share of a location’s leavers its top reason must reach before the readout flags it.',
        0.4,
      ),
    ],
  },
  {
    id: M.wouldReturn,
    name: 'Would return',
    definition:
      'Share of leavers who answer 4 or 5 to "I would consider working here again" in the exit survey.',
    formula: 'answers of 4 or 5 ÷ answers',
    population: `Exit survey answers in the period. ${GROUPED}`,
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.5, comparator: '>=' },
    targetUsed: true,
    uses: union(ANSWER, ITEM, ['surveyResponses.driver']),
    owner: OWNER,
  },
  {
    id: M.driverGap,
    name: 'Exit driver gap, regretted vs other leavers',
    definition:
      'Mean exit survey score per driver for regretted leavers less the score for other leavers who left by choice.',
    formula: 'mean (regretted) − mean (other leavers)',
    population: `Exit survey answers in the period, joined to the leaver’s regretted flag. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: null,
    uses: union(ANSWER, ITEM, ['surveyResponses.driver'], REGRETTED),
    owner: OWNER,
  },
  {
    id: M.upward,
    name: 'Upward feedback by manager',
    definition:
      'Mean upward feedback score per manager, pooled over the last four quarters. A manager shows only with at least the survey manager-cut minimum of distinct respondents. The readout and the Action center flag a manager below the low score.',
    formula: 'mean of the answers about the manager',
    population:
      'Answers that name the manager, or from people who report to them, in the four quarters to the as-of date.',
    window: 'The four quarters to the as-of date.',
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, SUBJECT, MANAGER_JOIN),
    readoutUses: MANAGER_EXITS,
    owner: OWNER,
    params: [
      num(
        P.lowScore,
        'Low score',
        'A manager whose mean upward feedback is below this, on 1 to 5, is flagged for the HR business partner.',
        3,
        {
          min: 1,
          max: 5,
          step: 0.1,
        },
      ),
    ],
  },
  {
    id: M.serviceCuts,
    name: 'HR service satisfaction by category and channel',
    definition: 'Mean HR service survey score per case category and per channel, pooled over the period.',
    formula: 'mean of the answers per category or channel of the case',
    population: `HR service survey answers in the period, joined to the case they rate. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, SUBJECT, CASE_JOIN),
    owner: OWNER,
  },
  {
    id: M.returnTiming,
    name: 'Return to work by processing time',
    definition:
      'Mean return to work score for people whose return was processed by its due date, and for those processed late. The readout flags a gap.',
    formula: 'mean (processed late) and mean (on time)',
    population: `Return to work answers in the period, joined to the return transaction. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, ['surveyResponses.driver'], RETURN_TX),
    owner: OWNER,
    params: [
      num(
        P.gap,
        'Processing gap',
        'How far below on-time returns, on 1 to 5, late returns must score before the readout flags it.',
        0.5,
        {
          min: 0.1,
          max: 2,
          step: 0.05,
        },
      ),
    ],
  },
  {
    id: M.byCourse,
    name: 'Training evaluation by course',
    definition:
      'Mean training evaluation score per course, pooled over the period. The readout flags the lowest course when it is below the low score.',
    formula: 'mean of the answers per course',
    population: `Training evaluation answers in the period. ${GROUPED}`,
    window: PERIOD,
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, COURSE),
    owner: OWNER,
    params: [
      num(
        P.lowScore,
        'Low course score',
        'A course whose mean is below this, on 1 to 5, shows in the readout.',
        3.5,
        {
          min: 1,
          max: 5,
          step: 0.1,
        },
      ),
    ],
  },
  {
    id: M.trend,
    name: 'Driver scores by wave',
    definition:
      'Mean score of each driver in each of the last four waves, so a slow slide shows as well as a jump since the last wave. A survey about managers is compared across waves for the whole company only.',
    formula: 'mean of the answers to the driver’s items, per wave',
    population: `Answers on the 1 to 5 scale in each wave. A wave and driver with fewer respondents than the minimum is a gap in the line. ${GROUPED}`,
    window: 'The last four waves started on or before the as-of date.',
    unit: 'num2',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, ['surveyResponses.driver']),
    owner: OWNER,
  },
  {
    id: M.exitVsRecord,
    name: 'Exit reasons, survey and HR record',
    definition:
      'The share of leavers giving each reason in the exit survey beside the share with that termination reason in the HR record. The two are counted apart and never matched person by person.',
    formula:
      'survey: distinct respondents per reason ÷ respondents who gave one · record: voluntary leavers per reason ÷ voluntary leavers with a reason',
    population: `Exit survey answers in the period, counted once per person, and employees who left by choice in the period with a termination reason. Either side with fewer people than the minimum is hidden. Survey reasons fewer than the minimum gave are grouped into one row, and the HR-record people with such a reason are counted, not listed. ${GROUPED}`,
    window: PERIOD,
    unit: 'pct',
    goodDirection: null,
    uses: union(WAVE, RESPONDENT, REASON, [
      'employees.terminationDate',
      'employees.terminationType',
      'employees.terminationReason',
      'employees.employmentType',
    ]),
    owner: OWNER,
  },
  {
    id: M.engagementByOrg,
    name: 'eNPS by business unit',
    definition:
      'Employee NPS from the engagement pulse per business unit, in the latest wave. Shown only while engagement surveys are on.',
    formula: '% promoters − % detractors per business unit',
    population: `Engagement answers in the latest wave. ${GROUPED}`,
    window: LATEST,
    unit: 'int',
    goodDirection: 'up',
    uses: union(ANSWER, ITEM, EMP_ORG),
    owner: OWNER,
  },
]

export const metrics: MetricDef[] = defineMetrics('listening', [...PROGRAMS.map(programEntry), ...ENTRIES])

/** Fields the source and recruiter cuts add to candidate NPS. */
export const CANDIDATE_CUT_USES = union(CAND_REQ, CAND_SOURCE, CAND_RECRUITER)
