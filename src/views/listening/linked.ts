/**
 * The one linked survey number other views show (docs/ROADMAP.md Part 3, "Each survey's key
 * result also appears in the view it belongs to"; docs/VIEWS.md, Listening > Elsewhere): where
 * each one sits, and the words and export row of `<LinkedSurvey>`. Pure: no React.
 *
 * The number is `surveyHeadline(ctx, survey)` from ./api, so it is the same figure Listening
 * shows for the latest wave, and it opens grouped results only, never one person's answers.
 */
import type { AnalyticsContext } from '@/data/context'
import { type SurveyType, surveyProgramOf, type ViewKey } from '@/data/schema'
import { fmt, fmtDelta } from '@/lib/format'
import { targetText } from '@/metrics/overrides'
import { surveyMinimumsOf } from '@/metrics/privacy'
import type { MetricDef, MetricTarget } from '@/metrics/types'
import { type SurveyHeadline, surveyHeadline } from './api'
import { listeningSettings, STATUS_WORD } from './engine/settings'

/**
 * Where a survey's number shows outside Listening, from `SURVEY_PROGRAMS[].alsoIn`: Recruiting
 * (candidate experience, hiring manager satisfaction), Onboarding (the day-30 and day-90 pulses),
 * People stats (exit survey, manager feedback), HR ops (HR service survey, return to work) and
 * Talent (stay interviews, training evaluation). Engagement has no home outside Listening.
 */
export function linkedSpots(): { survey: SurveyType; view: ViewKey; tab: string }[] {
  return [...surveyProgramOf.values()].flatMap((p) =>
    p.alsoIn ? [{ survey: p.survey, view: p.alsoIn.view, tab: p.alsoIn.tab }] : [],
  )
}

/**
 * Fewest respondents the linked number needs: the survey's own minimum (the anonymity minimum,
 * or more), and for a survey about managers (manager feedback) outside the whole company the
 * manager-cut minimum too, 10 by default. A leader or department filter can narrow People stats
 * to one manager's team, and the number would then be that manager's result.
 */
export function linkedMinimum(
  ctx: Pick<AnalyticsContext, 'metrics' | 'isCompany'>,
  survey: SurveyType,
): number {
  const own = listeningSettings(ctx.metrics).minOf[survey]
  if (ctx.isCompany || !surveyProgramOf.get(survey)?.managerCuts) return own
  return Math.max(own, surveyMinimumsOf(ctx.metrics).minManager)
}

/**
 * `surveyHeadline` as another view shows it: hidden below `linkedMinimum`, and for a manager
 * survey in a narrowed scope without the change since the wave before (the earlier wave may be a
 * smaller cut of the same manager).
 */
export function linkedHeadline(ctx: AnalyticsContext, survey: SurveyType): SurveyHeadline | null {
  const h = surveyHeadline(ctx, survey)
  if (!h || ctx.isCompany || !surveyProgramOf.get(survey)?.managerCuts) return h
  if (h.respondents < linkedMinimum(ctx, survey))
    return { ...h, value: null, suppressed: true, change: null, status: 'none', drill: null }
  return { ...h, change: null }
}

/** "Sent after each interview stage and after a decline": when the survey goes out. */
export function sentWhen(survey: SurveyType): string {
  const when = surveyProgramOf.get(survey)?.when
  return when ? `Sent ${when.charAt(0).toLowerCase()}${when.slice(1)}` : ''
}

/** The unit under the number: NPS runs from −100 to 100, the other headlines are 1-5 means. */
export function scaleText(h: Pick<SurveyHeadline, 'format'>): string {
  return h.format === 'int' ? 'Net promoter score, −100 to 100' : 'Mean score on a 1 to 5 scale'
}

/** "At least 20": the target in words, or null without one. */
export function targetWords(def: Pick<MetricDef, 'unit'> | undefined, t: MetricTarget | null): string | null {
  return def && t ? targetText(def, t) : null
}

/** "+3", "−0.12": the change since the wave before, or null when either wave is hidden or missing. */
export function changeText(h: Pick<SurveyHeadline, 'change' | 'format' | 'suppressed'>): string | null {
  return h.suppressed || h.change == null ? null : fmtDelta(h.change, h.format)
}

/** The figure's one row, as the table and every export carry it. */
export interface LinkedSurveyRow {
  survey: SurveyType
  measure: string
  wave: string
  value: number | null
  target: number | null
  status: string
  priorWave: string
  change: number | null
  respondents: number | null
}

/**
 * A hidden headline exports no value, change or respondent count: below the minimum nothing about
 * the group is shown.
 */
export function linkedSurveyRow(h: SurveyHeadline): LinkedSurveyRow {
  const hidden = h.suppressed || h.value == null
  return {
    survey: h.survey,
    measure: h.name,
    wave: h.wave ?? '—',
    value: hidden ? null : h.value,
    target: h.target,
    status: h.suppressed ? 'Hidden' : h.value == null ? '—' : STATUS_WORD[h.status],
    priorWave: h.priorWave ?? '—',
    change: hidden ? null : h.change,
    respondents: h.suppressed ? null : h.respondents,
  }
}

/** "Candidate NPS is −4 in 2026 Q3", for the accessible name of the number. */
export function headlineSentence(h: SurveyHeadline): string {
  if (h.suppressed || h.value == null) return `${h.name}: hidden to protect anonymity`
  return `${h.name} is ${fmt(h.value, h.format)}${h.wave ? ` in ${h.wave}` : ''}`
}
