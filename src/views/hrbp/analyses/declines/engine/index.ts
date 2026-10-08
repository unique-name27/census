/**
 * Why offers are declined (docs/ANALYSES.md, part 3): its definition for the Special analyses
 * shell. The model is `./model` (`declinesModel`); the figures are `../ui/Panel`.
 *
 * Read a declined offer's reason with `readDeclineReason(c.rejectionReason, ctx.offerDeclineReasons)`
 * (`@/data/lists`): the reason on the Offer decline reasons list and its theme, or the text as
 * written under Other when it is not recognized.
 */
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { loaded, present } from '../../fields'
import type { AnalysisDef, Missing, Readiness } from '../../types'
import { DECLINES_FIGURES as F } from './ids'
import { DM } from './metrics'
import { type DeclinesModel, declinesModel } from './model'

export function declinesReady(ctx: AnalyticsContext): Readiness {
  if (!loaded(ctx, 'candidates') || !loaded(ctx, 'requisitions'))
    return {
      ready: false,
      message: 'Upload Candidates and Requisitions to see why offers are declined.',
      dataRoom: true,
    }
  if (!ctx.all.candidates.some((c) => c.status === 'Declined'))
    return {
      ready: false,
      message: "No declined offers in the data, so declines can't be measured.",
      dataRoom: false,
    }
  return { ready: true }
}

const OFFER_FIELDS = [
  ['competingOffer', 'Competing offer', [F.competing]],
  ['offerRevised', 'Offer revised', [F.competing]],
  ['offerPositionInRange', 'Offer position in range', [F.rangePosition]],
] as const

export function declinesMissing(ctx: AnalyticsContext): Missing[] {
  const out: Missing[] = []
  const declined = ctx.all.candidates.filter((c) => c.status === 'Declined')
  if (declined.length && !declined.some((c) => !!c.rejectionReason?.trim()))
    out.push({
      id: 'rejectionReason',
      what: 'Rejection reason',
      message: 'Add Rejection reason to Candidates to see why offers were declined.',
      refs: ['candidates.rejectionReason'],
      figures: [F.reasons, F.nextSteps],
    })
  if (!present(ctx, 'candidates.onsiteDate') && !present(ctx, 'candidates.hmDate'))
    out.push({
      id: 'finalInterview',
      what: 'Onsite date or Hiring manager date',
      message: 'Add Onsite date or Hiring manager date to Candidates to see this.',
      refs: ['candidates.onsiteDate', 'candidates.hmDate'],
      figures: [F.interviewToOffer],
    })
  for (const [key, label, figures] of OFFER_FIELDS)
    if (!present(ctx, `candidates.${key}`))
      out.push({
        id: key,
        what: label,
        message: `Add ${label} to Candidates to see this.`,
        refs: [`candidates.${key}`],
        figures,
      })
  return out
}

export type { DeclinesModel } from './model'

export const DECLINES: AnalysisDef<DeclinesModel> = {
  key: 'declines',
  label: 'Offer declines',
  short: 'Declines',
  title: 'Why offers are declined',
  dek: (ctx) =>
    `How often are offers declined, where, and why? Offers resolved in ${ctx.window.label}; the trend covers 8 quarters.`,
  // The period picked; the quarterly trend keeps its own 8 quarters (its subtitle says so).
  window: (ctx) => ({
    start: ctx.window.start,
    end: ctx.window.end,
    label: `Offers resolved ${formatDate(ctx.window.start)} to ${formatDate(ctx.window.end)}`,
    ignoresPeriod: false,
  }),
  leadMetric: DM.reasons,
  leadFigure: F.reasons,
  figures: Object.values(F),
  ready: declinesReady,
  missing: declinesMissing,
  model: declinesModel,
}
