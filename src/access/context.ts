/**
 * `ctx.access`: the mode, the manager lock and `decide` bound to them, carried on the analytics
 * context so engines and UI that hold only `ctx` ask the policy the same way (docs/ROLES.md, 6.4).
 * An off-screen render with its own provider (`access` prop) gets its own answers. Pure.
 */
import type { MetricsApi } from '@/metrics/types'
import type { ManagerLock } from './lock'
import type { Mode } from './modes'
import { type At, type DecideInfo, type Decision, decide } from './policy'
import type { SurfaceId } from './surfaces'

export interface AccessContext {
  mode: Mode
  /** Manager mode only; null otherwise. */
  lock: ManagerLock | null
  /**
   * Manager mode without a usable manager (none picked yet, or the remembered one is not in the
   * loaded data): the lock holds nobody, so every view is empty until one is picked.
   */
  unset: boolean
  /** decide() bound to this mode, for engines and UI that hold only ctx. */
  decide: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => Decision
  /** Anything but hidden. */
  can: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => boolean
}

/** What a context is built for: the mode and, in Manager mode, the manager. */
export interface AccessInput {
  mode: Mode
  managerId?: string | null
}

export const HR_INPUT: AccessInput = { mode: 'hr' }

type MetricLookup = Pick<MetricsApi, 'def'> | null

const bound = new WeakMap<object, Map<string, AccessContext>>()
const NO_METRICS = {}

/**
 * The access context for a mode and lock. A metric's views come from the dictionary, so a metric
 * listed only on hidden views is hidden. Memoized per dictionary, mode and lock.
 */
export function accessFor(
  mode: Mode,
  lock: ManagerLock | null = null,
  metrics: MetricLookup = null,
  unset = false,
): AccessContext {
  const holder: object = metrics ?? NO_METRICS
  let byKey = bound.get(holder)
  if (!byKey) {
    byKey = new Map()
    bound.set(holder, byKey)
  }
  const key = `${mode}|${lock?.managerId ?? ''}|${lock?.size ?? ''}|${lock?.orgIds.size ?? ''}|${unset}`
  const hit = byKey.get(key)
  if (hit && hit.lock === lock) return hit
  const metricViews = metrics ? (id: string) => metrics.def(id)?.views : undefined
  const decideHere = (s: SurfaceId | string, at?: At, info?: DecideInfo): Decision =>
    decide(mode, s, at, metricViews && !info?.metricViews ? { ...info, metricViews } : info)
  const out: AccessContext = {
    mode,
    lock,
    unset,
    decide: decideHere,
    can: (s, at, info) => decideHere(s, at, info).access !== 'hidden',
  }
  byKey.set(key, out)
  return out
}

/** HR mode with no lock: what every context gets when no mode is given (tests, the gallery). */
export const HR_ACCESS: AccessContext = accessFor('hr')
