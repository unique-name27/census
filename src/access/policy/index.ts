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
import { homeOf, homeViewOf, type Mode, type PayView, type RoleOverrides, setRoleOverrides } from '../modes'
import { overlayTable, overrideDecision } from '../overrides/overlay'
import { setPayOverrides } from '../pay'
import type { SurfaceId } from '../surfaces'
import { decideChro } from './chro'
import { COMPENSATION_POLICY } from './compensation'
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

/** The table a mode is answered by, with the overrides in force laid over it; null for Developer, HR and CHRO. */
export const policyOf = (mode: Mode): RolePolicy | null =>
  isTableMode(mode) ? tableUnder(overrides, mode) : null

/* ───────────── overrides (docs/SECURITY-CENTER.md) ───────────── */

/**
 * Surface decisions per mode laid over the defaults (the policy file in force). Two kinds of key
 * are role settings rather than surfaces: `role:offered` hidden leaves the mode out of the Mode
 * menu, and `role:home:<view>` shown makes that view the mode's home (`src/access/overrides`).
 */
export type PolicyOverrides = ReadonlyMap<Mode, ReadonlyMap<string, Decision>>

let overrides: PolicyOverrides | null = null
let version = 0

/** Each table mode's table with a policy's overrides written in, built once per overrides object. */
const tables = new WeakMap<PolicyOverrides, Map<TableMode, RolePolicy>>()

function tableUnder(ov: PolicyOverrides | null, mode: TableMode): RolePolicy {
  const own = ov?.get(mode)
  if (!ov || !own?.size) return ROLE_POLICY[mode]
  let byMode = tables.get(ov)
  if (!byMode) {
    byMode = new Map()
    tables.set(ov, byMode)
  }
  let t = byMode.get(mode)
  if (!t) {
    t = overlayTable(ROLE_POLICY[mode], own)
    byMode.set(mode, t)
  }
  return t
}

/**
 * Lay a policy file's decisions over the defaults (null: the defaults alone). Developer mode is
 * never overridden, and a Developer-only surface never shows in another mode. A view an override
 * hides takes its tabs, figures and metrics with it; one it shows brings them back
 * (`src/access/overrides/overlay.ts`). The pay surfaces set the mode's pay view, and the role
 * settings its home and its place in the Mode menu. Bumps `policyVersion` so callers that cache
 * decisions can tell.
 */
export function setPolicyOverrides(next: PolicyOverrides | null): void {
  overrides = next?.size ? next : null
  setRoleOverrides(roleSettingsOf(overrides))
  setPayOverrides(payViewsUnder(overrides))
  version++
}

/** The policy overrides in force (the Security center compares its draft with them). */
export const policyOverrides = (): PolicyOverrides | null => overrides

/** Changes whenever the overrides in force change. */
export const policyVersion = (): number => version

/** The home and Mode menu settings a policy's `role:` keys hold. */
function roleSettingsOf(ov: PolicyOverrides | null): RoleOverrides | null {
  if (!ov) return null
  const home = new Map<Mode, RouteView>()
  const offered = new Map<Mode, boolean>()
  for (const [mode, own] of ov) {
    if (mode === 'developer') continue
    for (const [s, d] of own) {
      if (s === 'role:offered') offered.set(mode, d.access !== 'hidden')
      else if (s.startsWith('role:home:') && d.access !== 'hidden') home.set(mode, s.slice(10) as RouteView)
    }
  }
  return home.size || offered.size ? { home, offered } : null
}

/** The pay view of every mode whose pay surfaces a policy changes: amounts, else totals, else none. */
function payViewsUnder(ov: PolicyOverrides | null): ReadonlyMap<Mode, PayView> | null {
  if (!ov) return null
  const out = new Map<Mode, PayView>()
  for (const [mode, own] of ov) {
    if (mode === 'developer' || ![...own.keys()].some((s) => s.startsWith('pay:'))) continue
    const on = (s: string) => decideUnder(ov, mode, s).access !== 'hidden'
    out.set(mode, on('pay:amounts') && on('pay:switch') ? 'switch' : on('pay:totals') ? 'totals' : 'none')
  }
  return out.size ? out : null
}

/* ───────────── decide ───────────── */

/**
 * The decision for a surface under a given set of overrides (null: the built-in defaults). The
 * Security center weighs its draft with it before anything is in force.
 */
export function decideUnder(
  ov: PolicyOverrides | null,
  mode: Mode,
  surface: SurfaceId | string,
  at?: At,
  info?: DecideInfo,
): Decision {
  if (mode === 'developer') return SHOWN
  const own = ov?.get(mode)
  if (own?.size) {
    const o = overrideDecision(
      own,
      surface,
      at,
      info,
      (view) =>
        decideUnder(ov, mode, PAGE_KEYS.has(view) ? `page:${view}` : `view:${view}`).access === 'hidden',
    )
    if (o) return o
  }
  if (mode === 'hr') return decideHr(surface, at)
  if (mode === 'chro') return decideChro(surface, at)
  return decideTable(tableUnder(ov, mode), surface, at, info)
}

/** Shown, limited or hidden: the one answer for a surface in a mode. */
export function decide(mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  return decideUnder(overrides, mode, surface, at, info)
}

/** Anything but hidden. */
export const can = (mode: Mode, surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean =>
  decide(mode, surface, at, info).access !== 'hidden'

/** Whether a metric id is on a table mode's hide lists or outside its allowlist (or hidden by an override). */
export function hidesMetricId(mode: Mode, id: string): boolean {
  if (mode === 'developer') return false
  if ((mode === 'hr' || mode === 'chro') && !overrides?.get(mode)?.size) return false
  return decide(mode, `metric:${id}`).access === 'hidden'
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
    if (route.view === homeViewOf(mode)) return same
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
