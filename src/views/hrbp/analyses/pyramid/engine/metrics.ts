/**
 * The Level pyramid's metric dictionary entries (docs/ANALYSES.md, 5.3) and the settings its
 * engine reads through `ctx.metrics`. Appended to `ANALYSES_METRICS` (`../../metrics`), so they are
 * People stats metrics owned by People analytics. Plain data, like every view's metrics file:
 * never React, '@/data/context', '@/data/store' or the '@/metrics' barrel.
 *
 * The pyramid also reuses People stats' headcount (`hrbp.headcount.employees`, with its contractor
 * setting), median span and manager ratio, and the Org chart's wide and narrow span.
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { MetricInput } from '@/metrics/define'
import { ORG_METRIC } from '@/views/org/metrics'

/** The pyramid's own metric ids. */
export const PYRAMID_METRIC = {
  levelMix: 'hrbp.pyramid.levelMix',
  ratioBelow: 'hrbp.pyramid.ratioBelow',
  levelFlow: 'hrbp.pyramid.levelFlow',
  findings: 'hrbp.pyramid.findings',
} as const

/** Every setting the pyramid engine reads, by what it changes. */
export const PYRAMID_SET = {
  tolerance: { metricId: PYRAMID_METRIC.ratioBelow, key: 'tolerance' },
  bulgeGap: { metricId: PYRAMID_METRIC.findings, key: 'bulgeGap' },
  minLevel: { metricId: PYRAMID_METRIC.findings, key: 'minLevel' },
  thinRatio: { metricId: PYRAMID_METRIC.findings, key: 'thinRatio' },
  topHeavyGap: { metricId: PYRAMID_METRIC.findings, key: 'topHeavyGap' },
  minUnit: { metricId: PYRAMID_METRIC.findings, key: 'minUnit' },
} as const

const OWNER = 'People analytics'
const HEADCOUNT_ID = 'hrbp.headcount.employees'
const EMPLOYEES =
  'Employees only by default; contractors count too when "Count contractors in headcount" is on. Interns never count. People with no level are counted apart.'

/** Headcount by level today (5.2). */
export const LEVEL_USES: readonly FieldRef[] = [
  'employees.level',
  'employees.hireDate',
  'employees.terminationDate',
  'employees.employmentType',
]

/** Levels a year ago and the 12-month flow: the roster plus job history. */
export const FLOW_USES: readonly FieldRef[] = [
  ...LEVEL_USES,
  'jobChanges.changeType',
  'jobChanges.fromLevel',
  'jobChanges.toLevel',
  'jobChanges.effectiveDate',
  'jobChanges.employeeId',
  'employees.employeeId',
]

