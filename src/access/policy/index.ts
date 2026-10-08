/**
 * The access policy (docs/ROLES-V2.md 8.3; docs/ROLES.md part 3 and 6.2): one pure function answers,
 * for every surface in every mode, shown, limited or hidden, with one plain sentence for limited and
 * hidden.
 *
 *  1. Developer: shown, always.
 *  2. An override for the mode and surface (the Security center's policy file), except that a
 *     Developer-only surface never shows elsewhere.
 *  3. HR: `decideHr` (developer-only surfaces, My team and the role homes hidden).
 *  4. CHRO: `decideChro` (HR plus the executive home).
 *  5. Every other mode: `decideTable(ROLE_POLICY[mode], …)`, the allowlist engine.
 *
 * The Action center is limited per mode like any other page (docs/ROLES-V2.md 6.3): who sees which
 * item kinds is the routing table in `routing.ts`.
 *
 * Routes (`routeShown`, `routeDecision`) ask `decide` for the view and tab, so an override that
 * hides a view also redirects its address. Callers ask through `ctx.access.decide` (the context binds
 * the mode), so an off-screen render with its own mode gets its own answers. The policy never imports
 * the view registry. Pure.
 */
import { VIEW_LABEL } from '@/data/schema'
import type { Route, RouteView } from '@/data/store'
import { hiddenPageTitle, hiddenTabTitle, openedInstead, openedTabInstead } from '../copy'
import { HOME_OF, homeOf, type Mode } from '../modes'
import type { SurfaceId } from '../surfaces'
import { decideChro } from './chro'
import { COMPENSATION_POLICY } from './compensation'
import { isGuardedDeveloperSurface } from './developer'
import { FINANCE_POLICY } from './finance'
import { decideHr } from './hr'
import { HRBP_REGION_POLICY, HRBP_UNIT_POLICY } from './hrbp'
import { HR_OPS_POLICY } from './hrOps'
import { MANAGER_POLICY } from './manager'
import { RECRUITER_POLICY } from './recruiter'
import { baseTab, decideTable, PAGE_KEYS } from './table'
import { TALENT_POLICY } from './talent'
import {
  type At,
  type DecideInfo,
  type Decision,
  type HiddenPart,
  type RolePolicy,
  type RoleTab,
  SHOWN,
} from './types'

export * from './chro'
export * from './developer'
export * from './hr'
export * from './manager'
export * from './routing'
export * from './stub'
export * from './table'
export * from './types'

/** The modes answered by a table (every mode but Developer, HR and CHRO). */
export type TableMode = Exclude<Mode, 'developer' | 'hr' | 'chro'>

export const isTableMode = (mode: Mode): mode is TableMode =>
  mode !== 'developer' && mode !== 'hr' && mode !== 'chro'

/** Each allowlist mode's table: the built-in defaults (docs/ROLES-V2.md part 4). */
export const ROLE_POLICY: Readonly<Record<TableMode, RolePolicy>> = {
  'hrbp-unit': HRBP_UNIT_POLICY,
  'hrbp-region': HRBP_REGION_POLICY,
  compensation: COMPENSATION_POLICY,
  'talent-management': TALENT_POLICY,
  recruiter: RECRUITER_POLICY,
  'hr-ops': HR_OPS_POLICY,
  finance: FINANCE_POLICY,
  manager: MANAGER_POLICY,
}

/** The table a mode is answered by, or null for Developer, HR and CHRO. */
export const policyOf = (mode: Mode): RolePolicy | null => (isTableMode(mode) ? ROLE_POLICY[mode] : null)

/* ───────────── overrides (docs/SECURITY-CENTER.md) ───────────── */

/** Exact surface decisions per mode laid over the defaults (the policy file in force). */
export type PolicyOverrides = ReadonlyMap<Mode, ReadonlyMap<string, Decision>>

let overrides: PolicyOverrides | null = null
let version = 0

/**
 * Lay a policy file's decisions over the defaults (null: the defaults alone). Developer mode is
 * never overridden, and a Developer-only surface never shows in another mode. Bumps `policyVersion`
 * so callers that cache decisions can tell.
 */
export function setPolicyOverrides(next: PolicyOverrides | null): void {
  overrides = next?.size ? next : null
  version++
}

/** Changes whenever the overrides in force change. */
export const policyVersion = (): number => version

function overrideFor(mode: Mode, surface: string): Decision | undefined {
  const o = overrides?.get(mode)?.get(surface)
  if (!o) return undefined
  if (o.access !== 'hidden' && isGuardedDeveloperSurface(surface)) return undefined
  return o
}

/* ───────────── decide ───────────── */

/** Shown, limited or hidden: the one answer for a surface in a mode. */
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  if (mode === 'developer') return SHOWN
  const o = overrides ? overrideFor(mode, surface) : undefined
  if (o) return o
  if (mode === 'hr') return decideHr(surface, at)
  if (mode === 'chro') return decideChro(surface, at)
  return decideTable(ROLE_POLICY[mode], surface, at, info)
}

