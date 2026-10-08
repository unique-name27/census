/**
 * The records guard for every scope (docs/ROLES-V2.md, 2.7; docs/ROLES.md 4.5): the records panel,
 * the person card and a finding's people keep to the scope. Pure.
 *
 * - `org`: unchanged. Employee-keyed rows by employee ID; requisitions by hiring manager and
 *   candidates by their requisition (`ctx.all` scoped to the leader once per context, cached);
 *   onboarding tasks by their person; succession by incumbent, the manager's own role left out;
 *   cases by requester. Grouped kinds and the hiring plan are left out.
 * - `unit`, `region`: the same identities, against the scope's pinned filter: employees by the
 *   scope's members; requisitions and hiring plan lines by their own business unit or location;
 *   candidates by their req; cases by requester (an unknown requester: left out in a unit, by the
 *   case's own location in a region); succession by incumbent. Grouped kinds (`surveyGroups`,
 *   `leaveGroups`) are computed inside the scope and kept.
 * - `reqs`: requisitions in `reqIds`, candidates on them, onboarding tasks by `appIds` or
 *   `startIds`, employees in `startIds`; every other kind is left out.
 *
 * Action center rows (`actionItems`, `actionOwners`) are the items the mode lists, kept as listed.
 */
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, scopeDatasets } from '@/data/scope'
import type { DrillKind, DrillSpec } from '@/drill/types'
import type { AccessContext } from '../context'
import type { OrgScope, RegionScope, ScopeLock, UnitScope } from './types'

/** What the guard reads from an access context: its scope (or, from older callers, Manager mode's lock). */
export type ScopeHolder = Partial<Pick<AccessContext, 'scope' | 'lock'>> | null | undefined

type ScopeCtx = Pick<AnalyticsContext, 'all' | 'org'> & { access?: ScopeHolder }

/** The scope a context holds: `access.scope`, else Manager mode's `lock` (older callers). */
export const scopeOfAccess = (access: ScopeHolder): ScopeLock | null => access?.scope ?? access?.lock ?? null

interface Ids {
  reqIds: ReadonlySet<string>
  appIds: ReadonlySet<string>
}

const cache = new WeakMap<object, WeakMap<object, Ids>>()

function cached(ctx: ScopeCtx, key: object, build: () => Ids): Ids {
  let byScope = cache.get(ctx.all)
  if (!byScope) {
    byScope = new WeakMap()
    cache.set(ctx.all, byScope)
  }
  let ids = byScope.get(key)
  if (!ids) {
    ids = build()
    byScope.set(key, ids)
  }
  return ids
}

/** Requisitions and applications in the manager's org (the leader filter's rule), once per context. */
const orgIds = new WeakMap<object, Map<string, object>>()
function orgKey(ctx: ScopeCtx, s: OrgScope): object {
  // One key per manager, so two org scopes for the same manager share the cache.
  let byManager = orgIds.get(ctx.all)
  if (!byManager) {
    byManager = new Map()
    orgIds.set(ctx.all, byManager)
  }
  let k = byManager.get(s.managerId)
  if (!k) {
    k = {}
    byManager.set(s.managerId, k)
  }
  return k
}

function orgRecords(ctx: ScopeCtx, s: OrgScope): Ids {
  return cached(ctx, orgKey(ctx, s), () => {
    const data = scopeDatasets(ctx.all, { ...DEFAULT_FILTERS, modes: {}, leaderId: s.managerId }, ctx.org)
    return {
      reqIds: new Set(data.requisitions.map((r) => r.reqId)),
      appIds: new Set(data.candidates.map((c) => c.applicationId)),
    }
  })
}

