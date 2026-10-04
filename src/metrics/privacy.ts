/**
 * The privacy rules, as dictionary entries. Their wording and targets are locked. The anonymity
 * minimum can be raised, never lowered; pay amounts staying opt-in and the absence of protected
 * fields cannot be changed at all.
 *
 * Engines read the anonymity minimum with `minGroupOf(ctx.metrics)` (or
 * `ctx.metrics.num(ANONYMITY.metricId, ANONYMITY.key)`) instead of `MIN_GROUP`.
 */
import { MIN_GROUP } from '@/data/schema'
import type { MetricDef, MetricsApi, MetricView } from './types'

const DATA_VIEWS: readonly MetricView[] = ['recruiting', 'hrbp', 'org', 'services', 'talent', 'comp']

export const ANONYMITY = { metricId: 'privacy.anonymity', key: 'minGroup' } as const
export const PAY_AMOUNTS = { metricId: 'privacy.payAmounts', key: 'optIn' } as const
export const PROTECTED_FIELDS = { metricId: 'privacy.protectedFields', key: 'excluded' } as const

export const PRIVACY_METRICS: readonly MetricDef[] = [
  {
    id: ANONYMITY.metricId,
    name: 'Anonymity minimum',
    views: DATA_VIEWS,
    definition:
      'A rate or average over a group smaller than this is hidden and shows "—" with "Hidden to protect anonymity". Breakdown tables fold smaller groups into "Other".',
    population: 'People in the group the number describes.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: ANONYMITY.key,
        label: 'Smallest group shown',
        description:
          'Groups with fewer people than this are hidden. It can be raised, never lowered below 5.',
        type: 'number',
        default: MIN_GROUP,
        min: MIN_GROUP,
        max: 50,
        step: 1,
        format: 'int',
        locked: 'raiseOnly',
      },
    ],
  },
  {
    id: PAY_AMOUNTS.metricId,
    name: 'Pay amounts',
    views: DATA_VIEWS,
    definition:
      'Salary, range, market, equity and merit amounts show and export only while "Show pay amounts" is on, for one session. Ratios such as compa-ratio and merit % always show.',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: PAY_AMOUNTS.key,
        label: 'Pay amounts are opt-in',
        description:
          'Pay amounts stay hidden until someone switches them on for the session. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
  {
    id: PROTECTED_FIELDS.metricId,
    name: 'Protected fields',
    views: DATA_VIEWS,
    definition:
      'Census holds no gender, ethnicity, age or other protected-class fields, and none can be added or imported.',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: 'People analytics',
    locked: true,
    kind: 'rule',
    params: [
      {
        key: PROTECTED_FIELDS.key,
        label: 'Protected fields are excluded',
        description: 'Uploads never bring in protected-class fields. This rule is locked.',
        type: 'boolean',
        default: true,
        locked: true,
      },
    ],
  },
]

/** The anonymity minimum in force: 5, or higher when someone raised it. */
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number => m.num(ANONYMITY.metricId, ANONYMITY.key)
