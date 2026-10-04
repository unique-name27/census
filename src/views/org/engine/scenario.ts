/**
 * Reorg sandbox engine: a scenario is a list of actions applied to the as-of tree. The datasets
 * are never touched; a scenario only rewires a copy of the parent map.
 *
 *  - move, person mode: the person moves under the new manager; their direct reports roll up to
 *    the person's old manager (as in the old tool's individual drag).
 *  - move, team mode: the person moves with their whole org.
 *  - exit: the person leaves; their direct reports roll up to their manager.
 *
 * A move that would put someone under a person in their own reporting line (for example a manager
 * under one of their reports) is blocked in both modes and explained, never silently fixed.
 */
import type { Employee } from '@/data/schema'
import { levelIndex } from '@/data/schema'
import { isEmployee } from '@/data/scope'
import { plural } from '@/lib/format'
import { WIDE_SPAN } from './flags'
import { type OrgTree, treeFromParents } from './tree'

export type MoveMode = 'person' | 'team'

export type ScenarioAction =
  | { kind: 'move'; personId: string; toManagerId: string; mode: MoveMode }
  | { kind: 'exit'; personId: string }

export type BlockCode = 'unknown-person' | 'unknown-manager' | 'self' | 'same-manager' | 'cycle' | 'top'

export interface CheckResult {
  ok: boolean
  code?: BlockCode
  /** Why the action is blocked, in plain words. */
  reason?: string
  /** Things to look at before confirming; never block. */
  warnings: string[]
}

export interface Ripple extends CheckResult {
  action: ScenarioAction
  /** People who change manager. */
  changes: { id: string; from: string | null; to: string | null }[]
  /** People who move with the action (the person, plus their org in team mode). */
  peopleMoving: number
  /** Their ids, the person first. */
  movingIds: string[]
  /** Direct reports who roll up to the old manager (person mode and exits). */
  rolledUp: string[]
  oldManager: { id: string; before: number; after: number } | null
  newManager: { id: string; before: number; after: number } | null
  /**
   * People whose manager changes to one in another department (and whose old manager was not in
   * that department either). Same rule as the scenario diff, so the preview and the diff agree.
   */
  crossDept: number
  crossDeptIds: string[]
}

/** Mutable working copy of the reporting lines. */
interface Working {
  people: Map<string, Employee>
  parent: Map<string, string | null>
}

const nameIn = (w: Working, id: string | null | undefined) => (id ? (w.people.get(id)?.name ?? id) : '')

function directsOf(w: Working, id: string): string[] {
  const out: string[] = []
  for (const [k, p] of w.parent) if (p === id && w.people.has(k)) out.push(k)
  return out
}

/** The chain from `id` up to (and including) `stop`, or null when `stop` is not above `id`. */
function chainUpTo(w: Working, id: string, stop: string): string[] | null {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur && !seen.has(cur)) {
    out.push(cur)
    if (cur === stop) return out
    seen.add(cur)
    cur = w.parent.get(cur) ?? null
  }
  return null
}

function kidsIndex(w: Working): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [k, p] of w.parent) {
    if (!p || !w.people.has(k)) continue
    const arr = out.get(p)
    if (arr) arr.push(k)
    else out.set(p, [k])
  }
  return out
}

/** Everyone in `id`'s org including them. */
function orgIds(w: Working, id: string): string[] {
  const kids = kidsIndex(w)
  const out: string[] = []
  const stack = [id]
  const seen = new Set<string>()
  while (stack.length) {
    const cur = stack.pop()!
    if (seen.has(cur)) continue
    seen.add(cur)
    out.push(cur)
    for (const c of kids.get(cur) ?? []) stack.push(c)
  }
  return out
}

