/**
 * Talent engine entry point: one pure function of the analytics context that the view memoizes,
 * and the cheap folder-tab headline.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Datasets, ISODate } from '@/data/schema'
import { fmt } from '@/lib/format'
import type { Headline } from '../../types'
import { buildBase, type FieldCoverage, type TalentBase } from './base'
import { buildFindings } from './findings'
import { buildKpis } from './kpis'
import { computeLearning, type LearningResult } from './learning'
import { computeNineBox, type NineBoxResult } from './ninebox'
import { computePerformance, type PerformanceResult } from './performance'
import { computeOverdue, type OverdueResult } from './promotion'
import { computeRetention, type RetentionResult } from './retention'
import { buildRiskModel, type RiskModel } from './risk'
import { computeSuccession, criticalCoverage, type SuccessionResult } from './succession'

export interface TalentModel {
  asOf: ISODate
  has: FieldCoverage
  /** Scoped employees active at the as-of date. */
  activeCount: number
  performance: PerformanceResult
  nineBox: NineBoxResult
  succession: SuccessionResult
  risk: RiskModel
  retention: RetentionResult
  overdue: OverdueResult
  learning: LearningResult
  kpis: Kpi[]
  findings: Finding[]
}

/**
 * The flight-risk model scores the whole company, so it only depends on the unscoped data and the
 * as-of date. Cache it per dataset object so changing a filter doesn't rebuild it.
 */
const riskCache = new WeakMap<Datasets, Map<ISODate, RiskModel>>()

function riskFor(base: TalentBase): RiskModel {
  const { ctx, asOf } = base
  let byDate = riskCache.get(ctx.all)
  if (!byDate) {
    byDate = new Map()
    riskCache.set(ctx.all, byDate)
  }
  let model = byDate.get(asOf)
  if (!model) {
    model = buildRiskModel(
      {
        employees: ctx.all.employees,
        jobs: base.jobs,
        reviews: base.reviews,
        comp: ctx.all.comp,
        has: base.has,
      },
      asOf,
    )
    byDate.set(asOf, model)
  }
  return model
}

export function computeTalent(ctx: AnalyticsContext): TalentModel {
  const base = buildBase(ctx)
  const risk = riskFor(base)
  const performance = computePerformance(base)
  const nineBox = computeNineBox(base, risk.scores)
  const succession = computeSuccession(base, risk.scores)
  const retention = computeRetention(base, risk)
  const overdue = computeOverdue(base, risk.scores)
  const learning = computeLearning(base)
  const inputs = { base, performance, succession, retention, overdue, learning, risk }
  return {
    asOf: ctx.asOf,
    has: base.has,
    activeCount: base.active.length,
    performance,
    nineBox,
    succession,
    risk,
    retention,
    overdue,
    learning,
    kpis: buildKpis(inputs),
    findings: buildFindings(inputs),
  }
}

/** Folder-tab headline: share of Critical roles with a Ready-now successor. */
export function talentHeadline(ctx: AnalyticsContext): Headline {
  const { covered, critical } = criticalCoverage({ ctx, byId: ctx.org.byId, asOf: ctx.asOf })
  return {
    value: critical ? fmt(covered / critical, 'pct0') : '—',
    label: 'critical roles covered',
  }
}
