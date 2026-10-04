/**
 * Which metric dictionary entry each KPI tile, figure and readout rule of the Recruiting view
 * shows. The tile or finding carries it as `metricId`, the Figure as `metric`, so popovers,
 * definitions and the dictionary page read one registry entry (`../metrics.ts`).
 */
import { type RecruitingMetricId, RM } from '../metrics'
import type { KPI_USES, RecruitingFigureId } from './lineage'

export const KPI_METRICS = {
  'open-reqs': RM.openReqs,
  hires: RM.offersAccepted,
  'time-to-fill': RM.timeToFill,
  'time-to-hire': RM.timeToHire,
  'offer-acceptance': RM.offerAcceptance,
  'lacking-next-step': RM.lackingNextStep,
} as const satisfies Record<keyof typeof KPI_USES, RecruitingMetricId>

export const FIGURE_METRICS = {
  // Overview
  'recruiting-pipeline-today': RM.activeCandidates,
  'recruiting-hires-by-month': RM.offersAccepted,
  'recruiting-offer-acceptance-quarter': RM.offerAcceptance,
  'recruiting-open-reqs-department': RM.openReqs,
  'recruiting-time-to-fill-level': RM.timeToFill,
  // Pipeline
  'recruiting-candidate-flow': RM.candidateFlow,
  'recruiting-action-queue': RM.lackingNextStep,
  'recruiting-stage-conversion': RM.passRate,
  'recruiting-waiting-time': RM.daysWaiting,
  'recruiting-speed-heatmap': RM.stepDaysByMonth,
  // Requisitions
  'recruiting-open-requisitions': RM.emptyFunnel,
  'recruiting-open-req-age': RM.reqAge,
  'recruiting-reqs-opened-filled': RM.openedFilled,
  'recruiting-time-to-fill-department': RM.timeToFill,
  'recruiting-recruiter-load': RM.recruiterLoad,
  // Sources & offers
  'recruiting-source-effectiveness': RM.sourceHireRate,
  'recruiting-applications-source-month': RM.sourceApplications,
  'recruiting-offer-acceptance-location': RM.acceptanceByLocation,
  'recruiting-decline-reasons': RM.declineReasons,
  'recruiting-exit-reasons': RM.exitReasons,
} as const satisfies Record<RecruitingFigureId, RecruitingMetricId>

/**
 * Other metrics a figure shows beside its own: a column of a table, or a rule that marks bars
 * amber. Its definitions explain each, from the dictionary entry or the setting in force.
 */
export const FIGURE_ALSO_METRICS = {
  'recruiting-pipeline-today': [RM.lackingNextStep],
  'recruiting-stage-conversion': [RM.daysToNextStage],
  'recruiting-time-to-fill-department': [RM.slowFill],
  'recruiting-open-reqs-department': [RM.reqAge],
} as const satisfies Partial<Record<RecruitingFigureId, readonly RecruitingMetricId[]>>

/** Readout rules, by finding id. */
export const FINDING_METRICS = {
  'rec-data-join': RM.reqMatch,
  'rec-bottleneck': RM.bottleneck,
  'rec-lacking-next-step': RM.lackingNextStep,
  'rec-offer-acceptance': RM.acceptanceDrop,
  'rec-offers-waiting': RM.offersWaiting,
  'rec-empty-funnel': RM.emptyFunnel,
  'rec-time-to-fill': RM.slowFill,
  'rec-source-drying-up': RM.sourceDryingUp,
  'rec-withdrawals': RM.withdrawals,
  'rec-best-source': RM.bestSource,
} as const satisfies Record<string, RecruitingMetricId>

export type RecruitingFindingId = keyof typeof FINDING_METRICS
