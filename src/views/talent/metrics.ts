/**
 * The talent view's metric dictionary entries (docs/METRICS.md): one per KPI, per figure measure
 * and per readout finding rule, registered with `defineMetrics('talent', [...])`. The catalog
 * imports this file, so keep it to plain data: never React, '@/data/context', '@/data/store', the
 * '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 *
 * Wording names a setting with its default ("4 or 5 by default") so it stays true when the
 * setting changes; the screens word their numbers with the values in force. Ids and defaults
 * live in `./engine/settings` (shared with the engines) and the lineage in `./engine/lineage`.
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'
import { registryLineage } from './engine/lineage'
import {
  DEFAULT_GUIDELINE,
  DEFAULT_ON_TIME_TARGET,
  DEFAULTS,
  TALENT_METRIC as M,
  TALENT_PARAM as P,
} from './engine/settings'

const L = registryLineage()

const OWNER = 'People analytics'
const LEARNING_OWNER = 'Learning and development'

const CYCLE = 'The latest review cycle that closed on or before the as-of date'
const ANNUAL = 'The latest annual cycle (the latest that records potential) on or before the as-of date'
const PERIOD = 'The period picker (default last 12 months)'
const AS_OF = 'As of the as-of date'
const RATED = 'Everyone in scope rated in the latest cycle, current and former.'
const ACTIVE = 'Employees active at the as-of date; contractors and interns excluded.'

/** "Smallest business unit": the fewest people rated before a business unit can be flagged. */
const minRatedParam = (def: number, what: string): ParamDef => ({
  key: 'minRated',
  label: 'Smallest business unit',
  description: `Business units with fewer people ${what} are not flagged.`,
  type: 'number',
  default: def,
  min: 5,
  max: 5000,
  step: 1,
  format: 'int',
})

/** People stats metrics whose settings set how voluntary attrition is measured. */
const PEOPLE_STATS_RATES = ['hrbp.headcount.employees', 'hrbp.attrition.all']

/**
 * Settings and targets registered on another metric that change a number (its `dependsOn`), so
 * "Definition changed" marks follow them: the high performer rating runs through most of the tab,
 * the flight-risk bands through key talent, and People stats sets how attrition is measured.
 */
const DEPENDS_ON: Readonly<Record<string, readonly string[]>> = {
  [M.regrettedHigh]: [M.highPerformers],
  [M.keyTalent]: [M.highPerformers, M.riskBands, M.flightRisk],
  [M.exitByRating]: [M.highPerformers],
  [M.nineBox]: [M.highPerformers, M.flightRisk],
  [M.riskBands]: [M.flightRisk],
  [M.flightRisk]: [M.highPerformers, ...PEOPLE_STATS_RATES],
  [M.backTest]: [M.riskBands, M.flightRisk],
  [M.riskDrivers]: [M.riskBands, M.flightRisk],
  [M.promotionOverdue]: [M.highPerformers],
  [M.hipoExitsRule]: [M.highPerformers],
  [M.inflationRule]: [M.highPerformers, M.ratingDistribution],
  [M.promotionOverdueRule]: [M.promotionOverdue],
  [M.keyTalentRule]: [M.keyTalent, M.riskDrivers],
  [M.goodTrainingRule]: [M.requiredOnTime],
  [M.goodDistributionRule]: [M.highPerformers, M.ratingDistribution, M.calibrationRule],
}

