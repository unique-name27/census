/**
 * The tier gate for numbers on screen: the analytics context supplies the quality index and the
 * data standard, the current view supplies the fallback datasets. The Data room is never gated:
 * it is where below-standard data is inspected and raised.
 */
import { useAnalytics } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { QualityIndex } from '@/data/quality/types'
import { useCurrentView } from '../currentView'
import { gateFor, type TierGate } from './tierModel'

export type GateFn = (uses: readonly FieldRef[] | undefined) => TierGate | null

/** A function that gates any number in the current view (for lists: KPI strips, readouts). */
export function useGateFn(enabled = true): GateFn {
  const { quality, standard } = useAnalytics()
  const view = useCurrentView()
  const off = !enabled || view?.key === 'data'
  const fallback = view?.datasets ?? []
  return (uses) => (off ? null : gateFor(quality, standard, uses, fallback))
}

/** The gate for one number; null when it is not gated (no data named, or in the Data room). */
export function useTierGate(uses: readonly FieldRef[] | undefined, enabled = true): TierGate | null {
  return useGateFn(enabled)(uses)
}

/** The quality index, for wording what holds a number back. */
export function useQuality(): QualityIndex {
  return useAnalytics().quality
}
