/**
 * The compensation cycle settings (merit budget, healthy compa-ratio band, merit guideline by
 * rating) as settings of the Compensation metrics. They moved here from Settings > Compensation
 * cycle; `src/metrics/persist.ts` carries saved values over once.
 *
 * The cycle's dates (open, calibration, close and effective, and the hire date that makes someone
 * eligible) are date settings of 'comp.merit.proposals' (docs/ROLES-V2.md 5.14, the audit's open
 * question 5), so they are logged and travel with the settings file like every other setting.
 * Blank means not set: Compensation's items then have no due date and say so. Read them with
 * `cycleDatesOf(ctx.metrics)`.
 *
 * The comp view registers these metric ids in `src/views/comp/metrics.ts` with its own wording;
 * the catalog adds the entries below for any id or setting it leaves out, so the settings always
 * exist.
 */

import type { ISODate } from '@/data/schema'
import {
  COMP_CYCLE_LIMITS,
  type CompCycleSettings,
  DEFAULT_COMP_CYCLE,
  type LegacyCycleSettings,
} from '@/data/settings'
import { paramField } from './registry'
import type { MetricDef, MetricEdit, MetricsApi, ParamDef, ParamValue, RatingMap } from './types'

/** The metric that holds the cycle's dates. */
const CYCLE_DATES_METRIC = 'comp.merit.proposals'

/** Where each cycle setting lives: metric id and setting key. */
export const COMP_CYCLE = {
  meritBudget: { metricId: 'comp.merit.spend', key: 'meritBudget' },
  healthyBand: { metricId: 'comp.compa.inBand', key: 'healthyBand' },
  guideline: { metricId: 'comp.merit.guidelineSpend', key: 'guideline' },
  openDate: { metricId: CYCLE_DATES_METRIC, key: 'openDate' },
  calibrationDate: { metricId: CYCLE_DATES_METRIC, key: 'calibrationDate' },
  closeDate: { metricId: CYCLE_DATES_METRIC, key: 'closeDate' },
  effectiveDate: { metricId: CYCLE_DATES_METRIC, key: 'effectiveDate' },
  eligibleHiredBy: { metricId: CYCLE_DATES_METRIC, key: 'eligibleHiredBy' },
} as const

/** The cycle settings in the order Settings > Compensation cycle lists them. */
export const COMP_CYCLE_ROWS = [
  COMP_CYCLE.meritBudget,
  COMP_CYCLE.healthyBand,
  COMP_CYCLE.guideline,
  COMP_CYCLE.openDate,
  COMP_CYCLE.calibrationDate,
  COMP_CYCLE.closeDate,
  COMP_CYCLE.effectiveDate,
  COMP_CYCLE.eligibleHiredBy,
] as const

export const MERIT_BUDGET_PARAM: ParamDef = {
  key: COMP_CYCLE.meritBudget.key,
  label: 'Merit budget',
  description: 'The merit pool as a share of eligible base salary. Merit spend is compared with it.',
  type: 'percent',
  default: DEFAULT_COMP_CYCLE.meritBudgetPct,
  min: COMP_CYCLE_LIMITS.meritBudgetPct.min,
  max: COMP_CYCLE_LIMITS.meritBudgetPct.max,
  step: 0.0005,
  format: 'pct2',
}

export const HEALTHY_BAND_PARAM: ParamDef = {
  key: COMP_CYCLE.healthyBand.key,
  label: 'Healthy compa-ratio band',
  description: 'Compa-ratios from the low end to the high end, inclusive, count as healthy.',
  type: 'range',
  default: [DEFAULT_COMP_CYCLE.healthyBand[0], DEFAULT_COMP_CYCLE.healthyBand[1]],
  min: COMP_CYCLE_LIMITS.band.min,
  max: COMP_CYCLE_LIMITS.band.max,
  step: 0.01,
  format: 'ratio',
}

export const MERIT_GUIDELINE_PARAM: ParamDef = {
  key: COMP_CYCLE.guideline.key,
  label: 'Merit guideline by rating',
  description: 'The merit increase each rating should get, as a share of base salary.',
  type: 'ratingMap',
  default: { ...DEFAULT_COMP_CYCLE.guideline },
  min: COMP_CYCLE_LIMITS.guideline.min,
  max: COMP_CYCLE_LIMITS.guideline.max,
  step: 0.0025,
  format: 'pct',
}

const dateParam = (key: string, label: string, description: string): ParamDef => ({
  key,
  label,
  description,
  type: 'date',
  default: '',
})

/** The cycle's dates, on 'comp.merit.proposals'. Blank (the default) means not set. */
export const CYCLE_DATE_PARAMS: readonly ParamDef[] = [
  dateParam(
    COMP_CYCLE.openDate.key,
    'Cycle opens',
    'The day managers can start entering merit proposals. Before it, the cycle is not open and no proposal is missing yet.',
  ),
  dateParam(
    COMP_CYCLE.calibrationDate.key,
    'Calibration',
    'The day calibration of the proposals starts. Shown with the cycle dates on the Merit cycle tab.',
  ),
  dateParam(
    COMP_CYCLE.closeDate.key,
    'Cycle closes',
    'The day proposals are final. Compensation items are due on this date; without it they have no due date and say so.',
  ),
  dateParam(
    COMP_CYCLE.effectiveDate.key,
    'Increases take effect',
    'The day merit increases are paid from. Shown with the cycle dates on the Merit cycle tab.',
  ),
  dateParam(
    COMP_CYCLE.eligibleHiredBy.key,
    'Eligible if hired by',
    'People hired after this date are not eligible this cycle. Blank: the latest hire date among people with a merit proposal.',
  ),
]

