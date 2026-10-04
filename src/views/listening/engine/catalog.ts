/**
 * The Listening view's fixed reference data: its tabs, and for each survey program the tab it
 * lives on, the metric that holds its headline target and what the headline measures.
 *
 * Plain data only: the view's metric registry (../metrics.ts) imports this file, so it must never
 * import React, the analytics context or the rest of the engine.
 */
import type { Level, SurveyType } from '@/data/schema'

export type ListeningTab =
  | 'overview'
  | 'candidates'
  | 'onboarding'
  | 'stay-exit'
  | 'managers'
  | 'services'
  | 'engagement'

export type AreaTab = Exclude<ListeningTab, 'overview'>

/** Sub-tabs in order. Engagement shows only while the engagement surveys switch is on. */
export const LISTENING_TABS: readonly { key: ListeningTab; label: string; feature?: 'engagementSurveys' }[] =
  [
    { key: 'overview', label: 'Overview' },
    { key: 'candidates', label: 'Candidates & hiring' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'stay-exit', label: 'Stay & exit' },
    { key: 'managers', label: 'Managers' },
    { key: 'services', label: 'Services & learning' },
    { key: 'engagement', label: 'Engagement', feature: 'engagementSurveys' },
  ]

export const TAB_LABEL: Record<ListeningTab, string> = Object.fromEntries(
  LISTENING_TABS.map((t) => [t.key, t.label]),
) as Record<ListeningTab, string>

/**
 * What a program's headline measures: NPS from its 0-10 "likelihood to recommend" answers, or
 * the mean of its 1-5 answers.
 */
export type HeadlineKind = 'nps' | 'mean'

export interface ProgramMeta {
  survey: SurveyType
  /** camelCase key of its metric: `listening.score.<key>`. */
  key: string
  tab: AreaTab
  /** Metric name, what HR people call the headline: "Candidate NPS". */
  name: string
  headline: HeadlineKind
  /** Default headline target: NPS points, or a mean on 1-5. */
  target: number
  /** One plain sentence: what the headline is. */
  definition: string
  /** Who is invited, when the population is known (response rate); null when it is not. */
  population: string | null
}

export const PROGRAMS: readonly ProgramMeta[] = [
  {
    survey: 'Candidate experience',
    key: 'candidateExperience',
    tab: 'candidates',
    name: 'Candidate NPS',
    headline: 'nps',
    target: 20,
    definition:
      'Net promoter score from candidates asked how likely they are to recommend applying, after an interview stage or an offer decision.',
    population: 'Candidates whose furthest interview stage or offer decision fell in the period.',
  },
  {
    survey: 'Hiring manager satisfaction',
    key: 'hiringManager',
    tab: 'candidates',
    name: 'Hiring manager satisfaction',
    headline: 'mean',
    target: 4,
    definition:
      'Mean score of hiring managers asked about speed, slate quality and communication when a req is filled.',
    population: 'Hiring managers of reqs filled in the period.',
  },
  {
    survey: 'Onboarding pulse day 30',
    key: 'onboardingDay30',
    tab: 'onboarding',
    name: 'Day-30 onboarding pulse',
    headline: 'mean',
    target: 4,
    definition:
      'Mean score of new employees 30 days after their start: readiness, role clarity, manager support and belonging.',
    population: 'Employees whose 30th day fell in the period and who were still employed then.',
  },
  {
    survey: 'Onboarding pulse day 90',
    key: 'onboardingDay90',
    tab: 'onboarding',
    name: 'Day-90 onboarding pulse',
    headline: 'mean',
    target: 4,
    definition:
      'Mean score of new employees 90 days after their start: role clarity, manager support, job match and growth.',
    population: 'Employees whose 90th day fell in the period and who were still employed then.',
  },
  {
    survey: 'Stay interview',
    key: 'stayInterview',
    tab: 'stay-exit',
    name: 'Stay interview score',
    headline: 'mean',
    target: 3.8,
    definition:
      'Mean score of key talent in stay interviews, twice a year: growth, pay, manager, the work and flexibility.',
    population: null,
  },
  {
    survey: 'Exit survey',
    key: 'exitSurvey',
    tab: 'stay-exit',
    name: 'Exit survey score',
    headline: 'mean',
    target: 3.5,
    definition: 'Mean score of people leaving by choice, asked at notice of resignation.',
    population: 'Employees who left by choice with a termination date in the period.',
  },
  {
    survey: 'Manager feedback',
    key: 'managerFeedback',
    tab: 'managers',
    name: 'Upward feedback',
    headline: 'mean',
    target: 4,
    definition: 'Mean score people give their own manager in the twice-yearly upward feedback survey.',
    population: null,
  },
  {
    survey: 'HR service survey',
    key: 'hrService',
    tab: 'services',
    name: 'HR service satisfaction',
    headline: 'mean',
    target: 4.2,
    definition:
      'Mean score from employees asked about satisfaction and effort when their HR case is resolved.',
    population:
      'Employees whose HR case was resolved in the period. Employee relations cases are never surveyed.',
  },
  {
    survey: 'Return to work',
    key: 'returnToWork',
    tab: 'services',
    name: 'Return to work score',
    headline: 'mean',
    target: 4,
    definition:
      'Mean score of people asked 30 days after returning from leave whether the return was smooth.',
    population: 'Employees who returned from leave in the period.',
  },
  {
    survey: 'Training evaluation',
    key: 'training',
    tab: 'services',
    name: 'Training evaluation score',
    headline: 'mean',
    target: 4,
    definition: 'Mean score for usefulness and relevance from people who finished a course.',
    population: null,
  },
  {
    survey: 'Engagement',
    key: 'engagement',
    tab: 'engagement',
    name: 'eNPS',
    headline: 'nps',
    target: 20,
    definition:
      'Employee net promoter score from the quarterly engagement pulse: how likely people are to recommend working here.',
    population: null,
  },
]

export const programOf = new Map(PROGRAMS.map((p) => [p.survey, p]))

/** Programs by tab, in catalog order. */
export const programsOnTab = (tab: AreaTab): readonly ProgramMeta[] => PROGRAMS.filter((p) => p.tab === tab)

/** Career bands for stay interview cuts: early career, senior and staff, principal, managers, executives. */
export const LEVEL_BANDS: readonly { band: string; levels: readonly Level[] }[] = [
  { band: 'L1-L3', levels: ['L1', 'L2', 'L3'] },
  { band: 'L4-L5', levels: ['L4', 'L5'] },
  { band: 'L6', levels: ['L6'] },
  { band: 'M1-M2', levels: ['M1', 'M2'] },
  { band: 'E1-E3', levels: ['E1', 'E2', 'E3'] },
]
const BAND_OF = new Map(LEVEL_BANDS.flatMap((b) => b.levels.map((l) => [l, b.band] as const)))
export const levelBand = (level: Level | null | undefined): string | null =>
  level ? (BAND_OF.get(level) ?? null) : null

/** Reasons that point at pay, so a pay-led exit reason goes to total rewards in the Action center. */
export const PAY_REASONS: ReadonlySet<string> = new Set([
  'Base salary',
  'Equity, bonus or total rewards',
  'Pay',
  'Compensation',
])
