/**
 * Why offers are declined (docs/ANALYSES.md, part 3): every number the analysis shows, as a pure
 * function of the analytics context. The shell computes it once per context through
 * `analysisModel(ctx, 'declines')`; nothing here feeds the Scorecard, `summary()`, the Action center
 * or Copy talking points.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Window } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { type RenegeCount, renegeCount } from '@/views/onboarding/engine/upcoming'
import { present } from '../../fields'
import type { AnalysisModel } from '../../types'
import { type AcceptanceRow, competingRows, type RangeRow, rangeRows } from './competing'
import { allCuts, type GroupRow } from './cuts'
import { declinesFindings } from './findings'
import { declinesKpis } from './kpis'
import { COMPETING_USES, CUT_USES, OFFER_USES, RANGE_USES, TIMING_USES } from './metrics'
import { type MixBenchmark, mixBenchmark } from './mix'
import { type DeclineCount, declineCount, type Offer, offerBooks } from './offers'
import { type ReasonRow, reasonRows, reasonsToLine, type ThemeRow, themeRows } from './reasons'
import { type DeclinesSettings, declinesSettings } from './settings'
import { type SurveyPart, surveyPart } from './survey'
import { type BucketRow, bucketRows, isFlat, medianDaysToDecide } from './timing'
import { COMPANY_SERIES, type QuarterRow, quarterRows } from './trend'

export interface TimingPart {
  rows: BucketRow[]
  /** Offers with the dates the buckets need. */
  measured: Offer[]
  /** The decline rate over the measured offers (the chart's rule). */
  overall: number | null
  /** No bucket is `gapPts` away from it: "No clear link in this period". */
  flat: boolean
}

/** Which optional columns hold data anywhere (company-wide, as the Data room reads them). */
export interface DeclinesHas {
  reasons: boolean
  finalInterview: boolean
  offerDate: boolean
  competing: boolean
  revised: boolean
  position: boolean
}

export interface DeclinesModel extends AnalysisModel {
  settings: DeclinesSettings
  window: Window
  prior: Window
  /** "the last 12 months", for sentences. */
  periodWords: string
  /** Offers resolved in the window, in scope; the prior window's; the company's. */
  offers: Offer[]
  priorOffers: Offer[]
  companyOffers: Offer[]
  count: DeclineCount
  priorCount: DeclineCount
  companyCount: DeclineCount
  mix: MixBenchmark
  /** The scope's expected rate from its location and level mix. */
  expected: number | null
  declined: Offer[]
  reasons: ReasonRow[]
  /** The named reasons that reach 80% of declines; empty when they don't. */
  toLine: ReasonRow[]
  themes: ThemeRow[]
  /** The scope's 8 quarters. */
  quarters: QuarterRow[]
  /** The company's 8 quarters, under an org filter only (the trend's second line). */
  companyQuarters: QuarterRow[]
  /** Every cut, long form. */
  groups: GroupRow[]
  toOffer: TimingPart
  toDecide: TimingPart
  decide: { declined: { days: number | null; n: number }; accepted: { days: number | null; n: number } }
  competing: AcceptanceRow[]
  /** Company offer acceptance in the window (the competing chart's rule). */
  companyAcceptance: number | null
  range: RangeRow[]
  survey: SurveyPart | null
  renege: RenegeCount
  has: DeclinesHas
  /** The fields each part reads. */
  uses: {
    offers: readonly FieldRef[]
    reasons: readonly FieldRef[]
    groups: readonly FieldRef[]
    timing: readonly FieldRef[]
    competing: readonly FieldRef[]
    range: readonly FieldRef[]
    renege: readonly FieldRef[]
  }
}

/** "the last 12 months", "the year to date", or the dates of a custom range. */
export function periodWords(ctx: Pick<AnalyticsContext, 'filters' | 'window'>): string {
  switch (ctx.filters.period) {
    case 't12m':
      return 'the last 12 months'
    case 't6m':
      return 'the last 6 months'
    case 't3m':
      return 'the last 3 months'
    case 'ytd':
      return 'the year to date'
    case 'lastQuarter':
      return 'the last full quarter'
    default:
      return `${formatDate(ctx.window.start)} to ${formatDate(ctx.window.end)}`
  }
}

