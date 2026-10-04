/**
 * The privacy rules, as dictionary entries. Their wording and targets are locked. The anonymity
 * minimum can be raised, never lowered; pay amounts staying opt-in and the absence of protected
 * fields cannot be changed at all.
 *
 * Engines read the anonymity minimum with `minGroupOf(ctx.metrics)` (or
 * `ctx.metrics.num(ANONYMITY.metricId, ANONYMITY.key)`) instead of `MIN_GROUP`, and the survey
 * minimums with `surveyMinimumsOf(ctx.metrics)`.
 */
import { MIN_GROUP } from '@/data/schema'
import type { MetricDef, MetricsApi, MetricView } from './types'

const DATA_VIEWS: readonly MetricView[] = [
  'scorecard',
  'recruiting',
  'onboarding',
  'hrbp',
  'org',
  'services',
  'talent',
  'comp',
  'compliance',
  'listening',
  'actions',
]

export const ANONYMITY = { metricId: 'privacy.anonymity', key: 'minGroup' } as const
export const PAY_AMOUNTS = { metricId: 'privacy.payAmounts', key: 'optIn' } as const
export const PROTECTED_FIELDS = { metricId: 'privacy.protectedFields', key: 'excluded' } as const
export const IMMIGRATION_DETAILS = { metricId: 'privacy.immigrationDetails', key: 'optIn' } as const
export const SURVEY_ANSWERS = { metricId: 'privacy.surveyAnswers', key: 'groupedOnly' } as const
export const SURVEY_MANAGER_CUTS = { metricId: 'privacy.surveyManagerCuts', key: 'minRespondents' } as const
/** Survey results cut by manager need at least this many respondents (Atlas listening rules). */
export const SURVEY_MANAGER_MIN = 10
/** Quarters of answers pooled for a manager cut. */
export const SURVEY_MANAGER_QUARTERS = 4

export const PRIVACY_METRICS: readonly MetricDef[] = [
  {
    id: ANONYMITY.metricId,
    name: 'Anonymity minimum',
    views: DATA_VIEWS,
    definition:
      'A rate or average over a group smaller than this is hidden and shows "—" with "Hidden to protect anonymity". Breakdown tables fold smaller groups into "Other".',
    formula:
      'a rate or average shows only when people in the group ≥ smallest group shown; smaller breakdown groups fold into Other',
    population: 'People in the group the number describes.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: ANONYMITY.key,
        label: 'Smallest group shown',
        description:
          'Groups with fewer people than this are hidden. It can be raised, never lowered below 5.',
        type: 'number',
        default: MIN_GROUP,
        min: MIN_GROUP,
        max: 50,
        step: 1,
        format: 'int',
        locked: 'raiseOnly',
      },
    ],
  },
  {
    id: PAY_AMOUNTS.metricId,
    name: 'Pay amounts',
    views: DATA_VIEWS,
    definition:
      'Salary, range, market, equity and merit amounts show and export only while "Show pay amounts" is on, for one session. Ratios such as compa-ratio and merit % always show.',
    formula: 'pay amount columns show and export only while Show pay amounts is on; ratios always show',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: PAY_AMOUNTS.key,
        label: 'Pay amounts are opt-in',
        description:
          'Pay amounts stay hidden until someone switches them on for the session. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
  {
    id: PROTECTED_FIELDS.metricId,
    name: 'Protected fields',
    views: DATA_VIEWS,
    definition:
      'Census holds no gender, ethnicity, age, nationality, citizenship or other protected-class fields, and none can be added or imported.',
    formula: 'protected-class columns are dropped from every upload; the schema holds none',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: PROTECTED_FIELDS.key,
        label: 'Protected fields are excluded',
        description: 'Uploads never bring in protected-class fields. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
  {
    id: IMMIGRATION_DETAILS.metricId,
    name: 'Immigration details',
    views: DATA_VIEWS,
    definition:
      'Work authorization types show per person only while "Show immigration details" is on, for one session. Counts by type always show, and nationality or citizenship is never held.',
    formula:
      'authorization type per person shows only while Show immigration details is on; counts by type always show',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: IMMIGRATION_DETAILS.key,
        label: 'Immigration details are opt-in',
        description:
          'Authorization types stay hidden per person until someone switches them on for the session. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
  {
    id: SURVEY_ANSWERS.metricId,
    name: 'Survey answers',
    views: DATA_VIEWS,
    definition:
      'Survey numbers drill to grouped counts and scores, never to one person’s answers. Respondent keys only join org, stage or req attributes, and free-text comments are never imported.',
    formula: 'survey numbers are grouped counts and scores; no view, drill or export shows one answer',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: SURVEY_ANSWERS.key,
        label: 'Survey answers are grouped',
        description: 'No view, drill or export shows an individual answer. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
  {
    id: SURVEY_MANAGER_CUTS.metricId,
    name: 'Survey manager cuts',
    views: DATA_VIEWS,
    definition:
      'Survey results cut by manager need more respondents than other groups, pooled over the last four quarters. Managers below the minimum show "—" with the reason.',
    formula:
      'a manager cut shows only when distinct respondents over the last four quarters ≥ smallest manager group shown (and ≥ smallest group shown)',
    population: 'Distinct respondents who answered about the manager, or who report to them.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: SURVEY_MANAGER_CUTS.key,
        label: 'Smallest manager group shown',
        description:
          'Manager cuts with fewer respondents than this are hidden. It can be raised, never lowered below 10.',
        type: 'number',
        default: SURVEY_MANAGER_MIN,
        min: SURVEY_MANAGER_MIN,
        max: 100,
        step: 1,
        format: 'int',
        locked: 'raiseOnly',
      },
    ],
  },
]

/** The anonymity minimum in force: 5, or higher when someone raised it. */
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number => m.num(ANONYMITY.metricId, ANONYMITY.key)

export interface SurveyMinimums {
  /** Any survey group: the anonymity minimum. */
  minGroup: number
  /** Cuts by manager: the survey manager-cut minimum, never below the anonymity minimum. */
  minManager: number
  /** Quarters pooled for a manager cut. */
  quarters: number
}

/** The survey minimums in force, for `@/lib/surveys` (`{ min: minGroup }`, `managerCuts(..., { minManager })`). */
export function surveyMinimumsOf(m: Pick<MetricsApi, 'num'>): SurveyMinimums {
  const minGroup = minGroupOf(m)
  return {
    minGroup,
    minManager: Math.max(minGroup, m.num(SURVEY_MANAGER_CUTS.metricId, SURVEY_MANAGER_CUTS.key)),
    quarters: SURVEY_MANAGER_QUARTERS,
  }
}
