/**
 * Org design at asOf: spans of control, layers, manager health and single-report chains.
 *
 * Spans count active direct reports of every worker type (contractors and interns report to
 * regular managers). A manager is an active person in scope with at least one active direct
 * report in scope. Every lookup goes through maps built once (no find-in-loop).
 */
import type { Employee, ISODate } from '@/data/schema'
import { addMonths, daysBetween } from '@/lib/dates'
import { directReports, exitsIn, isActiveAt } from '@/lib/people'
import { median } from '@/lib/stats'
import { activeWorkers, type Prep } from './base'

export type ManagerFlag = 'Overloaded' | 'Heavy' | 'Light' | 'New' | 'Healthy'

export interface ManagerRow {
  managerId: string
  name: string
  jobTitle: string
  department: string
  location: string
  directs: number
  totalOrg: number
  tenureMonths: number
  managerSince: ISODate
  newManager: boolean
  regretted12: number
  flag: ManagerFlag
}

export interface ChainRow {
  managerId: string
  manager: string
  department: string
  reportId: string
  report: string
  reportTitle: string
  below: number
}

export interface SpanBucketRow {
  bucket: string
  managers: number
  share: number
}

export interface LayerRow {
  businessUnit: string
  layers: number
  people: number
}

export interface OrgModel {
  managers: ManagerRow[]
  spanBuckets: SpanBucketRow[]
  meanSpan: number | null
  medianSpan: number | null
  /** Individual contributors per manager. */
  managerRatio: number | null
  layers: number | null
  layersByBu: LayerRow[]
  chains: ChainRow[]
  /** People more than 7 levels below the top of the scope. */
  deep: { people: Employee[]; maxDepth: number }
  activeWorkers: number
}

export const SPAN_BUCKETS = ['1', '2', '3-5', '6-8', '9-11', '12+'] as const
export function spanBucket(n: number): (typeof SPAN_BUCKETS)[number] {
  if (n <= 1) return '1'
  if (n === 2) return '2'
  if (n <= 5) return '3-5'
  if (n <= 8) return '6-8'
  if (n <= 11) return '9-11'
  return '12+'
}

/**
 * Span flags for line managers. Executives (E levels) lead leadership teams whose size is set by
 * the org design, so they are flagged only when new.
 */
export function managerFlag(directs: number, isNew: boolean, level?: string | null): ManagerFlag {
  if (level?.startsWith('E')) return isNew ? 'New' : 'Healthy'
  if (directs >= 12) return 'Overloaded'
  if (directs >= 9) return 'Heavy'
  if (directs < 3) return 'Light'
  if (isNew) return 'New'
  return 'Healthy'
}

/**
 * Direct reports of every worker type per manager at d (the shared `directReports` with
 * `allWorkers`), kept to managers who are themselves active and in scope.
 */
export function activeChildren(people: readonly Employee[], d: ISODate): Map<string, Employee[]> {
  const ids = new Set(people.filter((e) => isActiveAt(e, d)).map((e) => e.employeeId))
  const out = directReports(people, d, { allWorkers: true })
  for (const id of [...out.keys()]) if (!ids.has(id)) out.delete(id)
  return out
}

/** Number of people below each person (cycle-safe, memoized). */
export function subtreeSizer(children: Map<string, Employee[]>): (id: string) => number {
  const memo = new Map<string, number>()
  const size = (id: string, guard: Set<string>): number => {
    const hit = memo.get(id)
    if (hit !== undefined) return hit
    if (guard.has(id)) return 0
    guard.add(id)
    let n = 0
    for (const c of children.get(id) ?? []) n += 1 + size(c.employeeId, guard)
    memo.set(id, n)
    return n
  }
  return (id) => size(id, new Set())
}

/** Depth below the top of the population (0 = no in-scope manager above), cycle-safe. */
export function depthOf(active: readonly Employee[], sameGroup?: (a: Employee, b: Employee) => boolean) {
  const byId = new Map(active.map((e) => [e.employeeId, e]))
  const memo = new Map<string, number>()
  const depth = (e: Employee, guard: Set<string>): number => {
    const hit = memo.get(e.employeeId)
    if (hit !== undefined) return hit
    if (guard.has(e.employeeId)) return 0
    guard.add(e.employeeId)
    const m = e.managerId ? byId.get(e.managerId) : undefined
    const d = m && m !== e && (!sameGroup || sameGroup(e, m)) ? 1 + depth(m, guard) : 0
    memo.set(e.employeeId, d)
    return d
  }
  return (e: Employee) => depth(e, new Set())
}

