/**
 * The org view's metric dictionary entries (docs/METRICS.md): one per metric the view shows,
 * registered with `defineMetrics('org', [...])` from '@/metrics/define'. The catalog imports
 * this file, so keep it to plain data: never React, '@/data/context', '@/data/store', the
 * '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 *
 * The settings below replace the constants the engine used to hold (`engine/rules.ts` reads them
 * through `ctx.metrics`). Where a setting changes a number, the wording says "by default" so the
 * text stays true when someone changes it; the labels on screen carry the value in force.
 */
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'
import { TALENT_METRIC, TALENT_PARAM } from '@/views/talent/engine/settings'
import {
  ACTIVE_USES,
  BACKFILL_USES,
  flagUses,
  OPEN_ROLE_USES,
  REPORTING_USES,
  refs,
  SCENARIO_USES,
  TEAM_EXIT_USES,
  TEAM_REGRETTED_USES,
} from './engine/uses'

/** Every Org chart metric id, by what it measures. */
export const ORG_METRIC = {
  /** The chart itself: who reports to whom. */
  reportingLines: 'org.chart.reportingLines',
  people: 'org.people.count',
  managers: 'org.managers.count',
  medianSpan: 'org.span.median',
  layers: 'org.layers.count',
  openRoles: 'org.openRoles.count',
  flagged: 'org.flags.structure',
  wideSpan: 'org.flags.wideSpan',
  narrowSpan: 'org.flags.narrowSpan',
  chain: 'org.flags.singleReportChain',
  newManager: 'org.flags.newManager',
  newHire: 'org.flags.newHire',
  placement: 'org.flags.placement',
  directReports: 'org.person.directReports',
  totalOrg: 'org.person.totalOrg',
  teamTenure: 'org.team.avgTenure',
  tenureMix: 'org.team.tenureMix',
  teamContingent: 'org.team.contingent',
  teamExits: 'org.team.exits',
  teamRegretted: 'org.team.regrettedExits',
  backfills: 'org.exit.backfills',
  moves: 'org.scenario.moves',
  reportingChanges: 'org.scenario.reportingChanges',
  spanChanges: 'org.scenario.spanChanges',
  scenarioExits: 'org.scenario.exits',
  avgSpan: 'org.scenario.avgSpan',
  firstReport: 'org.scenario.firstReport',
  noReportsLeft: 'org.scenario.noReportsLeft',
  crossDepartment: 'org.scenario.crossDepartment',
} as const

export type OrgMetricId = (typeof ORG_METRIC)[keyof typeof ORG_METRIC]

/** Each setting the engine reads: the metric that holds it and its key. */
export const ORG_PARAM = {
  wideSpan: { metricId: ORG_METRIC.wideSpan, key: 'minDirects' },
  narrowSpan: { metricId: ORG_METRIC.narrowSpan, key: 'maxDirects' },
  chainMinBelow: { metricId: ORG_METRIC.chain, key: 'minBelow' },
  newManagerMonths: { metricId: ORG_METRIC.newManager, key: 'months' },
  largeTeam: { metricId: ORG_METRIC.newManager, key: 'minDirects' },
  newHireDays: { metricId: ORG_METRIC.newHire, key: 'days' },
  deepChain: { metricId: ORG_METRIC.layers, key: 'deepChain' },
  exitMonths: { metricId: ORG_METRIC.teamExits, key: 'months' },
  /** A high rating is the high performer rating, set once on Talent. */
  backfillRating: TALENT_PARAM.highRating,
} as const

const OWNER = 'People analytics'
const AS_OF = 'The as-of date'
const ACTIVE = 'Everyone active on the as-of date (hired on or before it, not yet left), every worker type.'
const SCENARIO =
  'The reorg sandbox: the org on the as-of date with the scenario applied. The data is never changed.'
const SCENARIO_POPULATION =
  'Everyone active on the as-of date, every worker type, with the scenario moves applied.'

