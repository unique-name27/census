/**
 * The People stats (hrbp) view's metric dictionary entries (docs/METRICS.md): one per KPI, per
 * figure measure and per readout rule, with the wording the view shows and the calculation
 * settings its engine reads through `ctx.metrics` (see `./engine/settings`).
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. The lineage module it reuses has no runtime imports.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'
import { ORG_METRIC, ORG_PARAM } from '@/views/org/metrics'
import { ANALYSES_METRICS } from './analyses/metrics'
import {
  ATTRITION,
  all,
  allRefs,
  BUSINESS_UNIT,
  DEPARTMENT,
  DEPARTMENT_AT,
  EXITS,
  FIGURE,
  FIRST_YEAR,
  HEADCOUNT,
  HIRES,
  LEVEL,
  type Lineage,
  LOCATION,
  MANAGER,
  MANAGER_SINCE,
  MOVES,
  need,
  ORG,
  PAST_HEADCOUNT,
  PROMOTION_RATE,
  REASON,
  REGRETTED,
  REGRETTED_EXITS,
  TENURE,
  VOLUNTARY,
  WORKERS,
} from './engine/lineage'

/** Every metric id the view registers, by role. */
export const ID = {
  /* headcount and flows */
  headcount: 'hrbp.headcount.employees',
  avgHeadcount: 'hrbp.headcount.average',
  netChange: 'hrbp.headcount.netChange',
  share: 'hrbp.headcount.share',
  bridge: 'hrbp.headcount.bridge',
  hires: 'hrbp.flow.hires',
  exits: 'hrbp.flow.exits',
  /* attrition */
  attrition: 'hrbp.attrition.all',
  voluntary: 'hrbp.attrition.voluntary',
  regretted: 'hrbp.attrition.regretted',
  firstYear: 'hrbp.attrition.firstYear',
  exitReasons: 'hrbp.attrition.exitReasons',
  trailing12: 'hrbp.attrition.trailing12',
  cohortRetention: 'hrbp.attrition.cohortRetention',
  /* movement */
  promotions: 'hrbp.movement.promotions',
  promotionRate: 'hrbp.movement.promotionRate',
  moves: 'hrbp.movement.moves',
  mobility: 'hrbp.movement.mobility',
  demotions: 'hrbp.movement.demotions',
  sincePromotion: 'hrbp.movement.timeSincePromotion',
  managerChange: 'hrbp.movement.managerChange',
  /* workforce */
  tenure: 'hrbp.workforce.tenure',
  contingent: 'hrbp.workforce.contingent',
  growth: 'hrbp.workforce.growth',
  engineering: 'hrbp.workforce.engineeringShare',
  /* org design */
  managers: 'hrbp.org.managers',
  span: 'hrbp.org.span',
  meanSpan: 'hrbp.org.meanSpan',
  medianSpan: 'hrbp.org.medianSpan',
  managerRatio: 'hrbp.org.managerRatio',
  layers: 'hrbp.org.layers',
  totalOrg: 'hrbp.org.totalOrg',
  newManager: 'hrbp.org.newManager',
  managerFlag: 'hrbp.org.managerFlag',
  chains: 'hrbp.org.singleReportChains',
  /* rules */
  scorecard: 'hrbp.scorecard.offCompany',
  material: 'hrbp.rules.materialChange',
  /* readout rules */
  regrettedCluster: 'hrbp.findings.regrettedCluster',
  voluntaryAbove: 'hrbp.findings.voluntaryAboveCompany',
  firstYearHigh: 'hrbp.findings.firstYear',
  spanOutliers: 'hrbp.findings.spanOutliers',
  newManagers: 'hrbp.findings.newManagers',
  orgDepth: 'hrbp.findings.orgDepth',
  rapidGrowth: 'hrbp.findings.rapidGrowth',
  newHires: 'hrbp.findings.newHireConcentration',
  unevenGrowth: 'hrbp.findings.unevenGrowth',
} as const

export type HrbpMetricId = (typeof ID)[keyof typeof ID]

/**
 * A calculation setting: the metric it is registered on and its key. Most are People stats
 * metrics; the org design thresholds (wide and narrow span, the new manager window, single-report
 * chains and the deep-chain layer) have one home, on the Org chart, and People stats reads them there.
 */
export interface SettingRef {
  readonly metricId: string
  readonly key: string
}

const ref = (metricId: HrbpMetricId, key: string): SettingRef => ({ metricId, key })

