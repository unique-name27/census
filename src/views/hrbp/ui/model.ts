import { useMemo } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import type { Filters } from '@/data/scope'
import { focusScope } from '@/drill/focus'
import { type HrbpModel, hrbpModel } from '../engine'

/** One model per analytics context, shared by the view body, the header actions and the Scorecard. */
export const hrbpFor: (ctx: AnalyticsContext) => HrbpModel = hrbpModel

export function useHrbp(): HrbpModel {
  const ctx = useAnalytics()
  return useMemo(() => hrbpFor(ctx), [ctx])
}

/**
 * Apply a filter patch as one history entry with an Undo toast: the same merge as the readout's
 * Focus link and the records panel's "Filter to" (`focusScope`).
 */
export function rescope(ctx: AnalyticsContext, patch: Partial<Filters>): void {
  focusScope(patch, { org: ctx.org })
}
