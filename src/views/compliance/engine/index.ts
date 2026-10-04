/**
 * Compliance engine entry points: the view model, the folder-tab headline, the scorecard summary
 * and the Action center items. Pure functions of the analytics context.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { addDays } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem, Headline, ViewSummary } from '../../types'
import { M } from '../metrics'
import { buildActions } from './actions'
import { buildBase } from './base'
import type { DrillScope } from './drills'
import { buildFindings } from './findings'
import { buildKpis, coreKpis } from './kpis'
import { USES } from './lineage'
import { type ComplianceCore, type ComplianceModel, computeCore } from './model'
import { computeTraining } from './training'
import { daysText } from './wording'

export interface ComplianceView extends ComplianceModel {
  scope: DrillScope
  kpis: Kpi[]
  findings: ReturnType<typeof buildFindings>
}

export function drillScopeOf(
  ctx: Pick<AnalyticsContext, 'asOf' | 'scopeLabel' | 'window' | 'prior' | 'showImmigration'>,
): DrillScope {
  return {
    asOf: ctx.asOf,
    scope: ctx.scopeLabel,
    window: ctx.window.label,
    prior: ctx.prior.label,
    showImmigration: ctx.showImmigration,
  }
}

const views = new WeakMap<AnalyticsContext, ComplianceView>()
const cores = new WeakMap<AnalyticsContext, ComplianceCore>()

/** The core model, once per analytics context (the view, the scorecard and the Action center share it). */
function coreOf(ctx: AnalyticsContext): ComplianceCore {
  let c = cores.get(ctx)
  if (!c) {
    c = computeCore(ctx)
    cores.set(ctx, c)
  }
  return c
}

/** The view model, once per analytics context. */
export function compute(ctx: AnalyticsContext): ComplianceView {
  let v = views.get(ctx)
  if (!v) {
    const m = { ...coreOf(ctx), training: computeTraining(ctx, coreOf(ctx).settings) }
    const scope = drillScopeOf(ctx)
    v = { ...m, scope, kpis: buildKpis(ctx, m, scope), findings: buildFindings(ctx, m, scope) }
    views.set(ctx, v)
  }
  return v
}

/** Folder-tab headline: work authorizations expiring in the headline window (90 days). */
export function headline(ctx: AnalyticsContext): Headline {
  const base = buildBase(ctx)
  const days = base.settings.headlineDays
  const label = `expiring in ${daysText(days)}`
  if (!base.has.rightToWork || !base.has.expiry)
    return { value: '—', label, metricId: M.expiring, uses: USES.expiring }
  const end = addDays(ctx.asOf, days)
  const n = base.active.filter(
    (p) => !!p.r.expiryDate && p.r.expiryDate > ctx.asOf && p.r.expiryDate <= end,
  ).length
  return { value: fmt(n, 'int'), label, metricId: M.expiring, uses: USES.expiring }
}

/**
 * The scorecard's measures: reverification on time, I-9 Section 2 within the allowed business
 * days, and people working without an export license in force; the readout as findings.
 */
export function summary(ctx: AnalyticsContext): ViewSummary {
  const core = coreOf(ctx)
  const scope = drillScopeOf(ctx)
  const k = coreKpis(core, scope)
  // The readout without the training summary, which only the view itself computes.
  const findings = buildFindings(ctx, { ...core, training: EMPTY_TRAINING }, scope)
  return { kpis: [k.reverification, k.i9, k.license], findings }
}

/** Open compliance items for the Action center. */
export function actions(ctx: AnalyticsContext): ActionItem[] {
  return buildActions(ctx, coreOf(ctx), drillScopeOf(ctx))
}

const EMPTY_TRAINING: ComplianceModel['training'] = {
  required: { loaded: false, available: false, rate: null, due: 0, onTime: 0, records: [] },
  policy: { available: false, judged: [], onTime: [], rate: null },
}