export const metrics: MetricDef[] = defineMetrics('talent', [
  /* ───────── KPIs ───────── */
  {
    id: M.ratedCoverage,
    name: 'Rated in latest cycle',
    definition:
      'Share of employees active at the as-of date who have a rating in the latest review cycle. People need about 90 days in role to be rated, so recent hires lower this.',
    formula: 'active employees rated in the latest cycle ÷ active employees',
    population: ACTIVE,
    window: CYCLE,
    unit: 'pct',
    goodDirection: 'up',
    uses: L.kpi['talent-rated'],
    owner: OWNER,
  },
  {
    id: M.highPerformers,
    name: 'High performers',
    definition:
      "Share of people rated in the latest cycle who received a high rating, at or above the high performer rating (4 or 5 by default), including people who have left since the cycle closed. The change compares it with the rating guideline's share at those ratings (35% by default: 25% rated 4, 10% rated 5).",
    formula: 'people rated at or above the high performer rating ÷ people rated in the cycle',
    population: RATED,
    window: CYCLE,
    unit: 'pct',
    goodDirection: null,
    uses: L.kpi['talent-high-performers'],
    owner: OWNER,
    params: [
      {
        key: P.highRating.key,
        label: 'High performer rating',
        description:
          'The lowest rating that counts as a high performer: at 4, people rated 4 or 5 count. The 9-box, key talent, regretted exits, promotion readiness, the flight-risk factor for a high rating and the Org chart exit simulation use it too.',
        type: 'number',
        default: DEFAULTS.highRating,
        min: 3,
        max: 5,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.highPotentials,
    name: 'High potentials',
    definition:
      'Share of active employees assessed for potential in the latest annual cycle who were rated High potential.',
    formula: 'rated High potential ÷ assessed for potential',
    population: 'Employees active at the as-of date with a potential rating in the latest annual cycle.',
    window: ANNUAL,
    unit: 'pct',
    goodDirection: null,
    uses: L.kpi['talent-high-potentials'],
    owner: OWNER,
  },
  {
    id: M.criticalCoverage,
    name: 'Critical roles covered',
    definition:
      'Share of roles marked Critical with at least one named successor who is Ready now and still employed.',
    formula: 'critical roles with a ready-now successor ÷ critical roles',
    population:
      'Critical roles in the succession plans whose incumbent is in scope. Successors who have left are not counted.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    // A common benchmark: four in five Critical roles with a successor ready now.
    target: { value: 0.8, comparator: '>=' },
    uses: L.kpi['talent-succession-coverage'],
    owner: OWNER,
  },
  {
    id: M.regrettedHigh,
    name: 'Regretted exits of high performers',
    definition:
      'Voluntary exits in the period marked regrettable whose last rating before leaving was high (4 or 5 by default). Needs termination type, the regrettable flag and reviews.',
    formula: 'voluntary, regrettable exits with a last rating at or above the high performer rating',
    population: 'Employees in scope who left in the period; contractors and interns excluded.',
    window: `${PERIOD}; the trend shows the last 8 quarters`,
    unit: 'int',
    goodDirection: 'down',
    uses: L.kpi['talent-regretted-high'],
    owner: OWNER,
  },
  {
    id: M.requiredOnTime,
    name: 'Required training on time',
    definition:
      'Required assignments due in the period that were completed on or before the due date, for employees still employed on the due date. When the courses due in the two periods differ a lot, the change is shown in gray.',
    formula: 'completed by the due date ÷ required assignments due',
    population: 'Employees employed on the due date; contractors and interns are not counted.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    target: DEFAULT_ON_TIME_TARGET,
    // The good-news readout is raised only when training meets this target.
    targetUsed: true,
    uses: L.kpi['talent-training-on-time'],
    owner: LEARNING_OWNER,
  },
  {
    id: M.keyTalent,
    name: 'Key talent at risk',
    definition:
      'Active employees whose latest rating is high (4 or 5 by default) and whose flight-risk score is in the high band (about the top 10% of scores company-wide by default). People with the same score share a band, so the band is not exactly that share.',
    formula: 'active high performers in the high flight-risk band',
    population: 'Employees active at the as-of date, by their latest rating on or before it.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: L.kpi['talent-key-talent-risk'],
    owner: OWNER,
  },

  /* ───────── figure measures ───────── */
  {
    id: M.ratingDistribution,
    name: 'Rating distribution',
    definition:
      'Share of people rated in the latest cycle at each rating from 1 to 5, against the rating guideline: the target share of rated people at each rating (by default 1 = 3%, 2 = 10%, 3 = 52%, 4 = 25%, 5 = 10%).',
    formula: 'people at the rating ÷ people rated in the cycle',
    population: RATED,
    window: CYCLE,
    unit: 'pct',
    goodDirection: null,
    uses: L.figure['talent-rating-distribution'],
    owner: OWNER,
    params: [
      {
        key: P.guideline.key,
        label: 'Rating guideline',
        description:
          'The target share of rated people at each rating; the shares should add up to 100%. The high performer guideline is the sum at or above the high performer rating.',
        type: 'ratingMap',
        default: DEFAULT_GUIDELINE,
        min: 0,
        max: 1,
        step: 0.01,
        format: 'pct',
      },
    ],
  },
  {
    id: M.calibrationShift,
    name: 'Calibration shift',
    definition:
      'Average of the manager-proposed rating minus the final rating, for people with both. A positive shift means calibration lowered ratings.',
    formula: 'mean(proposed rating − final rating)',
    population: 'People rated in the latest cycle with a proposed and a final rating.',
    window: CYCLE,
    unit: 'num2',
    goodDirection: null,
    uses: L.figure['talent-calibration-shift'],
    owner: OWNER,
  },
  {
    id: M.averageRating,
    name: 'Average rating',
    definition: 'Mean final rating per business unit in each review cycle.',
    formula: 'mean(final rating)',
    population: 'People in scope rated in the cycle, current and former.',
    window: 'Every review cycle that closed on or before the as-of date',
    unit: 'num2',
    goodDirection: null,
    uses: L.figure['talent-average-rating-by-cycle'],
    owner: OWNER,
  },
  {
    id: M.exitByRating,
    name: 'Exit rate within 12 months by rating',
    definition:
      'Of employees rated in the cycle, the share who left in the 12 months after the cycle date, split by voluntary and involuntary exits.',
    formula: 'exits within 12 months ÷ people rated',
    population: 'Employees rated in the cycle.',
    window: 'The latest review cycle with a full 12 months of follow-up before the as-of date',
    unit: 'pct',
    goodDirection: null,
    uses: L.figure['talent-exit-by-rating'],
    owner: OWNER,
  },
  {
    id: M.nineBox,
    name: 'Performance and potential (9-box)',
    definition:
      'Active employees placed by performance from their rating in the latest annual cycle against potential from the same cycle (Low, Moderate, High). Performance is High at or above the high performer rating, Moderate from 3 and Low at 1-2 (4-5, 3 and 1-2 by default).',
    formula: 'people in the box ÷ people placed',
    population:
      'Employees active at the as-of date with a rating and a potential in the latest annual cycle.',
    window: ANNUAL,
    unit: 'int',
    goodDirection: null,
    uses: L.figure['talent-nine-box'],
    owner: OWNER,
  },
  {
    id: M.bestReadiness,
    name: 'Best successor readiness',
    definition:
      'Critical and key roles by the readiness of their best successor still employed: ready now, in 1-2 years, in 3+ years, or no successor.',
    formula: 'roles counted by the readiness of their best successor',
    population: 'Roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: L.figure['talent-succession-coverage'],
    owner: OWNER,
  },
  {
    id: M.roleStatus,
    name: 'Role status',
    definition:
      'Covered: at least one successor ready now. Thin: successors named, none ready now. No successor: nobody named, or everyone named has left.',
    population: 'Roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'text',
    goodDirection: null,
    uses: L.figure['talent-critical-roles'],
    owner: OWNER,
  },
  {
    id: M.bench,
    name: 'Bench strength',
    definition:
      'Named successors still employed, by readiness. One person can be named for more than one role.',
    formula: 'successors named ÷ roles planned (successors per role)',
    population: 'Roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'num1',
    goodDirection: 'up',
    uses: L.figure['talent-bench-strength'],
    owner: OWNER,
  },
  {
    id: M.riskBands,
    name: 'Flight-risk bands',
    definition:
      'Relative to everyone scored company-wide: about the top 10% of scores are High and the next 25% Medium by default, the rest Low. People with the same score always share a band, so the cut sits where the band comes closest to its share, and the real shares are shown. A score of 0 is always Low.',
    formula: 'people in the band ÷ people scored',
    population: 'Employees active at the as-of date, scored company-wide.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: null,
    uses: L.figure['talent-risk-bands'],
    owner: OWNER,
    params: [
      {
        key: P.highBand.key,
        label: 'High band share',
        description:
          'About this share of everyone scored is placed in the high band. People with the same score share a band, so the real share can differ a little.',
        type: 'percent',
        default: DEFAULTS.highBand,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        format: 'pct0',
      },
      {
        key: P.mediumBand.key,
        label: 'Medium band share',
        description:
          'About this share of everyone scored, the next scores below the high band, is placed in the medium band. Together the two bands cover at most everyone scored.',
        type: 'percent',
        default: DEFAULTS.mediumBand,
        min: 0,
        max: 0.6,
        step: 0.01,
        format: 'pct0',
      },
    ],
  },
  {
    id: M.flightRisk,
    name: 'Flight-risk score',
    definition:
      'Points from up to nine factors, each with a plain reason, added up to a score from 0 to 100. A factor’s points come from how much more often people with it left voluntarily within 12 months, checked at each month-end 12 to 23 months back, so only exits that have already happened are used. Factors that did not go with more exits get 0 points; factors whose data does not reach back that far keep their default points. Points are rounded to 5.',
    formula: 'score = Σ factor strength × factor points',
    population: 'Employees active at the as-of date, scored company-wide.',
    window: 'Points from the month-ends 12 to 23 months before the as-of date',
    unit: 'int',
    goodDirection: null,
    uses: L.figure['talent-risk-factors'],
    owner: OWNER,
  },
  {
    id: M.backTest,
    name: 'Flight-risk back-test',
    definition:
      'Everyone active 12 months before the as-of date is scored with points learned only from exits known by then (month-ends 24 to 35 months back and the 12 months after each), and their voluntary exits over the next 12 months are counted per band. No exit after the scoring date helps set the points it is judged on. Factors whose data does not reach back that far use their default points.',
    formula: 'exit rate = left within 12 months ÷ people in the band',
    population: 'Employees active 12 months before the as-of date, whole company.',
    window: 'Scored 12 months before the as-of date; exits in the 12 months after',
    unit: 'pct',
    goodDirection: null,
    uses: L.figure['talent-risk-back-test'],
    owner: OWNER,
  },
  {
    id: M.riskDrivers,
    name: 'Risk drivers',
    definition:
      'Share of people in the high flight-risk band with each factor, and how many have it as their main reason. The main reason is the factor that adds the most points to the person’s score, leaving out a factor most of the high band shares (80% by default, such as tenure of 1-3 years) when the person has another one.',
    formula: 'people in the high band with the factor ÷ people in the high band',
    population: 'Employees in scope in the high flight-risk band at the as-of date.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: null,
    uses: L.figure['talent-risk-drivers'],
    owner: OWNER,
    params: [
      {
        key: P.sharedFactor.key,
        label: 'Shared factor share',
        description:
          'A factor at least this share of the company’s high band carries says little about one person, so it is never shown as their main reason when they have another one.',
        type: 'percent',
        default: DEFAULTS.sharedFactor,
        min: 0.5,
        max: 1,
        step: 0.05,
        format: 'pct0',
      },
    ],
  },
  {
    id: M.promotionOverdue,
    name: 'Overdue for promotion',
    definition:
      'Active employees below executive level who have been with the company at least the set number of years (3 by default), were rated at or above the high performer rating (4 by default) in each of the last two annual cycles, and have had no promotion in those years.',
    formula: 'consistent high performers with no promotion in the set number of years',
    population: 'Employees active at the as-of date below executive level, with both annual ratings.',
    window: 'The last two annual cycles on or before the as-of date',
    unit: 'int',
    goodDirection: 'down',
    uses: L.figure['talent-promotion-overdue'],
    owner: OWNER,
    params: [
      {
        key: P.promotionYears.key,
        label: 'Years without a promotion',
        description:
          'People count as overdue after this many years with the company and since their last promotion.',
        type: 'number',
        default: DEFAULTS.promotionYears,
        min: 1,
        max: 10,
        step: 0.5,
        format: 'years',
      },
    ],
  },
  {
    id: M.completions,
    name: 'Course completions',
    definition: 'Courses completed each month, required and optional.',
    formula: 'assignments with a completion date in the month',
    population: 'Learning assignments of people in scope.',
    window: PERIOD,
    unit: 'int',
    goodDirection: null,
    uses: L.figure['talent-completions-by-month'],
    owner: LEARNING_OWNER,
  },
  {
    id: M.overdue,
    name: 'Overdue required training',
    definition:
      'A required assignment that is not completed and was due before the as-of date, for employees active today. Contractors and interns are not counted.',
    formula: 'not completed ÷ required assignments past due',
    population: 'Employees active at the as-of date.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.figure['talent-overdue-assignments'],
    owner: LEARNING_OWNER,
  },
  {
    id: M.hours,
    name: 'Learning hours per employee',
    definition:
      'Hours credited for courses completed in the period by employees, divided by the average headcount over the period. Contractors and interns are excluded.',
    formula: 'hours completed ÷ average headcount',
    population: 'Employees in scope; contractors and interns excluded.',
    window: PERIOD,
    unit: 'hours',
    goodDirection: 'up',
    uses: L.figure['talent-learning-hours'],
    owner: LEARNING_OWNER,
  },

  /* ───────── readout finding rules ───────── */
  {
    id: M.hipoExitsRule,
    name: 'Readout: high-potential exits',
    definition:
      'Raised when people whose latest potential on record was High and whose last rating was high (4 or 5 by default) resigned with a regretted exit in the look-back window (6 months by default). Critical from 2 people.',
    formula: 'regretted voluntary exits of high potentials rated high, in the window',
    population: 'Employees in scope who left in the window.',
    window: 'The look-back window before the as-of date',
    unit: 'int',
    goodDirection: 'down',
    uses: L.finding['talent-hipo-exits'],
    owner: OWNER,
    params: [
      {
        key: P.hipoExitMonths.key,
        label: 'Look-back window',
        description: 'How many months back the readout looks for high-potential regretted exits.',
        type: 'months',
        default: DEFAULTS.hipoExitMonths,
        min: 1,
        max: 24,
        step: 1,
      },
    ],
  },
  {
    id: M.successionExposedRule,
    name: 'Readout: roles exposed to loss',
    definition:
      'Raised when roles have an incumbent at high risk of loss and no successor named. Risk of loss comes from the succession plan, or from the flight-risk model when the plans record none.',
    formula: 'roles with no successor and an incumbent at high risk of loss',
    population: 'Roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: L.finding['talent-succession-exposed'],
    owner: OWNER,
  },
  {
    id: M.criticalNotReadyRule,
    name: 'Readout: critical roles not ready',
    definition:
      'Raised when critical roles have no successor who is ready now. It is critical when more than a set share of critical roles is not ready (40% by default), a warning otherwise.',
    formula: 'critical roles with nobody ready now ÷ critical roles',
    population: 'Critical roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.finding['talent-critical-not-ready'],
    owner: OWNER,
    params: [
      {
        key: P.notReadyCritical.key,
        label: 'Critical above',
        description:
          'The finding is critical when more than this share of critical roles has nobody ready now.',
        type: 'percent',
        default: DEFAULTS.notReadyCritical,
        min: 0,
        max: 1,
        step: 0.05,
        format: 'pct0',
      },
    ],
  },
  {
    id: M.inflationRule,
    name: 'Readout: rating inflation',
    definition:
      'Raised for a business unit whose share of high performers in the latest cycle is more than a set number of points above the guideline share at those ratings (8 pts by default), with enough people rated (20 by default). Up to two business units are named.',
    formula: 'business unit share rated high − guideline share',
    population: RATED,
    window: CYCLE,
    unit: 'pts',
    goodDirection: 'down',
    uses: L.finding['talent-inflation'],
    owner: OWNER,
    params: [
      {
        key: P.inflationPts.key,
        label: 'Points above the guideline',
        description:
          'A business unit is flagged when its share of high performers is more than this many points above the guideline. The Performance tab marks the same groups.',
        type: 'percent',
        default: DEFAULTS.inflationPts,
        min: 0.01,
        max: 0.5,
        step: 0.01,
        format: 'pts',
      },
      minRatedParam(DEFAULTS.inflationMinRated, 'rated'),
    ],
  },
  {
    id: M.calibrationRule,
    name: 'Readout: calibration shift',
    definition:
      'Raised for a business unit where calibration lowered manager-proposed ratings by more than a set amount on average (0.30 rating points by default), with enough people calibrated (20 by default). Up to two business units are named.',
    formula: 'mean(proposed rating − final rating) in the business unit',
    population: 'People rated in the latest cycle with a proposed and a final rating.',
    window: CYCLE,
    unit: 'num2',
    goodDirection: null,
    uses: L.finding['talent-calibration'],
    owner: OWNER,
    params: [
      {
        key: P.calibrationShift.key,
        label: 'Shift flagged',
        description:
          'A business unit is flagged when calibration lowered its ratings by more than this many rating points on average.',
        type: 'number',
        default: DEFAULTS.calibrationShift,
        min: 0.05,
        max: 2,
        step: 0.05,
        format: 'num2',
      },
      minRatedParam(DEFAULTS.calibrationMinRated, 'with a proposed and a final rating'),
    ],
  },
  {
    id: M.trainingOverdueRule,
    name: 'Readout: required training overdue',
    definition:
      'Raised for the required course with the most overdue assignments, naming where its overdue share concentrates (business unit, department, location or level). A compliance or security course is critical when at least a set share of that group (25% by default) and a set number of people (10 by default) are overdue.',
    formula: 'overdue ÷ past due in the group, against the rest of the scope',
    population: 'Employees active at the as-of date.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'down',
    uses: L.finding['talent-training-overdue'],
    owner: LEARNING_OWNER,
    params: [
      {
        key: P.overdueCriticalShare.key,
        label: 'Critical share overdue',
        description:
          'A compliance or security course is critical when at least this share of the group is overdue.',
        type: 'percent',
        default: DEFAULTS.overdueCriticalShare,
        min: 0.05,
        max: 1,
        step: 0.05,
        format: 'pct0',
      },
      {
        key: P.overdueCriticalPeople.key,
        label: 'Critical people overdue',
        description:
          'A compliance or security course is critical only with at least this many people overdue in the group.',
        type: 'number',
        default: DEFAULTS.overdueCriticalPeople,
        min: 1,
        max: 500,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.promotionOverdueRule,
    name: 'Readout: overdue for promotion',
    definition:
      'Raised when at least a set number of consistent high performers (3 by default) are overdue for promotion, naming the department where most of them are.',
    formula: 'people overdue for promotion',
    population: 'Employees active at the as-of date below executive level.',
    window: 'The last two annual cycles on or before the as-of date',
    unit: 'int',
    goodDirection: 'down',
    uses: L.finding['talent-promotion-overdue'],
    owner: OWNER,
    params: [
      {
        key: P.promotionMinPeople.key,
        label: 'Fewest people',
        description: 'The readout names overdue high performers only when there are at least this many.',
        type: 'number',
        default: DEFAULTS.promotionMinPeople,
        min: 1,
        max: 100,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.keyTalentRule,
    name: 'Readout: key talent at risk',
    definition:
      'Raised when any active high performer is in the high flight-risk band, with where they concentrate, their most common reasons and how well the bands separated leavers a year ago.',
    formula: 'active high performers in the high flight-risk band',
    population: 'Employees active at the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: L.finding['talent-key-talent-risk'],
    owner: OWNER,
  },
  {
    id: M.goodTrainingRule,
    name: 'Readout: training on target',
    definition:
      'A good-news finding when required training on time meets its target (95% by default) with enough assignments due (20 by default). Without a target it is not raised.',
    formula: 'completed by the due date ÷ required assignments due, against the target',
    population: 'Employees employed on the due date.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: L.finding['talent-good-training'],
    owner: LEARNING_OWNER,
    params: [
      {
        key: P.goodTrainingMinDue.key,
        label: 'Fewest assignments due',
        description: 'The finding needs at least this many required assignments due in the period.',
        type: 'number',
        default: DEFAULTS.goodTrainingMinDue,
        min: 5,
        max: 100000,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.goodDistributionRule,
    name: 'Readout: ratings match the guideline',
    definition:
      'A good-news finding for the largest business unit whose share of high performers is within a set distance of the guideline (3 pts by default), with enough people rated (100 by default) and not flagged for calibration. Raised when training is not on target.',
    formula: '|business unit share rated high − guideline share|',
    population: RATED,
    window: CYCLE,
    unit: 'pts',
    goodDirection: null,
    uses: L.finding['talent-good-distribution'],
    owner: OWNER,
    params: [
      {
        key: P.goodDistributionTolerance.key,
        label: 'Distance from the guideline',
        description:
          'A business unit matches the guideline when its share of high performers is within this many points of it.',
        type: 'percent',
        default: DEFAULTS.goodDistributionTolerance,
        min: 0,
        max: 0.2,
        step: 0.005,
        format: 'pts',
      },
      minRatedParam(DEFAULTS.goodDistributionMinRated, 'rated'),
    ],
  },
  {
    id: M.goodSuccessionRule,
    name: 'Readout: succession bench strong',
    definition:
      'A good-news finding when at least a set share of critical roles has a successor ready now (80% by default), with enough critical roles (5 by default). Raised when neither training nor ratings give a good-news finding.',
    formula: 'critical roles with a ready-now successor ÷ critical roles',
    population: 'Critical roles in the succession plans whose incumbent is in scope.',
    window: AS_OF,
    unit: 'pct',
    goodDirection: 'up',
    uses: L.finding['talent-good-succession'],
    owner: OWNER,
    params: [
      {
        key: P.goodSuccessionCoverage.key,
        label: 'Coverage needed',
        description: 'The finding needs at least this share of critical roles with a successor ready now.',
        type: 'percent',
        default: DEFAULTS.goodSuccessionCoverage,
        min: 0.5,
        max: 1,
        step: 0.05,
        format: 'pct0',
      },
      {
        key: P.goodSuccessionMinCritical.key,
        label: 'Fewest critical roles',
        description: 'The finding needs at least this many critical roles in scope.',
        type: 'number',
        default: DEFAULTS.goodSuccessionMinCritical,
        min: 1,
        max: 500,
        step: 1,
        format: 'int',
      },
    ],
  },
]).map((d) => (DEPENDS_ON[d.id] ? { ...d, dependsOn: DEPENDS_ON[d.id] } : d))
