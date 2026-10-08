/**
 * Offer declines in the metric dictionary (docs/ANALYSES.md, 3.4): the decline rate and its parts,
 * with the calculation settings the engine reads through `ctx.metrics`. People stats registers them
 * beside its own (`../../metrics` appends `DECLINES_METRICS` to `ANALYSES_METRICS`), owner People
 * analytics. Each one depends on Recruiting's offer acceptance: the offers counted are the same.
 *
 * Reused, not copied: the reasons Pareto shows `recruiting.offers.declineReasons` and the reneges
 * tile `onboarding.upcoming.renegeRate` (both list 'hrbp' in their views), so each number means the
 * same thing on every tab.
 *
 * Plain data: never React, '@/data/context', '@/data/store' or the '@/metrics' barrel, and nothing
 * from `../../metrics` (that module imports this one).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import type { MetricDef, ParamDef } from '@/metrics/types'

/** The ids Offer declines shows, its own and the ones it reuses. */
export const DM = {
  rate: 'hrbp.declines.rate',
  count: 'hrbp.declines.count',
  expected: 'hrbp.declines.expected',
  timing: 'hrbp.declines.timing',
  competing: 'hrbp.declines.competing',
  rangePosition: 'hrbp.declines.rangePosition',
  findings: 'hrbp.declines.findings',
  /* reused */
  reasons: 'recruiting.offers.declineReasons',
  renege: 'onboarding.upcoming.renegeRate',
  acceptance: 'recruiting.offers.acceptance',
} as const

/** Every setting the engine reads, by the metric that holds it. */
export const DSET = {
  minPersonOffers: { metricId: DM.rate, key: 'minPersonOffers' },
  minCell: { metricId: DM.expected, key: 'minCell' },
  rangeGap: { metricId: DM.rangePosition, key: 'rangeGap' },
  risePts: { metricId: DM.findings, key: 'risePts' },
  gapPts: { metricId: DM.findings, key: 'gapPts' },
  slowDecisionDays: { metricId: DM.findings, key: 'slowDecisionDays' },
  minResolved: { metricId: DM.findings, key: 'minResolved' },
} as const

/* ───────── lineage ───────── */

/** Offers resolved in the window, in scope through their requisition (3.4). */
export const OFFER_USES: readonly FieldRef[] = [
  'candidates.status',
  'candidates.offerDate',
  'candidates.hiredDate',
  'candidates.rejectedDate',
  'candidates.rejectionReason',
  'candidates.reqId',
  'requisitions.reqId',
  'requisitions.location',
  'requisitions.level',
  'requisitions.businessUnit',
]
/** The cuts that are not the requisition's place and level. */
export const CUT_USES: readonly FieldRef[] = [
  'candidates.source',
  'candidates.recruiter',
  'requisitions.hiringManager',
]
/** Days from the final interview to the offer, and from the offer to the decision. */
export const TIMING_USES: readonly FieldRef[] = ['candidates.onsiteDate', 'candidates.hmDate']
export const COMPETING_USES: readonly FieldRef[] = ['candidates.competingOffer', 'candidates.offerRevised']
export const RANGE_USES: readonly FieldRef[] = ['candidates.offerPositionInRange']

const OWNER = 'People analytics'
const PERIOD = 'The period picker (default last 12 months).'
const OFFERS =
  'Offers accepted (by offer accepted date) or declined (by decline date) in the window, in scope through their requisition. Reneges are not declines. Rates over fewer offers than the anonymity minimum are hidden.'
const DEPENDS = [DM.acceptance]

const num = (
  key: string,
  label: string,
  description: string,
  value: number,
  o: { min: number; max: number; step?: number; format?: ParamDef['format'] },
): ParamDef => ({
  key,
  label,
  description,
  type: 'number',
  default: value,
  min: o.min,
  max: o.max,
  step: o.step ?? 1,
  format: o.format ?? 'int',
})

const pts = (key: string, label: string, description: string, value: number): ParamDef => ({
  key,
  label,
  description,
  type: 'percent',
  default: value,
  min: 0.01,
  max: 0.5,
  step: 0.01,
  format: 'pts',
})

