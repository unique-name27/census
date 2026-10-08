/**
 * Quality of hire's metric dictionary entries (docs/ANALYSES.md, 2.4): the lead number, its two
 * parts, the cohort, education coverage, the expected score from site and level, and the readout
 * rules, with every calculation setting the engine reads through `ctx.metrics` (`./settings`).
 * People stats registers them with its own (`../../metrics`), so they are People stats metrics
 * owned by People analytics.
 *
 * Plain data: never React, '@/data/context', '@/data/store', the '@/metrics' barrel or
 * `../../metrics` (which imports this file).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, SettingRef } from '@/metrics/types'

/** Quality of hire's metric ids, by role. */
export const QID = {
  score: 'hrbp.quality.score',
  performance: 'hrbp.quality.performance',
  retention: 'hrbp.quality.retention',
  cohort: 'hrbp.quality.cohort',
  education: 'hrbp.quality.education',
  expected: 'hrbp.quality.expected',
  findings: 'hrbp.quality.findings',
} as const

export type QualityMetricId = (typeof QID)[keyof typeof QID]

/** The regretted rule in force (People stats, `hrbp.attrition.regretted`) decides who counts as regretted. */
const REGRETTED = 'hrbp.attrition.regretted'

const ref = (metricId: QualityMetricId, key: string): SettingRef => ({ metricId, key })

/** Every setting the engine reads, by what it changes. */
export const QSET = {
  performanceWeight: ref(QID.score, 'performanceWeight'),
  retentionWeight: ref(QID.score, 'retentionWeight'),
  retentionMonths: ref(QID.score, 'retentionMonths'),
  regrettedSecondYear: ref(QID.score, 'regrettedSecondYear'),
  rifExcluded: ref(QID.score, 'rifExcluded'),
  cohortMonths: ref(QID.score, 'cohortMonths'),
  firstReviewMinDays: ref(QID.score, 'firstReviewMinDays'),
  firstReviewWithinMonths: ref(QID.score, 'firstReviewWithinMonths'),
  scoring: ref(QID.score, 'scoring'),
  minUniversityHires: ref(QID.score, 'minUniversityHires'),
  minCellHires: ref(QID.score, 'minCellHires'),
  interval: ref(QID.score, 'interval'),
  minCell: ref(QID.expected, 'minCell'),
  minGap: ref(QID.findings, 'minGap'),
} as const

/** How a first review rating becomes a 0 to 100 score. */
export type Scoring = 'scale' | 'percentile'

/** The core lineage: the cohort, the first review and the 12-month outcome. */
export const QUALITY_CORE: readonly FieldRef[] = [
  'employees.hireDate',
  'employees.terminationDate',
  'employees.terminationType',
  'employees.regrettable',
  'employees.terminationReason',
  'employees.employmentType',
  'employees.location',
  'employees.level',
  'reviews.rating',
  'reviews.cycleDate',
  'reviews.cycle',
]

/** The education groupings. */
export const EDUCATION_USES: readonly FieldRef[] = [
  'employees.university',
  'employees.degreeLevel',
  'employees.fieldOfStudy',
]

/** Level at hire, rebuilt from the job history. */
export const LEVEL_AT_HIRE: readonly FieldRef[] = ['jobChanges.fromLevel', 'jobChanges.toLevel']

/** Source of hire: the application a hire came from, matched by name and start date. */
export const SOURCE_USES: readonly FieldRef[] = [
  'candidates.source',
  'candidates.hiredDate',
  'candidates.candidateName',
  'employees.name',
]

/** Quality of hire's lineage (2.4): the core fields and the education groupings. */
export const QUALITY_USES: readonly FieldRef[] = [...QUALITY_CORE, ...EDUCATION_USES]

const OWNER = 'People analytics'
const WINDOW =
  'Hires from the 24 months ending 12 months before the as-of date, whatever the period. Both lengths are settings of Quality of hire.'
const COHORT =
  'Employees hired in the cohort window; contractors and interns are never hires here. A hire counts in the scope their record is in, leavers under their last manager.'
const DEPENDS = [QID.score, REGRETTED]

