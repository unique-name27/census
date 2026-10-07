/**
 * Data quality rules as dictionary entries (Data room): the silver fill threshold, the allowed
 * problem rate, the control-total tolerance and the freshness limit of each dataset. Their
 * defaults are the constants in `src/data/quality/rules.ts`; the analytics context hands the
 * values in force to the quality index through `qualityRulesOf(ctx.metrics)`.
 */
import {
  DEFAULT_FRESH_DAYS,
  DEFAULT_QUALITY_RULES,
  DEFAULT_TOLERANCE,
  FRESHNESS,
  MAX_PROBLEM_SHARE,
  MIN_COVERAGE,
  type QualityRules,
  SNAPSHOT_FRESHNESS,
} from '@/data/quality/rules'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import type { MetricDef, MetricsApi, ParamDef } from './types'

export const QUALITY_RULES = {
  fill: { metricId: 'quality.rules.fill', key: 'minCoverage' },
  problems: { metricId: 'quality.rules.problemRate', key: 'maxProblemShare' },
  tolerance: { metricId: 'quality.rules.controlTolerance', key: 'tolerance' },
  /** One setting per dataset, keyed by the dataset key ('employees'). */
  freshness: { metricId: 'quality.rules.freshness' },
} as const

/** Datasets with a freshness limit, in schema order. */
const FRESH_KEYS: readonly DatasetKey[] = DATASET_KEYS.filter((k) => DEFAULT_FRESH_DAYS[k] != null)

function freshParam(key: DatasetKey): ParamDef {
  const what = FRESHNESS[key]?.what ?? SNAPSHOT_FRESHNESS[key]?.what ?? 'record'
  const snapshot = !FRESHNESS[key] && !!SNAPSHOT_FRESHNESS[key]
  return {
    key,
    label: datasetDef(key).label,
    description: snapshot
      ? `Gold needs the ${what} taken within this many days of the as-of date.`
      : `Gold needs the latest ${what} dated within this many days of the as-of date.`,
    type: 'days',
    default: DEFAULT_FRESH_DAYS[key] as number,
    min: 1,
    max: 1095,
    step: 1,
  }
}

const OWNER = 'People analytics'
/** The rules judge the version of each dataset loaded now. */
const LOADED = 'The version of each dataset loaded now, as of its load.'

export const QUALITY_METRICS: readonly MetricDef[] = [
  {
    id: QUALITY_RULES.fill.metricId,
    name: 'Silver fill threshold',
    views: ['data'],
    definition:
      'A field is silver or better only when it is filled for at least this share of the rows it applies to. Below it, the field is bronze, and so is every number that uses it.',
    formula: 'filled rows ÷ rows the field applies to',
    population: 'Rows the field applies to; for example, termination type applies to leavers only.',
    window: LOADED,
    unit: 'pct',
    goodDirection: null,
    uses: [],
    kind: 'rule',
    owner: OWNER,
    params: [
      {
        key: QUALITY_RULES.fill.key,
        label: 'Fill threshold',
        description: 'The share of applicable rows a field must have filled to count as silver.',
        type: 'percent',
        default: MIN_COVERAGE,
        min: 0.5,
        max: 1,
        step: 0.005,
        format: 'pct',
      },
    ],
  },
  {
    id: QUALITY_RULES.problems.metricId,
    name: 'Allowed problem rate',
    views: ['data'],
    definition:
      'The most problems silver allows: values not recognized or defaulted in a field, rows with an import error in a dataset, and rows whose references to other data do not resolve.',
    formula: 'problem rows ÷ rows checked',
    population:
      'For a field, the rows it applies to; for a dataset, every row loaded, each counted once however many problems it has.',
    window: LOADED,
    unit: 'pct',
    goodDirection: null,
    uses: [],
    kind: 'rule',
    owner: OWNER,
    params: [
      {
        key: QUALITY_RULES.problems.key,
        label: 'Allowed problem rate',
        description: 'Above this share of problem rows, a field or dataset stays bronze.',
        type: 'percent',
        default: MAX_PROBLEM_SHARE,
        min: 0,
        max: 0.25,
        step: 0.005,
        format: 'pct',
      },
    ],
  },
  {
    id: QUALITY_RULES.tolerance.metricId,
    name: 'Control total tolerance',
    views: ['data'],
    definition:
      'How far a certified dataset may differ from a control total, such as headcount per the HRIS report, and still reconcile. A total that states its own tolerance keeps it.',
    formula: '|actual − expected| ≤ tolerance × |expected|',
    population: 'Certified datasets with a control total.',
    window: LOADED,
    unit: 'pct2',
    goodDirection: null,
    uses: [],
    kind: 'rule',
    owner: OWNER,
    params: [
      {
        key: QUALITY_RULES.tolerance.key,
        label: 'Tolerance',
        description: 'Used for new control totals and for any total that does not state its own.',
        type: 'percent',
        default: DEFAULT_TOLERANCE,
        min: 0,
        max: 0.05,
        step: 0.0005,
        format: 'pct2',
      },
    ],
  },
  {
    id: QUALITY_RULES.freshness.metricId,
    name: 'Freshness limits',
    views: ['data'],
    definition:
      'Gold needs current data: the latest event in the rows, such as a hire, an application or a case, dated within a set number of days of the as-of date. Compensation has no event dates, so the date its pay extract was taken is used.',
    formula: 'as-of date − latest event date ≤ limit',
    population: 'The rows of each loaded dataset that carry an event date (Compensation: the extract date).',
    window: 'The as-of date, against the latest event in the version loaded.',
    unit: 'days',
    goodDirection: null,
    uses: [],
    kind: 'rule',
    owner: OWNER,
    params: FRESH_KEYS.map(freshParam),
  },
]

/* ───────────── the rules in force ───────────── */

const byApi = new WeakMap<object, QualityRules>()
const bySignature = new Map<string, QualityRules>()
const SIGNATURE_CACHE = 32

const signature = (r: QualityRules): string =>
  JSON.stringify([r.minCoverage, r.maxProblemShare, r.tolerance, FRESH_KEYS.map((k) => r.freshDays[k])])

const DEFAULT_SIGNATURE = signature(DEFAULT_QUALITY_RULES)

/**
 * The quality rules the dictionary holds. The same values always give the same object (the
 * defaults give `DEFAULT_QUALITY_RULES`), so the quality index is only rebuilt when a rule changes.
 */
export function qualityRulesOf(m: Pick<MetricsApi, 'num'>): QualityRules {
  const hit = byApi.get(m)
  if (hit) return hit
  const freshDays: Partial<Record<DatasetKey, number>> = {}
  for (const k of FRESH_KEYS) freshDays[k] = m.num(QUALITY_RULES.freshness.metricId, k)
  const rules: QualityRules = {
    minCoverage: m.num(QUALITY_RULES.fill.metricId, QUALITY_RULES.fill.key),
    maxProblemShare: m.num(QUALITY_RULES.problems.metricId, QUALITY_RULES.problems.key),
    tolerance: m.num(QUALITY_RULES.tolerance.metricId, QUALITY_RULES.tolerance.key),
    freshDays,
  }
  const sig = signature(rules)
  let out = sig === DEFAULT_SIGNATURE ? DEFAULT_QUALITY_RULES : bySignature.get(sig)
  if (!out) {
    out = rules
    bySignature.set(sig, out)
    if (bySignature.size > SIGNATURE_CACHE) bySignature.delete(bySignature.keys().next().value as string)
  }
  byApi.set(m, out)
  return out
}
