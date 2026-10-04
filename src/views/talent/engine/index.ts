/**
 * Talent engine entry point: one pure function of the analytics context that the view memoizes,
 * and the cheap folder-tab headline.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { BELOW_STANDARD_TEXT, meetsStandard } from '@/data/quality'
import type { Datasets, ISODate } from '@/data/schema'
import { fmt } from '@/lib/format'
import type { Headline } from '../../types'
import { buildBase, type FieldCoverage, type TalentBase } from './base'
import { buildDrills, type TalentDrills } from './drills'
import { tagFindings } from './drillUses'
import { buildFindings } from './findings'
import { buildKpis } from './kpis'
import { computeLearning, type LearningResult } from './learning'
import { buildLineage, HEADLINE_USES, type Refs, riskUses, type TalentFigureId } from './lineage'
import { computeNineBox, type NineBoxResult } from './ninebox'
import { computePerformance, type PerformanceResult } from './performance'
import { computeOverdue, type OverdueResult } from './promotion'
import { computeRetention, type RetentionResult } from './retention'
import { buildRiskModel, type RiskModel, type RiskSettings, riskSettingsKey } from './risk'
import { TALENT_METRIC, type TalentSettings } from './settings'
import { computeSuccession, criticalCoverage, type SuccessionResult } from './succession'

export interface TalentModel {
  asOf: ISODate
  has: FieldCoverage
  /** The calculation settings in force (from the metric dictionary), for wording that follows them. */
  settings: TalentSettings
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
  /** The records behind every number, opened on click. */
  drill: TalentDrills
  /** The dataset fields behind each Figure, by figure id (KPIs and findings carry their own). */
  uses: Record<TalentFigureId, Refs>
  /**
   * The flight-risk band meets the data standard, so the 9-box draws its high-risk overlay. Below
   * it the overlay is left out (and said so) rather than hiding the whole 9-box.
   */
  riskOverlay: boolean
  /** "Not yet confirmed for production": why an overlay below the standard is left out. */
  belowStandard: string
}

const TALENT_DATASETS = ['reviews', 'succession', 'learning', 'employees', 'jobChanges', 'comp'] as const

/**
 * The flight-risk model scores the whole company, so it only depends on the unscoped data, the
 * as-of date and its settings (band shares, high rating, anonymity minimum). Cache it per dataset
 * object so changing a filter doesn't rebuild it.
 */
const riskCache = new WeakMap<Datasets, Map<string, RiskModel>>()
const RISK_CACHE_SIZE = 12

/** Fields the flight-risk model reads, today and at past dates, per model. */
const riskUsesCache = new WeakMap<RiskModel, { risk: Refs; riskHistory: Refs }>()

function riskLineage(model: RiskModel, all: Datasets): { risk: Refs; riskHistory: Refs } {
  let u = riskUsesCache.get(model)
  if (!u) {
    u = {
      risk: riskUses(model, all, { today: true }),
      riskHistory: riskUses(model, all, { today: false }),
    }
    riskUsesCache.set(model, u)
  }
  return u
}

/** The flight-risk model's settings, from the dictionary values on the base. */
export const riskSettingsOf = (s: TalentSettings): RiskSettings => ({
  bands: { high: s.highBand, medium: s.mediumBand },
  highRating: s.highRating,
  minGroup: s.minGroup,
  rates: s.rates,
})

function riskFor(base: TalentBase): RiskModel {
  const { ctx, asOf } = base
  const settings = riskSettingsOf(base.settings)
  let byKey = riskCache.get(ctx.all)
  if (!byKey) {
    byKey = new Map()
    riskCache.set(ctx.all, byKey)
  }
  const key = `${asOf}|${riskSettingsKey(settings)}`
  let model = byKey.get(key)
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
      settings,
    )
    byKey.set(key, model)
    // Keep the few most recent (as-of dates and settings being tried), not every one ever built.
    while (byKey.size > RISK_CACHE_SIZE) byKey.delete(byKey.keys().next().value!)
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
  const drill = buildDrills({ base, performance, nineBox, succession, retention, overdue, learning, risk })
  const riskRefs = riskLineage(risk, ctx.all)
  const riskOverlay =
    ctx.standard === 'bronze' ||
    meetsStandard(ctx.quality.tierOf(riskRefs.risk, TALENT_DATASETS), ctx.standard)
  const lineage = buildLineage({ has: base.has, ...riskRefs, riskOverlay })
  const inputs = { base, performance, succession, retention, overdue, learning, risk, drill, lineage }
  return {
    asOf: ctx.asOf,
    has: base.has,
    settings: base.settings,
    activeCount: base.active.length,
    performance,
    nineBox,
    succession,
    risk,
    retention,
    overdue,
    learning,
    kpis: buildKpis(inputs),
    findings: tagFindings(buildFindings(inputs)),
    drill,
    uses: lineage.figure,
    riskOverlay,
    belowStandard: BELOW_STANDARD_TEXT[ctx.standard],
  }
}

const modelCache = new WeakMap<AnalyticsContext, TalentModel>()

/** The model for an analytics context, built once per context (the view, the Scorecard and the Action center share it). */
export function talentModel(ctx: AnalyticsContext): TalentModel {
  let m = modelCache.get(ctx)
  if (!m) {
    m = computeTalent(ctx)
    modelCache.set(ctx, m)
  }
  return m
}

/** Folder-tab headline: share of Critical roles with a Ready-now successor. */
export function talentHeadline(ctx: AnalyticsContext): Headline {
  const { covered, critical } = criticalCoverage({ ctx, byId: ctx.org.byId, asOf: ctx.asOf })
  return {
    value: critical ? fmt(covered / critical, 'pct0') : '—',
    label: 'critical roles covered',
    metricId: TALENT_METRIC.criticalCoverage,
    uses: HEADLINE_USES,
  }
}