function check(w: Working, a: ScenarioAction): CheckResult {
  const person = w.people.get(a.personId)
  if (!person) {
    return {
      ok: false,
      code: 'unknown-person',
      reason: `${a.personId} is not in the chart on this date.`,
      warnings: [],
    }
  }
  if (a.kind === 'exit') {
    if ((w.parent.get(a.personId) ?? null) === null) {
      return {
        ok: false,
        code: 'top',
        reason: `${person.name} is at the top of the chart, so their reports would have nobody to roll up to.`,
        warnings: [],
      }
    }
    const mgr = w.parent.get(a.personId)!
    const after = directsOf(w, mgr).length - 1 + directsOf(w, a.personId).length
    const warnings: string[] = []
    if (after >= WIDE_SPAN) warnings.push(`${nameIn(w, mgr)} would have ${after} direct reports.`)
    return { ok: true, warnings }
  }

  const target = w.people.get(a.toManagerId)
  if (!target) {
    return {
      ok: false,
      code: 'unknown-manager',
      reason: `${a.toManagerId} is not in the chart on this date.`,
      warnings: [],
    }
  }
  if (a.toManagerId === a.personId) {
    return { ok: false, code: 'self', reason: `${person.name} can't report to themselves.`, warnings: [] }
  }
  if ((w.parent.get(a.personId) ?? null) === a.toManagerId) {
    return {
      ok: false,
      code: 'same-manager',
      reason: `${person.name} already reports to ${target.name}.`,
      warnings: [],
    }
  }
  const loop = chainUpTo(w, a.toManagerId, a.personId)
  if (loop) {
    const path = loop.map((id) => nameIn(w, id)).join(' → ')
    return {
      ok: false,
      code: 'cycle',
      reason: `${target.name} already reports up to ${person.name} (${path}). Moving ${person.name} under ${target.name} would create a reporting loop. Move ${target.name} out of ${person.name}'s org first.`,
      warnings: [],
    }
  }

  const warnings: string[] = []
  const newAfter = directsOf(w, a.toManagerId).length + 1
  if (newAfter >= WIDE_SPAN) warnings.push(`${target.name} would have ${newAfter} direct reports.`)
  if (person.level && target.level && levelIndex(person.level) >= levelIndex(target.level)) {
    warnings.push(
      `${person.name} (${person.level}) would report to someone at the same or a lower level (${target.name}, ${target.level}).`,
    )
  }
  if (!isEmployee(target)) {
    warnings.push(`${target.name} is ${target.employmentType === 'Intern' ? 'an intern' : 'a contractor'}.`)
  }
  const old = w.parent.get(a.personId) ?? null
  if (old) {
    const left = directsOf(w, old).length - 1 + (a.mode === 'person' ? directsOf(w, a.personId).length : 0)
    if (left === 0) warnings.push(`${nameIn(w, old)} would have no direct reports left.`)
    else if (left === 1) warnings.push(`${nameIn(w, old)} would have one direct report left.`)
  }
  return { ok: true, warnings }
}

function apply(w: Working, a: ScenarioAction) {
  if (a.kind === 'exit') {
    const mgr = w.parent.get(a.personId) ?? null
    for (const c of directsOf(w, a.personId)) w.parent.set(c, mgr)
    w.parent.delete(a.personId)
    w.people.delete(a.personId)
    return
  }
  if (a.mode === 'person') {
    const old = w.parent.get(a.personId) ?? null
    for (const c of directsOf(w, a.personId)) w.parent.set(c, old)
  }
  w.parent.set(a.personId, a.toManagerId)
}

const working = (t: OrgTree): Working => ({ people: new Map(t.people), parent: new Map(t.parent) })

/** Check one action against a tree. */
export function checkAction(tree: OrgTree, action: ScenarioAction): CheckResult {
  return check(working(tree), action)
}

/** Who moves with an action: the person, plus everyone below them when they move with their org. */
export function movingIds(tree: OrgTree, action: ScenarioAction): string[] {
  if (!tree.people.has(action.personId)) return []
  if (action.kind === 'move' && action.mode === 'team') return orgIds(working(tree), action.personId)
  return [action.personId]
}

/** People whose new manager sits in another department (the scenario diff's rule). */
function crossDeptOf(
  people: ReadonlyMap<string, Employee>,
  changes: readonly { id: string; from: string | null; to: string | null }[],
): string[] {
  const out: string[] = []
  for (const c of changes) {
    const e = people.get(c.id)
    const mgr = c.to ? people.get(c.to) : undefined
    const oldMgr = c.from ? people.get(c.from) : undefined
    if (e && mgr && mgr.department !== e.department && oldMgr?.department !== mgr.department) out.push(c.id)
  }
  return out
}

