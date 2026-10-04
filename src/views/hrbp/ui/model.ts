import { useMemo } from 'react'
import { describeFocus } from '@/components/filterLabels'
import { toast } from '@/components/toast'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import type { Filters } from '@/data/scope'
import { useCensus } from '@/data/store'
import { type HrbpModel, hrbpModel } from '../engine'

/** One model per analytics context, shared by the view body, the header actions and the Scorecard. */
export const hrbpFor: (ctx: AnalyticsContext) => HrbpModel = hrbpModel

export function useHrbp(): HrbpModel {
  const ctx = useAnalytics()
  return useMemo(() => hrbpFor(ctx), [ctx])
}

/** Apply a filter patch with an Undo toast (the same pattern the readout's Focus link uses). */
export function rescope(ctx: AnalyticsContext, patch: Partial<Filters>): void {
  const before = ctx.filters
  const { setFilters } = useCensus.getState()
  setFilters(patch)
  const label = describeFocus(patch, (id) => ctx.org.byId.get(id)?.name)
  toast(label ? `Showing ${label}` : 'Filters applied', {
    action: { label: 'Undo', onClick: () => setFilters(before) },
  })
}