/** When the person started managing: their move from an individual level to a manager level, else their hire date. */
export function managerSince(e: Employee, becameManager: ISODate | null): ISODate {
  return becameManager && becameManager > e.hireDate ? becameManager : e.hireDate
}

export function computeOrg(p: Prep): OrgModel {
  const { asOf, people, t12 } = p
  const active = activeWorkers(people, asOf)
  const children = activeChildren(active, asOf)
  const below = subtreeSizer(children)
  const yearAgo = addMonths(asOf, -12)

  const regretted = new Map<string, number>()
  for (const e of exitsIn(p.emps, t12)) {
    if (e.terminationType !== 'Voluntary' || e.regrettable !== true || !e.managerId) continue
    regretted.set(e.managerId, (regretted.get(e.managerId) ?? 0) + 1)
  }

  const byId = new Map(active.map((e) => [e.employeeId, e]))
  const managers: ManagerRow[] = []
  for (const [id, kids] of children) {
    const m = byId.get(id)
    if (!m) continue
    const since = managerSince(m, p.history.becameManager(id))
    const isNew = since > yearAgo
    managers.push({
      managerId: id,
      name: m.name,
      jobTitle: m.jobTitle,
      department: m.department,
      location: m.location,
      directs: kids.length,
      totalOrg: below(id),
      tenureMonths: Math.max(0, Math.floor(daysBetween(m.hireDate, asOf) / 30.436875)),
      managerSince: since,
      newManager: isNew,
      regretted12: regretted.get(id) ?? 0,
      flag: managerFlag(kids.length, isNew, m.level),
    })
  }
  managers.sort((a, b) => b.directs - a.directs || b.totalOrg - a.totalOrg || a.name.localeCompare(b.name))

  const spans = managers.map((m) => m.directs)
  const bucketCounts = new Map<string, number>()
  for (const s of spans) bucketCounts.set(spanBucket(s), (bucketCounts.get(spanBucket(s)) ?? 0) + 1)
  const spanBuckets = SPAN_BUCKETS.map((bucket) => ({
    bucket,
    managers: bucketCounts.get(bucket) ?? 0,
    share: spans.length ? (bucketCounts.get(bucket) ?? 0) / spans.length : 0,
  }))

  const depth = depthOf(active)
  let maxDepth = -1
  const deepPeople: Employee[] = []
  for (const e of active) {
    const d = depth(e)
    if (d > maxDepth) maxDepth = d
    if (d > 7) deepPeople.push(e)
  }

  const buDepth = depthOf(active, (a, b) => a.businessUnit === b.businessUnit)
  const buLayers = new Map<string, { layers: number; people: number }>()
  for (const e of active) {
    const row = buLayers.get(e.businessUnit) ?? { layers: 0, people: 0 }
    row.layers = Math.max(row.layers, buDepth(e) + 1)
    row.people++
    buLayers.set(e.businessUnit, row)
  }

  const chains: ChainRow[] = []
  for (const [id, kids] of children) {
    if (kids.length !== 1) continue
    const m = byId.get(id)
    const r = kids[0]
    const n = below(r.employeeId)
    if (!m || n < 5) continue
    chains.push({
      managerId: id,
      manager: m.name,
      department: m.department,
      reportId: r.employeeId,
      report: r.name,
      reportTitle: r.jobTitle,
      below: n,
    })
  }
  chains.sort((a, b) => b.below - a.below)

  const enough = spans.length >= 1
  return {
    managers,
    spanBuckets,
    meanSpan: enough ? spans.reduce((a, b) => a + b, 0) / spans.length : null,
    medianSpan: enough ? median(spans) : null,
    managerRatio: enough ? (active.length - spans.length) / spans.length : null,
    layers: active.length ? maxDepth + 1 : null,
    layersByBu: [...buLayers.entries()]
      .map(([businessUnit, r]) => ({ businessUnit, layers: r.layers, people: r.people }))
      .sort((a, b) => b.layers - a.layers || b.people - a.people),
    chains,
    deep: { people: deepPeople, maxDepth: Math.max(0, maxDepth) },
    activeWorkers: active.length,
  }
}