/** What an action would change, for the live preview while dragging and the move dialog. */
export function rippleOf(tree: OrgTree, action: ScenarioAction): Ripple {
  const w = working(tree)
  const res = check(w, action)
  const person = w.people.get(action.personId)
  const old = w.parent.get(action.personId) ?? null
  const directs = person ? directsOf(w, action.personId) : []
  const base: Ripple = {
    ...res,
    action,
    changes: [],
    peopleMoving: 0,
    movingIds: [],
    rolledUp: [],
    oldManager: null,
    newManager: null,
    crossDept: 0,
    crossDeptIds: [],
  }
  if (!res.ok || !person) return base

  if (action.kind === 'exit') {
    const before = old ? directsOf(w, old).length : 0
    const changes = directs.map((id) => ({ id, from: action.personId, to: old }))
    const crossDeptIds = crossDeptOf(w.people, changes)
    return {
      ...base,
      changes,
      peopleMoving: 1,
      movingIds: [action.personId],
      rolledUp: directs,
      oldManager: old ? { id: old, before, after: before - 1 + directs.length } : null,
      crossDept: crossDeptIds.length,
      crossDeptIds,
    }
  }

  const team = action.mode === 'team'
  const moving = team ? orgIds(w, action.personId) : [action.personId]
  const oldBefore = old ? directsOf(w, old).length : 0
  const newBefore = directsOf(w, action.toManagerId).length
  const changes: Ripple['changes'] = [{ id: action.personId, from: old, to: action.toManagerId }]
  if (!team) for (const c of directs) changes.push({ id: c, from: action.personId, to: old })
  const crossDeptIds = crossDeptOf(w.people, changes)
  return {
    ...base,
    changes,
    peopleMoving: moving.length,
    movingIds: moving,
    rolledUp: team ? [] : directs,
    oldManager: old
      ? { id: old, before: oldBefore, after: oldBefore - 1 + (team ? 0 : directs.length) }
      : null,
    newManager: { id: action.toManagerId, before: newBefore, after: newBefore + 1 },
    crossDept: crossDeptIds.length,
    crossDeptIds,
  }
}

/** The direct reports of the old and the new manager after a previewed action. */
export function rippleTeams(tree: OrgTree, r: Ripple): { oldAfter: string[]; newAfter: string[] } {
  const a = r.action
  const kidsOf = (id: string | undefined) => (id ? [...(tree.children.get(id) ?? [])] : [])
  const oldAfter = kidsOf(r.oldManager?.id).filter((id) => id !== a.personId)
  if (a.kind === 'exit' || a.mode === 'person') oldAfter.push(...r.rolledUp)
  const newAfter = r.newManager ? [...kidsOf(r.newManager.id), a.personId] : []
  return { oldAfter, newAfter }
}

export interface ScenarioResult {
  tree: OrgTree
  /** Actions that applied, in order. */
  applied: ScenarioAction[]
  /** Actions that no longer apply (for example after the data changed), with the reason. */
  skipped: { action: ScenarioAction; reason: string }[]
}

/** Apply a list of actions in order; invalid ones are skipped and reported. */
export function applyScenario(base: OrgTree, actions: readonly ScenarioAction[]): ScenarioResult {
  if (!actions.length) return { tree: base, applied: [], skipped: [] }
  const w = working(base)
  const applied: ScenarioAction[] = []
  const skipped: ScenarioResult['skipped'] = []
  for (const a of actions) {
    const res = check(w, a)
    if (!res.ok) {
      skipped.push({ action: a, reason: res.reason ?? 'This change no longer applies.' })
      continue
    }
    apply(w, a)
    applied.push(a)
  }
  const notes = new Map([...base.notes].filter(([id]) => w.people.has(id)))
  return { tree: treeFromParents(w.people, w.parent, base.asOf, notes, base.issues), applied, skipped }
}

/** One line describing an action, e.g. "Move Priya Rao and team to Wei Chen". */
export function describeAction(tree: Pick<OrgTree, 'people'>, a: ScenarioAction): string {
  const name = (id: string) => tree.people.get(id)?.name ?? id
  if (a.kind === 'exit') return `${name(a.personId)} leaves`
  return `Move ${name(a.personId)}${a.mode === 'team' ? ' and their org' : ''} to ${name(a.toManagerId)}`
}

/* ───────── diff ───────── */

export interface ScenarioDiff {
  reportingChanges: {
    id: string
    name: string
    fromId: string | null
    from: string
    toId: string | null
    to: string
  }[]
  removed: { id: string; name: string }[]
  spanChanges: { id: string; name: string; before: number; after: number; delta: number }[]
  managersCreated: { id: string; name: string; directs: number }[]
  managersEmptied: { id: string; name: string; before: number }[]
  newWideSpans: { id: string; name: string; directs: number }[]
  newSpansOfOne: { id: string; name: string }[]
  crossDept: { id: string; name: string; department: string; managerDepartment: string }[]
  layers: { before: number; after: number; byDepth: { layer: number; before: number; after: number }[] }
  managers: { before: number; after: number }
  avgSpan: { before: number | null; after: number | null }
}