/** The cycle's dates in force; null where not set. */
export interface CycleDates {
  open: ISODate | null
  calibration: ISODate | null
  close: ISODate | null
  effective: ISODate | null
  /** People hired after this are not eligible; null: Census works it out from the proposals. */
  eligibleHiredBy: ISODate | null
}

const dateIn = (m: Pick<MetricsApi, 'param' | 'paramDef'>, where: { metricId: string; key: string }) => {
  if (!m.paramDef(where.metricId, where.key)) return null
  const v = m.param<ParamValue>(where.metricId, where.key)
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/** The comp cycle's dates in force (Settings > Compensation cycle). */
export function cycleDatesOf(m: Pick<MetricsApi, 'param' | 'paramDef'>): CycleDates {
  return {
    open: dateIn(m, COMP_CYCLE.openDate),
    calibration: dateIn(m, COMP_CYCLE.calibrationDate),
    close: dateIn(m, COMP_CYCLE.closeDate),
    effective: dateIn(m, COMP_CYCLE.effectiveDate),
    eligibleHiredBy: dateIn(m, COMP_CYCLE.eligibleHiredBy),
  }
}

const POPULATION = 'Active employees with a comp record.'

/** Fallback entries for the three metrics that hold the cycle settings. */
export const COMP_CYCLE_METRICS: readonly MetricDef[] = [
  {
    id: COMP_CYCLE.healthyBand.metricId,
    name: 'In healthy band',
    views: ['comp'],
    definition: 'Share of people with a compa-ratio inside the healthy band, inclusive.',
    formula: 'people with compa-ratio in the band ÷ people with a compa-ratio',
    population: POPULATION,
    unit: 'pct',
    goodDirection: 'up',
    uses: ['comp.baseSalary', 'comp.rangeMid', 'comp.employeeId'],
    owner: 'Total rewards',
    params: [HEALTHY_BAND_PARAM],
  },
  {
    id: COMP_CYCLE.meritBudget.metricId,
    name: 'Merit spend',
    views: ['comp'],
    definition:
      'Proposed merit increases as a share of eligible base salary, both in USD, against the merit budget.',
    formula: 'Σ(base × merit %) ÷ Σ base, eligible people',
    population: 'People with a merit proposal.',
    unit: 'pct2',
    goodDirection: null,
    uses: ['comp.meritPct', 'comp.baseSalary', 'comp.fxToUsd'],
    owner: 'Total rewards',
    params: [MERIT_BUDGET_PARAM],
  },
  {
    id: COMP_CYCLE.guideline.metricId,
    name: 'Spend at guideline',
    views: ['comp'],
    definition:
      'What the merit guideline would cost: each rated proposal at the guideline for its rating, weighted by base salary in USD like the actual spend.',
    formula: 'Σ(base × guideline for rating) ÷ Σ base, rated proposals',
    population: 'People with a merit proposal and a rating.',
    unit: 'pct2',
    goodDirection: null,
    uses: ['comp.meritPct', 'comp.baseSalary', 'comp.fxToUsd', 'reviews.rating'],
    owner: 'Total rewards',
    params: [MERIT_GUIDELINE_PARAM],
  },
  {
    id: CYCLE_DATES_METRIC,
    name: 'Merit proposals',
    views: ['comp'],
    definition:
      'Eligible people with a merit proposal. Eligible means an active employee with a comp record hired on or before the cycle’s eligibility date.',
    formula: 'people with a merit % ÷ eligible people',
    population: POPULATION,
    unit: 'int',
    goodDirection: null,
    uses: ['comp.meritPct', 'comp.employeeId', 'employees.hireDate'],
    owner: 'Total rewards',
    params: CYCLE_DATE_PARAMS,
  },
]

/** The cycle settings in force, in the Settings shape. */
export function compCycleOf(m: Pick<MetricsApi, 'num' | 'range' | 'ratings'>): CompCycleSettings {
  const band = m.range(COMP_CYCLE.healthyBand.metricId, COMP_CYCLE.healthyBand.key)
  return {
    meritBudgetPct: m.num(COMP_CYCLE.meritBudget.metricId, COMP_CYCLE.meritBudget.key),
    healthyBand: [band[0], band[1]],
    guideline: { ...m.ratings(COMP_CYCLE.guideline.metricId, COMP_CYCLE.guideline.key) },
  }
}

const engineCache = new WeakMap<object, LegacyCycleSettings>()

/**
 * The cycle settings in force in the comp engine's shape (`CycleSettings`: meritBudget, bandLow,
 * bandHigh, guideline). One object per dictionary state, so models memoized on it stay put.
 */
export function cycleSettingsOf(m: Pick<MetricsApi, 'num' | 'range' | 'ratings'>): LegacyCycleSettings {
  let s = engineCache.get(m)
  if (!s) {
    const c = compCycleOf(m)
    s = {
      meritBudget: c.meritBudgetPct,
      bandLow: c.healthyBand[0],
      bandHigh: c.healthyBand[1],
      guideline: c.guideline,
    }
    engineCache.set(m, s)
  }
  return s
}

/** Edits that set the three cycle settings to `c` (from Settings, an old settings file, or migration). */
export function compCycleEdits(c: CompCycleSettings): MetricEdit[] {
  return [
    {
      metricId: COMP_CYCLE.meritBudget.metricId,
      field: paramField(COMP_CYCLE.meritBudget.key),
      value: c.meritBudgetPct,
    },
    {
      metricId: COMP_CYCLE.healthyBand.metricId,
      field: paramField(COMP_CYCLE.healthyBand.key),
      value: [c.healthyBand[0], c.healthyBand[1]],
    },
    {
      metricId: COMP_CYCLE.guideline.metricId,
      field: paramField(COMP_CYCLE.guideline.key),
      value: { ...c.guideline } satisfies RatingMap,
    },
  ]
}
