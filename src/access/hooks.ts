/**
 * React hooks over `ctx.access` (docs/ROLES-V2.md 8.1; docs/ROLES.md 6.4). They read the analytics
 * context, never the mode store, so an off-screen render with its own mode gets its own answers.
 */
import { useCurrentView } from '@/components/currentView'
import { useAnalytics } from '@/data/context'
import type { AccessContext } from './context'
import type { At, DecideInfo, Decision } from './policy'
import type { OrgScope, ScopeLock } from './scopes/types'
import type { SurfaceId } from './surfaces'

export function useAccess(): AccessContext {
  return useAnalytics().access
}

/** The scope the mode holds (an org, a business unit, a region or a recruiter's reqs), or null. */
export function useScope(): ScopeLock | null {
  return useAnalytics().access.scope
}

/** Manager mode's org scope, or null in the other modes. */
export function useLock(): OrgScope | null {
  return useAnalytics().access.lock
}

/** Where the component sits: the view and tab on screen, when it is inside one. */
export function useAt(): At | undefined {
  const view = useCurrentView()
  return view ? { view: view.key, tab: view.tab } : undefined
}

/** The decision for a surface, at the view and tab on screen unless `at` is given. */
export function useDecision(surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  const access = useAccess()
  const here = useAt()
  return access.decide(surface, at ?? here, info)
}

/** Anything but hidden, at the view and tab on screen unless `at` is given. */
export function useCan(surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean {
  return useDecision(surface, at, info).access !== 'hidden'
}