export const metrics: MetricDef[] = defineMetrics('org', [
  /* ───────── the chart ───────── */
  {
    id: ORG_METRIC.reportingLines,
    name: 'Reporting lines',
    definition:
      'Who reports to whom on the as-of date, for everyone active that day, including contractors and interns. A selected leader becomes the top of the chart; other filters dim cards instead of hiding them so reporting lines stay readable.',
    formula:
      'each active person under their manager if active, else the nearest active manager above; top level if none',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },

  /* ───────── key figures ───────── */
  {
    id: ORG_METRIC.people,
    name: 'People in this org',
    definition:
      'Everyone in the org on screen, including its leader and every worker type. With the business unit, department, location or level filters set, only the people matching them count.',
    formula: 'active people in the org',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: ACTIVE_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.managers,
    name: 'People managers',
    definition: 'People in the org with at least one active direct report, of any worker type.',
    formula: 'people with 1 or more direct reports',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.medianSpan,
    name: 'Median span',
    definition: 'Median number of direct reports among people with at least one, all worker types.',
    formula: 'median of direct reports per people manager',
    population: 'People managers in the org on the as-of date. Reports of every worker type count.',
    window: AS_OF,
    unit: 'num1',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.layers,
    name: 'Layers',
    definition:
      'Levels from the top of this org to its deepest report, counting the top as 1. When people sit below the deep-chain layer (7 by default), the tile says how many.',
    formula: 'deepest layer, with the top of the org as layer 1',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: REPORTING_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.deepChain.key,
        label: 'Deep chain below layer',
        description:
          'People below this layer sit in a deep reporting chain. The Layers tile notes how many, and the count opens them. The People stats readout flags the same people.',
        type: 'number',
        default: 7,
        min: 3,
        max: 20,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: ORG_METRIC.openRoles,
    name: 'Open roles',
    definition:
      'Open requisitions whose hiring manager is in this org. The tile and the dashed cards show only with the Open roles switch on.',
    formula: 'open requisitions with a hiring manager in the org',
    population:
      'Requisitions with status Open, opened on or before the as-of date, with an active hiring manager.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: refs(ACTIVE_USES, OPEN_ROLE_USES),
    owner: OWNER,
  },
  {
    id: ORG_METRIC.flagged,
    name: 'Structure flags',
    definition:
      'People with a wide span, a narrow span, a single-report chain, or a new manager with a large team. Managing since is the move to a manager level in Job changes, otherwise the hire date.',
    formula: 'people with at least one structure flag',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: flagUses(true),
    owner: OWNER,
    // Each flag's own threshold changes the count.
    dependsOn: [ORG_METRIC.wideSpan, ORG_METRIC.narrowSpan, ORG_METRIC.chain, ORG_METRIC.newManager],
  },

  /* ───────── flag rules ───────── */
  {
    id: ORG_METRIC.wideSpan,
    name: 'Wide span',
    definition:
      'A manager with at least the wide-span number of direct reports, 12 by default, counting every worker type. Time per person gets thin at that size.',
    formula: 'direct reports ≥ wide span',
    population: 'People managers on the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: REPORTING_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.wideSpan.key,
        label: 'Wide span from',
        description:
          'Managers with this many direct reports or more get a wide-span flag. The reorg sandbox and the exit simulation warn at the same size, and People stats uses it for span outliers and the Overloaded manager flag.',
        type: 'number',
        default: 12,
        min: 4,
        max: 50,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: ORG_METRIC.narrowSpan,
    name: 'Narrow span',
    definition:
      'A manager with at least one direct report and at most the narrow-span number, 1 by default, counting every worker type. The layer adds a step without adding reach.',
    formula: '1 ≤ direct reports ≤ narrow span',
    population: 'People managers on the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: REPORTING_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.narrowSpan.key,
        label: 'Narrow span up to',
        description:
          'Managers with at least one direct report and no more than this many get a narrow-span flag. The reorg sandbox lists new spans this narrow, and People stats flags them as span outliers.',
        type: 'number',
        default: 1,
        min: 1,
        max: 5,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: ORG_METRIC.chain,
    name: 'Single-report chain',
    definition:
      'Exactly one direct report, who leads a team of their own (5 or more people below them by default). The extra layer sits above a whole team.',
    formula: "direct reports = 1 and the report's total org ≥ team below",
    population: 'People managers on the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: REPORTING_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.chainMinBelow.key,
        label: 'Team below the only report',
        description:
          'How many people, at every level, the only direct report must lead for the chain flag. People stats counts single-report chains the same way.',
        type: 'number',
        default: 5,
        min: 1,
        max: 50,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: ORG_METRIC.newManager,
    name: 'New manager, large team',
    definition:
      'Managing for less than the new-manager window (12 months by default) with a large team (8 or more direct reports by default). Managing since is the move from an individual contributor level to a manager level in Job changes, otherwise the hire date.',
    formula: 'managing since > as-of date − window, and direct reports ≥ large team',
    population: 'People managers on the as-of date.',
    window: 'The new-manager window before the as-of date (default 12 months)',
    unit: 'int',
    goodDirection: 'down',
    uses: flagUses(true),
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.newManagerMonths.key,
        label: 'New manager window',
        description:
          'Someone who started managing within this many months of the as-of date is a new manager, here and on People stats.',
        type: 'months',
        default: 12,
        min: 1,
        max: 36,
      },
      {
        key: ORG_PARAM.largeTeam.key,
        label: 'Large team from',
        description: 'New managers with this many direct reports or more get the flag.',
        type: 'number',
        default: 8,
        min: 2,
        max: 50,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: ORG_METRIC.newHire,
    name: 'New hire',
    definition: 'Joined within the new-hire window before the as-of date (90 days by default).',
    formula: 'hire date > as-of date − window',
    population: ACTIVE,
    window: 'The new-hire window before the as-of date (default 90 days)',
    unit: 'int',
    goodDirection: null,
    uses: ACTIVE_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.newHireDays.key,
        label: 'New hire window',
        description:
          'People hired within this many days of the as-of date get a new-hire mark on their card.',
        type: 'days',
        default: 90,
        min: 7,
        max: 365,
      },
    ],
  },
  {
    id: ORG_METRIC.placement,
    name: 'Reporting line note',
    definition:
      "The person's manager in the data is not active on the as-of date (shown under the next active manager up), is not in the roster, or is part of a reporting loop.",
    formula:
      'manager in the data: not active on the as-of date, not in the roster, the person themselves, or in a reporting loop',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: 'down',
    uses: REPORTING_USES,
    owner: OWNER,
  },

  /* ───────── a person's team ───────── */
  {
    id: ORG_METRIC.directReports,
    name: 'Direct reports',
    definition: 'Active people of every worker type who report to the person on the as-of date.',
    formula: 'count of active people whose manager on the chart is the person',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.totalOrg,
    name: 'Total org',
    definition: 'Everyone below the person, at every level.',
    formula: 'Σ over direct reports of (1 + their total org)',
    population: ACTIVE,
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.teamTenure,
    name: 'Average tenure',
    definition:
      "Mean tenure of everyone in the person's org, at every level below them. Hidden for an org smaller than the anonymity minimum.",
    formula: 'mean of (as-of date − hire date) in years',
    population: ACTIVE,
    window: AS_OF,
    unit: 'years',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.tenureMix,
    name: 'Tenure mix by team',
    definition:
      'For each direct report of the person at the top of the chart, everyone below them at every level, split by years since hire: under 1, 1-2, 2-5, 5-10 and 10 or more. Every worker type counts, contractors and interns included. Orgs smaller than the anonymity minimum are folded into Other, or left out when together they are still under it.',
    formula: 'people in the org in each tenure band ÷ people in the org',
    population: ACTIVE,
    window: AS_OF,
    unit: 'pct',
    goodDirection: null,
    uses: REPORTING_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.teamContingent,
    name: 'Contractors and interns',
    definition: "Contractors and interns among the person's direct reports.",
    formula: 'direct reports with an employment type other than Employee',
    population: 'Direct reports on the as-of date.',
    window: AS_OF,
    unit: 'int',
    goodDirection: null,
    uses: refs(REPORTING_USES, ['employees.employmentType']),
    owner: OWNER,
  },
  {
    id: ORG_METRIC.teamExits,
    name: 'Exits',
    definition:
      'People who left while the person was their manager in the data, within the exits window before the as-of date (12 months by default).',
    formula: 'leavers with this manager, termination date in the window',
    population: 'Leavers of every worker type and termination type.',
    window: 'The exits window before the as-of date (default 12 months)',
    unit: 'int',
    goodDirection: 'down',
    uses: TEAM_EXIT_USES,
    owner: OWNER,
    params: [
      {
        key: ORG_PARAM.exitMonths.key,
        label: 'Exits window',
        description: 'How far back the detail panel counts exits and regretted exits.',
        type: 'months',
        default: 12,
        min: 1,
        max: 36,
      },
    ],
  },
  {
    id: ORG_METRIC.teamRegretted,
    name: 'Regretted exits',
    definition:
      "Voluntary exits marked regrettable among the person's former reports, in the same window as Exits.",
    formula: 'voluntary leavers with regrettable = yes',
    population: 'Leavers whose manager in the data is the person.',
    window: 'The exits window before the as-of date (default 12 months)',
    unit: 'int',
    goodDirection: 'down',
    uses: TEAM_REGRETTED_USES,
    owner: OWNER,
    dependsOn: [ORG_METRIC.teamExits],
  },
  {
    id: ORG_METRIC.backfills,
    name: 'Who could step up',
    definition:
      "In the exit simulation, the person's direct reports with a high rating in the latest review cycle on or before the as-of date: at or above the high performer rating (4 or 5 by default, set on Talent). Highest rating first, then potential.",
    formula:
      'direct reports rated ≥ high performer rating in the latest cycle on or before the as-of date, highest rating then potential first',
    population: 'Direct reports with a rating in that cycle.',
    window: 'The latest review cycle on or before the as-of date',
    unit: 'int',
    goodDirection: 'up',
    uses: refs(REPORTING_USES, BACKFILL_USES),
    owner: OWNER,
    dependsOn: [TALENT_METRIC.highPerformers],
  },

  /* ───────── reorg sandbox ───────── */
  {
    id: ORG_METRIC.moves,
    name: 'Moves',
    definition:
      'Each step of the reorg scenario, in order, with the people who move in it. Someone moving with their org brings everyone below them.',
    formula: 'per step: the person, plus everyone below them when they move with their org',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.reportingChanges,
    name: 'People changing manager',
    definition: 'People whose manager in the scenario differs from their manager on the as-of date.',
    formula: 'people whose manager in the scenario ≠ their manager on the as-of date',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.spanChanges,
    name: 'Spans that change',
    definition: 'Managers whose number of direct reports differs between today and the scenario.',
    formula: 'direct reports in the scenario − direct reports today',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.scenarioExits,
    name: 'Exits in the scenario',
    definition: 'People the scenario takes out. Their direct reports roll up to their manager.',
    formula: 'people on the chart today who are not in the scenario',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.avgSpan,
    name: 'Average span',
    definition:
      'Mean number of direct reports per people manager across the whole chart, today and in the scenario.',
    formula: 'direct reports ÷ people managers',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'num1',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.firstReport,
    name: 'First direct report',
    definition: 'People with no direct reports today who gain at least one in the scenario.',
    formula: 'direct reports today = 0 and direct reports in the scenario ≥ 1',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.noReportsLeft,
    name: 'No direct reports left',
    definition: 'Managers today who keep no direct reports in the scenario.',
    formula: 'direct reports today ≥ 1 and direct reports in the scenario = 0',
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: SCENARIO_USES,
    owner: OWNER,
  },
  {
    id: ORG_METRIC.crossDepartment,
    name: 'Reporting across departments',
    definition:
      'People who change to a manager in another department, when their manager today was not in that department either.',
    formula: "new manager's department ≠ the person's department, and ≠ the old manager's department",
    population: SCENARIO_POPULATION,
    window: SCENARIO,
    unit: 'int',
    goodDirection: null,
    uses: refs(SCENARIO_USES, ['employees.department']),
    owner: OWNER,
  },
])