/** Every setting the engine reads, by what it changes. */
export const SET = {
  countContractors: ref(ID.headcount, 'countContractors'),
  annualize: ref(ID.attrition, 'annualize'),
  regrettedRule: ref(ID.regretted, 'rule'),
  firstYearDays: ref(ID.firstYear, 'days'),
  engineeringReference: ref(ID.engineering, 'reference'),
  /* org design: one home, on the Org chart */
  newManagerMonths: ORG_PARAM.newManagerMonths,
  wideSpan: ORG_PARAM.wideSpan,
  narrowSpan: ORG_PARAM.narrowSpan,
  chainMinBelow: ORG_PARAM.chainMinBelow,
  deepChain: ORG_PARAM.deepChain,
  flagHeavy: ref(ID.managerFlag, 'heavy'),
  flagLight: ref(ID.managerFlag, 'light'),
  offRateFloor: ref(ID.scorecard, 'rateFloor'),
  offRelative: ref(ID.scorecard, 'relative'),
  offSpanFloor: ref(ID.scorecard, 'spanFloor'),
  offMinHeadcount: ref(ID.scorecard, 'minHeadcount'),
  materialRelative: ref(ID.material, 'relative'),
  materialAbsolute: ref(ID.material, 'absolute'),
  clusterMinExits: ref(ID.regrettedCluster, 'minExits'),
  clusterCriticalExits: ref(ID.regrettedCluster, 'criticalExits'),
  clusterStayDays: ref(ID.regrettedCluster, 'stayWithinDays'),
  aboveGap: ref(ID.voluntaryAbove, 'gap'),
  aboveMinAvgHeadcount: ref(ID.voluntaryAbove, 'minAvgHeadcount'),
  aboveMinExits: ref(ID.voluntaryAbove, 'minExits'),
  aboveCriticalRatio: ref(ID.voluntaryAbove, 'criticalRatio'),
  aboveCriticalExits: ref(ID.voluntaryAbove, 'criticalExits'),
  firstYearThreshold: ref(ID.firstYearHigh, 'threshold'),
  firstYearMinHires: ref(ID.firstYearHigh, 'minHires'),
  firstYearMinLeavers: ref(ID.firstYearHigh, 'minLeavers'),
  newManagersMinTeam: ref(ID.newManagers, 'minTeam'),
  newManagersWarnTeam: ref(ID.newManagers, 'warnTeam'),
  depthWarnLayers: ref(ID.orgDepth, 'warnLayers'),
  rapidGrowth: ref(ID.rapidGrowth, 'growth'),
  newHiresShare: ref(ID.newHires, 'share'),
  newHiresMinTeam: ref(ID.newHires, 'minTeam'),
  newHiresWarnShare: ref(ID.newHires, 'warnShare'),
  unevenMinGrowth: ref(ID.unevenGrowth, 'minGrowth'),
  unevenMinAdded: ref(ID.unevenGrowth, 'minAdded'),
} as const

/** What counts as a regretted exit (the `rule` setting of regretted attrition). */
export type RegrettedRule = 'voluntaryFlagged' | 'anyFlagged'

/**
 * Settings registered on another metric that also change this one (each entry's `dependsOn`), so
 * its definition says when they differ from the defaults and its tiles are marked "Definition
 * changed": the population setting changes every headcount-based number, the annualizing setting
 * every turnover rate, and the Org chart's thresholds the org design numbers.
 */
export const INHERITS: Readonly<Partial<Record<HrbpMetricId, readonly string[]>>> = {
  [ID.avgHeadcount]: [ID.headcount],
  [ID.netChange]: [ID.headcount],
  [ID.share]: [ID.headcount],
  [ID.bridge]: [ID.headcount],
  [ID.hires]: [ID.headcount],
  [ID.exits]: [ID.headcount],
  [ID.attrition]: [ID.headcount],
  [ID.voluntary]: [ID.headcount, ID.attrition],
  [ID.regretted]: [ID.headcount, ID.attrition],
  [ID.firstYear]: [ID.headcount],
  [ID.exitReasons]: [ID.headcount],
  [ID.trailing12]: [ID.headcount, ID.attrition, ID.regretted],
  [ID.cohortRetention]: [ID.headcount],
  [ID.managerChange]: [ID.headcount],
  [ID.promotionRate]: [ID.headcount],
  [ID.mobility]: [ID.headcount],
  [ID.growth]: [ID.headcount],
  [ID.engineering]: [ID.headcount],
  [ID.tenure]: [ID.headcount],
  [ID.newManager]: [ORG_METRIC.newManager],
  [ID.managerFlag]: [ID.newManager, ORG_METRIC.wideSpan],
  [ID.chains]: [ORG_METRIC.chain],
  [ID.scorecard]: [ID.headcount, ID.attrition, ID.regretted, ID.firstYear],
  [ID.regrettedCluster]: [ID.regretted],
  [ID.voluntaryAbove]: [ID.headcount, ID.attrition],
  [ID.firstYearHigh]: [ID.firstYear],
  [ID.spanOutliers]: [ORG_METRIC.wideSpan, ORG_METRIC.narrowSpan],
  [ID.newManagers]: [ID.newManager],
  [ID.orgDepth]: [ORG_METRIC.layers],
  [ID.newHires]: [ID.headcount],
  [ID.rapidGrowth]: [ID.headcount],
  [ID.unevenGrowth]: [ID.headcount],
}

const OWNER = 'People analytics'
const PERIOD = 'The period picker (default last 12 months)'
const RATE_WINDOW = `${PERIOD}. The change compares with the prior period, or with the company under an org filter.`
const AS_OF = 'The as-of date'
const LAST_12 = 'Last 12 months to the as-of date, whatever the period'
const EMPLOYEES =
  'Employees only by default; contractors count too when "Count contractors in headcount" is on. Interns never count.'
const RATES =
  'Employees only by default; contractors count too when "Count contractors in headcount" is on, interns never. Average headcount is the mean of month-end headcounts. Groups under the anonymity minimum (5 by default) are hidden.'

const uses = (l: Lineage): FieldRef[] => allRefs(l)

/** Each entry with what it depends on (`INHERITS`), for its "Changed setting" notes and marks. */
const withSources = (defs: MetricDef[]): MetricDef[] =>
  defs.map((d) => {
    const from = INHERITS[d.id as HrbpMetricId]
    return from?.length ? { ...d, dependsOn: from } : d
  })

