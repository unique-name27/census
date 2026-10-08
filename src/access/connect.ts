/**
 * Connects the modes to the app (docs/ROLES-V2.md 1.5, 2.3 and 4.13; docs/ROLES.md 6.3): registers
 * the store's filter guard (every way filters change goes through the one clamp, per scope kind and
 * Finance's restriction), route guard (a hidden route opens the mode's home or the view's first
 * shown tab; a scoped mode waiting for its pick shows only its home), standard guard (Finance and
 * Manager keep the saved data standard) and lens guard (off in Finance and Manager); checks the
 * opening route; and carries out a mode change. Called once by the shell, like `connectLens`. No
 * React: the shell passes `notify` to show toasts.
 */
import { batchAddress, setLensGuard, setLensOn } from '@/data/address'
import { effectiveLists } from '@/data/lists/effective'
import { useLists } from '@/data/lists/store'
import type { ListsState } from '@/data/lists/types'
import { applyReferenceMappings } from '@/data/reference/apply'
import type { ReferenceMapping } from '@/data/reference/types'
import { type Datasets, type Employee, withAllDatasets } from '@/data/schema'
import {
  buildOrgIndex,
  type Filters,
  isExcluded,
  normalizeFilters,
  type OrgIndex,
  withMode,
} from '@/data/scope'
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
import { metricsApi } from '@/metrics/api'
import {
  CHANGE_MODE,
  FINANCE_FILTERS_NOTE,
  leftScopeDescription,
  linkLeaderReplaced,
  modeToastTitle,
  NOT_SECURITY_SHORT,
  PICKER_COPY,
  toManagerTitle,
  WHOLE_COMPANY,
} from './copy'
import {
  EVERY_RECRUITER,
  HOME_OF,
  homeOf,
  type Mode,
  type ModePicks,
  modeButtonLabel,
  PICK_OF,
  SCOPE_OF,
} from './modes'
import { routeDecision } from './policy'
import {
  clampFilters,
  clampReason,
  DEFAULT_DEDUP_DAYS,
  type OrgScope,
  regionIndex,
  type ScopeEnv,
  type ScopeLock,
  type ScopeResult,
  scopeFor,
} from './scopes'
import { openModeMenu, picksOfState, useMode } from './store'

/** A toast the shell shows for the modes. */
export interface AccessNotice {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  timeout?: number
}

