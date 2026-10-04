/**
 * Cycle settings (merit budget, healthy compa-ratio band, merit guideline) live in the app
 * settings, Settings → Compensation cycle. These adapters give the comp engine its own shape.
 */
import { type CompCycleSettings, fromCycleSettings, toCycleSettings } from '@/data/settings'
import { useCensus } from '@/data/store'
import type { CycleSettings } from './engine/settings'

/** One engine object per stored settings object, so models memoized on it stay put. */
const cache = new WeakMap<CompCycleSettings, CycleSettings>()

export function cycleSettingsOf(c: CompCycleSettings): CycleSettings {
  let s = cache.get(c)
  if (!s) {
    s = toCycleSettings(c)
    cache.set(c, s)
  }
  return s
}

/** The cycle settings the comp engine reads, kept in step with Settings. */
export function useCycleSettings(): CycleSettings {
  return cycleSettingsOf(useCensus((s) => s.compCycle))
}

/** Save new cycle settings (sanitized by the store). */
export function setCycleSettings(s: CycleSettings): void {
  useCensus.getState().setCompCycle(fromCycleSettings(s))
}
