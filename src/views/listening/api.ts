/**
 * One linked survey number for the views a survey belongs to (docs/VIEWS.md, Listening,
 * Elsewhere): Recruiting shows candidate NPS, Onboarding the day-30 pulse, People stats the exit
 * survey and upward feedback, HR ops the HR service and return to work surveys, Talent the stay
 * interviews and training evaluations. The number links to its Listening tab instead of copying
 * the charts.
 *
 * ```ts
 * import { surveyHeadline, surveyKpi } from '@/views/listening/api'
 * const h = surveyHeadline(ctx, 'Candidate experience')
 * // { value: 6.4, format: 'int', label: 'Candidate NPS, 2026 Q3', metricId, uses, drill, tab: 'candidates', … }
 * goTo('listening', h.tab)        // or <a href={h.href}>
 * const tile = surveyKpi(ctx, 'Exit survey') // a ready KPI tile (no `tab`: it opens Listening by link)
 * ```
 *
 * Pure and cheap (the answers are prepared once per context); null when the survey has no
 * answers in scope, or for Engagement while the engagement surveys switch is off. The value is
 * the latest wave's headline (NPS for candidate experience and engagement, else the mean on 1-5)
 * and is null with `suppressed` when that wave has fewer respondents than the minimum.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { SurveyType } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import { formatRange } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { type AreaTab, programOf } from './engine/catalog'
import { answersDrill } from './engine/drills'
import * as L from './engine/lineage'
import { headlineOf, inWave, marginOf, wavesUpTo } from './engine/measures'
import { answersOf, prepare } from './engine/prepare'
import { listeningSettingsFor, managerScoped, type Status, statusOf } from './engine/settings'
import { scoreMetric } from './metrics'

export interface SurveyHeadline {
  survey: SurveyType
  /** NPS (-100 to 100) or a mean on 1-5; null when hidden or empty. */
  value: number | null
  format: Format
  /** "Candidate NPS, 2026 Q3". */
  label: string
  /** The measure without the wave: "Candidate NPS". */
  name: string
  wave: string | null
  /** Distinct respondents behind the value. */
  respondents: number
  /** Fewer respondents than the minimum: the value is null. */
  suppressed: boolean
  target: number | null
  status: Status
  /** Change since the wave before; null when either wave is hidden or missing. */
  change: number | null
  priorWave: string | null
  /** The metric dictionary entry (`listening.score.<key>`). */
  metricId: string
  uses: FieldRef[]
  view: 'listening'
  /** The Listening tab the survey lives on. */
  tab: AreaTab
  /** '#listening.<tab>' for a plain link. */
  href: string
  /** The latest wave by driver: grouped counts and scores, never one person's answers. */
  drill: DrillSource
}

export function surveyHeadline(ctx: AnalyticsContext, survey: SurveyType): SurveyHeadline | null {
  const program = programOf.get(survey)
  if (!program) return null
  if (survey === 'Engagement' && !ctx.features.engagementSurveys) return null
  const p = prepare(ctx)
  const all = answersOf(p, survey)
  if (!all.length) return null
  // A survey about managers in a narrowed scope needs the manager-cut minimum and drops the change.
  const s = listeningSettingsFor(ctx)
  const min = s.minOf[survey]
  const waves = wavesUpTo(all, survey, ctx.asOf)
  const latest = waves.at(-1) ?? null
  const prior = waves.at(-2) ?? null
  const rows = inWave(all, latest)
  const h = headlineOf(rows, program.headline, min)
  const before =
    prior && !managerScoped(ctx, survey) ? headlineOf(inWave(all, prior), program.headline, min) : null
  const target = s.targetOf[survey]
  const uses = [
    ...L.union(
      L.ANSWER,
      L.ITEM,
      L.when(p.hasDriverColumn, ['surveyResponses.driver']),
      L.when(p.hasItems, L.ITEMS_DRIVER),
    ),
  ]
  return {
    survey,
    value: h.value,
    format: program.headline === 'nps' ? 'int' : 'num2',
    label: latest ? `${program.name}, ${latest.wave}` : program.name,
    name: program.name,
    wave: latest?.wave ?? null,
    respondents: h.respondents,
    suppressed: h.suppressed,
    target: target?.value ?? null,
    status: statusOf(h.value, target, marginOf(program.headline, s)),
    change: h.value != null && before?.value != null ? h.value - before.value : null,
    priorWave: prior?.wave ?? null,
    metricId: scoreMetric(program),
    uses,
    view: 'listening',
    tab: program.tab,
    href: `#listening.${program.tab}`,
    drill: () =>
      answersDrill(rows, {
        survey,
        wave: latest?.wave ?? null,
        title: `${program.name}, ${latest?.wave ?? 'latest wave'}, by driver`,
        subtitle: `${latest ? formatRange(latest.start, latest.end) : ''} · ${ctx.scopeLabel}`,
        min,
        uses,
      }),
  }
}

/**
 * The headline as a KPI tile for another view's strip. It carries no `tab` (a tile's tab opens a
 * tab of the view it sits in); link to Listening with `surveyHeadline(...).href` beside it.
 */
export function surveyKpi(
  ctx: AnalyticsContext,
  survey: SurveyType,
  opts: { id?: string; label?: string } = {},
): Kpi | null {
  const h = surveyHeadline(ctx, survey)
  if (!h) return null
  return {
    id: opts.id ?? `survey-${h.metricId.split('.').at(-1)}`,
    metricId: h.metricId,
    label: opts.label ?? h.name,
    value: h.value,
    format: h.format,
    delta: h.change,
    deltaLabel: h.priorWave ? `vs ${h.priorWave}` : undefined,
    goodDirection: 'up',
    suppressed: h.suppressed,
    note: h.wave ? `${h.wave} · ${h.respondents} respondents · Listening` : 'Listening',
    uses: h.uses,
    drill: h.drill,
  }
}
