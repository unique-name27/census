/**
 * What other views read from Onboarding, without rendering it (pure, no React).
 *
 * `hiresVsPlan(ctx)`: starts against the hiring plan, plan year to date, for Recruiting's
 * "Hires vs plan" tile. Null when no plan is loaded. The tile carries no `tab` (a tab is opened in
 * the view that shows it); link it with `goTo('onboarding', 'plan')`.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { onboardingBase } from './engine/base'
import { employeesDrill, planDrill, planYtdSub } from './engine/drills'
import { ACTUAL, PLAN, PLAN_REQ, union } from './engine/lineage'
import { computePlan, type PlanStatus } from './engine/plan'
import { M } from './metrics'

export interface HiresVsPlan {
  /** Starts to date ÷ planned starts to date. */
  value: number | null
  actual: number
  planned: number
  status: PlanStatus | null
  version: string | null
  metricId: string
  /** A tile ready for a KPI strip; it opens Onboarding > Hiring plan. */
  kpi: Kpi
}

const cache = new WeakMap<AnalyticsContext, HiresVsPlan | null>()

export function hiresVsPlan(ctx: AnalyticsContext): HiresVsPlan | null {
  if (cache.has(ctx)) return cache.get(ctx) ?? null
  const b = onboardingBase(ctx)
  const p = computePlan(b, ctx, null)
  let out: HiresVsPlan | null = null
  if (p) {
    const uses = union(PLAN, ACTUAL)
    const ytd = p.views.filter((v) => v.line.period <= p.toDate)
    out = {
      value: p.vsPlan,
      actual: p.actual.length,
      planned: p.planYtd,
      status: p.status,
      version: p.version,
      metricId: M.vsPlan,
      kpi: {
        id: 'hires-vs-plan',
        metricId: M.vsPlan,
        label: 'Hires vs plan',
        value: p.vsPlan,
        format: 'pct',
        goodDirection: null,
        note: `${fmt(p.actual.length, 'int')} of ${fmt(p.planYtd, 'int')} planned to date${p.status ? ` · ${p.status}` : ''}`,
        drill: () =>
          employeesDrill(b, p.actual, `Starts since ${formatDate(p.start)}`, {
            subtitle: planYtdSub(b, p),
            uses,
          }),
        noteDrill: () => planDrill(b, ytd, 'Planned starts to date', { uses: union(PLAN, PLAN_REQ) }),
        uses,
      },
    }
  }
  cache.set(ctx, out)
  return out
}
