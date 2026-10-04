/**
 * The People scorecard for the current analytics context, computed in idle time after the first
 * paint and shared by the page, the folder-tab headline and the monthly report. While a new
 * context (another scope or period) is being worked out, the last result stays on screen, marked
 * as updating.
 */
import { useEffect, useState } from 'react'
import { refreshHeadlines } from '@/app/headlineRefresh'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import type { ScorecardModel } from '../engine/model'
import { cachedScorecard, isSuperseded, scheduleScorecard, scorecardNow } from '../engine/schedule'
import { OTHER_VIEWS } from '../views'

/** A run for an older context stops quietly; anything else is logged. */
const report = (err: unknown) => {
  if (!isSuperseded(err)) console.error('People scorecard could not be computed', err)
}

/** Start (or join) the idle computation; the folder tabs read their headlines again when it is done. */
export function scorecardFor(ctx: AnalyticsContext): Promise<ScorecardModel> {
  return scheduleScorecard(ctx, OTHER_VIEWS, { onReady: refreshHeadlines })
}

/**
 * The scorecard when it is ready, without waiting. In a browser a miss starts the idle
 * computation and returns null; without a window (tests) it is computed on the spot.
 */
export function scorecardIfReady(ctx: AnalyticsContext): ScorecardModel | null {
  const hit = cachedScorecard(ctx)
  if (hit) return hit
  if (typeof window === 'undefined') return scorecardNow(ctx, OTHER_VIEWS)
  scorecardFor(ctx).catch(report)
  return null
}

export interface ScorecardState {
  /** The latest scorecard computed: for this context, or the previous one while it updates. */
  model: ScorecardModel | null
  /** The model shown is from the previous context; the new one is on its way. */
  updating: boolean
}

export function useScorecard(): ScorecardState {
  const ctx = useAnalytics()
  const [state, setState] = useState<{ ctx: AnalyticsContext; model: ScorecardModel } | null>(() => {
    const hit = cachedScorecard(ctx)
    return hit ? { ctx, model: hit } : null
  })
  useEffect(() => {
    let live = true
    const hit = cachedScorecard(ctx)
    if (hit) setState({ ctx, model: hit })
    else
      scorecardFor(ctx)
        .then((model) => {
          if (live) setState({ ctx, model })
        })
        .catch(report)
    return () => {
      live = false
    }
  }, [ctx])
  return { model: state?.model ?? null, updating: !!state && state.ctx !== ctx }
}
