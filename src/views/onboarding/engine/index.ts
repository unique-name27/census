/**
 * Onboarding engine: every number the view shows, as a pure function of the analytics context.
 * Results are cached per context object, so the three tabs, the folder tab, the People scorecard
 * and the Action center share one computation.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { addDays } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem, Headline, ViewSummary } from '../../types'
import { M } from '../metrics'
import { onboardingActions } from './actions'
import { type OnboardingBase, onboardingBase } from './base'
import { onboardingFindings } from './findings'
import { computeFirst90, type First90Model } from './first90'
import { computeForecast, type ForecastModel } from './forecast'
import { first90Kpis, planKpis, upcomingKpis, weeklyStarts } from './kpis'
import { UPCOMING } from './lineage'
import { computePlan, type PlanModel } from './plan'
import { computeUpcoming, type UpcomingModel } from './upcoming'

export interface OnboardingModel {
  base: OnboardingBase
  upcoming: UpcomingModel
  first90: First90Model
  /** Null when no requisitions are loaded. */
  forecast: ForecastModel | null
  /** Null when no hiring plan is loaded. */
  plan: PlanModel | null
  kpis: { upcoming: Kpi[]; first90: Kpi[]; plan: Kpi[] }
  findings: Finding[]
}

/** Something to show on Upcoming starts: pre-hires, or accepted offers with a start date. */
function hasStartData(ctx: AnalyticsContext, b: OnboardingBase): boolean {
  return b.upcoming.starts.length > 0 || ctx.all.candidates.some((c) => !!c.startDate)
}

export function computeOnboardingUncached(ctx: AnalyticsContext): OnboardingModel {
  const b = onboardingBase(ctx)
  const upcoming = computeUpcoming(b, ctx)
  const first90 = computeFirst90(b, ctx)
  const forecast = ctx.all.requisitions.length ? computeForecast(b, ctx) : null
  const plan = computePlan(b, ctx, forecast)
  return {
    base: b,
    upcoming,
    first90,
    forecast,
    plan,
    kpis: {
      upcoming: upcomingKpis(b, upcoming, hasStartData(ctx, b)),
      first90: first90Kpis(b, first90),
      plan: planKpis(b, plan, forecast),
    },
    findings: onboardingFindings(b, upcoming, first90, plan, ctx),
  }
}

const cache = new WeakMap<AnalyticsContext, OnboardingModel>()

export function computeOnboarding(ctx: AnalyticsContext): OnboardingModel {
  let m = cache.get(ctx)
  if (!m) {
    m = computeOnboardingUncached(ctx)
    cache.set(ctx, m)
  }
  return m
}

/** Folder tab: starts in the next 30 days, with weekly starts for the next 8 weeks. Cheap. */
export function headline(ctx: AnalyticsContext): Headline {
  const b = onboardingBase(ctx)
  const label = 'starts in 30 days'
  if (!hasStartData(ctx, b)) return { value: '—', label, metricId: M.starts, uses: UPCOMING }
  const end = addDays(b.asOf, 30)
  const n = b.upcoming.starts.filter((s) => s.startDate <= end).length
  return {
    value: fmt(n, 'int'),
    label,
    metricId: M.starts,
    spark: weeklyStarts(b.upcoming.starts, b.asOf, 8),
    uses: UPCOMING,
  }
}

/** For the People scorecard: day-one readiness, I-9 Section 2 on time, early voluntary attrition. */
export function summary(ctx: AnalyticsContext): ViewSummary {
  const m = computeOnboarding(ctx)
  const pick = (id: string) => m.kpis.first90.find((k) => k.id === id)
  return {
    kpis: [pick('day-one'), pick('i9'), pick('attrition-90')].filter((k): k is Kpi => !!k),
    findings: m.findings,
  }
}

/** For the Action center: starts not ready, probation decisions, I-9 Section 2. */
export function actions(ctx: AnalyticsContext): ActionItem[] {
  const m = computeOnboarding(ctx)
  return onboardingActions(m.base, m.upcoming, m.first90, m.base.starters)
}