/** Reneges: accepted offers later withdrawn (Onboarding's definition). */
export const RENEGE_USES: readonly FieldRef[] = [
  'candidates.status',
  'candidates.hiredDate',
  'candidates.rejectedDate',
  'candidates.reqId',
  'requisitions.reqId',
  'requisitions.location',
]

const uniq = (...lists: (readonly FieldRef[])[]): FieldRef[] => [...new Set(lists.flat())]

function timingPart(offers: readonly Offer[], kind: 'toOffer' | 'toDecide', s: DeclinesSettings): TimingPart {
  const { rows, measured } = bucketRows(offers, kind, s.minGroup)
  const c = declineCount(measured)
  const overall = c.resolved >= s.minGroup ? c.rate : null
  return { rows, measured, overall, flat: isFlat(rows, overall, s.gapPts) }
}

export function declinesModel(ctx: AnalyticsContext): DeclinesModel {
  const s = declinesSettings(ctx.metrics)
  const books = offerBooks(ctx)
  const offers = books.scope.resolved(ctx.window)
  const priorOffers = books.scope.resolved(ctx.prior)
  const companyOffers = books.company.resolved(ctx.window)
  const mix = mixBenchmark(companyOffers, s.minCell)
  const declined = offers.filter((o) => o.declined)
  const reasons = reasonRows(declined, undefined, s.minGroup)
  const quarters = quarterRows(books.scope, ctx.asOf, ctx.scopeLabel, s.minGroup)
  const companyQuarters = ctx.isCompany
    ? []
    : quarterRows(books.company, ctx.asOf, COMPANY_SERIES, s.minGroup)
  const has: DeclinesHas = {
    reasons: ctx.all.candidates.some((c) => c.status === 'Declined' && !!c.rejectionReason?.trim()),
    finalInterview: present(ctx, 'candidates.onsiteDate') || present(ctx, 'candidates.hmDate'),
    offerDate: present(ctx, 'candidates.offerDate'),
    competing: present(ctx, 'candidates.competingOffer'),
    revised: present(ctx, 'candidates.offerRevised'),
    position: present(ctx, 'candidates.offerPositionInRange'),
  }
  const companyCount = declineCount(companyOffers)
  const base = {
    settings: s,
    window: ctx.window,
    prior: ctx.prior,
    periodWords: periodWords(ctx),
    offers,
    priorOffers,
    companyOffers,
    count: declineCount(offers),
    priorCount: declineCount(priorOffers),
    companyCount,
    mix,
    expected: mix.expected(offers),
    declined,
    reasons,
    toLine: reasonsToLine(reasons),
    themes: themeRows(offers, s.minGroup),
    quarters,
    companyQuarters,
    groups: allCuts(offers, mix, s),
    toOffer: timingPart(offers, 'toOffer', s),
    toDecide: timingPart(offers, 'toDecide', s),
    decide: {
      declined: medianDaysToDecide(declined, s.minGroup),
      accepted: medianDaysToDecide(
        offers.filter((o) => !o.declined),
        s.minGroup,
      ),
    },
    competing: competingRows(offers, s.minGroup),
    companyAcceptance:
      companyCount.resolved >= s.minGroup && companyCount.rate != null ? 1 - companyCount.rate : null,
    range: rangeRows(offers, companyOffers, s.minGroup),
    survey: surveyPart(ctx, offers),
    renege: renegeCount(ctx.data.candidates, ctx.window),
    has,
    uses: {
      offers: OFFER_USES,
      reasons: OFFER_USES,
      groups: uniq(OFFER_USES, CUT_USES),
      timing: uniq(OFFER_USES, TIMING_USES),
      competing: uniq(OFFER_USES, COMPETING_USES),
      range: uniq(OFFER_USES, RANGE_USES),
      renege: RENEGE_USES,
    },
  }
  const parts = { ...base, kpis: [], findings: [] } as DeclinesModel
  parts.kpis = declinesKpis(ctx, parts)
  parts.findings = declinesFindings(ctx, parts)
  return parts
}
