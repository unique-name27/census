/**
 * Actual against budget (`src/lib/budget.ts`): the dictionary entries for headcount and cost
 * against the optional headcount and cost budget, and the contractor estimate the cost uses. The
 * Workforce cost tab and Finance's home show them; the comp view may register these ids in
 * `src/views/comp/metrics.ts` with its own wording, and the catalog adds the entries below for any
 * id it leaves out.
 *
 * The "on budget" bands are settings once the comp engine reads them: register
 * `BUDGET_BAND_PARAMS` on the two ids in the comp view's entries when Workforce cost calls
 * `computeBudget(ctx)` (comp's settings test requires its engine to read every comp setting).
 * Until then `computeBudget` uses the defaults in `BUDGET_BAND`.
 */
import { BUDGET_BAND, BUDGET_METRICS } from '@/lib/budget'
import type { MetricDef, ParamDef } from './types'

const OWNER = 'Finance'

const bandParam = (what: string, value: number): ParamDef => ({
  key: BUDGET_BAND.key,
  label: 'On-budget band',
  description: `${what} within this share of the budget, above or below, counts as on budget. Further away is over or under.`,
  type: 'percent',
  default: value,
  min: 0,
  max: 0.1,
  step: 0.0025,
  format: 'pct',
})

/** The "on budget" band settings, by metric: key `band`, a share of the budget. */
export const BUDGET_BAND_PARAMS: Readonly<Record<'headcount' | 'cost', ParamDef>> = {
  headcount: bandParam('Headcount', BUDGET_BAND.headcount),
  cost: bandParam('Cost', BUDGET_BAND.cost),
}

const LINES = [
  'budget.period',
  'budget.businessUnit',
  'budget.department',
  'budget.costCenter',
  'budget.planVersion',
] as const

const PEOPLE = [
  'employees.employmentType',
  'employees.hireDate',
  'employees.terminationDate',
  'employees.businessUnit',
  'employees.costCenter',
] as const

const LINE_POPULATION =
  'Budget lines of the latest plan version in the scope. The budget is compared for whole business units and departments only, never for a location, level or leader filter.'

export const BUDGET_METRIC_DEFS: readonly MetricDef[] = [
  {
    id: BUDGET_METRICS.headcount,
    name: 'Headcount against budget',
    views: ['comp'],
    definition:
      'Employees at the end of each budget month against the headcount the budget sets for it. Contractors and interns are not headcount and are counted beside it.',
    formula:
      'employees active at the month end (the as-of date in its month) − budget headcount for the month',
    population: `Employees only. ${LINE_POPULATION}`,
    window: 'Every budget month up to the as-of date; months after it show the budget alone.',
    unit: 'int',
    goodDirection: null,
    uses: [...LINES, 'budget.budgetHeadcount', ...PEOPLE],
    requires: ['budget.period', 'budget.budgetHeadcount', 'employees.hireDate', 'employees.employmentType'],
    owner: OWNER,
    params: [],
  },
  {
    id: BUDGET_METRICS.cost,
    name: 'Workforce cost against budget',
    views: ['comp'],
    definition:
      'The monthly run rate of workforce cost at the as-of date against the month’s budget cost: employees’ target cash, plus contractors at the range midpoint of their level and location (an estimate). Totals only, over groups of 5 or more people; a group under 5 folds into Other.',
    formula:
      '(Σ base salary × (1 + target bonus %) × FX to USD over employees + contractor estimate) ÷ 12 − budget cost for the month in USD',
    population: `Employees active at the as-of date with a comp row and an exchange rate, and active contractors. Interns are not costed. ${LINE_POPULATION}`,
    window: 'The month of the as-of date. Pay is a snapshot, so earlier months have no actual cost.',
    unit: 'money',
    goodDirection: null,
    uses: [
      ...LINES,
      'budget.budgetCost',
      'budget.currency',
      ...PEOPLE,
      'employees.level',
      'employees.location',
      'comp.employeeId',
      'comp.baseSalary',
      'comp.targetBonusPct',
      'comp.fxToUsd',
      'comp.currency',
      'comp.rangeMid',
    ],
    requires: ['budget.period', 'budget.budgetCost', 'comp.baseSalary', 'comp.fxToUsd'],
    dependsOn: [BUDGET_METRICS.contractors],
    owner: OWNER,
    params: [],
  },
  {
    id: BUDGET_METRICS.contractors,
    name: 'Contractor cost (estimate)',
    views: ['comp'],
    definition:
      'Census has no contractor rates, so each active contractor is costed at the median range midpoint of employees at their level and location, or at their level company-wide when fewer than 5 are there. Contractors with no level, or with too few employees at it, are left out and counted in the note.',
    formula:
      'Σ median(range midpoint × FX to USD) of active employees at the contractor’s level and location (5 or more), else at the level (5 or more), ÷ 12',
    population: 'Active contractors at the as-of date. Interns are not costed.',
    window: 'The as-of date.',
    unit: 'money',
    goodDirection: null,
    uses: [
      'employees.employmentType',
      'employees.hireDate',
      'employees.terminationDate',
      'employees.level',
      'employees.location',
      'comp.employeeId',
      'comp.rangeMid',
      'comp.fxToUsd',
    ],
    requires: ['employees.employmentType', 'employees.level', 'comp.rangeMid', 'comp.fxToUsd'],
    owner: OWNER,
    params: [],
  },
]