/** Requisitions by their own business unit or location; applications on them. */
function placeRecords(ctx: ScopeCtx, s: UnitScope | RegionScope): Ids {
  return cached(ctx, s, () => {
    const at = s.kind === 'region' ? new Set(s.sites) : null
    const unit = s.kind === 'unit' ? s.unit : null
    const reqIds = new Set(
      ctx.all.requisitions
        .filter((r) => (at ? !!r.location && at.has(r.location) : r.businessUnit === unit))
        .map((r) => r.reqId),
    )
    const appIds = new Set(ctx.all.candidates.filter((c) => reqIds.has(c.reqId)).map((c) => c.applicationId))
    return { reqIds, appIds }
  })
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function inOrg(kind: DrillKind, r: Record<string, unknown>, ctx: ScopeCtx, s: OrgScope): boolean {
  const person = (id: unknown) => {
    const x = str(id)
    return !!x && s.orgIds.has(x)
  }
  switch (kind) {
    case 'employees':
    case 'jobChanges':
    case 'reviews':
    case 'learning':
    case 'comp':
    case 'rightToWork':
    case 'transactions':
      return person(r.employeeId)
    case 'succession':
      // The plan for the manager's own role stays with HR and their leader (docs/ROLES.md, 4.5).
      return person(r.incumbentId) && r.incumbentId !== s.managerId
    case 'requisitions':
      return !!str(r.reqId) && orgRecords(ctx, s).reqIds.has(r.reqId as string)
    case 'candidates':
      return (
        (!!str(r.applicationId) && orgRecords(ctx, s).appIds.has(r.applicationId as string)) ||
        (!!str(r.reqId) && orgRecords(ctx, s).reqIds.has(r.reqId as string))
      )
    case 'onboardingTasks': {
      if (str(r.employeeId) && ctx.org.byId.has(r.employeeId as string)) return person(r.employeeId)
      return !!str(r.applicationId) && orgRecords(ctx, s).appIds.has(r.applicationId as string)
    }
    case 'cases':
      return person(r.requesterId)
    case 'actionItems':
    case 'actionOwners':
      return true
    default:
      // Grouped kinds (surveys, leave) and the hiring plan are hidden in Manager mode.
      return false
  }
}

function inPlace(
  kind: DrillKind,
  r: Record<string, unknown>,
  ctx: ScopeCtx,
  s: UnitScope | RegionScope,
): boolean {
  const person = (id: unknown) => {
    const x = str(id)
    return !!x && s.memberIds.has(x)
  }
  const atSite = (loc: unknown) => {
    const l = str(loc)
    return s.kind === 'region' ? !!l && s.sites.includes(l) : false
  }
  switch (kind) {
    case 'employees':
    case 'jobChanges':
    case 'reviews':
    case 'learning':
    case 'comp':
    case 'rightToWork':
    case 'transactions':
      return person(r.employeeId)
    case 'succession':
      return person(r.incumbentId)
    case 'requisitions':
      return !!str(r.reqId) && placeRecords(ctx, s).reqIds.has(r.reqId as string)
    case 'candidates':
      return (
        (!!str(r.applicationId) && placeRecords(ctx, s).appIds.has(r.applicationId as string)) ||
        (!!str(r.reqId) && placeRecords(ctx, s).reqIds.has(r.reqId as string))
      )
    case 'onboardingTasks': {
      if (str(r.employeeId) && ctx.org.byId.has(r.employeeId as string)) return person(r.employeeId)
      return !!str(r.applicationId) && placeRecords(ctx, s).appIds.has(r.applicationId as string)
    }
    case 'cases': {
      const req = str(r.requesterId)
      if (req && ctx.org.byId.has(req)) return person(req)
      return atSite(r.location)
    }
    case 'hiringPlan':
      return s.kind === 'region' ? atSite(r.location) : r.businessUnit === s.unit
    case 'budget':
      // Budget lines name a business unit (and department), never a location: a unit keeps its
      // own lines, a region none.
      return s.kind === 'unit' && r.businessUnit === s.unit
    case 'surveyResponses': {
      const key = str(r.respondentKey)
      if (key && ctx.org.byId.has(key)) return person(key)
      return !!key && placeRecords(ctx, s).appIds.has(key)
    }
    case 'surveyGroups':
    case 'leaveGroups':
    case 'surveyItems':
    case 'actionItems':
    case 'actionOwners':
      return true
    default:
      return false
  }
}

function inReqs(kind: DrillKind, r: Record<string, unknown>, s: ScopeLock & { kind: 'reqs' }): boolean {
  switch (kind) {
    case 'requisitions':
      return !!str(r.reqId) && s.reqIds.has(r.reqId as string)
    case 'candidates':
      return (
        (!!str(r.applicationId) && s.appIds.has(r.applicationId as string)) ||
        (!!str(r.reqId) && s.reqIds.has(r.reqId as string))
      )
    case 'onboardingTasks':
      return (
        (!!str(r.applicationId) && s.appIds.has(r.applicationId as string)) ||
        (!!str(r.employeeId) && s.startIds.has(r.employeeId as string))
      )
    case 'employees':
      return !!str(r.employeeId) && s.startIds.has(r.employeeId as string)
    case 'actionItems':
    case 'actionOwners':
      return true
    default:
      return false
  }
}

/** Whether a raw drill row is inside the context's scope. Always true without a scope. */
export function inScope(kind: DrillKind, row: unknown, ctx: ScopeCtx): boolean {
  const s = scopeOfAccess(ctx.access)
  if (!s) return true
  const r = (row ?? {}) as Record<string, unknown>
  switch (s.kind) {
    case 'org':
      return inOrg(kind, r, ctx, s)
    case 'unit':
    case 'region':
      return inPlace(kind, r, ctx, s)
    case 'reqs':
      return inReqs(kind, r, s)
  }
}

/** The rows of a drill inside the scope, and how many were left out. */
export function rowsInScope<K extends DrillKind>(
  spec: DrillSpec<K>,
  ctx: ScopeCtx,
): { rows: DrillSpec<K>['rows']; leftOut: number } {
  if (!scopeOfAccess(ctx.access)) return { rows: spec.rows, leftOut: 0 }
  const rows = spec.rows.filter((r) => inScope(spec.kind, r, ctx))
  return { rows, leftOut: spec.rows.length - rows.length }
}

/**
 * Whether a person may open (the full person card, Focus on): someone inside the scope, always
 * true without one. In a `reqs` scope only a matched pre-hire opens.
 */
export function personInScope(id: string | null | undefined, access: ScopeHolder): boolean {
  const s = scopeOfAccess(access)
  if (!s) return true
  if (!id) return false
  switch (s.kind) {
    case 'org':
      return s.orgIds.has(id)
    case 'unit':
    case 'region':
      return s.memberIds.has(id)
    case 'reqs':
      return s.startIds.has(id)
  }
}

/** Today's names, kept as wrappers (docs/ROLES-V2.md 8.1). */
export const inLock = inScope
export const rowsInLock = rowsInScope
export const personInLock = personInScope
