/**
 * Which Action center items a mode lists (docs/ROLES-V2.md 6.1; docs/ROLES.md 3.3 and 3.4). Pure.
 *
 * 1. What the mode lists (`itemsShown`): in every allowlist mode (all but Developer, HR and CHRO)
 *    an item is listed when the mode shows its view, its tab, its subject kind and its drill kind,
 *    and its id is on no hidden item prefix (Manager's I-9 rule stays). Developer, HR and CHRO list
 *    every item.
 * 2. The scope (`itemInScope`): an item about the scope (its `place` or its subject inside it), or
 *    one anywhere owned by someone in it. The Action center applies this to its wide run
 *    (`withoutScope`); its scoped run is already inside the scope.
 *
 * 3. Whose an item is (`roleItems`: needs, waiting, left), with the routing in `policy/routing.ts`
 *    (docs/ACTION-CENTER-AUDIT.md 4.4 and 5.12). The Action center calls it over its collection,
 *    so the page, the masthead count, the homes and Ask read the same two lists.
 */
import type { ISODate } from '@/data/schema'
import { daysBetween, isValidDate } from '@/lib/dates'
import type { ActionItem, ActionOwnerRole } from '@/views/types'
import type { AccessContext } from './context'
import type { Mode } from './modes'
import { isTableMode } from './policy'
import {
  ESCALATING_KINDS,
  ESCALATION_DAYS,
  isUnlisted,
  itemKindOf,
  kindMatches,
  listOf,
  ROUTING,
} from './policy/routing'
import { personInScope, scopeOfAccess } from './scopes/records'

/** Whether an item is listed in this mode (its view, tab, kinds and id). */
export function itemShown(access: Pick<AccessContext, 'can'>, item: ActionItem): boolean {
  if (!access.can(`item:${item.id}`)) return false
  if (!access.can(`view:${item.view}`)) return false
  if (item.tab && !access.can(`tab:${item.view}.${item.tab}`)) return false
  if (item.subject.kind !== 'none' && !access.can(`drill:${item.subject.kind}`)) return false
  // A drill given as a spec names its kind; one built on click is checked by the records panel.
  const d = item.drill
  if (d && typeof d === 'object' && !access.can(`drill:${d.kind}`)) return false
  return true
}

/** The items a mode lists, the same array when every one is. */
export function itemsShown<T extends ActionItem>(
  access: Pick<AccessContext, 'can' | 'mode'>,
  items: readonly T[],
): T[] {
  if (!isTableMode(access.mode)) return items as T[]
  const out = items.filter((i) => itemShown(access, i))
  return out.length === items.length ? (items as T[]) : out
}

/** Subject kinds whose id is an employee ID. */
const PERSON_KINDS: ReadonlySet<string> = new Set([
  'employees',
  'jobChanges',
  'reviews',
  'learning',
  'comp',
  'rightToWork',
  'transactions',
])

/**
 * Owner groups that work a queue for the whole company: a recruiter, a coordinator or an HR agent
 * who sits in a business unit or a region still works items about people anywhere. In those
 * scopes their items count only when the item is about the scope.
 */
const QUEUE_OWNERS: ReadonlySet<ActionOwnerRole> = new Set([
  'recruiter',
  'coordinator',
  'hr-ops',
  'payroll',
  'benefits',
  'immigration',
  'trade-compliance',
  'talent',
  'total-rewards',
  'it',
  'facilities',
  'finance',
])

/**
 * Whether an item is inside the scope: about someone or something in it (its subject, or its
 * `place`), or owned by someone in it. In a business unit or region scope an owner in a queue
 * group (`QUEUE_OWNERS`) does not bring an item in on their own: its drill would open nothing in
 * the scope. Always true without a scope.
 */
export function itemInScope(access: Pick<AccessContext, 'scope' | 'lock'>, item: ActionItem): boolean {
  const s = scopeOfAccess(access)
  if (!s) return true
  const queue = (s.kind === 'unit' || s.kind === 'region') && QUEUE_OWNERS.has(item.ownerRole)
  if (!queue && item.ownerId && personInScope(item.ownerId, access)) return true
  const { kind, id } = item.subject
  switch (s.kind) {
    case 'org':
    case 'unit':
    case 'region': {
      if (id && PERSON_KINDS.has(kind)) return personInScope(id, access)
      const p = item.place
      if (!p) return false
      if (s.kind === 'unit') return p.businessUnit === s.unit
      if (s.kind === 'region') return (!!p.location && s.sites.includes(p.location)) || p.region === s.region
      return false
    }
    case 'reqs':
      if (!id) return false
      if (kind === 'requisitions') return s.reqIds.has(id)
      if (kind === 'candidates') return s.appIds.has(id)
      if (kind === 'employees' || kind === 'onboardingTasks') return s.startIds.has(id) || s.appIds.has(id)
      return false
  }
}

/* ───────────── whose it is: roleItems (docs/ROLES-V2.md 6.1; docs/ACTION-CENTER-AUDIT.md 4.4) ───────────── */

