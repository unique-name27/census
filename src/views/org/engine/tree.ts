/**
 * The reporting tree on a date. Pure, cycle-safe, built once per (roster, as-of) and reused by the
 * chart, the sandbox and every export.
 *
 * Who is in it: everyone active on the as-of date (`isActiveAt`), every worker type, because
 * contractors and interns report to regular managers and count in spans (same rule as the HR
 * business partners view).
 *
 * Where they sit: under their manager when that manager is active too. When the manager has left
 * (or is not active yet), the person is shown under the nearest active manager further up the
 * data's chain, with a note. When the manager ID is not in the roster at all, the person sits at the
 * top level. Reporting loops are broken at their most senior member, who moves to the top level.
 * With more than one top-level person the chart gets a virtual "whole company" root.
 */
import type { Employee, ISODate } from '@/data/schema'
import { levelIndex } from '@/data/schema'
import { isActiveAt } from '@/data/scope'

/** Id of the virtual root used when the roster has several top-level people. */
export const COMPANY_ROOT = '__company__'

export type PlacementNote =
  /** The data's manager is not active on the as-of date; shown under the next active manager up. */
  | 'manager-inactive'
  /** The data's manager ID is not in the roster; shown at the top level. */
  | 'manager-missing'
  /** Part of a reporting loop in the data; moved to the top level to break it. */
  | 'cycle-broken'
  /** Lists themselves as their own manager; shown at the top level. */
  | 'self-manager'

export interface OrgTree {
  asOf: ISODate
  /** People in the tree (active on the as-of date). */
  people: ReadonlyMap<string, Employee>
  /** Effective manager per person; null = top level. */
  parent: ReadonlyMap<string, string | null>
  /** Direct reports per id (including COMPANY_ROOT when used), in display order. */
  children: ReadonlyMap<string, readonly string[]>
  /** Top-level people. */
  roots: readonly string[]
  /** The one node the chart starts from: the single top-level person, or COMPANY_ROOT. */
  rootId: string
  /** Depth below the top level (top-level people are 0; COMPANY_ROOT is -1). */
  depth: ReadonlyMap<string, number>
  /** Number of direct reports. */
  directs: ReadonlyMap<string, number>
  /** Number of people below (whole org, not counting the person). */
  total: ReadonlyMap<string, number>
  /** Why someone sits somewhere other than under their data manager. */
  notes: ReadonlyMap<string, PlacementNote>
  issues: {
    /** Reporting loops found in the data (ids in loop order). */
    cycles: string[][]
    /** People whose data manager was not usable (inactive, missing or self). */
    rehomed: string[]
  }
}

const seniority = (e: Employee | undefined) => (e?.level ? levelIndex(e.level) : -1)

/** Display order of a manager's reports: people leaders first (largest org first), then by seniority and name. */
function sortChildren(
  ids: string[],
  people: ReadonlyMap<string, Employee>,
  total: ReadonlyMap<string, number>,
) {
  return ids.sort((a, b) => {
    const ta = total.get(a) ?? 0
    const tb = total.get(b) ?? 0
    if (ta > 0 !== tb > 0) return ta > 0 ? -1 : 1
    if (ta !== tb) return tb - ta
    const sa = seniority(people.get(a))
    const sb = seniority(people.get(b))
    if (sa !== sb) return sb - sa
    return (people.get(a)?.name ?? a).localeCompare(people.get(b)?.name ?? b)
  })
}

/**
 * Derive children, roots, depth and org sizes from a parent map. Used by `buildOrgTree` and by the
 * reorg sandbox after it rewires reporting lines. The parent map must be acyclic.
 */
export function treeFromParents(
  people: ReadonlyMap<string, Employee>,
  parent: ReadonlyMap<string, string | null>,
  asOf: ISODate,
  notes: ReadonlyMap<string, PlacementNote> = new Map(),
  issues: OrgTree['issues'] = { cycles: [], rehomed: [] },
): OrgTree {
  const kids = new Map<string, string[]>()
  const roots: string[] = []
  for (const id of people.keys()) {
    const p = parent.get(id) ?? null
    if (p === null || !people.has(p)) {
      roots.push(id)
      continue
    }
    const arr = kids.get(p)
    if (arr) arr.push(id)
    else kids.set(p, [id])
  }

  // Org sizes, post-order without recursion (deep chains stay safe).
  const total = new Map<string, number>()
  const depth = new Map<string, number>()
  const order: string[] = []
  const stack: [string, number][] = roots.map((r) => [r, 0])
  while (stack.length) {
    const [id, d] = stack.pop()!
    if (depth.has(id)) continue
    depth.set(id, d)
    order.push(id)
    for (const c of kids.get(id) ?? []) stack.push([c, d + 1])
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    let n = 0
    for (const c of kids.get(id) ?? []) n += 1 + (total.get(c) ?? 0)
    total.set(id, n)
  }

  const children = new Map<string, readonly string[]>()
  const directs = new Map<string, number>()
  for (const [id, arr] of kids) {
    children.set(id, sortChildren(arr, people, total))
    directs.set(id, arr.length)
  }
  sortChildren(roots, people, total)

  let rootId = roots[0] ?? COMPANY_ROOT
  if (roots.length > 1) {
    rootId = COMPANY_ROOT
    children.set(COMPANY_ROOT, roots.slice())
    directs.set(COMPANY_ROOT, roots.length)
    total.set(COMPANY_ROOT, people.size)
    depth.set(COMPANY_ROOT, -1)
  }

  return { asOf, people, parent, children, roots, rootId, depth, directs, total, notes, issues }
}

