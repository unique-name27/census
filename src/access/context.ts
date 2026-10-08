/**
 * `ctx.access` (docs/ROLES-V2.md 8.5; docs/ROLES.md 6.4): the mode, its scope, its pay view and
 * `decide` bound to them, carried on the analytics context so engines and UI that hold only `ctx`
 * ask the policy the same way. An off-screen render with its own provider (`access` prop) gets its
 * own answers. Pure.
 */
import type { MetricsApi } from '@/metrics/types'
import { type Mode, type ModePicks, PAY_OF, type PayView } from './modes'
import { type At, type DecideInfo, type Decision, decide, policyVersion } from './policy'
import type { OrgScope, ScopeLock } from './scopes/types'
import type { SurfaceId } from './surfaces'

export interface AccessContext {
  mode: Mode
  /** The scope the mode holds (org, unit, region, reqs); null in the modes without one and for "Every recruiter". */
  scope: ScopeLock | null
  /** @deprecated Manager's org scope: `scope` when its kind is 'org', else null. */
  lock: OrgScope | null
  /**
   * A scoped mode without a usable pick (none picked yet, or the remembered one is not in the
   * loaded data): the scope holds nobody, so every view is empty until one is picked.
   */
  unset: boolean
  /** The mode's pay view: `switch`, `totals` or `none` (part 3). */
  pay: PayView
  /** decide() bound to this mode, for engines and UI that hold only ctx. */
  decide: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => Decision
  /** Anything but hidden. */
  can: (surface: SurfaceId | string, at?: At, info?: DecideInfo) => boolean
}

/** What a context is built for: the mode and its picks. */
export interface AccessInput {
  mode: Mode
  picks?: Partial<ModePicks>
  /** @deprecated use picks.managerId */
  managerId?: string | null
}

export const HR_INPUT: AccessInput = { mode: 'hr' }

/** The picks of an input, with the deprecated `managerId` folded in. */
export function picksOf(input: AccessInput): Partial<ModePicks> {
  if (input.managerId === undefined || input.picks?.managerId !== undefined) return input.picks ?? {}
  return { ...input.picks, managerId: input.managerId }
}

type MetricLookup = Pick<MetricsApi, 'def'> | null

const bound = new WeakMap<object, Map<string, AccessContext>>()
const NO_METRICS = {}
/** A key for a scope's content, so equal scopes share one entry and the cache stays small. */
function scopeKey(s: ScopeLock | null): string {
  if (!s) return ''
  switch (s.kind) {
    case 'org':
      return `org:${s.managerId}:${s.size}:${s.orgIds.size}`
    case 'unit':
      return `unit:${s.unit}:${s.label}:${s.size}:${s.memberIds.size}`
    case 'region':
      return `region:${s.region}:${s.label}:${s.sites.join(',')}:${s.size}`
    case 'reqs':
      return `reqs:${s.recruiter}:${s.asOf}:${s.reqIds.size}:${s.startIds.size}`
  }
}

/**
 * The access context for a mode and scope. A metric's views come from the dictionary, so a metric
 * listed only on hidden views is hidden. Memoized per dictionary, mode, scope, `unset` and the
 * policy overrides in force.
 */
export function accessFor(
  mode: Mode,
  scope: ScopeLock | null = null,
  metrics: MetricLookup = null,
  unset = false,
): AccessContext {
  const holder: object = metrics ?? NO_METRICS
  let byKey = bound.get(holder)
  if (!byKey) {
    byKey = new Map()
    bound.set(holder, byKey)
  }
  const key = `${mode}|${scopeKey(scope)}|${unset}|${policyVersion()}`
  const hit = byKey.get(key)
  if (hit && hit.scope === scope) return hit
  const metricViews = metrics ? (id: string) => metrics.def(id)?.views : undefined
  const decideHere = (s: SurfaceId | string, at?: At, info?: DecideInfo): Decision =>
    decide(mode, s, at, metricViews && !info?.metricViews ? { ...info, metricViews } : info)
  const out: AccessContext = {
    mode,
    scope,
    lock: scope?.kind === 'org' ? scope : null,
    unset,
    pay: PAY_OF[mode],
    decide: decideHere,
    can: (s, at, info) => decideHere(s, at, info).access !== 'hidden',
  }
  byKey.set(key, out)
  return out
}

/** HR mode with no scope: what every context gets when no mode is given (tests, the gallery). */
export const HR_ACCESS: AccessContext = accessFor('hr')