/** Who is looking: the mode, its person ("me": the manager, the one recruiter) and the date items are judged on. */
export interface RoleLens {
  mode: Mode
  /** The manager (Manager) or the one recruiter (Recruiter); null for "Every recruiter" and the modes without one. */
  me: { id: string | null; name: string } | null
  asOf: ISODate
  /** A critical item overdue more than this many days escalates (`escalationDays` on `actions.items.critical`). */
  escalationDays: number
}

/** What `roleItems` reads from a collected item (the Action center's `OpenAction` fits). */
export interface RoutedItem {
  item: ActionItem
  /** The owner's employee ID, given or matched on the roster. */
  ownerId: string | null
  ownerName: string
  /** The owner group. */
  role: ActionOwnerRole
  /** Owned by a team queue rather than a named person (without it: a person when an ID is known). */
  isTeam?: boolean
}

export interface RoleLists<T> {
  /** Every item the mode lists (its full list in Developer, HR and CHRO), in the order given. */
  listed: T[]
  /** "Needs attention": owned by the role, its person or its queues, most pressing first. */
  needs: T[]
  /** "Waiting on others": in the role's area, owned by someone else. */
  waiting: T[]
  /** Items in neither list (said as a count, never shown); in Developer, HR and CHRO, the ones not listed at all. */
  left: number
}

/** The lens for an access context: its mode and the person its scope names. */
export function lensOf(
  access: Pick<AccessContext, 'mode' | 'scope' | 'lock'>,
  asOf: ISODate,
  escalationDays: number = ESCALATION_DAYS,
): RoleLens {
  const s = scopeOfAccess(access)
  // The regional HR business partner named in Settings (Official lists, Regions), if any.
  const me =
    s?.kind === 'org'
      ? { id: s.managerId, name: s.managerName }
      : s?.kind === 'reqs'
        ? { id: s.recruiterId, name: s.recruiter }
        : s?.kind === 'region'
          ? (s.owner ?? null)
          : null
  return { mode: access.mode, me, asOf, escalationDays }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * About a site or the region rather than one person or record: no subject record, and a place
 * that names a location or region (an exit survey reason at a site, day-30 readiness in a region).
 */
export function isSiteMatter(item: Pick<ActionItem, 'subject' | 'place'>): boolean {
  return item.subject.kind === 'none' && !!(item.place?.location || item.place?.region)
}

/** Whether the lens's person owns an item: by employee ID, else by name. Null without a person. */
export function isMine(
  lens: Pick<RoleLens, 'me'>,
  a: Pick<RoutedItem, 'ownerId' | 'ownerName'>,
): boolean | null {
  const me = lens.me
  if (!me) return null
  if (me.id && a.ownerId) return me.id === a.ownerId
  return sameName(me.name, a.ownerName)
}

/**
 * Why an item escalates (ROLES-V2 5.4): 0 legal exposure, 1 a critical role at high risk or a
 * regretted exit cluster, 2 a critical item overdue more than the escalation days; null when it
 * does not.
 */
export function escalationRank(
  item: ActionItem,
  lens: Pick<RoleLens, 'asOf' | 'escalationDays'>,
): number | null {
  if (item.exposure) return 0
  if (item.severity !== 'critical') return null
  if (kindMatches(itemKindOf(item.id), ESCALATING_KINDS)) return 1
  const due = item.due
  if (due && isValidDate(due) && daysBetween(due, lens.asOf) > lens.escalationDays) return 2
  return null
}

/**
 * Split the items a mode lists into its two lists by the routing table (`policy/routing.ts`).
 * Order is kept (the Action center hands them most pressing first); escalations go by their
 * reason first (legal exposure, then the critical kinds, then long overdue).
 */
export function roleItems<T extends RoutedItem>(items: readonly T[], lens: RoleLens): RoleLists<T> {
  const routing = ROUTING[lens.mode]
  const needs: { a: T; rank: number }[] = []
  const waiting: T[] = []
  const listed: T[] = []
  let left = 0
  const escalating = routing.rules.some((r) => r.escalation)
  for (const a of items) {
    const kind = itemKindOf(a.item.id)
    if (isUnlisted(routing, kind, a.role)) {
      left++
      continue
    }
    listed.push(a)
    const rank = escalationRank(a.item, lens)
    const list = listOf(routing, {
      kind,
      owner: a.role,
      severity: a.item.severity,
      mine: isMine(lens, a),
      escalation: rank != null,
      site: isSiteMatter(a.item),
      person: a.isTeam === undefined ? !!a.ownerId : !a.isTeam,
    })
    if (list === 'needs') needs.push({ a, rank: rank ?? 0 })
    else if (list === 'waiting') waiting.push(a)
    // Developer, HR and CHRO list every item in their full list: only the unlisted are left.
    else if (!escalating) left++
  }
  if (escalating) needs.sort((x, y) => x.rank - y.rank)
  return { listed, needs: needs.map((x) => x.a), waiting, left }
}
