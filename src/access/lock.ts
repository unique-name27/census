/**
 * The manager's org as a lock the mode holds, not a value the filters hold (docs/ROLES.md, 4.1
 * and 4.2). Every way the filters change goes through `clampFilters`: the leader filter may name
 * the manager or anyone inside their org, in include mode; never anyone outside it, and never in
 * exclude mode. List filters and the period stay and apply inside the org. Pure.
 */
import type { ISODate } from '@/data/schema'
import { type Filters, isActiveAt, isEmployee, type OrgIndex, subtreeIds, withMode } from '@/data/scope'

export interface ManagerLock {
  managerId: string
  managerName: string
  /** Employee IDs in the manager's org (subtreeIds), the manager included. */
  orgIds: ReadonlySet<string>
  /** Active employees in the org on the as-of date (headcount basis). */
  size: number
}

const memo = new WeakMap<OrgIndex, Map<string, ManagerLock | null>>()

/** The lock for a manager, memoized per org index, as-of date and manager. Null when they are not on the roster. */
export function managerLock(
  org: OrgIndex,
  asOf: ISODate,
  managerId: string | null | undefined,
): ManagerLock | null {
  if (!managerId) return null
  let byKey = memo.get(org)
  if (!byKey) {
    byKey = new Map()
    memo.set(org, byKey)
  }
  const key = `${asOf}|${managerId}`
  if (byKey.has(key)) return byKey.get(key) ?? null
  const m = org.byId.get(managerId)
  let lock: ManagerLock | null = null
  if (m) {
    const orgIds = subtreeIds(org, managerId)
    let size = 0
    for (const id of orgIds) {
      const e = org.byId.get(id)
      if (e && isEmployee(e) && isActiveAt(e, asOf)) size++
    }
    lock = { managerId, managerName: m.name || managerId, orgIds, size }
  }
  byKey.set(key, lock)
  return lock
}

/**
 * A lock that holds nobody: Manager mode before a manager is picked, or after new data no longer
 * has them. Its scope is empty, never the whole company.
 */
export function emptyLock(managerId: string | null | undefined): ManagerLock {
  return { managerId: managerId || 'none', managerName: '', orgIds: new Set(), size: 0 }
}

/**
 * The lock Manager mode holds for a remembered manager: theirs when they can still be Manager
 * mode's manager (`isPickableManager`), else one that holds nobody, with `unset` (docs/ROLES.md,
 * 1.3). An ID not on the roster already scopes to nobody, so it is kept; someone who leads fewer
 * than 3 would scope to their own few records, so the lock names nobody instead.
 */
export function heldLock(
  org: OrgIndex,
  asOf: ISODate,
  managerId: string | null | undefined,
): { lock: ManagerLock; unset: boolean } {
  const found = managerLock(org, asOf, managerId)
  if (found && isPickableManager(org, asOf, found)) return { lock: found, unset: false }
  return { lock: emptyLock(found ? null : managerId), unset: true }
}

/** Whether a leader filter keeps to the lock: the manager or someone in their org, in include mode. */
export function leaderInLock(filters: Pick<Filters, 'leaderId' | 'modes'>, lock: ManagerLock): boolean {
  if (!filters.leaderId || filters.modes?.leaderId === 'exclude') return false
  return filters.leaderId === lock.managerId || lock.orgIds.has(filters.leaderId)
}

/**
 * The filters inside the lock: a leader that is missing, outside the org or excluded becomes the
 * manager in include mode; a leader inside the org stays (a director can narrow to one of their
 * managers). Everything else is kept. Returns the same object when nothing changes.
 */
export function clampFilters(filters: Filters, lock: ManagerLock | null): Filters {
  if (!lock || leaderInLock(filters, lock)) return filters
  return { ...filters, leaderId: lock.managerId, modes: withMode(filters.modes, 'leaderId', 'include') }
}

/** True when clamping replaced a leader the filters named (a link's or a saved view's leader). */
export function leaderReplaced(before: Filters, after: Filters): boolean {
  return before !== after && !!before.leaderId && before.leaderId !== after.leaderId
}

/** How many active employees a manager must lead to be picked (the leader filter's own rule). */
export const MIN_REPORTS = 3

/**
 * Whether the lock's manager can still be Manager mode's manager: active on the as-of date and
 * leading at least `MIN_REPORTS` active employees, the leader filter's list (`leaderOptions`).
 */
export function isPickableManager(org: OrgIndex, asOf: ISODate, lock: ManagerLock | null): boolean {
  if (!lock) return false
  const m = org.byId.get(lock.managerId)
  if (!m || !isActiveAt(m, asOf)) return false
  const self = isEmployee(m) ? 1 : 0
  return lock.size - self >= MIN_REPORTS
}
