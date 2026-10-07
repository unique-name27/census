/**
 * Connects the modes to the app (docs/ROLES.md, 6.3): registers the store's filter guard (every
 * way filters change goes through the Manager mode clamp), route guard (a hidden route opens the
 * mode's home or the view's first shown tab), standard guard (Manager mode keeps the saved data
 * standard) and the lens guard (off in Manager mode); checks the opening route; and carries out a
 * mode change (1.5). Called once by the shell, like `connectLens`. No React: the shell passes
 * `notify` to show toasts.
 */
import { batchAddress, setLensGuard, setLensOn } from '@/data/address'
import type { Employee } from '@/data/schema'
import { buildOrgIndex, type Filters, isExcluded, type OrgIndex, withMode } from '@/data/scope'
import {
  contextAsOf,
  initialRouteNamed,
  savedDataStandard,
  setFilterGuard,
  setRouteGuard,
  setStandardGuard,
  useCensus,
} from '@/data/store'
import { setTimingOn } from '@/lib/timing'
import {
  CHANGE_MODE,
  leftManagerDescription,
  linkLeaderReplaced,
  modeToastTitle,
  NOT_SECURITY_SHORT,
  pickAgain,
  toManagerTitle,
  WHOLE_COMPANY,
} from './copy'
import { clampFilters, heldLock, type ManagerLock } from './lock'
import { HOME_OF, homeOf, type Mode } from './modes'
import { routeDecision } from './policy'
import { openModeMenu, useMode } from './store'

/** A toast the shell shows for the modes. */
export interface AccessNotice {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  timeout?: number
}

export interface ConnectDeps {
  notify: (n: AccessNotice) => void
  /** A mode or manager changed: close what shows records from before (the records panel). */
  onModeChange?: () => void
}

let deps: ConnectDeps = { notify: () => undefined }

const orgs = new WeakMap<readonly Employee[], OrgIndex>()
/** The org index of the loaded roster (raw rows: reference mappings never change IDs or managers). */
function orgOf(employees: readonly Employee[]): OrgIndex {
  let o = orgs.get(employees)
  if (!o) {
    o = buildOrgIndex(employees)
    orgs.set(employees, o)
  }
  return o
}

/** The lock Manager mode holds right now and whether a manager is still to be picked; null in other modes. */
function liveHeld(): { lock: ManagerLock; unset: boolean } | null {
  const { mode, managerId } = useMode.getState()
  if (mode !== 'manager') return null
  const st = useCensus.getState()
  return heldLock(orgOf(st.data.employees), contextAsOf(st), managerId)
}

/** The lock Manager mode holds right now (empty until a manager in the data is picked); null in other modes. */
export function liveLock(): ManagerLock | null {
  return liveHeld()?.lock ?? null
}

/** Manager mode on loaded data with nobody usable picked: every route shows My team's empty state. */
const waitingForManager = (): boolean => !!useCensus.getState().ready && !!liveHeld()?.unset

/** The mode and lock right now, for code outside React (openInOrgChart, the clamp toasts). */
export function liveAccess(): { mode: Mode; lock: ManagerLock | null } {
  return { mode: useMode.getState().mode, lock: liveLock() }
}

const changeMode = { label: CHANGE_MODE, onClick: openModeMenu }

/**
 * After a link or a saved view applied its scope: say so when Manager mode replaced the leader it
 * named (outside the org, or excluded). Back and Forward never call this.
 */
export function noteLeaderReplaced(
  asked: Pick<Filters, 'leaderId' | 'modes'>,
  from: 'link' | 'view' = 'link',
): void {
  const lock = liveLock()
  if (!lock || !asked.leaderId || !lock.managerName) return
  const now = useCensus.getState().filters
  if (asked.leaderId === now.leaderId && !isExcluded(asked, 'leaderId')) return
  deps.notify({ title: linkLeaderReplaced(lock.managerName, from), timeout: 9000 })
}

/** Send a hidden route to where the mode shows it, silently (a mode change says so itself). */
function routeIntoMode(mode: Mode): void {
  const st = useCensus.getState()
  const d = routeDecision(mode, st.route)
  if (d.redirected)
    st.navigate(d.route.view, d.route.tab, { history: 'replace', scroll: d.route.view !== st.route.view })
}

/**
 * Manager mode on loaded data: is the manager still one (on the roster, leading 3 or more)? If
 * not, open the picker with a note; either way keep the filters inside the lock.
 */
function checkManager(): void {
  const { mode, managerId, picking } = useMode.getState()
  const st = useCensus.getState()
  if (mode !== 'manager' || !st.ready) return
  const org = orgOf(st.data.employees)
  const held = heldLock(org, contextAsOf(st), managerId)
  if (held.unset) {
    if (!picking)
      useMode
        .getState()
        .openPicker(managerId ? pickAgain(org.byId.get(managerId)?.name || 'The manager you picked') : null)
    // My team's empty state until someone is picked (docs/ROLES.md, 1.3).
    const home = homeOf('manager')
    if (st.route.view !== home.view) st.navigate(home.view, home.tab, { history: 'replace', scroll: false })
  }
  const clamped = clampFilters(st.filters, held.lock)
  if (clamped !== st.filters) st.setFilters(clamped, { history: 'replace' })
}