/** The reporting tree of everyone active on `asOf`. */
export function buildOrgTree(employees: readonly Employee[], asOf: ISODate): OrgTree {
  const all = new Map<string, Employee>()
  for (const e of employees) if (e.employeeId && !all.has(e.employeeId)) all.set(e.employeeId, e)

  const people = new Map<string, Employee>()
  for (const e of all.values()) if (isActiveAt(e, asOf)) people.set(e.employeeId, e)

  const parent = new Map<string, string | null>()
  const notes = new Map<string, PlacementNote>()
  for (const e of people.values()) {
    const m = e.managerId || null
    if (!m) {
      parent.set(e.employeeId, null)
      continue
    }
    if (m === e.employeeId) {
      parent.set(e.employeeId, null)
      notes.set(e.employeeId, 'self-manager')
      continue
    }
    if (people.has(m)) {
      parent.set(e.employeeId, m)
      continue
    }
    // Walk up the data's chain through people who are not active on the date.
    const seen = new Set<string>([e.employeeId])
    let cur: string | null = m
    let found: string | null = null
    let missing = false
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (people.has(cur)) {
        found = cur
        break
      }
      const rec = all.get(cur)
      if (!rec) {
        missing = cur === m
        break
      }
      cur = rec.managerId || null
    }
    parent.set(e.employeeId, found)
    notes.set(e.employeeId, missing ? 'manager-missing' : 'manager-inactive')
  }

  // Break reporting loops at their most senior member (ties: lowest id).
  const cycles: string[][] = []
  const state = new Map<string, 1 | 2>()
  for (const start of people.keys()) {
    if (state.has(start)) continue
    const path: string[] = []
    let cur: string | null = start
    while (cur && !state.has(cur)) {
      state.set(cur, 1)
      path.push(cur)
      cur = parent.get(cur) ?? null
    }
    if (cur && state.get(cur) === 1) {
      const loop = path.slice(path.indexOf(cur))
      cycles.push(loop)
      const breaker = loop.slice().sort((a, b) => {
        const d = seniority(people.get(b)) - seniority(people.get(a))
        return d !== 0 ? d : a.localeCompare(b)
      })[0]
      parent.set(breaker, null)
      notes.set(breaker, 'cycle-broken')
    }
    for (const id of path) state.set(id, 2)
  }

  return treeFromParents(people, parent, asOf, notes, { cycles, rehomed: [...notes.keys()] })
}

/** Ids from the top of the tree down to `id` (inclusive). Cycle-safe. */
export function chainTo(tree: Pick<OrgTree, 'parent'>, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    cur = tree.parent.get(cur) ?? null
  }
  return out.reverse()
}

/** True when `id` is `ancestorId` or sits anywhere below them. */
export function isWithin(tree: Pick<OrgTree, 'parent'>, id: string, ancestorId: string): boolean {
  if (ancestorId === COMPANY_ROOT) return true
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true
    seen.add(cur)
    cur = tree.parent.get(cur) ?? null
  }
  return false
}

/** Everyone in `id`'s org including them (or the whole tree for COMPANY_ROOT). */
export function subtreeOf(tree: OrgTree, id: string): string[] {
  const out: string[] = []
  const stack = id === COMPANY_ROOT ? [...tree.roots] : tree.people.has(id) ? [id] : []
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    for (const c of tree.children.get(cur) ?? []) stack.push(c)
  }
  return out
}

/** Layers in an org: the deepest level below its top person, counted from 1. */
export function layersBelow(tree: OrgTree, id: string): number {
  if (id !== COMPANY_ROOT && !tree.people.has(id)) return 0
  const base = id === COMPANY_ROOT ? 0 : (tree.depth.get(id) ?? 0)
  let max = 0
  for (const p of subtreeOf(tree, id)) max = Math.max(max, (tree.depth.get(p) ?? 0) - base + 1)
  return max
}

/**
 * Where a filtered group enters the chart: matching people whose manager does not match (or who
 * sit at the top). Expanding the chain to these shows every matching cluster without opening
 * everything below them. Largest orgs first.
 */
export function entryPoints(tree: OrgTree, rootId: string, matches: (id: string) => boolean): string[] {
  const out: string[] = []
  for (const id of subtreeOf(tree, rootId)) {
    if (!matches(id)) continue
    const p = tree.parent.get(id) ?? null
    if (id === rootId || !p || !matches(p)) out.push(id)
  }
  return out.sort((a, b) => (tree.total.get(b) ?? 0) - (tree.total.get(a) ?? 0))
}