export const PYRAMID_METRICS: MetricInput[] = [
  {
    id: PYRAMID_METRIC.levelMix,
    name: 'Level mix',
    definition:
      'The share of employees in a band of levels on the as-of date. Entry is the lowest two individual levels, Career the next two and Senior the top two; Management holds the manager levels and Executive the executive levels. The change compares with the mix a year earlier, at the levels people held then.',
    formula: 'employees in the band ÷ employees with a level',
    population: EMPLOYEES,
    window: 'The as-of date, against 12 months earlier.',
    unit: 'pct',
    goodDirection: null,
    uses: [...LEVEL_USES, 'employees.businessUnit'],
    requires: ['employees.level'],
    dependsOn: [HEADCOUNT_ID],
    owner: OWNER,
  },
  {
    id: PYRAMID_METRIC.ratioBelow,
    name: 'Size against the level below',
    definition:
      'How many people a level holds for each person in the level below it, on the as-of date: each individual level against the one below, the second manager level against the first, and the executive levels together against the second manager level. On the individual track a level larger than the one below by more than the tolerance is an inverted step.',
    formula: 'headcount(level) ÷ headcount(level below)',
    population: `${EMPLOYEES} The ratio is hidden when the level below has fewer people than the anonymity minimum (5 by default).`,
    window: 'The as-of date.',
    unit: 'times',
    goodDirection: null,
    uses: LEVEL_USES,
    requires: ['employees.level'],
    dependsOn: [HEADCOUNT_ID],
    owner: OWNER,
    params: [
      {
        key: PYRAMID_SET.tolerance.key,
        label: 'Tolerance',
        description:
          'An individual level counts as an inverted step when it is larger than the level below by more than this share (1.25 times by default).',
        type: 'percent',
        default: 0.25,
        min: 0,
        max: 2,
        step: 0.05,
        format: 'pct',
      },
    ],
  },
  {
    id: PYRAMID_METRIC.levelFlow,
    name: 'How each level changed',
    definition:
      'What took each level from its headcount 12 months ago to today: people hired at the level, promoted into it, promoted out of it and leaving from it. Other changes are everything else that moved someone in or out of a level, such as demotions, level corrections and contractor conversions.',
    formula: 'a year ago + hired + promoted in − promoted out − left + other changes = today',
    population: `${EMPLOYEES} Levels at hire, at exit and a year ago are rebuilt from Job changes.`,
    window: 'The 12 months to the as-of date, whatever the period.',
    unit: 'int',
    goodDirection: null,
    uses: FLOW_USES,
    requires: ['employees.level', 'employees.terminationDate'],
    dependsOn: [HEADCOUNT_ID],
    owner: OWNER,
  },
  {
    id: PYRAMID_METRIC.findings,
    name: 'Pyramid readout',
    definition:
      'Flags a level that grew much faster than the workforce in a year (a bulge), an individual level well under the size of the level above it (a thin level), an individual level above the lowest three that is larger than the one below by more than the tolerance (an inverted step), a management level whose median span is at the Org chart’s narrow or wide span, and a business unit whose senior, management and executive share is well above the company’s.',
    formula:
      'bulge: growth(level) − growth(workforce) ≥ bulge gap, level ≥ smallest level; thin: headcount(level) ÷ headcount(level above) < thin ratio; top-heavy: senior and above share(unit) − share(company) ≥ gap, unit ≥ smallest unit',
    population: EMPLOYEES,
    window: 'The as-of date, against 12 months earlier.',
    unit: 'pct',
    goodDirection: null,
    uses: [...FLOW_USES, 'employees.businessUnit', 'employees.managerId'],
    // The inverted step reads the tolerance; the span rule reads the Org chart's wide and narrow span.
    dependsOn: [HEADCOUNT_ID, PYRAMID_METRIC.ratioBelow, ORG_METRIC.wideSpan, ORG_METRIC.narrowSpan],
    owner: OWNER,
    params: [
      {
        key: PYRAMID_SET.bulgeGap.key,
        label: 'Growth above the workforce for a bulge',
        description:
          'A level is a bulge when it grew at least this many points faster than the whole workforce in 12 months.',
        type: 'percent',
        default: 0.1,
        min: 0.01,
        max: 2,
        step: 0.01,
        format: 'pct',
      },
      {
        key: PYRAMID_SET.minLevel.key,
        label: 'Smallest level for a bulge',
        description: 'Levels with fewer people than this today are never called a bulge.',
        type: 'number',
        default: 20,
        min: 5,
        max: 1000,
        step: 1,
        format: 'int',
      },
      {
        key: PYRAMID_SET.thinRatio.key,
        label: 'Thin against the level above',
        description: 'An individual level is thin when it holds less than this share of the level above it.',
        type: 'percent',
        default: 0.5,
        min: 0.05,
        max: 1,
        step: 0.05,
        format: 'pct',
      },
      {
        key: PYRAMID_SET.topHeavyGap.key,
        label: 'Senior share above the company for a top-heavy unit',
        description:
          'A business unit is top-heavy when its share of senior, management and executive levels is at least this many points above the company’s.',
        type: 'percent',
        default: 0.08,
        min: 0.01,
        max: 1,
        step: 0.01,
        format: 'pct',
      },
      {
        key: PYRAMID_SET.minUnit.key,
        label: 'Smallest business unit',
        description: 'Business units with fewer employees than this are never called top-heavy.',
        type: 'number',
        default: 50,
        min: 5,
        max: 10000,
        step: 1,
        format: 'int',
      },
    ],
  },
]
