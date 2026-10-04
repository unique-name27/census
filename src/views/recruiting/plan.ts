/**
 * Recruiting's "Hires vs plan" tile (docs/ROADMAP.md Part 1, "Avoid duplicates"): the Onboarding
 * engine's own plan number (`hiresVsPlan` in src/views/onboarding/api.ts), so the tile and
 * Onboarding > Hiring plan always say the same thing, and a click opens that tab.
 *
 * Kept out of the Recruiting engine on purpose: the Onboarding forecast imports the Recruiting
 * engine (an import back would be a cycle), and the engine reads only Recruiting's own settings.
 * The Overview strip and the Scorecard summary both read the tile from here. Pure: no React.
 */
import type { Kpi, ViewLink } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { VIEW_LABEL } from '@/data/schema'
import { hiresVsPlan } from '../onboarding/api'
import { M as ONBOARDING } from '../onboarding/metrics'
import { computeRecruiting } from './engine'

export const HIRES_VS_PLAN = 'hires-vs-plan'

/** The tab the tile opens. */
export const PLAN_LINK: ViewLink = {
  view: 'onboarding',
  tab: 'plan',
  label: `${VIEW_LABEL.onboarding}, Hiring plan`,
}

/**
 * Starts to date against the Hiring plan, as Onboarding counts them. Without a plan the tile still
 * shows, as "—" with how to fill it, and opens the Hiring plan tab (its empty state has the
 * template).
 */
export function hiresVsPlanKpi(ctx: AnalyticsContext): Kpi {
  const h = hiresVsPlan(ctx)
  if (h) return { ...h.kpi, id: HIRES_VS_PLAN, link: PLAN_LINK }
  const metricId = ONBOARDING.vsPlan
  return {
    id: HIRES_VS_PLAN,
    metricId,
    label: 'Hires vs plan',
    value: null,
    format: 'pct',
    goodDirection: null,
    note: 'Upload a Hiring plan to see this',
    uses: ctx.metrics.def(metricId)?.uses ?? [],
    link: PLAN_LINK,
  }
}

/** The Overview strip: the Recruiting engine's tiles, then Hires vs plan. */
export function overviewKpis(ctx: AnalyticsContext): Kpi[] {
  return [...computeRecruiting(ctx).kpis, hiresVsPlanKpi(ctx)]
}