export const QUALITY_METRICS: MetricDef[] = defineMetrics('hrbp', [
  {
    id: QID.score,
    name: 'Quality of hire',
    definition:
      'How well a group of hires did in their first full review and whether they stayed a year, as a score from zero to one hundred. It compares groups, never people: no hire gets a score of their own on screen, in a drill or in an export. The hires are a fixed cohort, old enough to have both, so the score is the same whatever period is picked.',
    formula: '(wP × first review score + wR × retention score) ÷ (wP + wR), averaged over scored hires',
    population: `${COHORT} A hire who left before a first full review scores 0 (retention alone); one still employed without a first full review is not scored. A hire who left in a reduction in force is scored on the first review alone.`,
    window: WINDOW,
    unit: 'num1',
    goodDirection: 'up',
    uses: QUALITY_USES,
    requires: ['employees.hireDate'],
    dependsOn: [REGRETTED],
    owner: OWNER,
    params: [
      {
        key: QSET.performanceWeight.key,
        label: 'Weight of the first review',
        description:
          'The share of quality of hire that comes from the first full review. The two weights are divided by their sum; when both are 0, each counts half.',
        type: 'percent',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        format: 'pct',
      },
      {
        key: QSET.retentionWeight.key,
        label: 'Weight of staying a year',
        description:
          'The share of quality of hire that comes from staying a year. Weights are divided by their sum.',
        type: 'percent',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        format: 'pct',
      },
      {
        key: QSET.retentionMonths.key,
        label: 'Retention window',
        description:
          'A hire counts as retained when still employed this many months after their hire date. It also ends the hire window, so every hire in it has a known outcome.',
        type: 'months',
        default: 12,
        min: 6,
        max: 24,
        step: 1,
      },
      {
        key: QSET.regrettedSecondYear.key,
        label: 'Count regretted exits in the second year',
        description:
          'On: a regretted exit in the year after the retention window, on or before the as-of date, also scores 0. Hires from the last year of the hire window have not had a full second year yet.',
        type: 'boolean',
        default: true,
      },
      {
        key: QSET.rifExcluded.key,
        label: 'Leave reductions in force out',
        description:
          'On: a hire who left in a reduction in force gets no retention score, so a layoff never counts against a hiring outcome.',
        type: 'boolean',
        default: true,
      },
      {
        key: QSET.cohortMonths.key,
        label: 'Hire window',
        description:
          'How many months of hires the cohort holds, ending at the retention window before the as-of date.',
        type: 'months',
        default: 24,
        min: 6,
        max: 60,
        step: 1,
      },
      {
        key: QSET.firstReviewMinDays.key,
        label: 'First full review after',
        description: 'The first review that counts is at least this many days after the hire date.',
        type: 'days',
        default: 180,
        min: 90,
        max: 365,
        step: 1,
      },
      {
        key: QSET.firstReviewWithinMonths.key,
        label: 'First review within',
        description: 'A review more than this many months after the hire date is not a first review.',
        type: 'months',
        default: 24,
        min: 12,
        max: 36,
        step: 1,
      },
      {
        key: QSET.scoring.key,
        label: 'Performance scoring',
        description:
          'How a rating becomes 0 to 100: its position on the 1 to 5 scale (Meets is 50), or its percentile among everyone rated in the same review cycle, which takes out drift from cycle to cycle.',
        type: 'choice',
        default: 'scale' satisfies Scoring,
        choices: [
          { value: 'scale' satisfies Scoring, label: 'Position on the 1 to 5 scale' },
          { value: 'percentile' satisfies Scoring, label: 'Percentile within the review cycle' },
        ],
      },
      {
        key: QSET.minUniversityHires.key,
        label: 'Smallest university shown',
        description:
          'A university needs at least this many scored hires to be shown on its own; smaller ones fold into Other universities. It can be lowered to the anonymity minimum and no further.',
        type: 'number',
        default: 10,
        min: 5,
        max: 100,
        step: 1,
        format: 'int',
      },
      {
        key: QSET.minCellHires.key,
        label: 'Smallest degree and field cell',
        description:
          'A degree level and field of study cell needs at least this many scored hires; smaller cells show the dash placeholder.',
        type: 'number',
        default: 10,
        min: 5,
        max: 100,
        step: 1,
        format: 'int',
      },
      {
        key: QSET.interval.key,
        label: 'Interval',
        description:
          'How sure a comparison must be: the width of the interval bars, and the test for clearly above or below the company.',
        type: 'choice',
        default: '0.9',
        choices: [
          { value: '0.8', label: '80%' },
          { value: '0.9', label: '90%' },
          { value: '0.95', label: '95%' },
        ],
      },
    ],
  },
  {
    id: QID.performance,
    name: 'First review score',
    definition:
      'The first full review after hire as a score from zero to one hundred, averaged over a group of rated hires. By default (rating − 1) ÷ 4 × 100, so Meets is 50.',
    formula: '(first full review rating − 1) × 25, averaged',
    population:
      'Rated hires in the cohort: their earliest review at least 180 days after the hire date and within 24 months of it, by default. When the Reviews data starts later than that, the earliest review on record is used and the drill says so.',
    window: WINDOW,
    unit: 'num1',
    goodDirection: 'up',
    uses: [
      'employees.hireDate',
      'employees.employmentType',
      'reviews.rating',
      'reviews.cycleDate',
      'reviews.cycle',
    ],
    requires: ['employees.hireDate', 'reviews.rating'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: QID.retention,
    name: 'Stayed a year',
    definition:
      'The share of hires still employed a year after their hire date (the retention window, 12 months by default). Any exit before then counts against, and by default a regretted exit in the second year does too.',
    formula: 'hires who stayed a year ÷ hires with a retention score',
    population: 'The cohort, less hires who left in a reduction in force.',
    window: WINDOW,
    unit: 'pct',
    goodDirection: 'up',
    uses: [
      'employees.hireDate',
      'employees.terminationDate',
      'employees.terminationType',
      'employees.regrettable',
      'employees.terminationReason',
      'employees.employmentType',
    ],
    requires: ['employees.hireDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: QID.cohort,
    name: 'Hires scored',
    definition:
      'Hires in the cohort with a quality of hire score. Hires still employed without a first full review are counted apart as not scored.',
    formula: 'count of hires with a quality of hire score; "Not scored" counted apart',
    population: COHORT,
    window: WINDOW,
    unit: 'int',
    goodDirection: null,
    uses: QUALITY_CORE,
    requires: ['employees.hireDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: QID.education,
    name: 'Education recorded',
    definition:
      'The share of hires in the cohort with a university or a degree level recorded. Below the target, the readout names the business unit with the lowest coverage.',
    formula: 'cohort hires with university or degree level ÷ cohort hires',
    population: COHORT,
    window: WINDOW,
    unit: 'pct',
    goodDirection: 'up',
    target: { value: 0.8, comparator: '>=' },
    targetUsed: true,
    uses: ['employees.hireDate', 'employees.employmentType', 'employees.university', 'employees.degreeLevel'],
    readoutUses: ['employees.businessUnit'],
    requires: ['employees.hireDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: QID.expected,
    name: 'Expected from site and level',
    definition:
      'What a group would score if each of its hires scored like the company’s hires at the same site and level band at hire. A group far from it differs for a reason other than where and at what level its hires sit.',
    formula: 'mean over a group’s hires of the company score in their site and level cell',
    population:
      'Scored hires company-wide, so a filter never changes the benchmark. Cells are site × level band at hire (four bands, from the entry levels to management and above), then site, then the company. Site is today’s location: Census has no location history.',
    window: WINDOW,
    unit: 'num1',
    goodDirection: null,
    uses: [...QUALITY_CORE, ...LEVEL_AT_HIRE],
    requires: ['employees.hireDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      {
        key: QSET.minCell.key,
        label: 'Smallest mix cell',
        description:
          'A site and level cell needs at least this many scored hires company-wide; smaller cells fall back to the site, then the company.',
        type: 'number',
        default: 10,
        min: 5,
        max: 100,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: QID.findings,
    name: 'Quality of hire readout',
    definition:
      'Flags a university, degree level, field of study or source of hire whose interval clears the company line, at least the gap worth a finding (5 points by default) from the company and half of it from its expected score (at most two, one per grouping, universities first); a group with first reviews eight points above the company and retention ten points below it; the lowest degree and field cell at twice the gap below the company; and education coverage under its target. Findings name groups, never hires.',
    formula:
      'interval excludes company mean and |actual − company| ≥ gap and |actual − expected| ≥ gap ÷ 2 in the same direction; first review at least eight points above the company and stayed a year at least ten points below it; cell ≤ company − 2 × gap with hires ≥ smallest cell; coverage below target',
    population: 'The cohort (see Quality of hire).',
    window: WINDOW,
    unit: 'num1',
    goodDirection: 'up',
    uses: [...QUALITY_USES, ...LEVEL_AT_HIRE],
    readoutUses: ['employees.businessUnit'],
    requires: ['employees.hireDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      {
        key: QSET.minGap.key,
        label: 'Gap worth a finding',
        description:
          'A group must sit at least this many points from the company, and half of it from its expected score, to be named in the readout.',
        type: 'number',
        default: 5,
        min: 1,
        max: 50,
        step: 0.5,
        format: 'num1',
      },
    ],
  },
])