/** What changes when the mode or the manager changes (docs/ROLES.md, 1.5). Not a history entry. */
function switched(
  prev: { mode: Mode; managerId: string | null },
  next: { mode: Mode; managerId: string | null },
) {
  const st = useCensus.getState()
  const name = (id: string | null) => (id ? orgOf(st.data.employees).byId.get(id)?.name : undefined)
  batchAddress('replace', () => {
    if (next.mode === 'manager') {
      // The leader becomes the manager (include mode); list filters and the period stay.
      st.setFilters(
        { leaderId: next.managerId, modes: withMode(st.filters.modes, 'leaderId', 'include') },
        { history: 'replace' },
      )
      st.setShowPay(false)
      st.setShowImmigration(false)
      setLensOn(false)
      st.setScopeStandard(savedDataStandard())
    }
    routeIntoMode(next.mode)
  })
  deps.onModeChange?.()
  const prevName = prev.mode === 'manager' ? name(prev.managerId) : undefined
  if (next.mode === 'manager') {
    // Someone who leads fewer than 3 is no manager: no org is named until one is picked.
    const usable = !heldLock(orgOf(st.data.employees), contextAsOf(st), next.managerId).unset
    const who = usable ? name(next.managerId) : undefined
    deps.notify({
      title: who ? toManagerTitle(who) : modeToastTitle('manager'),
      description: NOT_SECURITY_SHORT,
    })
    checkManager()
  } else if (prevName)
    deps.notify({
      title: modeToastTitle(next.mode),
      description: leftManagerDescription(prevName),
      action: {
        label: WHOLE_COMPANY,
        onClick: () => useCensus.getState().setFilters({ leaderId: null }, { history: 'push' }),
      },
    })
  else deps.notify({ title: modeToastTitle(next.mode), description: NOT_SECURITY_SHORT })
}

/** The page this load opened on: an unnamed one goes to the mode's home; a hidden one is redirected with a notice. */
function checkOpeningRoute(): void {
  const st = useCensus.getState()
  const mode = useMode.getState().mode
  if (!initialRouteNamed) {
    const home = homeOf(mode)
    if (st.route.view !== home.view) st.navigate(home.view, home.tab, { history: 'replace', scroll: false })
    return
  }
  // The route guard redirects and says why.
  if (routeDecision(mode, st.route).redirected)
    st.navigate(st.route.view, st.route.tab, { history: 'replace', scroll: false })
}

let connected: (() => void) | null = null

/**
 * Register the guards and follow the mode. Call once, before the address connects (the shell does
 * it when it mounts). Returns the stop (tests).
 */
export function connectAccess(d: ConnectDeps): () => void {
  connected?.()
  deps = d
  setFilterGuard((f) => {
    const lock = liveLock()
    return lock ? clampFilters(f, lock) : f
  })
  setRouteGuard({
    check(route) {
      // No manager picked yet: My team's empty state is the only page (the picker is open).
      if (waitingForManager() && route.view !== HOME_OF.manager) return { route: homeOf('manager') }
      const r = routeDecision(useMode.getState().mode, route)
      if (!r.redirected || !r.reason) return null
      const reason = r.reason
      return {
        route: r.route,
        notice: () =>
          deps.notify({ title: reason.title, description: reason.description, action: changeMode }),
      }
    },
    home: () => HOME_OF[useMode.getState().mode],
  })
  setStandardGuard((asked) => (useMode.getState().mode === 'manager' ? savedDataStandard() : asked))
  setLensGuard(() => useMode.getState().mode === 'manager')
  checkOpeningRoute()
  checkManager()
  // Timings record only in Developer mode (docs/ROLES.md, 5.7): the other modes pay nothing.
  setTimingOn(useMode.getState().mode === 'developer')
  const unMode = useMode.subscribe((s, prev) => {
    if (s.mode !== prev.mode) setTimingOn(s.mode === 'developer')
    if (s.mode !== prev.mode || (s.mode === 'manager' && s.managerId !== prev.managerId))
      switched({ mode: prev.mode, managerId: prev.managerId }, { mode: s.mode, managerId: s.managerId })
  })
  const unData = useCensus.subscribe((s, prev) => {
    if (
      s.ready !== prev.ready ||
      s.data.employees !== prev.data.employees ||
      s.asOfOverride !== prev.asOfOverride
    )
      checkManager()
  })
  const stop = () => {
    unMode()
    unData()
    setFilterGuard(null)
    setRouteGuard(null)
    setStandardGuard(null)
    setLensGuard(null)
    setTimingOn(false)
    deps = { notify: () => undefined }
    connected = null
  }
  connected = stop
  return stop
}