export const DECLINES_METRICS: MetricDef[] = defineMetrics('hrbp', [
  {
    id: DM.rate,
    name: 'Decline rate',
    definition:
      'The share of offers resolved in the period that the candidate declined: one minus offer acceptance, on the same offers Recruiting counts.',
    formula: 'declined ÷ (accepted + declined), offers resolved in the window',
    population: `${OFFERS} A recruiter or hiring manager is shown on their own only with enough resolved offers.`,
    window: `${PERIOD} The trend covers the 8 quarters to the as-of date.`,
    unit: 'pct',
    goodDirection: 'down',
    uses: [...OFFER_USES, ...CUT_USES],
    requires: ['candidates.status', 'candidates.reqId'],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      num(
        DSET.minPersonOffers.key,
        'Offers to show a recruiter or hiring manager',
        'A recruiter or hiring manager with fewer resolved offers folds into "Other recruiters" or "Other hiring managers". It can be lowered to the anonymity minimum and no further.',
        10,
        { min: 5, max: 200 },
      ),
    ],
  },
  {
    id: DM.count,
    name: 'Declined offers',
    definition: 'Offers the candidate declined, counted on the decline date.',
    formula: 'count of declined offers resolved in the window',
    population: OFFERS,
    window: PERIOD,
    unit: 'int',
    goodDirection: 'down',
    uses: OFFER_USES,
    requires: ['candidates.status', 'candidates.rejectedDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: DM.expected,
    name: 'Expected from location and level',
    definition:
      'The decline rate a group would have if each of its offers were declined as often as the company’s offers in the same location and level band. A bar near its expected rate is the market; a bar well past it is the group.',
    formula:
      'mean over the group’s offers of the company decline rate in the offer’s cell: location and level band (levels up to L4, the two senior levels, M1 to E3), else location, else the company',
    population:
      'Company offers resolved in the window, so a filter never changes the benchmark. A cell needs enough resolved offers, else the next coarser cell is used. A cut by location leaves location out of the cells, and a cut by level leaves the level band out.',
    window: PERIOD,
    unit: 'pct',
    goodDirection: null,
    uses: OFFER_USES,
    requires: ['candidates.status', 'candidates.reqId'],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      num(
        DSET.minCell.key,
        'Offers in a cell',
        'A location and level cell needs at least this many company offers to set the expected rate; with fewer, the location alone is used, then the company.',
        5,
        { min: 5, max: 200 },
      ),
    ],
  },
  {
    id: DM.timing,
    name: 'Decline rate by time to offer and to decide',
    definition:
      'The decline rate of offers grouped by the days from the final interview to the offer, and by the days from the offer to the candidate’s decision.',
    formula:
      'declined ÷ resolved per bucket; days to offer = offer date − final interview (onsite date, else hiring manager date); days to decide = accepted or declined date − offer date',
    population: `${OFFERS} Offers without the dates a bucket needs are left out of it.`,
    window: PERIOD,
    unit: 'pct',
    goodDirection: null,
    uses: [...OFFER_USES, ...TIMING_USES],
    requires: ['candidates.status', 'candidates.offerDate'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: DM.competing,
    name: 'Acceptance with a competing offer',
    definition:
      'How often candidates who told us they held another offer accepted ours, apart for offers we revised and offers we did not.',
    formula: 'accepted ÷ resolved, offers with a competing offer',
    population: `${OFFERS} A blank Competing offer counts as no competing offer recorded.`,
    window: PERIOD,
    unit: 'pct',
    goodDirection: 'up',
    uses: [...OFFER_USES, ...COMPETING_USES],
    requires: ['candidates.status', 'candidates.competingOffer'],
    dependsOn: DEPENDS,
    owner: OWNER,
  },
  {
    id: DM.rangePosition,
    name: 'Offer position in range',
    definition:
      'Where offers sat in the role’s pay range, 0 at the minimum and 1 at the maximum: the median for declined offers and for accepted ones. A ratio, never an amount.',
    formula: 'median position in range, by outcome',
    population: `${OFFERS} Each outcome needs at least the anonymity minimum of offers with a position.`,
    window: PERIOD,
    unit: 'ratio',
    goodDirection: null,
    uses: [...OFFER_USES, ...RANGE_USES],
    requires: ['candidates.status', 'candidates.offerPositionInRange'],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      num(
        DSET.rangeGap.key,
        'Gap in the range to flag',
        'The readout flags a location whose declined offers sat at least this far below its accepted offers in the range.',
        0.15,
        { min: 0.05, max: 1, step: 0.01, format: 'ratio' },
      ),
    ],
  },
  {
    id: DM.findings,
    name: 'Offer declines readout',
    definition:
      'The readout of Offer declines: declines rising in the latest quarter, the few reasons behind most declines, a group well above its expected rate, revised offers against competing ones, declined offers low in the range, and slow decisions.',
    formula:
      'latest quarter − mean of the 4 quarters before ≥ rise to flag; group rate − expected ≥ gap to flag; rate after the decision window − rate within it ≥ gap to flag',
    population: OFFERS,
    window: `${PERIOD} The rise compares the latest quarter with the four quarters before it.`,
    unit: 'pts',
    goodDirection: 'down',
    uses: [...OFFER_USES, ...CUT_USES, ...TIMING_USES, ...COMPETING_USES, ...RANGE_USES],
    dependsOn: DEPENDS,
    owner: OWNER,
    params: [
      pts(
        DSET.risePts.key,
        'Rise to flag',
        'How far the latest quarter’s decline rate must be above the mean of the four quarters before it to flag.',
        0.1,
      ),
      pts(
        DSET.gapPts.key,
        'Gap to flag',
        'How far a group must be above its expected rate, or slow decisions above quick ones, to flag. Also marks the bars of the decline rate by group chart.',
        0.1,
      ),
      {
        key: DSET.slowDecisionDays.key,
        label: 'Days to decide before an offer counts as slow',
        description: 'Offers decided after more than this many days count as slow decisions.',
        type: 'days',
        default: 7,
        min: 1,
        max: 60,
        step: 1,
      },
      num(
        DSET.minResolved.key,
        'Fewest resolved offers',
        'A quarter or a group needs at least this many resolved offers before the readout flags it.',
        20,
        { min: 5, max: 1000 },
      ),
    ],
  },
])
