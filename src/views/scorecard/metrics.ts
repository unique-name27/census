/**
 * The People scorecard's metric dictionary entries (docs/METRICS.md), registered with
 * `defineMetrics('scorecard', [...])`.
 *
 * The scorecard shows other views' numbers: each practice's measures come from that view's
 * `summary(ctx)` and keep their own metric ids, targets and settings. What the scorecard adds is
 * how a measure is judged against its target (the watch margin), the folder-tab count of targets
 * met, its one finding about missed targets and how many findings the top list shows. Targets
 * themselves are edited on each measure's own entry in Metric definitions, never here.
 *
 * The catalog imports this file, so keep it to plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or
 * '@/metrics/testing'. The other views' `metrics.ts` files it reads are plain data too.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef } from '@/metrics/types'
import { metrics as comp } from '@/views/comp/metrics'
import { metrics as compliance } from '@/views/compliance/metrics'
import { metrics as hrbp } from '@/views/hrbp/metrics'
import { metrics as listening } from '@/views/listening/metrics'
import { metrics as onboarding } from '@/views/onboarding/metrics'
import { metrics as recruiting } from '@/views/recruiting/metrics'
import { metrics as services } from '@/views/services/metrics'
import { metrics as talent } from '@/views/talent/metrics'

/** Metric ids, by what the scorecard calls them. */
export const M = {
  /** How a measure is judged: Met, Watch or Missed against the target in force. */
  status: 'scorecard.measures.status',
  /** The watch margin: how close to target a miss still counts as Watch. */
  watch: 'scorecard.status.watch',
  /** The folder-tab headline: measures that meet their target, of those with one. */
  targetsMet: 'scorecard.measures.targetsMet',
  /** The scorecard's own finding when measures in several practices miss target. */
  missed: 'scorecard.findings.missedTargets',
  /** How many findings "Top findings across Census" lists. */
  top: 'scorecard.findings.top',
} as const

/** Setting keys, by the metric that holds them. */
export const P = {
  shareMargin: { metricId: M.watch, key: 'shareMargin' },
  relativeMargin: { metricId: M.watch, key: 'relativeMargin' },
  minPractices: { metricId: M.missed, key: 'minPractices' },
  limit: { metricId: M.top, key: 'limit' },
} as const

/** Today's defaults; the engine reads the values in force through `ctx.metrics`. */
export const DEFAULTS = {
  shareMargin: 0.05,
  relativeMargin: 0.1,
  minPractices: 2,
  limit: 8,
} as const

/**
 * The measures each practice is judged on, as the views' `summary(ctx)` return them (docs/VIEWS.md,
 * Scorecard). The scorecard reads whatever a summary returns; this list only gives the dictionary
 * the lineage of "Status against target" and "Targets met". A test keeps it in step with the views.
 */
export const MEASURE_IDS: readonly string[] = [
  'recruiting.reqs.timeToFill',
  'recruiting.offers.acceptance',
  'onboarding.plan.vsPlan',
  'onboarding.first90.dayOneReadiness',
  'onboarding.first90.i9Section2',
  'onboarding.first90.attrition90',
  'hrbp.attrition.voluntary',
  'hrbp.attrition.regretted',
  'hrbp.attrition.firstYear',
  'services.cases.resolutionSla',
  'services.tx.onTime',
  'services.levels.of05-final-pay',
  'talent.succession.criticalCoverage',
  'talent.learning.requiredOnTime',
  'talent.retention.keyTalent',
  'comp.compa.inBand',
  'comp.position.belowMin',
  'comp.merit.spend',
  'compliance.work.reverificationOnTime',
  'compliance.i9.section2OnTime',
  'compliance.export.withoutLicense',
  'listening.programs.responseRate',
  'listening.onboarding.readiness',
  'listening.exit.wouldReturn',
]

const MEASURE_DEFS: ReadonlyMap<string, MetricDef> = new Map(
  [recruiting, onboarding, hrbp, services, talent, comp, compliance, listening].flatMap((list) =>
    list.map((d) => [d.id, d] as const),
  ),
)

/** The fields the measures read, each once: the lineage of the scorecard's own numbers. */
export const MEASURE_USES: readonly FieldRef[] = [
  ...new Set(MEASURE_IDS.flatMap((id) => MEASURE_DEFS.get(id)?.uses ?? [])),
]

