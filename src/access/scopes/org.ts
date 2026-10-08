/**
 * The `org` scope: Manager mode's lock on one manager's subtree (docs/ROLES.md, 4.1 and 4.2;
 * docs/ROLES-V2.md 2.2). Moved here unchanged from `lock.ts` (`managerLock` is `orgScope`). The
 * leader filter may name the manager or anyone inside their org, in include mode; never anyone
 * outside it, and never in exclude mode. Pure and memoized.
 */
import type { ISODate } from '@/data/schema'
import { type Filters, isActiveAt, isEmployee, type OrgIndex, subtreeIds } from '@/data/scope'
import { orgOf } from '../copy'
import type { HeldScope, OrgScope } from './types'

const memo = new WeakMap<OrgIndex, Map<string, OrgScope | null>>()

/** The org scope for a manager, memoized per org index, as-of date and manager. Null when they are not on the roster. */
export function orgScope(
  org: OrgIndex,
  asOf: ISODate,
  managerId: string | null | undefined,
): OrgScope | null {
  if (!managerId) return null
  let byKey = memo.get(org)
  if (!byKey) {
    byKey = new Map()
    memo.set(org, byKey)
  }
  const key = `${asOf}|${managerId}`
  if (byKey.has(key)) return byKey.get(key) ?? null
  const m = org.byId.get(managerId)
  let scope: OrgScope | null = null
  if (m) {
    const orgIds = subtreeIds(org, managerId)
    let size = 0
    for (const id of orgIds) {
      const e = org.byId.get(id)
      if (e && isEmployee(e) && isActiveAt(e, asOf)) size++
    }
    const managerName = m.name || managerId
    scope = { kind: 'org', label: orgOf(managerName), managerId, managerName, orgIds, size }
  }
  byKey.set(key, scope)
  return scope
}

/** Today's name for `orgScope`. */
export const managerLock = orgScope

/**
 * An org scope that holds nobody: Manager mode before a manager is picked, or after new data no
 * longer has them. Its scope is empty, never the whole company.
 */
export function emptyLock(managerId: string | null | undefined): OrgScope {
  const id = managerId || 'none'
  let s = empties.get(id)
  if (!s) {
    s = { kind: 'org', label: '', managerId: id, managerName: '', orgIds: new Set(), size: 0 }
    empties.set(id, s)
  }
  return s
}
const empties = new Map<string, OrgScope>()

/** How many active employees a manager must lead to be picked (the leader filter's own rule). */
export const MIN_REPORTS = 3

/**
 * Whether the scope's manager can still be Manager mode's manager: active on the as-of date and
 * leading at least `MIN_REPORTS` active employees, the leader filter's list (`leaderOptions`).
 */
export function isPickableManager(org: OrgIndex, asOf: ISODate, lock: OrgScope | null): boolean {
  if (!lock) return false
  const m = org.byId.get(lock.managerId)
  if (!m || !isActiveAt(m, asOf)) return false
  const self = isEmployee(m) ? 1 : 0
  return lock.size - self >= MIN_REPORTS
}

/**
 * The scope Manager mode holds for a remembered manager: theirs when they can still be Manager
 * mode's manager (`isPickableManager`), else one that holds nobody, with `unset` (docs/ROLES.md,
 * 1.3). An ID not on the roster already scopes to nobody, so it is kept; someone who leads fewer
 * than 3 would scope to their own few records, so the scope names nobody instead.
 */
export function heldLock(
  org: OrgIndex,
  asOf: ISODate,
  managerId: string | null | undefined,
): HeldScope<OrgScope> & { lock: OrgScope } {
  const found = orgScope(org, asOf, managerId)
  const usable = found && isPickableManager(org, asOf, found)
  const scope = usable ? found : emptyLock(found ? null : managerId)
  return { scope, lock: scope, unset: !usable }
}

/** Whether a leader filter keeps to the org: the manager or someone in their org, in include mode. */
export function leaderInLock(filters: Pick<Filters, 'leaderId' | 'modes'>, lock: OrgScope): boolean {
  if (!filters.leaderId || filters.modes?.leaderId === 'exclude') return false
  return filters.leaderId === lock.managerId || lock.orgIds.has(filters.leaderId)
}

/** True when clamping replaced a leader the filters named (a link's or a saved view's leader). */
export function leaderReplaced(before: Filters, after: Filters): boolean {
  return before !== after && !!before.leaderId && before.leaderId !== after.leaderId
}