function depthCounts(t: OrgTree): Map<number, number> {
  const out = new Map<number, number>()
  for (const id of t.people.keys()) {
    const d = (t.depth.get(id) ?? 0) + 1
    out.set(d, (out.get(d) ?? 0) + 1)
  }
  return out
}

function spanStats(t: OrgTree) {
  let managers = 0
  let reports = 0
  for (const id of t.people.keys()) {
    const n = t.directs.get(id) ?? 0
    if (n > 0) {
      managers++
      reports += n
    }
  }
  return { managers, avg: managers ? reports / managers : null }
}

/** What changes between the as-of tree and the scenario tree. */
export function diffTrees(before: OrgTree, after: OrgTree): ScenarioDiff {
  const nameOf = (id: string | null) =>
    id ? (after.people.get(id)?.name ?? before.people.get(id)?.name ?? id) : 'Top level'

  const reportingChanges: ScenarioDiff['reportingChanges'] = []
  const crossDept: ScenarioDiff['crossDept'] = []
  for (const [id, e] of after.people) {
    const from = before.parent.get(id) ?? null
    const to = after.parent.get(id) ?? null
    if (from === to) continue
    reportingChanges.push({ id, name: e.name, fromId: from, from: nameOf(from), toId: to, to: nameOf(to) })
    const mgr = to ? after.people.get(to) : undefined
    const oldMgr = from ? before.people.get(from) : undefined
    if (mgr && mgr.department !== e.department && oldMgr?.department !== mgr.department) {
      crossDept.push({ id, name: e.name, department: e.department, managerDepartment: mgr.department })
    }
  }
  reportingChanges.sort((a, b) => a.name.localeCompare(b.name))

  const removed = [...before.people.values()]
    .filter((e) => !after.people.has(e.employeeId))
    .map((e) => ({ id: e.employeeId, name: e.name }))

  const spanChanges: ScenarioDiff['spanChanges'] = []
  const managersCreated: ScenarioDiff['managersCreated'] = []
  const managersEmptied: ScenarioDiff['managersEmptied'] = []
  const newWideSpans: ScenarioDiff['newWideSpans'] = []
  const newSpansOfOne: ScenarioDiff['newSpansOfOne'] = []
  for (const id of new Set([...before.people.keys(), ...after.people.keys()])) {
    const b = before.directs.get(id) ?? 0
    const a = after.people.has(id) ? (after.directs.get(id) ?? 0) : 0
    if (a === b) continue
    const name = nameOf(id)
    if (after.people.has(id)) spanChanges.push({ id, name, before: b, after: a, delta: a - b })
    if (b === 0 && a > 0) managersCreated.push({ id, name, directs: a })
    if (b > 0 && a === 0 && after.people.has(id)) managersEmptied.push({ id, name, before: b })
    if (a >= WIDE_SPAN && b < WIDE_SPAN) newWideSpans.push({ id, name, directs: a })
    if (a === 1 && b !== 1) newSpansOfOne.push({ id, name })
  }
  spanChanges.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name))

  const db = depthCounts(before)
  const da = depthCounts(after)
  const layerKeys = [...new Set([...db.keys(), ...da.keys()])].sort((x, y) => x - y)
  const sb = spanStats(before)
  const sa = spanStats(after)

  return {
    reportingChanges,
    removed,
    spanChanges,
    managersCreated,
    managersEmptied,
    newWideSpans,
    newSpansOfOne,
    crossDept,
    layers: {
      before: layerKeys.length ? Math.max(...db.keys()) : 0,
      after: layerKeys.length ? Math.max(...da.keys()) : 0,
      byDepth: layerKeys.map((layer) => ({ layer, before: db.get(layer) ?? 0, after: da.get(layer) ?? 0 })),
    },
    managers: { before: sb.managers, after: sa.managers },
    avgSpan: { before: sb.avg, after: sa.avg },
  }
}

/** Short summary of a diff for toasts and notes: "4 people change manager · 2 spans change". */
export function diffSummary(d: ScenarioDiff): string {
  const parts = [
    plural(d.reportingChanges.length, 'person changes manager', 'people change manager'),
    plural(d.spanChanges.length, 'span changes', 'spans change'),
  ]
  if (d.removed.length) parts.push(plural(d.removed.length, 'exit'))
  if (d.layers.before !== d.layers.after) parts.push(`layers ${d.layers.before} → ${d.layers.after}`)
  return parts.join(' · ')
}