/** Anything but hidden. */
export const can = (mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean =>
  decide(mode, surface, at, info).access !== 'hidden'

/** Whether a metric id is on a table mode's hide lists or outside its allowlist; false elsewhere. */
export function hidesMetricId(mode: Mode, id: string): boolean {
  if (mode === 'developer' || mode === 'hr' || mode === 'chro') return false
  return decideTable(ROLE_POLICY[mode], `metric:${id}`).access === 'hidden'
}

/** Kept for Manager mode's callers. */
export const managerHidesMetricId = (id: string): boolean => hidesMetricId('manager', id)

/* ───────────── routes (docs/ROLES-V2.md 4.13) ───────────── */

/** Page names for the redirect toast: "The Data room is not shown in Finance mode". */
const PLACE_LABEL: Readonly<Record<string, string>> = {
  data: 'The Data room',
  actions: 'The Action center',
  dev: 'The Developer page',
}

export const placeLabel = (view: string): string =>
  PLACE_LABEL[view] ?? (VIEW_LABEL as Record<string, string>)[view] ?? view

const placeSurface = (view: string): string => (PAGE_KEYS.has(view) ? `page:${view}` : `view:${view}`)

/** Whether a view or page is shown in a mode. */
const placeShown = (mode: Mode, view: string): boolean => can(mode, placeSurface(view))

/** The tabs a mode's table names for a view; null when the mode shows every tab (HR, CHRO) or the view has no table. */
const namedTabs = (mode: Mode, view: string): readonly RoleTab[] | null =>
  (policyOf(mode)?.tabs as Record<string, readonly RoleTab[]> | undefined)?.[view] ?? null

const hiddenPartOf = (mode: Mode, view: string, t: string): HiddenPart | undefined =>
  policyOf(mode)?.hiddenParts[`${view}.${t}`]

/** The first tab of a view a mode shows (null when the view is hidden or every tab is). */
export function firstShownTab(mode: Mode, view: string): RoleTab | null {
  if (!placeShown(mode, view)) return null
  const tabs = namedTabs(mode, view)
  return tabs?.find((t) => can(mode, `tab:${view}.${t.key}`)) ?? null
}

/** Kept for Manager mode's callers: the first tab of a view Manager mode shows. */
export const firstManagerTab = (view: string): RoleTab | null => firstShownTab('manager', view)

export interface RouteDecision {
  route: Route
  redirected: boolean
  /** For a redirect: the toast's title and description. */
  reason?: { title: string; description: string }
}

/** Whether a route (a view or page, and a tab) is shown in a mode. */
export function routeShown(mode: Mode, view: string, t = ''): boolean {
  if (mode === 'developer') return true
  if (!placeShown(mode, view)) return false
  if (!t) return true
  if (hiddenPartOf(mode, view, t)) return false
  // A tab the policy does not name is left for the view to resolve (it opens its first shown tab).
  const named = namedTabs(mode, view)?.find((x) => x.key === baseTab(t))
  if (!named) return true
  return can(mode, `tab:${view}.${named.key}`)
}

/**
 * Where a route goes in a mode: unchanged when it is shown; a hidden view or page goes to the
 * mode's home; a hidden tab of a shown view goes to the view's first shown tab; a hidden part of a
 * shown tab opens the part named instead. A tab the policy does not know is left for the view to
 * resolve. The mode's home is never redirected to itself.
 */
export function routeDecision(mode: Mode, route: Route): RouteDecision {
  const same: RouteDecision = { route, redirected: false }
  if (mode === 'developer') return same
  if (!placeShown(mode, route.view)) {
    if (route.view === HOME_OF[mode]) return same
    return {
      route: homeOf(mode),
      redirected: true,
      reason: { title: hiddenPageTitle(placeLabel(route.view), mode), description: openedInstead(mode) },
    }
  }
  const tabs = namedTabs(mode, route.view)
  if (!tabs || !route.tab) return same
  const named = tabs.find((x) => x.key === baseTab(route.tab))
  // A hidden part of a shown tab opens the part named instead, with the same toast.
  const part = hiddenPartOf(mode, route.view, route.tab)
  if (part && named && can(mode, `tab:${route.view}.${named.key}`))
    return {
      route: { view: route.view as RouteView, tab: part.instead },
      redirected: true,
      reason: {
        title: hiddenTabTitle(placeLabel(route.view), part.label, mode),
        description: openedTabInstead(part.insteadLabel),
      },
    }
  if (!named || can(mode, `tab:${route.view}.${named.key}`)) return same
  const first = firstShownTab(mode, route.view)
  return {
    route: { view: route.view as RouteView, tab: first?.key ?? '' },
    redirected: true,
    reason: {
      title: hiddenTabTitle(placeLabel(route.view), named.label, mode),
      description: openedTabInstead(first?.label ?? placeLabel(route.view)),
    },
  }
}