const viewMetrics: MetricDef[] = withSources(
  defineMetrics('hrbp', [
    /* ───────── headcount and flows ───────── */
    {
      id: ID.headcount,
      name: 'Headcount',
      definition:
        'Employees active on the as-of date: hired on or before it and not yet terminated. By default contractors and interns are counted separately.',
      formula: 'hire date ≤ as-of date and (no termination date or termination date > as-of date)',
      population:
        'Employees only. Contractors count too when "Count contractors in headcount" is on; interns never count. That setting applies to every number on People stats.',
      window: `${AS_OF}. The change compares with 12 months earlier.`,
      unit: 'int',
      goodDirection: null,
      uses: uses(HEADCOUNT),
      owner: OWNER,
      params: [
        {
          key: SET.countContractors.key,
          label: 'Count contractors in headcount',
          description:
            'On: contractors count as employees in headcount, hires, exits and every rate on People stats. Interns never count.',
          type: 'boolean',
          default: false,
        },
      ],
    },
    {
      id: ID.avgHeadcount,
      name: 'Average headcount',
      definition:
        'Mean of the month-end headcounts from the day before the period opens to its last day (13 points for 12 months). It is the denominator of every rate on People stats.',
      formula: 'sum of month-end headcounts ÷ number of month ends',
      population: EMPLOYEES,
      window: PERIOD,
      unit: 'num1',
      goodDirection: null,
      uses: uses(PAST_HEADCOUNT),
      owner: OWNER,
    },
    {
      id: ID.netChange,
      name: 'Net change, 12 months',
      definition:
        'Employees today minus employees 12 months earlier, each counted in the organization they are in today.',
      formula: 'headcount on the as-of date − headcount 12 months earlier',
      population: EMPLOYEES,
      window: `${AS_OF} against 12 months earlier.`,
      unit: 'int',
      goodDirection: null,
      uses: uses(PAST_HEADCOUNT),
      owner: OWNER,
    },
    {
      id: ID.share,
      name: 'Share of headcount',
      definition: "A group's employees as a share of all employees in scope on the as-of date.",
      formula: 'employees in the group ÷ employees in scope',
      population: EMPLOYEES,
      window: AS_OF,
      unit: 'pct',
      goodDirection: null,
      uses: uses(HEADCOUNT),
      owner: OWNER,
    },
    {
      id: ID.bridge,
      name: 'Headcount bridge',
      definition:
        'How headcount 12 months ago becomes headcount today: plus hires, minus exits, plus other changes. Other changes are neither hires nor exits in this scope, such as contractor conversions, rehires or people whose records moved in or out of the selected org.',
      formula: 'headcount 12 months ago + hires − exits + other changes = headcount today',
      population: EMPLOYEES,
      window: LAST_12,
      unit: 'int',
      goodDirection: null,
      uses: uses(FIGURE.bridge),
      owner: OWNER,
    },
    {
      id: ID.hires,
      name: 'Hires',
      definition:
        'Employees who started in the period (hire date in the Employees data). Interns are not included, and contractors only when "Count contractors in headcount" is on. Recruiting counts offers accepted by the accept date instead, so the two numbers can differ.',
      formula: 'count of employees with a hire date in the period',
      population: EMPLOYEES,
      window: `${PERIOD}. The monthly chart covers the last 12 months.`,
      unit: 'int',
      goodDirection: null,
      uses: uses(HIRES),
      owner: OWNER,
    },
    {
      id: ID.exits,
      name: 'Exits',
      definition: 'Employees whose termination date falls in the period, of any exit type.',
      formula: 'count of employees with a termination date in the period',
      population: EMPLOYEES,
      window: `${PERIOD}. The monthly chart covers the last 12 months.`,
      unit: 'int',
      goodDirection: null,
      uses: uses(EXITS),
      owner: OWNER,
    },

    /* ───────── attrition ───────── */
    {
      id: ID.attrition,
      name: 'Attrition',
      definition:
        'All employee exits in the period divided by average headcount (mean of month-end snapshots), annualized by default so periods of different length compare.',
      formula: 'exits ÷ average headcount, × (12 ÷ window months) when annualized',
      population: RATES,
      window: RATE_WINDOW,
      unit: 'pct',
      goodDirection: 'down',
      uses: uses(ATTRITION),
      owner: OWNER,
      params: [
        {
          key: SET.annualize.key,
          label: 'Annualize turnover rates',
          description:
            'On: every exit rate on People stats is scaled by 12 ÷ window months, so periods of different length compare. Off: a rate is the exits in the window ÷ average headcount.',
          type: 'boolean',
          default: true,
        },
      ],
    },
    {
      id: ID.voluntary,
      name: 'Voluntary attrition',
      // Quoted by the Compensation readout and the Talent flight-risk factors, measured the same way.
      views: ['comp', 'talent'],
      definition:
        'Employees who resigned in the period (termination type Voluntary), divided by average headcount, annualized by default.',
      formula: 'voluntary exits ÷ average headcount, × (12 ÷ window months) when annualized',
      population: RATES,
      window: RATE_WINDOW,
      unit: 'pct',
      goodDirection: 'down',
      // A common benchmark for technology employers; the Scorecard judges the rate against it.
      target: { value: 0.1, comparator: '<=' },
      uses: uses(VOLUNTARY),
      owner: OWNER,
    },
    {
      id: ID.regretted,
      name: 'Regretted attrition',
      definition:
        'Exits marked regrettable (by default only voluntary ones count), divided by average headcount, annualized by default.',
      formula: 'regretted exits ÷ average headcount, × (12 ÷ window months) when annualized',
      population: RATES,
      window: RATE_WINDOW,
      unit: 'pct',
      goodDirection: 'down',
      target: { value: 0.05, comparator: '<=' },
      uses: uses(REGRETTED),
      owner: OWNER,
      params: [
        {
          key: SET.regrettedRule.key,
          label: 'What counts as regretted',
          description:
            'Which exits count as regretted everywhere on People stats: voluntary exits flagged regrettable, or any exit flagged regrettable.',
          type: 'choice',
          default: 'voluntaryFlagged' satisfies RegrettedRule,
          choices: [
            { value: 'voluntaryFlagged' satisfies RegrettedRule, label: 'Voluntary and flagged regrettable' },
            { value: 'anyFlagged' satisfies RegrettedRule, label: 'Any exit flagged regrettable' },
          ],
        },
      ],
    },
    {
      id: ID.firstYear,
      name: 'First-year attrition',
      definition:
        'Of employees hired 12 to 24 months before the as-of date, the share who left within the first-year window (365 days by default) of their hire date. Hidden when the cohort is under the anonymity minimum (5 by default).',
      formula: 'left within the first-year window of hire ÷ employees hired 12 to 24 months ago',
      population: EMPLOYEES,
      window:
        'The cohort hired 12 to 24 months before the as-of date, whatever the period. The change compares with the cohort a year earlier, or with the company under an org filter.',
      unit: 'pct',
      goodDirection: 'down',
      target: { value: 0.15, comparator: '<=' },
      uses: uses(FIRST_YEAR),
      owner: OWNER,
      params: [
        {
          key: SET.firstYearDays.key,
          label: 'First-year window',
          description:
            'A hire counts as a first-year leaver when they left within this many days of their hire date. The cohort was hired at least 12 months ago, so the window can be shortened but not run past 365 days.',
          type: 'days',
          default: 365,
          min: 30,
          max: 365,
          step: 1,
        },
      ],
    },
    {
      id: ID.trailing12,
      name: 'Attrition, rolling 12 months',
      definition:
        'At each month end, the exits of the kind the figure shows (voluntary by default) in the 12 months to that date divided by the average headcount of those months. It moves one month at a time, so it is smoother than quarterly rates. Under an org filter the company line is drawn beside it. A point whose average headcount is under the anonymity minimum (5 by default) is hidden.',
      formula: 'exits in the 12 months to the month end ÷ mean of the 13 month-end headcounts',
      population: RATES,
      window: 'The last 24 month ends to the as-of date, each with its own 12 months, whatever the period',
      unit: 'pct',
      goodDirection: 'down',
      uses: uses(all(VOLUNTARY, REGRETTED)),
      owner: OWNER,
    },
    {
      id: ID.cohortRetention,
      name: 'Still here, by hire cohort',
      definition:
        'Of the employees hired in each of the last three 12-month periods, the share still employed 3, 6, 12, 18 and 24 months after their own hire date. Only hires whose checkpoint has passed by the as-of date count, so the latest cohort stops early instead of being guessed. A cohort, or a checkpoint, with fewer hires than the anonymity minimum (5 by default) is hidden.',
      formula: 'hires still employed n months after their hire date ÷ hires whose n months have passed',
      population: EMPLOYEES,
      window: 'Hires in the 36 months to the as-of date, in three 12-month cohorts',
      unit: 'pct',
      goodDirection: 'up',
      uses: uses(FIGURE.cohortRetention),
      owner: OWNER,
    },
    {
      id: ID.exitReasons,
      name: 'Exit reasons',
      definition:
        'Voluntary exits by the reason given, as a share of voluntary exits that have a reason. Termination reason uses the 12-reason voluntary taxonomy plus Other.',
      formula: 'voluntary exits with the reason ÷ voluntary exits with any reason',
      population: 'Voluntary leavers in the period, employees only.',
      window: PERIOD,
      unit: 'pct',
      goodDirection: null,
      uses: uses(FIGURE.exitReasons),
      owner: OWNER,
    },

    /* ───────── movement ───────── */
    {
      id: ID.promotions,
      name: 'Promotions',
      definition: 'Promotion events in the period from Job changes. A person promoted twice counts twice.',
      formula: 'count of Promotion events with an effective date in the period',
      population: 'Job changes of employees in scope.',
      window: `${PERIOD}. Periods shorter than a year compare with the same months a year earlier.`,
      unit: 'int',
      goodDirection: null,
      uses: uses(MOVES),
      owner: OWNER,
    },
    {
      id: ID.promotionRate,
      name: 'Promotion rate',
      definition:
        'Promotion events in the period from Job changes, divided by average headcount. Not annualized, because promotions come in cycles. A person promoted twice counts twice. Periods shorter than a year compare with the same months a year earlier.',
      formula: 'promotions ÷ average headcount',
      population: RATES,
      window: PERIOD,
      unit: 'pct',
      goodDirection: null,
      uses: uses(PROMOTION_RATE),
      owner: OWNER,
    },
    {
      id: ID.moves,
      name: 'Transfers and lateral moves',
      definition:
        'Transfer and Lateral move events in the period from Job changes. A transfer moves a person to a different department or manager line; a lateral move changes their role at the same level.',
      formula: 'count of Transfer and Lateral move events with an effective date in the period',
      population: 'Job changes of employees in scope.',
      window: PERIOD,
      unit: 'int',
      goodDirection: null,
      uses: uses(MOVES),
      owner: OWNER,
    },
    {
      id: ID.mobility,
      name: 'Internal mobility',
      definition:
        'People with at least one promotion, transfer or lateral move in the period, divided by average headcount. Each person counts once. Not annualized.',
      formula: 'people who moved ÷ average headcount',
      population: RATES,
      window: PERIOD,
      unit: 'pct',
      goodDirection: null,
      uses: uses(PROMOTION_RATE),
      owner: OWNER,
    },
    {
      id: ID.demotions,
      name: 'Demotions',
      definition: 'Demotion events in the period from Job changes.',
      formula: 'count of Demotion events with an effective date in the period',
      population: 'Job changes of employees in scope.',
      window: PERIOD,
      unit: 'int',
      goodDirection: null,
      uses: uses(MOVES),
      owner: OWNER,
    },
    {
      id: ID.managerChange,
      name: 'New manager in the last 12 months',
      definition:
        'The share of employees today who had at least one change of manager in the last 12 months: a manager change in Job changes, or a transfer to a different manager. The change recorded when a new manager joined after their report, on the manager’s hire date, is left out. Groups under the anonymity minimum (5 by default) fold into Other.',
      formula: 'employees today with a manager change in the last 12 months ÷ employees today',
      population: EMPLOYEES,
      window: LAST_12,
      unit: 'pct',
      goodDirection: 'down',
      uses: uses(FIGURE.managerChanges('businessUnit')),
      owner: OWNER,
    },
    {
      id: ID.sincePromotion,
      name: 'Time since last promotion',
      definition:
        'Employees on the as-of date by years since their last Promotion event. Never promoted means no Promotion event on record since hire, including people hired recently.',
      formula:
        '(as-of date − latest Promotion date on or before it) ÷ 365.25, in bands; never promoted without a Promotion event',
      population: EMPLOYEES,
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(FIGURE.timeSincePromotion),
      owner: OWNER,
    },

    /* ───────── workforce ───────── */
    {
      id: ID.tenure,
      name: 'Tenure',
      definition:
        'Years from hire date to the as-of date (365.25 days a year). The average is hidden under the anonymity minimum (5 employees by default).',
      formula: '(as-of date − hire date) in days ÷ 365.25; average = mean over employees',
      population: EMPLOYEES,
      window: AS_OF,
      unit: 'years',
      goodDirection: null,
      uses: uses(all(HEADCOUNT, TENURE)),
      owner: OWNER,
    },
    {
      id: ID.contingent,
      name: 'Contractors and interns',
      definition:
        "Active contractors and interns on the as-of date by site or business unit, with each group's share of its active workers. Worker type is the employment type on the roster; the table also lists employees, so each group's mix is complete.",
      formula:
        'active workers by type, per site or business unit; share = workers of the type ÷ active workers in the group',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(all(WORKERS, need('employees.employmentType'))),
      owner: OWNER,
    },
    {
      id: ID.growth,
      name: 'Growth',
      definition:
        'Change in headcount as a share of headcount 12 months ago, each person counted in the group they are in today. Hidden when the base is under the anonymity minimum (5 by default).',
      formula: '(today − 12 months ago) ÷ 12 months ago',
      population: EMPLOYEES,
      window: `${AS_OF} against 12 months earlier.`,
      unit: 'pct',
      goodDirection: null,
      uses: uses(PAST_HEADCOUNT),
      owner: OWNER,
    },
    {
      id: ID.engineering,
      name: 'Engineering share',
      definition:
        'Employees in engineering departments as a share of all employees on the as-of date. Engineering covers architecture, design, verification, validation, physical design, analog and mixed-signal, DFT, firmware, software, hardware, and test and product engineering.',
      formula: 'employees in engineering departments ÷ employees',
      population: EMPLOYEES,
      window: AS_OF,
      unit: 'pct',
      goodDirection: null,
      uses: uses(FIGURE.engineeringShare),
      owner: OWNER,
      params: [
        {
          key: SET.engineeringReference.key,
          label: 'Reference line',
          description:
            'Where the reference tick sits on the meter. The default is the middle of a common range of 60% to 70%. It is a reference, not a target.',
          type: 'percent',
          default: 0.65,
          min: 0,
          max: 1,
          step: 0.01,
          format: 'pct',
        },
      ],
    },

    /* ───────── org design ───────── */
    {
      id: ID.managers,
      name: 'Managers',
      definition: 'Active people in scope with at least one active direct report.',
      formula: 'count of active people with at least one active direct report',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.span,
      name: 'Span of control',
      definition:
        'Active direct reports of a manager, counting employees, contractors and interns. A manager is anyone in scope with at least one active direct report.',
      formula: 'count of active direct reports of the manager, every worker type',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.meanSpan,
      name: 'Mean span',
      definition:
        'Average number of active direct reports per manager, counting employees, contractors and interns. A manager is anyone in scope with at least one active direct report.',
      formula: 'direct reports ÷ managers',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'num1',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.medianSpan,
      name: 'Median span',
      definition:
        'The middle value of active direct reports per manager, counting employees, contractors and interns. Half of managers have this many or more.',
      formula: 'median(active direct reports per manager)',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'num1',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.managerRatio,
      name: 'Manager ratio',
      definition: 'Active workers who manage nobody, divided by the number of managers.',
      formula: 'individual contributors ÷ managers',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'num1',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.layers,
      name: 'Layers',
      definition:
        'Reporting levels from the top of the group to its deepest person. One person alone is 1 layer.',
      formula: 'deepest layer, with the top of the group as layer 1',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.totalOrg,
      name: 'Total org',
      definition: 'Everyone below the manager, at every level, active today.',
      formula: 'count of active people below the manager, at every level',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.newManager,
      name: 'New manager',
      definition:
        'Hired, or promoted from an individual level (L) to a manager level (M or E), within the new manager window (12 months by default). The window is set once, on the Org chart.',
      formula:
        'managing since > as-of date − new manager window; managing since = move from an L level to an M or E level, else hire date',
      population: 'Managers in scope.',
      window: 'The new manager window before the as-of date (default 12 months).',
      unit: 'int',
      goodDirection: null,
      uses: uses(all(ORG, MANAGER_SINCE)),
      owner: OWNER,
    },
    {
      id: ID.managerFlag,
      name: 'Manager flag',
      definition:
        'Overloaded at the wide span (12 or more direct reports by default, set on the Org chart), Heavy from 9 by default up to the wide span, Light under 3 by default, New when managing for less than the new manager window (12 months by default), otherwise Healthy. Executives (E levels) lead leadership teams and are flagged only when new.',
      formula:
        'E levels: New or Healthy only · direct reports ≥ wide span: Overloaded · ≥ heavy at: Heavy · < light under: Light · new manager: New · else Healthy',
      population: 'Managers in scope.',
      window: AS_OF,
      unit: 'text',
      goodDirection: null,
      uses: uses(all(ORG, MANAGER_SINCE, LEVEL)),
      owner: OWNER,
      params: [
        {
          key: SET.flagHeavy.key,
          label: 'Heavy at',
          description:
            'Direct reports at which a manager is flagged Heavy, below the wide span (Overloaded). The manager table filter for wide teams starts here too.',
          type: 'number',
          default: 9,
          min: 2,
          max: 50,
          step: 1,
          format: 'int',
        },
        {
          key: SET.flagLight.key,
          label: 'Light under',
          description:
            'A manager with fewer direct reports than this is flagged Light. The manager table filter for small teams uses it too.',
          type: 'number',
          default: 3,
          min: 1,
          max: 20,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.chains,
      name: 'Single-report chains',
      definition:
        'A manager with exactly one active direct report who in turn has people below them (5 or more by default, set on the Org chart). The layer adds a step without adding reach.',
      formula: "direct reports = 1 and the report's total org ≥ team below the only report",
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: 'down',
      uses: uses(ORG),
      owner: OWNER,
    },

    /* ───────── rules ───────── */
    {
      id: ID.scorecard,
      name: 'Materially off the company',
      definition:
        'A sub-org scorecard cell is marked when the org differs from the company by more than a floor or a share of the company value, whichever is larger: by default 1 pt or 10% (0.5 direct reports or 10% for span), in orgs of 10 or more employees. Orgs under the anonymity minimum (5 by default) are folded into Other.',
      formula: '|org − company| > max(floor, share × |company|)',
      population: 'Sub-organizations one level below the scope, against the whole company.',
      window: 'Headcount on the as-of date, rates over the period picker.',
      unit: 'text',
      goodDirection: null,
      uses: uses(all(HEADCOUNT, ORG, PAST_HEADCOUNT, VOLUNTARY, REGRETTED, PROMOTION_RATE)),
      owner: OWNER,
      params: [
        {
          key: SET.offRateFloor.key,
          label: 'Smallest gap for a rate',
          description: 'A rate is marked only when it differs from the company by more than this.',
          type: 'percent',
          default: 0.01,
          min: 0,
          max: 0.2,
          step: 0.001,
          format: 'pts',
        },
        {
          key: SET.offRelative.key,
          label: 'Smallest gap as a share of the company',
          description:
            'A cell is marked only when it differs from the company by more than this share of the company value.',
          type: 'percent',
          default: 0.1,
          min: 0,
          max: 1,
          step: 0.01,
          format: 'pct',
        },
        {
          key: SET.offSpanFloor.key,
          label: 'Smallest gap for span',
          description: 'Average span is marked only when it differs from the company by more than this.',
          type: 'number',
          default: 0.5,
          min: 0,
          max: 10,
          step: 0.1,
          format: 'num1',
        },
        {
          key: SET.offMinHeadcount.key,
          label: 'Smallest org marked',
          description: 'Orgs with fewer employees than this are compared but never marked.',
          type: 'number',
          default: 10,
          min: 5,
          max: 1000,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.material,
      name: 'Material change',
      definition:
        'A change on a People stats tile is colored only when it clears this floor: a share of the value it compares with plus a fixed floor (by default 2% plus 0.15 pts). Smaller changes show in gray.',
      formula: '|change| ≥ share × |comparison| + fixed floor',
      population: 'The rate tiles on People stats (attrition, first-year attrition, promotion rate).',
      window: RATE_WINDOW,
      unit: 'pts',
      goodDirection: null,
      uses: [],
      kind: 'setting',
      owner: OWNER,
      params: [
        {
          key: SET.materialRelative.key,
          label: 'Share of the comparison',
          description: 'The part of the floor that grows with the value compared with.',
          type: 'percent',
          default: 0.02,
          min: 0,
          max: 0.5,
          step: 0.005,
          format: 'pct',
        },
        {
          key: SET.materialAbsolute.key,
          label: 'Fixed floor',
          description: 'The part of the floor that is the same for every value.',
          type: 'percent',
          default: 0.0015,
          min: 0,
          max: 0.05,
          step: 0.0005,
          format: 'pts2',
        },
      ],
    },

    /* ───────── readout rules ───────── */
    {
      id: ID.regrettedCluster,
      name: 'Regretted exits under one manager',
      definition:
        'Flags the manager with the most regretted exits from their team in the last 12 months, when they have enough to flag (2 or more by default). It is critical at 3 or more by default.',
      formula:
        'regretted exits in the last 12 months per manager ≥ exits to flag; critical at ≥ exits to mark critical',
      population: 'Regretted leavers with a manager on record.',
      window: LAST_12,
      unit: 'int',
      goodDirection: 'down',
      // The finding also cites exit reasons and where the leavers sat.
      uses: uses(all(REGRETTED_EXITS, MANAGER, REASON, DEPARTMENT, LOCATION)),
      owner: OWNER,
      params: [
        {
          key: SET.clusterMinExits.key,
          label: 'Exits to flag',
          description: 'A manager is flagged when this many regretted exits left their team.',
          type: 'number',
          default: 2,
          min: 2,
          max: 20,
          step: 1,
          format: 'int',
        },
        {
          key: SET.clusterCriticalExits.key,
          label: 'Exits to mark critical',
          description: 'The finding is critical when the manager has at least this many.',
          type: 'number',
          default: 3,
          min: 2,
          max: 30,
          step: 1,
          format: 'int',
        },
        {
          key: SET.clusterStayDays.key,
          label: 'Stay conversations due within',
          description:
            'In the Action center, stay conversations with the rest of a flagged team are due this many days after the latest regretted exit.',
          type: 'days',
          default: 30,
          min: 7,
          max: 120,
          step: 1,
        },
      ],
    },
    {
      id: ID.voluntaryAbove,
      name: 'Voluntary attrition against the company',
      definition:
        'Flags the scope, a location or a department whose voluntary attrition is at least the gap to flag above the company (3 pts by default), in groups averaging 10 or more employees with 3 or more voluntary exits by default. It is critical at a multiple of the company rate with enough exits (1.75 times with 10 or more by default). A scope the same gap below the company is noted as working well.',
      formula: 'group voluntary attrition − company voluntary attrition ≥ gap to flag',
      population: RATES,
      window: PERIOD,
      unit: 'pts',
      goodDirection: 'down',
      // The finding also cites exit reasons and the department, location and level mix.
      uses: uses(all(VOLUNTARY, DEPARTMENT_AT, LOCATION, LEVEL, REASON)),
      owner: OWNER,
      params: [
        {
          key: SET.aboveGap.key,
          label: 'Gap to flag',
          description:
            'How far above (or below) the company voluntary attrition must be to flag. Also marks the bars of the attrition by group chart.',
          type: 'percent',
          default: 0.03,
          min: 0.005,
          max: 0.5,
          step: 0.005,
          format: 'pts',
        },
        {
          key: SET.aboveMinAvgHeadcount.key,
          label: 'Smallest group',
          description: 'Groups with a lower average headcount are never flagged.',
          type: 'number',
          default: 10,
          min: 5,
          max: 1000,
          step: 1,
          format: 'int',
        },
        {
          key: SET.aboveMinExits.key,
          label: 'Fewest voluntary exits',
          description: 'A location or department needs at least this many voluntary exits to be flagged.',
          type: 'number',
          default: 3,
          min: 1,
          max: 100,
          step: 1,
          format: 'int',
        },
        {
          key: SET.aboveCriticalRatio.key,
          label: 'Critical at this multiple',
          description: 'The finding is critical when the rate reaches this multiple of the company rate.',
          type: 'number',
          default: 1.75,
          min: 1,
          max: 5,
          step: 0.05,
          format: 'times',
        },
        {
          key: SET.aboveCriticalExits.key,
          label: 'Exits to mark critical',
          description: 'A critical finding also needs at least this many voluntary exits.',
          type: 'number',
          default: 10,
          min: 1,
          max: 500,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.firstYearHigh,
      name: 'High first-year attrition',
      definition:
        'Flags first-year attrition above the rate to flag (20% by default) for the scope. Otherwise it looks by business unit, then department, then location, and the first of these with a hit names the group with the most excess leavers among groups whose own rate is above the rate to flag and that have enough hires and first-year leavers (10 and 3 by default).',
      formula:
        'first-year attrition > rate to flag for the scope; else, by business unit, then department, then location, the group with rate > rate to flag, hires ≥ smallest group and leavers ≥ fewest first-year leavers, and the most leavers − hires × scope rate',
      population: 'The first-year cohort (see First-year attrition).',
      window: 'The cohort hired 12 to 24 months before the as-of date.',
      unit: 'pct',
      goodDirection: 'down',
      // The finding names the business unit, department or location.
      uses: uses(all(FIRST_YEAR, BUSINESS_UNIT, DEPARTMENT, LOCATION)),
      owner: OWNER,
      params: [
        {
          key: SET.firstYearThreshold.key,
          label: 'Rate to flag',
          description: 'First-year attrition above this is flagged.',
          type: 'percent',
          default: 0.2,
          min: 0.01,
          max: 1,
          step: 0.01,
          format: 'pct',
        },
        {
          key: SET.firstYearMinHires.key,
          label: 'Smallest group',
          description:
            'A business unit, department or location needs at least this many hires in the cohort.',
          type: 'number',
          default: 10,
          min: 5,
          max: 1000,
          step: 1,
          format: 'int',
        },
        {
          key: SET.firstYearMinLeavers.key,
          label: 'Fewest first-year leavers',
          description: 'A group needs at least this many first-year leavers to be flagged.',
          type: 'number',
          default: 3,
          min: 1,
          max: 100,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.spanOutliers,
      name: 'Span outliers',
      definition:
        'Flags managers at or above the wide span (12 direct reports by default) and managers at or below the narrow span (1 by default). Both are set once, on the Org chart. The span of control chart marks the same groups.',
      formula: 'managers with direct reports ≥ wide span, or direct reports ≤ narrow span',
      population: 'Managers in scope.',
      window: AS_OF,
      unit: 'int',
      goodDirection: 'down',
      uses: uses(ORG),
      owner: OWNER,
    },
    {
      id: ID.newManagers,
      name: 'New managers leading large teams',
      definition:
        'Flags new managers (see New manager) who lead enough direct reports (5 or more by default). It is a warning when one leads 8 or more by default.',
      formula: 'new managers with direct reports ≥ team size to flag; a warning at ≥ team size for a warning',
      population: 'Managers in scope.',
      window: AS_OF,
      unit: 'int',
      goodDirection: null,
      uses: uses(all(ORG, MANAGER_SINCE)),
      owner: OWNER,
      params: [
        {
          key: SET.newManagersMinTeam.key,
          label: 'Team size to flag',
          description: 'New managers with at least this many direct reports are flagged.',
          type: 'number',
          default: 5,
          min: 1,
          max: 50,
          step: 1,
          format: 'int',
        },
        {
          key: SET.newManagersWarnTeam.key,
          label: 'Team size for a warning',
          description: 'The finding is a warning when a new manager has at least this many.',
          type: 'number',
          default: 8,
          min: 1,
          max: 50,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.orgDepth,
      name: 'Deep reporting chains',
      definition:
        'Flags people below the deep-chain layer (7 by default, set on the Org chart), counting the top of the scope as layer 1. It is a warning when the deepest chain has 11 or more layers by default.',
      formula:
        'people with layer > deep chain below layer (the top of the scope is layer 1); a warning when the deepest layer ≥ layers for a warning',
      population: 'Active workers of every type.',
      window: AS_OF,
      unit: 'int',
      goodDirection: 'down',
      uses: uses(ORG),
      owner: OWNER,
      params: [
        {
          key: SET.depthWarnLayers.key,
          label: 'Layers for a warning',
          description: 'The finding is a warning when the deepest chain has at least this many layers.',
          type: 'number',
          default: 11,
          min: 3,
          max: 30,
          step: 1,
          format: 'int',
        },
      ],
    },
    {
      id: ID.rapidGrowth,
      name: 'Rapid department growth',
      definition:
        'Flags departments whose headcount grew at least the growth to flag (35% by default) in 6 months, from a base of at least the anonymity minimum (5 by default), with true headcount at both dates (department on each date rebuilt from transfers).',
      formula: '(headcount today − headcount 6 months ago) ÷ headcount 6 months ago',
      population: EMPLOYEES,
      window: 'The 6 months to the as-of date.',
      unit: 'pct',
      goodDirection: null,
      uses: uses(all(PAST_HEADCOUNT, DEPARTMENT_AT)),
      owner: OWNER,
      params: [
        {
          key: SET.rapidGrowth.key,
          label: 'Growth to flag',
          description: 'Departments that grew at least this much in 6 months are flagged.',
          type: 'percent',
          default: 0.35,
          min: 0.05,
          max: 5,
          step: 0.05,
          format: 'pct',
        },
      ],
    },
    {
      id: ID.newHires,
      name: 'New-hire concentration',
      definition:
        'Flags managers with enough direct reports (5 or more by default) when at least a set share of them (half by default) were hired in the last 6 months. It is a warning at 65% or more by default.',
      formula: 'direct reports hired in the last 6 months ÷ direct reports',
      population: EMPLOYEES,
      window: 'Hires in the 6 months to the as-of date.',
      unit: 'pct',
      goodDirection: null,
      uses: uses(all(HEADCOUNT, MANAGER)),
      owner: OWNER,
      params: [
        {
          key: SET.newHiresShare.key,
          label: 'Share of new hires to flag',
          description: 'A team is flagged when at least this share of its direct reports are recent hires.',
          type: 'percent',
          default: 0.5,
          min: 0.1,
          max: 1,
          step: 0.05,
          format: 'pct',
        },
        {
          key: SET.newHiresMinTeam.key,
          label: 'Smallest team',
          description: 'Teams with fewer direct reports than this are never flagged.',
          type: 'number',
          default: 5,
          min: 2,
          max: 50,
          step: 1,
          format: 'int',
        },
        {
          key: SET.newHiresWarnShare.key,
          label: 'Share for a warning',
          description: 'The finding is a warning when a team reaches this share of recent hires.',
          type: 'percent',
          default: 0.65,
          min: 0.1,
          max: 1,
          step: 0.05,
          format: 'pct',
        },
      ],
    },
    {
      id: ID.unevenGrowth,
      name: 'Uneven growth',
      definition:
        'Notes the business unit (or department, inside one unit) that grew the most in 12 months, when it grew and added enough (10% and 10 people by default), with its share of the net change.',
      formula: '(today − 12 months ago) ÷ 12 months ago',
      population: EMPLOYEES,
      window: `${AS_OF} against 12 months earlier.`,
      unit: 'pct',
      goodDirection: null,
      uses: uses(all(PAST_HEADCOUNT, BUSINESS_UNIT, DEPARTMENT)),
      owner: OWNER,
      params: [
        {
          key: SET.unevenMinGrowth.key,
          label: 'Growth to note',
          description: 'The fastest-growing group is noted when it grew at least this much.',
          type: 'percent',
          default: 0.1,
          min: 0.01,
          max: 2,
          step: 0.01,
          format: 'pct',
        },
        {
          key: SET.unevenMinAdded.key,
          label: 'Fewest people added',
          description: 'It also needs at least this many more people than 12 months ago.',
          type: 'number',
          default: 10,
          min: 1,
          max: 1000,
          step: 1,
          format: 'int',
        },
      ],
    },
  ]),
)

/** People stats' entries, then the Special analyses' (`./analyses/metrics`). */
export const metrics: MetricDef[] = [...viewMetrics, ...ANALYSES_METRICS]
