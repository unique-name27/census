/**
 * Groups items by who they wait on: owner groups in `ACTION_OWNER_ROLES` order (Managers, HR
 * business partners, Recruiters …), and inside each group one block per person or team, the
 * owner with the most pressing items first. Pure.
 */
import type { Severity } from '@/components/types'
import type { ISODate } from '@/data/schema'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionOwnerRole } from '@/views/types'
import { compareActions, type OpenAction } from './collect'
import { daysToDue } from './due'

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

export interface OwnerBlock {
  /** `OpenAction.ownerKey`, plus the group, so a person in two groups has a block in each. */
  key: string
  ownerKey: string
  name: string
  ownerId: string | null
  isTeam: boolean
  role: ActionOwnerRole
  items: OpenAction[]
  overdue: number
  critical: number
  /** The most severe item. */
  worst: Severity
}

export interface OwnerGroup {
  role: ActionOwnerRole
  label: string
  owners: OwnerBlock[]
  items: OpenAction[]
  overdue: number
  critical: number
}

const isOverdue = (a: OpenAction, asOf: ISODate) => (daysToDue(a.item.due, asOf) ?? 0) < 0

export function groupByOwner(items: readonly OpenAction[], asOf: ISODate): OwnerGroup[] {
  const byRole = new Map<ActionOwnerRole, Map<string, OpenAction[]>>()
  for (const a of items) {
    let owners = byRole.get(a.role)
    if (!owners) {
      owners = new Map()
      byRole.set(a.role, owners)
    }
    const list = owners.get(a.ownerKey)
    if (list) list.push(a)
    else owners.set(a.ownerKey, [a])
  }
  const out: OwnerGroup[] = []
  for (const role of ACTION_OWNER_ROLES) {
    const owners = byRole.get(role)
    if (!owners) continue
    const blocks: OwnerBlock[] = [...owners.entries()].map(([ownerKey, list]) => {
      const sorted = [...list].sort(compareActions)
      const first = sorted[0]
      return {
        key: `${role}|${ownerKey}`,
        ownerKey,
        name: first.ownerName,
        ownerId: first.ownerId,
        isTeam: first.isTeam,
        role,
        items: sorted,
        overdue: sorted.filter((a) => isOverdue(a, asOf)).length,
        critical: sorted.filter((a) => a.item.severity === 'critical').length,
        worst: sorted.reduce<Severity>(
          (w, a) => (RANK[a.item.severity] < RANK[w] ? a.item.severity : w),
          'good',
        ),
      }
    })
    blocks.sort(
      (a, b) =>
        RANK[a.worst] - RANK[b.worst] ||
        b.overdue - a.overdue ||
        b.items.length - a.items.length ||
        a.name.localeCompare(b.name),
    )
    const all = blocks.flatMap((b) => b.items)
    out.push({
      role,
      label: ACTION_OWNER_LABEL[role],
      owners: blocks,
      items: all,
      overdue: blocks.reduce((n, b) => n + b.overdue, 0),
      critical: blocks.reduce((n, b) => n + b.critical, 0),
    })
  }
  return out
}

/** Distinct owners (a person counts once across groups). */
export function ownerCount(items: readonly OpenAction[]): number {
  return new Set(items.map((a) => a.ownerKey)).size
}
