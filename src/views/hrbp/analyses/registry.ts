/**
 * The four special analyses in picker order, and what the shell (and later Ask) asks of them:
 * which the mode shows, which are ready, and each one's model, computed on first use and kept
 * per analytics context. Pure: the panels live in `./panels.tsx`.
 */
import type { AnalyticsContext } from '@/data/context'
import { timed } from '@/lib/timing'
import { DECLINES } from './declines/engine'
import { PYRAMID } from './pyramid/engine'
import { QUALITY } from './quality/engine'
import { STAGES } from './stages/engine'
import { ANALYSIS_KEYS, type AnalysisKey, analysisSurface, defaultAnalysis } from './tab'
import type { AnalysisDef, AnalysisModel } from './types'

export const ANALYSES: readonly AnalysisDef[] = [QUALITY, DECLINES, STAGES, PYRAMID]

const BY_KEY = new Map<AnalysisKey, AnalysisDef>(ANALYSES.map((a) => [a.key, a]))

export const analysisDef = (key: AnalysisKey): AnalysisDef => BY_KEY.get(key) as AnalysisDef

/** The analyses the mode shows, in picker order (Manager mode hides Quality of hire and Offer declines). */
export const shownAnalyses = (ctx: Pick<AnalyticsContext, 'access'>): AnalysisKey[] =>
  ANALYSIS_KEYS.filter((k) => ctx.access.can(analysisSurface(k)))

export const isReady = (ctx: AnalyticsContext, key: AnalysisKey): boolean => analysisDef(key).ready(ctx).ready

/** The analysis a bare address opens: the first shown one that is ready, else the first shown one. */
export const openingAnalysis = (ctx: AnalyticsContext): AnalysisKey | null =>
  defaultAnalysis(shownAnalyses(ctx), (k) => isReady(ctx, k))

const cache = new WeakMap<AnalyticsContext, Map<AnalysisKey, AnalysisModel>>()

/** An analysis's model for this context, computed on first use (`census:analysis:<key>` timing). */
export function analysisModel<M extends AnalysisModel = AnalysisModel>(
  ctx: AnalyticsContext,
  key: AnalysisKey,
): M {
  let byKey = cache.get(ctx)
  if (!byKey) {
    byKey = new Map()
    cache.set(ctx, byKey)
  }
  let hit = byKey.get(key)
  if (!hit) {
    const def = analysisDef(key)
    hit = timed(`census:analysis:${key}`, () => def.model(ctx))
    byKey.set(key, hit)
  }
  return hit as M
}

/** What Ask's `view_summary` will read for `tab: 'analyses:<key>'`: the analysis's tiles and findings. */
export function analysisSummary(ctx: AnalyticsContext, key: AnalysisKey): AnalysisModel {
  const m = analysisModel(ctx, key)
  return { kpis: m.kpis, findings: m.findings, ...(m.tables?.length ? { tables: m.tables } : {}) }
}
