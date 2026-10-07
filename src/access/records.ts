/**
 * The records guard (docs/ROLES.md, 4.5): in Manager mode the records panel keeps only rows about
 * the manager's org. A row is about the org when its identity is in the org's scoped data, using
 * the same scoping routes the filters use: `ctx.all` scoped to `{ leaderId: managerId }` once per
 * context (cached). Employees and employee-keyed rows by employee ID, requisitions by hiring
 * manager, candidates by their requisition, onboarding tasks by their person, succession by the
 * incumbent; Action center rows are already the listed items. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, scopeDatasets } from '@/data/scope'
import type { DrillKind, DrillSpec } from '@/drill/types'
import type { AccessContext } from './context'
import type { ManagerLock } from './lock'

type LockCtx = Pick<AnalyticsContext, 'all' | 'org'> & { access?: AccessContext }

interface OrgScope {
  reqIds: ReadonlySet<string>
  appIds: ReadonlySet<string>
}

const scopes = new WeakMap<object, Map<string, OrgScope>>()

function orgScope(ctx: LockCtx, lock: ManagerLock): OrgScope {
  let byManager = scopes.get(ctx.all)
  if (!byManager) {
    byManager = new Map()
    scopes.set(ctx.all, byManager)
  }
  let s = byManager.get(lock.managerId)
  if (!s) {
    const data = scopeDatasets(ctx.all, { ...DEFAULT_FILTERS, modes: {}, leaderId: lock.managerId }, ctx.org)
    s = {
      reqIds: new Set(data.requisitions.map((r) => r.reqId)),
      appIds: new Set(data.candidates.map((c) => c.applicationId)),
    }
    byManager.set(lock.managerId, s)
  }
  return s
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Whether a raw drill row is about the manager's org. Always true outside Manager mode. */
export function inLock(kind: DrillKind, row: unknown, ctx: LockCtx): boolean {
  const lock = ctx.access?.lock
  if (!lock) return true
  const r = (row ?? {}) as Record<string, unknown>
  const person = (id: unknown) => {
    const s = str(id)
    return !!s && lock.orgIds.has(s)
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
      return person(r.incumbentId) && r.incumbentId !== lock.managerId
    case 'requisitions':
      return !!str(r.reqId) && orgScope(ctx, lock).reqIds.has(r.reqId as string)
    case 'candidates':
      return (
        (!!str(r.applicationId) && orgScope(ctx, lock).appIds.has(r.applicationId as string)) ||
        (!!str(r.reqId) && orgScope(ctx, lock).reqIds.has(r.reqId as string))
      )
    case 'onboardingTasks': {
      if (str(r.employeeId) && ctx.org.byId.has(r.employeeId as string)) return person(r.employeeId)
      return !!str(r.applicationId) && orgScope(ctx, lock).appIds.has(r.applicationId as string)
    }
    case 'cases':
      return person(r.requesterId)
    case 'actionItems':
    case 'actionOwners':
      // The Action center lists only its items for the org; their rows are kept as listed.
      return true
    default:
      // Grouped kinds (surveys, leave) and the hiring plan are hidden in Manager mode.
      return false
  }
}

/** The rows of a drill that Manager mode lists, and how many were left out. */
export function rowsInLock<K extends DrillKind>(
  spec: DrillSpec<K>,
  ctx: LockCtx,
): { rows: DrillSpec<K>['rows']; leftOut: number } {
  if (!ctx.access?.lock) return { rows: spec.rows, leftOut: 0 }
  const rows = spec.rows.filter((r) => inLock(spec.kind, r, ctx))
  return { rows, leftOut: spec.rows.length - rows.length }
}

/** Whether a person may open in Manager mode: someone in the org (always true in other modes). */
export function personInLock(
  id: string | null | undefined,
  access: Pick<AccessContext, 'lock'> | null | undefined,
): boolean {
  if (!access?.lock) return true
  return !!id && access.lock.orgIds.has(id)
}
