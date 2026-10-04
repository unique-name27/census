/**
 * The Return to work survey's headline from Listening (docs/VIEWS.md, Listening > Elsewhere):
 * one number on the Leave & return tab that links to the full results there.
 *
 * Listening exports `surveyHeadline(ctx, survey)` from `src/views/listening/api.ts`. That module
 * is optional here: it is loaded through a glob, so HR ops builds and runs before Listening ships
 * it (no headline, "not available yet") and picks it up when it does. Kept out of `compute`, so
 * the HR ops engine reads only its own settings; the tab calls it beside the model.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { SurveyType } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import type { Format } from '@/lib/format'

/** What Listening's `surveyHeadline` returns (VIEWS.md contract). */
export interface SurveyHeadline {
  value: number | null
  format: Format
  label: string
  metricId: string
  uses: readonly FieldRef[]
  drill: DrillSource
}

type SurveyHeadlineFn = (ctx: AnalyticsContext, survey: SurveyType) => SurveyHeadline | null

interface ListeningApi {
  surveyHeadline?: SurveyHeadlineFn
}

const MODULES = import.meta.glob<ListeningApi>('../../listening/api.ts', { eager: true })

/** Listening's headline function, when the module exists and exports it. */
export function listeningHeadline(): SurveyHeadlineFn | null {
  for (const mod of Object.values(MODULES))
    if (typeof mod?.surveyHeadline === 'function') return mod.surveyHeadline
  return null
}

export const RETURN_SURVEY: SurveyType = 'Return to work'

/**
 * The Return to work headline, or null when Listening has no API yet, no data for the survey,
 * or the call fails (logged; the tab still renders).
 */
export function returnSurvey(
  ctx: AnalyticsContext,
  fn: SurveyHeadlineFn | null = listeningHeadline(),
): SurveyHeadline | null {
  if (!fn) return null
  try {
    return fn(ctx, RETURN_SURVEY) ?? null
  } catch (err) {
    console.error('The Return to work survey headline could not be computed', err)
    return null
  }
}