/** The registered measure, for tests and the targets list. */
export const measureDef = (id: string): MetricDef | undefined => MEASURE_DEFS.get(id)

const OWNER = 'People analytics'
const WINDOW = "Each measure's own window: the period picker, or a snapshot at the as-of date"

export const metrics: MetricDef[] = defineMetrics('scorecard', [
  {
    id: M.status,
    name: 'Status against target',
    definition:
      "Each practice's key measures judged against the target in force. Met when the value meets the target, Watch when it misses by less than the watch margin, Missed beyond it. A measure without a target shows No target.",
    formula: 'Met: value meets target · Watch: miss < watch margin · Missed: miss ≥ watch margin',
    population:
      "The two or three measures each practice is judged on, as the practice's own view computes them for the current scope.",
    window: WINDOW,
    unit: 'text',
    goodDirection: null,
    uses: MEASURE_USES,
    dependsOn: [M.watch],
    owner: OWNER,
  },
  {
    id: M.watch,
    name: 'Watch margin',
    definition:
      'How close to its target a measure that misses can be and still show Watch rather than Missed. Shares use a margin in points; other units use a share of the target.',
    formula: 'shares: target ± margin in pts · other units: target ± margin × |target|',
    population: 'Every measure on the People scorecard that has a target.',
    unit: 'pts',
    goodDirection: null,
    uses: [],
    kind: 'setting',
    owner: OWNER,
    params: [
      {
        key: P.shareMargin.key,
        label: 'Margin for shares',
        description:
          'A share (a rate or a percentage) that misses its target by less than this many points shows Watch.',
        type: 'percent',
        default: DEFAULTS.shareMargin,
        min: 0,
        max: 0.25,
        step: 0.005,
        format: 'pts',
      },
      {
        key: P.relativeMargin.key,
        label: 'Margin for other units',
        description:
          'Days, counts and scores that miss their target by less than this share of the target show Watch.',
        type: 'percent',
        default: DEFAULTS.relativeMargin,
        min: 0,
        max: 0.5,
        step: 0.01,
        format: 'pct',
      },
    ],
  },
  {
    id: M.targetsMet,
    name: 'Targets met',
    definition:
      'Measures on the People scorecard that meet their target, out of the measures that have a target and a value shown under the data standard.',
    formula: 'measures meeting target ÷ measures with a target and a value shown',
    population:
      'Measures hidden by the data standard, hidden to protect anonymity or without a target are left out of both counts.',
    window: WINDOW,
    unit: 'int',
    goodDirection: 'up',
    uses: MEASURE_USES,
    owner: OWNER,
  },
  {
    id: M.missed,
    name: 'Measures missing target',
    definition:
      'A finding when measures in several practices miss their target: how many miss, and the practices where most of them sit.',
    formula: 'measures with status Missed, by practice',
    population: 'Measures with a target and a value shown under the data standard.',
    window: WINDOW,
    unit: 'int',
    goodDirection: 'down',
    uses: MEASURE_USES,
    dependsOn: [M.watch],
    owner: OWNER,
    params: [
      {
        key: P.minPractices.key,
        label: 'Practices with a missed target',
        description: 'The finding shows when measures in at least this many practices miss their target.',
        type: 'number',
        default: DEFAULTS.minPractices,
        min: 1,
        max: 9,
        step: 1,
        format: 'int',
      },
    ],
  },
  {
    id: M.top,
    name: 'Top findings across Census',
    definition:
      "The most serious findings from every practice's readout: critical first, then watch. Within each, every practice's most serious finding comes before any practice's second, in folder-tab order.",
    formula: 'critical, then watch; one per practice per round, folder-tab order',
    population: "Findings each practice's readout shows under the data standard.",
    unit: 'int',
    goodDirection: null,
    uses: [],
    kind: 'setting',
    owner: OWNER,
    params: [
      {
        key: P.limit.key,
        label: 'Findings listed',
        description: 'How many findings the list on the People scorecard and the monthly report carry.',
        type: 'number',
        default: DEFAULTS.limit,
        min: 3,
        max: 20,
        step: 1,
        format: 'int',
      },
    ],
  },
])
