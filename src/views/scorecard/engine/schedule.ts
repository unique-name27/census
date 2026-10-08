/**
 * When the People scorecard is computed. Every practice's `summary(ctx)` runs in idle time after
 * the first paint (`requestIdleCallback`, with a 200 ms fallback where it is missing), one
 * practice per idle slice so the page stays responsive, and the result is kept per analytics
 * context: the page, the folder-tab headline and the monthly report share one computation. A
 * summary that throws is logged and its practice reads "Could not be computed".
 */
import { errorMessage, logDevError } from '@/app/devlog'
import type { AnalyticsContext } from '@/data/context'
import type { ViewDef } from '../../types'
import { buildScorecard, type PracticeInput, practiceShown, type ScorecardModel } from './model'

/**
 * The views the scorecard reads: every view with a summary, in folder-tab order, but itself; with
 * the mode's access, only the practices it shows (a summary the mode hides is never computed).
 */
export function practiceViews(views: readonly ViewDef[], access?: AnalyticsContext['access']): ViewDef[] {
  return views.filter(
    (v) =>
      v.key !== 'scorecard' &&
      v.key !== 'ai' &&
      typeof v.summary === 'function' &&
      practiceShown(access, v.key),
  )
}

/** One practice's summary, timed; a summary that throws is logged and comes back as an error. */
export function runSummary(view: ViewDef, ctx: AnalyticsContext, now: () => number = clock): PracticeInput {
  const t = now()
  try {
    const summary = view.summary?.(ctx) ?? { kpis: [], findings: [] }
    return { view, summary, ms: now() - t }
  } catch (error) {
    console.error(`People scorecard: the ${view.label} summary could not be computed`, error)
    logDevError({ where: 'summary', view: view.key, tab: null, message: errorMessage(error) })
    return { view, summary: null, error, ms: now() - t }
  }
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** A User Timing entry for the load budget, readable in the browser's performance tools. */
function measure(name: string, start: number): void {
  try {
    performance.measure(name, { start, end: clock() })
  } catch {
    /* no User Timing API: nothing to record */
  }
}

/** Everything at once, without waiting or caching (tests). */
export function computeScorecard(ctx: AnalyticsContext, views: readonly ViewDef[]): ScorecardModel {
  return buildScorecard(
    ctx,
    practiceViews(views, ctx.access).map((v) => runSummary(v, ctx)),
  )
}

/**
 * The scorecard for this context now, computed on the spot when it is not cached yet. Only where
 * there is no first paint to protect (no browser window: tests, scripts); the app schedules it.
 */
export function scorecardNow(ctx: AnalyticsContext, views: readonly ViewDef[]): ScorecardModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const model = computeScorecard(ctx, views)
  cache.set(ctx, model)
  return model
}

/** Wait for an idle moment; `timeout` caps the wait where idle callbacks exist. */
export type Idle = (timeout: number) => Promise<void>

/** First wait: let the first paint happen. */
const FIRST_WAIT_MS = 200

export const browserIdle: Idle = (timeout) =>
  new Promise((resolve) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    if (typeof ric === 'function') ric(() => resolve(), { timeout })
    else setTimeout(resolve, timeout)
  })

const cache = new WeakMap<AnalyticsContext, ScorecardModel>()
const pending = new WeakMap<AnalyticsContext, Promise<ScorecardModel>>()
/** The context asked for last: a run for an older one stops at its next idle slice. */
let latest: AnalyticsContext | null = null

/** A run stopped because a newer context (another scope, period or data load) was asked for. */
export class ScorecardSuperseded extends Error {
  constructor() {
    super('The scorecard was asked for a newer context.')
    this.name = 'ScorecardSuperseded'
  }
}

/** True for the error a superseded run rejects with: nothing went wrong, the result is not needed. */
export const isSuperseded = (err: unknown): boolean => err instanceof ScorecardSuperseded

/** The scorecard for this context when it is already computed; null while it is not. */
export function cachedScorecard(ctx: AnalyticsContext): ScorecardModel | null {
  return cache.get(ctx) ?? null
}

/**
 * The scorecard for this context, computed in idle time: one wait for the first paint, then one
 * practice per idle slice. Calls for the same context share one computation; `onReady` runs once
 * when a new result is stored (the folder tabs use it to read their headlines again). Asking for
 * a newer context stops an older run at its next slice (it rejects with `ScorecardSuperseded`),
 * so a burst of context changes while the data loads computes the scorecard once.
 */
export function scheduleScorecard(
  ctx: AnalyticsContext,
  views: readonly ViewDef[],
  opts: { idle?: Idle; onReady?: (model: ScorecardModel) => void } = {},
): Promise<ScorecardModel> {
  const hit = cache.get(ctx)
  if (hit) return Promise.resolve(hit)
  const running = pending.get(ctx)
  if (running) return running
  const idle = opts.idle ?? browserIdle
  latest = ctx
  const run = (async () => {
    try {
      await idle(FIRST_WAIT_MS)
      const inputs: PracticeInput[] = []
      for (const [i, view] of practiceViews(views, ctx.access).entries()) {
        if (i > 0) await idle(FIRST_WAIT_MS)
        if (latest !== ctx) throw new ScorecardSuperseded()
        const start = clock()
        inputs.push(runSummary(view, ctx))
        measure(`census:scorecard:${view.key}`, start)
      }
      const model = buildScorecard(ctx, inputs)
      cache.set(ctx, model)
      // How long the summaries took, for the load budget (read it in the browser's performance tools).
      try {
        performance.mark('census:scorecard', { detail: model.timing })
      } catch {
        /* no User Timing API: nothing to record */
      }
      opts.onReady?.(model)
      return model
    } finally {
      pending.delete(ctx)
    }
  })()
  pending.set(ctx, run)
  return run
}