export interface ConnectDeps {
  notify: (n: AccessNotice) => void
  /** A mode or pick changed: close what shows records from before (the records panel). */
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

const mapped = new WeakMap<object, WeakMap<readonly ReferenceMapping[], Datasets>>()
/** The loaded data after your reference mappings: the values the filters and scopes hold. */
function mappedData(data: Partial<Datasets>, mappings: readonly ReferenceMapping[]): Datasets {
  let byMappings = mapped.get(data)
  if (!byMappings) {
    byMappings = new WeakMap()
    mapped.set(data, byMappings)
  }
  let out = byMappings.get(mappings)
  if (!out) {
    out = applyReferenceMappings(withAllDatasets(data), mappings).datasets
    byMappings.set(mappings, out)
  }
  return out
}

const parentsMemo = new WeakMap<object, ReadonlyMap<string, string | null>>()

/** The metric whose `dedupDays` setting matches pre-hires to accepted offers (Onboarding's). */
const DEDUP_METRIC = 'onboarding.upcoming.starts'

/** What building the live scope reads: the mapped data, the lists in force, the matching window. */
function liveEnv(mode: Mode): ScopeEnv {
  const st = useCensus.getState()
  const all = mappedData(st.data, st.reference.mappings)
  const kind = SCOPE_OF[mode]
  const lists: ListsState = useLists.getState().state
  const env: ScopeEnv = { org: orgOf(st.data.employees), asOf: contextAsOf(st), all }
  if (kind === 'region')
    env.regions = regionIndex(effectiveLists(lists, all, st.sources).location?.values, all)
  if (kind === 'unit') {
    const values = effectiveLists(lists, all, st.sources).department?.values ?? []
    let parents = parentsMemo.get(values)
    if (!parents) {
      parents = new Map(values.map((v) => [v.value, v.parent ?? null]))
      parentsMemo.set(values, parents)
    }
    env.departmentParents = parents
  }
  if (kind === 'reqs') {
    // The onboarding matching window in force, as `buildContext` reads it.
    const m = metricsApi(st.metrics)
    env.dedupDays = m.paramDef(DEDUP_METRIC, 'dedupDays')
      ? m.num(DEDUP_METRIC, 'dedupDays')
      : DEFAULT_DEDUP_DAYS
  }
  return env
}

const livePicks = (): ModePicks => picksOfState(useMode.getState())

/** The scope the mode holds right now and whether its pick is still to be made; null scope in modes without one. */
function liveHeld(mode: Mode = useMode.getState().mode, picks: ModePicks = livePicks()): ScopeResult {
  if (!SCOPE_OF[mode]) return { scope: null, unset: false }
  return scopeFor(mode, picks, liveEnv(mode))
}

/** The scope the mode holds right now (empty until a pick in the data is made); null in modes without one. */
export function liveScope(): ScopeLock | null {
  return liveHeld().scope
}

/** Manager mode's org scope right now (empty until a manager in the data is picked); null in other modes. */
export function liveLock(): OrgScope | null {
  const s = liveScope()
  return s?.kind === 'org' ? s : null
}

/** A scoped mode on loaded data with nothing usable picked: every route shows its home's empty state. */
const waitingForPick = (): boolean => !!useCensus.getState().ready && liveHeld().unset

/** The mode and scope right now, for code outside React (openInOrgChart, the clamp toasts). */
export function liveAccess(): { mode: Mode; scope: ScopeLock | null; lock: OrgScope | null } {
  const scope = liveScope()
  return { mode: useMode.getState().mode, scope, lock: scope?.kind === 'org' ? scope : null }
}

const changeMode = { label: CHANGE_MODE, onClick: openModeMenu }

/**
 * After a link or a saved view applied its scope: say so when the mode's clamp changed what it
 * asked for (a leader outside the org, another business unit, other locations, Finance's other
 * filters). Back and Forward never call this.
 */
export function noteLeaderReplaced(asked: Partial<Filters>, from: 'link' | 'view' = 'link'): void {
  const mode = useMode.getState().mode
  const scope = liveScope()
  const now = useCensus.getState().filters
  if (scope?.kind === 'org') {
    if (!asked.leaderId || !scope.managerName) return
    if (asked.leaderId === now.leaderId && !isExcluded(asked, 'leaderId')) return
    deps.notify({ title: linkLeaderReplaced(scope.managerName, from), timeout: 9000 })
    return
  }
  const full = normalizeFilters(asked)
  const kept = clampFilters(full, scope, mode)
  const title = clampReason(mode, scope, full, kept, from)
  if (title) deps.notify({ title, timeout: 9000 })
}

/** The same note under its general name. */
export const noteScopeChanged = noteLeaderReplaced

/** Send a hidden route to where the mode shows it, silently (a mode change says so itself). */
function routeIntoMode(mode: Mode): void {
  const st = useCensus.getState()
  const d = routeDecision(mode, st.route)
  if (d.redirected)
    st.navigate(d.route.view, d.route.tab, { history: 'replace', scroll: d.route.view !== st.route.view })
}

/** The note the pick dialog opens with when the remembered pick is gone; null when nothing was picked. */
function goneNote(mode: Mode, picks: ModePicks): string | null {
  const kind = PICK_OF[mode]
  if (!kind) return null
  const copy = PICKER_COPY[kind]
  switch (kind) {
    case 'manager': {
      const id = picks.managerId
      if (!id) return null
      return copy.gone(
        orgOf(useCensus.getState().data.employees).byId.get(id)?.name || 'The manager you picked',
      )
    }
    case 'unit':
      return picks.unit ? copy.gone(picks.unit) : null
    case 'region':
      return picks.region ? copy.gone(picks.region) : null
    case 'recruiter':
      return picks.recruiter?.name ? copy.gone(picks.recruiter.name) : null
  }
}

/**
 * A scoped mode on loaded data: is the pick still usable (a manager leading 3 or more, a unit with
 * active employees, a region with a location in the data, a recruiter on a req)? If not, open the
 * pick dialog with a note and show the home's empty state; either way keep the filters inside the
 * scope (and Finance's filters to business unit and period).
 */
function checkScope(): void {
  const { mode, picking } = useMode.getState()
  const st = useCensus.getState()
  if (!st.ready) return
  const picks = livePicks()
  const held = liveHeld(mode, picks)
  const kind = PICK_OF[mode]
  if (held.unset && kind) {
    if (!picking) useMode.getState().openPicker(kind, goneNote(mode, picks))
    const home = homeOf(mode)
    if (st.route.view !== home.view) st.navigate(home.view, home.tab, { history: 'replace', scroll: false })
  }
  const clamped = clampFilters(st.filters, held.scope, mode)
  if (clamped !== st.filters) st.setFilters(clamped, { history: 'replace' })
}

/** The name a scope is shown by on the Mode button ("Silicon Engineering", "Maya Chen"). */
function pickName(mode: Mode, scope: ScopeLock | null, picks: ModePicks): string | null {
  if (mode === 'recruiter' && picks.recruiter?.name === EVERY_RECRUITER) return EVERY_RECRUITER
  if (!scope) return null
  switch (scope.kind) {
    case 'org':
      return scope.managerName || null
    case 'unit':
    case 'region':
      return scope.label || null
    case 'reqs':
      return scope.reqIds.size ? scope.recruiter : null
  }
}

/** The filters a scope pinned, cleared ("Whole company" on the leaving toast). */
function unpin(scope: ScopeLock): Partial<Filters> {
  if (scope.kind === 'org') return { leaderId: null }
  if (scope.kind === 'unit') return { businessUnit: [] }
  if (scope.kind === 'region') return { location: [] }
  return {}
}

interface Was {
  mode: Mode
  picks: ModePicks
}

/** What changes when the mode or its pick changes (docs/ROLES-V2.md 1.5). Not a history entry. */
function switched(prev: Was, next: Was) {
  const st = useCensus.getState()
  const before = liveHeld(prev.mode, prev.picks)
  const after = liveHeld(next.mode, next.picks)
  batchAddress('replace', () => {
    // One rule, whatever the modes: pay amounts and immigration details go off.
    st.setShowPay(false)
    st.setShowImmigration(false)
    if (next.mode === 'finance' || next.mode === 'manager') {
      setLensOn(false)
      st.setScopeStandard(savedDataStandard())
    }
    if (after.scope?.kind === 'org') {
      // The leader becomes the manager (include mode); list filters and the period stay.
      st.setFilters(
        { leaderId: after.scope.managerId, modes: withMode(st.filters.modes, 'leaderId', 'include') },
        { history: 'replace' },
      )
    } else {
      const clamped = clampFilters(useCensus.getState().filters, after.scope, next.mode)
      if (clamped !== useCensus.getState().filters) st.setFilters(clamped, { history: 'replace' })
    }
    routeIntoMode(next.mode)
  })
  deps.onModeChange?.()
  const prevScope = before.unset ? null : before.scope
  const name = pickName(next.mode, after.unset ? null : after.scope, next.picks)
  if (PICK_OF[next.mode]) {
    const title =
      next.mode === 'manager' && name
        ? toManagerTitle(name)
        : name
          ? modeButtonLabel(next.mode, name)
          : modeToastTitle(next.mode)
    deps.notify({ title, description: NOT_SECURITY_SHORT })
    checkScope()
  } else if (next.mode === 'finance')
    deps.notify({ title: modeToastTitle('finance'), description: FINANCE_FILTERS_NOTE })
  else if (prevScope && prevScope.kind !== 'reqs' && prevScope.label) {
    const pinned = unpin(prevScope)
    deps.notify({
      title: modeToastTitle(next.mode),
      description: leftScopeDescription(prevScope.label),
      action: {
        label: WHOLE_COMPANY,
        onClick: () => useCensus.getState().setFilters(pinned, { history: 'push' }),
      },
    })
  } else deps.notify({ title: modeToastTitle(next.mode), description: NOT_SECURITY_SHORT })
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

/** Whether the pick the current mode reads changed. */
function pickChanged(mode: Mode, a: ModePicks, b: ModePicks): boolean {
  switch (PICK_OF[mode]) {
    case 'manager':
      return a.managerId !== b.managerId
    case 'unit':
      return a.unit !== b.unit
    case 'region':
      return a.region !== b.region
    case 'recruiter':
      return (
        a.recruiter?.name !== b.recruiter?.name || (a.recruiter?.id ?? null) !== (b.recruiter?.id ?? null)
      )
    default:
      return false
  }
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
    const mode = useMode.getState().mode
    const scope = SCOPE_OF[mode] ? liveScope() : null
    return clampFilters(f, scope, mode)
  })
  setRouteGuard({
    check(route) {
      const mode = useMode.getState().mode
      // No pick yet: the home's empty state is the only page (the pick dialog is open).
      if (waitingForPick() && route.view !== HOME_OF[mode]) return { route: homeOf(mode) }
      const r = routeDecision(mode, route)
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
  setStandardGuard((asked) => {
    const mode = useMode.getState().mode
    return mode === 'manager' || mode === 'finance' ? savedDataStandard() : asked
  })
  setLensGuard(() => {
    const mode = useMode.getState().mode
    return mode === 'manager' || mode === 'finance'
  })
  checkOpeningRoute()
  checkScope()
  // Timings record only in Developer mode (docs/ROLES.md, 5.7): the other modes pay nothing.
  setTimingOn(useMode.getState().mode === 'developer')
  const unMode = useMode.subscribe((s, prev) => {
    if (s.mode !== prev.mode) setTimingOn(s.mode === 'developer')
    const now = picksOfState(s)
    const was = picksOfState(prev)
    if (s.mode !== prev.mode || pickChanged(s.mode, now, was))
      switched({ mode: prev.mode, picks: was }, { mode: s.mode, picks: now })
  })
  const unData = useCensus.subscribe((s, prev) => {
    if (
      s.ready !== prev.ready ||
      s.data.employees !== prev.data.employees ||
      s.data.requisitions !== prev.data.requisitions ||
      s.asOfOverride !== prev.asOfOverride ||
      s.reference !== prev.reference
    )
      checkScope()
  })
  const unLists = useLists.subscribe((s, prev) => {
    if (s.state !== prev.state && SCOPE_OF[useMode.getState().mode]) checkScope()
  })
  const stop = () => {
    unMode()
    unData()
    unLists()
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
