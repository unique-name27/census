/**
 * What candidates who declined told us (docs/ANALYSES.md, 3.6.8): the candidate experience survey's
 * NPS for respondents whose offer was declined against those who accepted, and the decline reasons
 * the survey's respondents chose beside the reasons recorded in the ATS. Every survey number is a
 * grouped count of distinct respondents and shows only at the survey's minimum (`linkedMinimum`);
 * it opens grouped results (`surveyGroups`), never an answer or a person. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { readDeclineReason } from '@/data/lists'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { SurveyResponse } from '@/data/schema'
import { windowLine } from '@/drill/subtitle'
import type { DrillSpec } from '@/drill/types'
import { aggregate } from '@/lib/surveys'
import { declineCut } from '@/views/listening/engine/cuts'
import { groupsDrill, rowsBy } from '@/views/listening/engine/drills'
import { linkedMinimum } from '@/views/listening/linked'
import type { Offer } from './offers'

export const CANDIDATE_SURVEY = 'Candidate experience' as const

export const SURVEY_USES: readonly FieldRef[] = [
  'surveyResponses.survey',
  'surveyResponses.wave',
  'surveyResponses.responseDate',
  'surveyResponses.respondentKey',
  'surveyResponses.score',
  'surveyResponses.scale',
  'surveyResponses.reason',
  'candidates.applicationId',
  'candidates.status',
]

export const SURVEY_OUTCOMES = ['Declined the offer', 'Accepted the offer'] as const
export type SurveyOutcome = (typeof SURVEY_OUTCOMES)[number]

export interface SurveyNpsRow {
  part: 'Candidate NPS'
  group: SurveyOutcome
  /** Null under the survey minimum. */
  nps: number | null
  respondents: number
  suppressed: boolean
}

export interface SurveyReasonRow {
  part: 'Decline reason'
  reason: string
  /** Respondents who chose it in the survey; null while the survey's decliners are under the minimum. */
  survey: number | null
  /** Declined offers with the reason in the ATS, in the same scope and period. */
  ats: number
  atsOffers: Offer[]
}

export interface SurveyPart {
  min: number
  nps: SurveyNpsRow[]
  reasons: SurveyReasonRow[]
  /** Survey respondents who chose a decline reason. */
  decliners: number
  reasonsSuppressed: boolean
  /** Distinct respondents behind the NPS rows. */
  respondents: number
  npsDrill: (row: SurveyNpsRow) => DrillSpec<'surveyGroups'> | null
  reasonDrill: (row: SurveyReasonRow) => DrillSpec<'surveyGroups'> | null
}

/** The survey part, or null when no candidate experience answers are loaded at all. */
export function surveyPart(ctx: AnalyticsContext, offers: readonly Offer[]): SurveyPart | null {
  if (!ctx.all.surveyResponses.some((r) => r.survey === CANDIDATE_SURVEY)) return null
  const min = linkedMinimum(ctx, CANDIDATE_SURVEY)
  const w = ctx.window
  const answers = ctx.data.surveyResponses.filter(
    (r) => r.survey === CANDIDATE_SURVEY && r.responseDate >= w.start && r.responseDate <= w.end,
  )
  const outcomeOf = new Map<string, SurveyOutcome>()
  for (const o of offers) outcomeOf.set(o.app.id, o.declined ? 'Declined the offer' : 'Accepted the offer')
  const ten = answers.filter((r) => r.scale === '0-10' && outcomeOf.has(r.respondentKey))
  const key = (r: SurveyResponse) => outcomeOf.get(r.respondentKey) ?? null
  const nps: SurveyNpsRow[] = SURVEY_OUTCOMES.map((group) => {
    const a = aggregate(
      ten.filter((r) => key(r) === group),
      { min },
    )
    return {
      part: 'Candidate NPS',
      group,
      nps: a.suppressed ? null : a.nps,
      respondents: a.respondents,
      suppressed: a.suppressed,
    }
  })
  const subtitle = windowLine(w, ctx.scopeLabel, 'Candidate experience survey')
  const cut = declineCut(answers, min)
  // Survey reasons read onto the Offer decline reasons list, so they line up with the ATS.
  const listed = (raw: string) => readDeclineReason(raw, ctx.offerDeclineReasons)?.reason ?? raw
  const atsBy = new Map<string, Offer[]>()
  for (const o of offers)
    if (o.declined && o.reason) {
      const arr = atsBy.get(o.reason.reason)
      if (arr) arr.push(o)
      else atsBy.set(o.reason.reason, [o])
    }
  const surveyBy = new Map<string, number>()
  for (const r of cut.rows) surveyBy.set(listed(r.reason), (surveyBy.get(listed(r.reason)) ?? 0) + r.count)
  const names = [...new Set([...surveyBy.keys(), ...atsBy.keys()])]
  const reasons: SurveyReasonRow[] = names
    .map((reason) => ({
      part: 'Decline reason' as const,
      reason,
      survey: cut.suppressed ? null : (surveyBy.get(reason) ?? 0),
      ats: atsBy.get(reason)?.length ?? 0,
      atsOffers: atsBy.get(reason) ?? [],
    }))
    .sort((a, b) => (b.survey ?? 0) - (a.survey ?? 0) || b.ats - a.ats || a.reason.localeCompare(b.reason))
  const withReason = answers.filter((r) => !!r.reason?.trim())
  return {
    min,
    nps,
    reasons,
    decliners: cut.total,
    reasonsSuppressed: cut.suppressed,
    respondents: new Set(ten.map((r) => r.respondentKey)).size,
    npsDrill: (row) =>
      row.suppressed
        ? null
        : groupsDrill(
            rowsBy(
              ten.filter((r) => key(r) === row.group),
              key,
              { survey: CANDIDATE_SURVEY, wave: null, groupBy: 'Offer outcome', min },
            ),
            {
              survey: CANDIDATE_SURVEY,
              wave: null,
              title: `Candidate NPS: ${row.group.toLowerCase()}`,
              subtitle,
              min,
              uses: SURVEY_USES,
            },
          ),
    reasonDrill: (row) =>
      cut.suppressed || !row.survey
        ? null
        : groupsDrill(
            rowsBy(
              withReason.filter((r) => listed(r.reason?.trim() ?? '') === row.reason),
              (r) => listed(r.reason?.trim() ?? ''),
              { survey: CANDIDATE_SURVEY, wave: null, groupBy: 'Decline reason', min },
            ),
            {
              survey: CANDIDATE_SURVEY,
              wave: null,
              title: `Survey decline reason: ${row.reason.toLowerCase()}`,
              subtitle,
              min,
              uses: SURVEY_USES,
            },
          ),
  }
}
