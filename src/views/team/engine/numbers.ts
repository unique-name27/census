/**
 * My team's key figures and readout (docs/ROLES.md 2.2): each tile is the producing view's own KPI
 * object, pointed at the tab that explains it, and the readout ranks People stats', Recruiting's,
 * Onboarding's and Talent's findings for the org the way the Scorecard ranks its top findings,
 * after Manager mode's hide lists. Pure.
 */
import type { Finding, Kpi, ViewLink } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { RouteView } from '@/data/store'
import { minGroupOf } from '@/metrics/privacy'
import { ID } from '@/views/hrbp/metrics'
import { type PracticeView, rankFindings, type SourcedFinding, sourced } from '@/views/scorecard/engine/model'
import { managerAnswers, type TeamSources } from './sources'

/** "People stats, Workforce": a view and tab as the tile's link names it. */
export type LabelOf = (view: RouteView, tab: string) => string

/** The tile, opening its own view's tab from My team (a tile's `tab` would open a tab of My team). */
export function relink(k: Kpi | undefined, view: RouteView, labelOf: LabelOf): Kpi[] {
  if (!k) return []
  if (k.link) return [k]
  const { tab, ...rest } = k
  const link: ViewLink = { view, tab: tab ?? '', label: labelOf(view, tab ?? '') }
  return [{ ...rest, link }]
}

const pick = (list: readonly Kpi[], id: string) => list.find((k) => k.id === id)

/** The tiles in My team's order (the items tile is added once the open items are collected). */
export const TEAM_TILES = [
  'headcount',
  'voluntary',
  'regretted',
  'open-reqs',
  'starts-30',
  'talent-training-on-time',
] as const

/**
 * Recruiting's open reqs tile reads "Upload Requisitions" when the scope has no reqs. With
 * requisitions loaded, an org without any has none open: 0, said plainly (nothing to open).
 */
function openReqsTile(k: Kpi | undefined, ctx: Pick<AnalyticsContext, 'all'> | undefined): Kpi | undefined {
  if (!k || k.value != null || !ctx?.all.requisitions.length) return k
  return {
    ...k,
    value: 0,
    delta: null,
    spark: undefined,
    note: 'No reqs in this org',
    drill: undefined,
    noteDrill: undefined,
  }
}

/**
 * Whether the org on screen has fewer employees than the anonymity minimum, so My team shows no
 * rate for it (ROLES.md 2.2): Manager mode's lock size, else the scope's headcount on the as-of
 * date. A producing view may gate a rate on its own population (Talent counts the people with
 * assignments due over the period, who can outnumber the org today); My team gates every org-level
 * rate on the people in the org.
 */
export function orgUnderMinimum(
  ctx: Pick<AnalyticsContext, 'access' | 'metrics'>,
  s: Pick<TeamSources, 'hrbp'>,
): boolean {
  const lock = ctx.access.mode === 'manager' ? ctx.access.lock : null
  return (lock ? lock.size : s.hrbp.kpi.headcount) < minGroupOf(ctx.metrics)
}

/** A rate tile for an org under the minimum: the value, its target, trend and records hidden. */
function hideRate(k: Kpi | undefined, small: boolean): Kpi | undefined {
  if (!k || !small) return k
  return {
    ...k,
    value: null,
    suppressed: true,
    delta: null,
    spark: undefined,
    drill: undefined,
    deltaDrill: undefined,
  }
}

/**
 * Headcount, voluntary and regretted attrition (against the company), open reqs, starts in the
 * next 30 days and required training on time, each the producing view's tile. With `small` (the
 * org is under the anonymity minimum) the training rate is hidden as the attrition rates are.
 * Where the mode hides regretted attrition (Manager: whether an exit was regretted is HR's call
 * about named leavers), the attrition tile, every exit, takes its place.
 */
export function teamKpis(
  s: TeamSources,
  labelOf: LabelOf,
  ctx?: Pick<AnalyticsContext, 'all'> & Partial<Pick<AnalyticsContext, 'access'>>,
  small = false,
): Kpi[] {
  const h = s.hrbp.kpi.kpis
  const regretted = !ctx?.access || ctx.access.can(`metric:${ID.regretted}`)
  return [
    ...relink(pick(h, 'headcount'), 'hrbp', labelOf),
    ...relink(hideRate(pick(h, 'voluntary'), small), 'hrbp', labelOf),
    ...relink(hideRate(pick(h, regretted ? 'regretted' : 'attrition'), small), 'hrbp', labelOf),
    ...relink(openReqsTile(pick(s.recruiting.kpis, 'open-reqs'), ctx), 'recruiting', labelOf),
    ...relink(pick(s.onboarding.kpis.upcoming, 'starts-30'), 'onboarding', labelOf),
    ...relink(hideRate(pick(s.talent.kpis, 'talent-training-on-time'), small), 'talent', labelOf),
  ]
}

/** A practice and the findings its readout shows for this scope. */
export interface PracticeFindings {
  view: PracticeView
  findings: readonly Finding[]
}

/** How many findings "What needs attention" lists. */
export const TEAM_FINDINGS = 6

const LISTED: readonly Finding['severity'][] = ['critical', 'warning', 'info']

/**
 * Up to six findings: critical first, then watch, then notes; within each, every practice's most
 * serious finding before any practice's second (the Scorecard's ranking). Findings whose metric
 * Manager mode hides are left out, and good news is not listed (the readout is what needs
 * attention).
 */
export function teamFindings(
  ctx: AnalyticsContext,
  practices: readonly PracticeFindings[],
  limit = TEAM_FINDINGS,
): SourcedFinding[] {
  const manager = managerAnswers(ctx)
  const groups = practices.map((p) =>
    sourced(
      p.view,
      p.findings.filter(
        (f) => LISTED.includes(f.severity) && (!f.metricId || manager.can(`metric:${f.metricId}`)),
      ),
    ),
  )
  return rankFindings(groups).slice(0, limit)
}

/** The four practices' findings in folder-tab order, from the models My team already holds. */
export function practiceFindings(
  s: TeamSources,
  views: Readonly<Record<'hrbp' | 'recruiting' | 'onboarding' | 'talent', PracticeView>>,
): PracticeFindings[] {
  return [
    { view: views.recruiting, findings: s.recruiting.findings },
    { view: views.onboarding, findings: s.onboarding.findings },
    { view: views.hrbp, findings: s.hrbp.findings },
    { view: views.talent, findings: s.talent.findings },
  ]
}
