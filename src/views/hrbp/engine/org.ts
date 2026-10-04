/**
 * Org design at asOf: spans of control, layers, manager health and single-report chains.
 *
 * Spans count active direct reports of every worker type (contractors and interns report to
 * regular managers). A manager is an active person in scope with at least one active direct
 * report in scope. Every lookup goes through maps built once (no find-in-loop).
 */
import type { Employee, ISODate } from '@/data/schema'
import { addMonths, daysBetween } from '@/lib/dates'
import { directReports, isActiveAt } from '@/lib/people'
import { median } from '@/lib/stats'
import { activeWorkers, type Prep } from './base'
import { exitsIn } from './population'
import { defaultSettings, type HrbpSettings } from './settings'

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
  /** The manager's own record. */
  employee: Employee
  /** Active direct reports of every worker type (`directs`). */
  reports: Employee[]
  /** Regretted voluntary leavers who reported to them, last 12 months (`regretted12`). */
  regrettedLeavers: Employee[]
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
  /** Every span in the bucket is a span outlier (the "Span outliers" settings): the chart marks it. */
  outlier: boolean
  /** The managers behind `managers`. */
  records: ManagerRow[]
}

export interface LayerRow {
  businessUnit: string
  layers: number
  people: number
  /** The active workers behind `people` (their layer inside the unit is in `OrgModel.buLayerOf`). */
  records: Employee[]
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
  /** People below the deep-chain layer (7 by default, the Org chart's setting); the top is layer 1. */
  deep: { people: Employee[]; maxDepth: number }
  /** The flag thresholds in force, for the manager table's filters. */
  flags: Readonly<HrbpSettings['managerFlag']>
  activeWorkers: number
  /** Active workers who manage nobody: the numerator of the manager ratio. */
  individuals: Employee[]
  /** Reporting layer of every active worker, counted from the top of the scope (1 = top). */
  layerOf: Map<string, number>
  /** Reporting layer of every active worker inside their business unit (1 = the unit's top). */
  buLayerOf: Map<string, number>
  /** Everyone below a person (every level, active today, in scope): the people behind `totalOrg` and `below`. */
  peopleBelow: (id: string) => Employee[]
}

export const SPAN_BUCKETS = ['1', '2', '3-5', '6-8', '9-11', '12+'] as const

/** The spans each bucket holds, lowest and highest. */
const BUCKET_RANGE: Record<(typeof SPAN_BUCKETS)[number], readonly [number, number]> = {
  '1': [1, 1],
  '2': [2, 2],
  '3-5': [3, 5],
  '6-8': [6, 8],
  '9-11': [9, 11],
  '12+': [12, Number.POSITIVE_INFINITY],
}

/** Every span in the bucket is wide (at or above `wide`) or narrow (at or below `narrow`). */
export function isOutlierBucket(
  bucket: (typeof SPAN_BUCKETS)[number],
  outliers: HrbpSettings['spanOutliers'] = defaultSettings().spanOutliers,
): boolean {
  const [lo, hi] = BUCKET_RANGE[bucket]
  return lo >= outliers.wide || hi <= outliers.narrow
}

export function spanBucket(n: number): (typeof SPAN_BUCKETS)[number] {
  if (n <= 1) return '1'
  if (n === 2) return '2'
  if (n <= 5) return '3-5'
  if (n <= 8) return '6-8'
  if (n <= 11) return '9-11'
  return '12+'
}

/**
 * Span flags for line managers (the "Manager flag" settings: Overloaded at 12, Heavy at 9, Light
 * under 3 by default). Executives (E levels) lead leadership teams whose size is set by the org
 * design, so they are flagged only when new.
 */
export function managerFlag(
  directs: number,
  isNew: boolean,
  level?: string | null,
  flags: HrbpSettings['managerFlag'] = defaultSettings().managerFlag,
): ManagerFlag {
  if (level?.startsWith('E')) return isNew ? 'New' : 'Healthy'
  if (directs >= flags.overloaded) return 'Overloaded'
  if (directs >= flags.heavy) return 'Heavy'
  if (directs < flags.light) return 'Light'
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

/** Everyone below each person, in the same walk as `subtreeSizer` (so the counts agree). */
export function subtreeCollector(children: Map<string, Employee[]>): (id: string) => Employee[] {
  return (id) => {
    const out: Employee[] = []
    const guard = new Set<string>([id])
    const walk = (at: string) => {
      for (const c of children.get(at) ?? []) {
        out.push(c)
        if (guard.has(c.employeeId)) continue
        guard.add(c.employeeId)
        walk(c.employeeId)
      }
    }
    walk(id)
    return out
  }
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
  // New managers started managing inside the "New manager" window (12 months by default).
  const newSince = addMonths(asOf, -p.set.newManagerMonths)
  const flags = { ...p.set.managerFlag }

  const regretted = new Map<string, Employee[]>()
  for (const e of exitsIn(p.emps, t12, p.counts)) {
    if (!p.isRegretted(e) || !e.managerId) continue
    const arr = regretted.get(e.managerId)
    if (arr) arr.push(e)
    else regretted.set(e.managerId, [e])
  }

  const byId = new Map(active.map((e) => [e.employeeId, e]))
  const managers: ManagerRow[] = []
  for (const [id, kids] of children) {
    const m = byId.get(id)
    if (!m) continue
    const since = managerSince(m, p.history.becameManager(id))
    const isNew = since > newSince
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
      regretted12: regretted.get(id)?.length ?? 0,
      flag: managerFlag(kids.length, isNew, m.level, flags),
      employee: m,
      reports: kids,
      regrettedLeavers: regretted.get(id) ?? [],
    })
  }
  managers.sort((a, b) => b.directs - a.directs || b.totalOrg - a.totalOrg || a.name.localeCompare(b.name))

  const spans = managers.map((m) => m.directs)
  const outliers = { ...p.set.spanOutliers }
  const byBucket = new Map<string, ManagerRow[]>()
  for (const m of managers) {
    const k = spanBucket(m.directs)
    const arr = byBucket.get(k)
    if (arr) arr.push(m)
    else byBucket.set(k, [m])
  }
  const spanBuckets: SpanBucketRow[] = SPAN_BUCKETS.map((bucket) => {
    const records = byBucket.get(bucket) ?? []
    return {
      bucket,
      managers: records.length,
      share: spans.length ? records.length / spans.length : 0,
      outlier: isOutlierBucket(bucket, outliers),
      records,
    }
  })

  const depth = depthOf(active)
  // Below the deep-chain layer (layer 1 is the top), as the Org chart counts it.
  const deepChain = p.set.orgDepth.deepChain
  let maxDepth = -1
  const deepPeople: Employee[] = []
  const layerOf = new Map<string, number>()
  for (const e of active) {
    const d = depth(e)
    layerOf.set(e.employeeId, d + 1)
    if (d > maxDepth) maxDepth = d
    if (d + 1 > deepChain) deepPeople.push(e)
  }

  const buDepth = depthOf(active, (a, b) => a.businessUnit === b.businessUnit)
  const buLayerOf = new Map<string, number>()
  const buLayers = new Map<string, { layers: number; people: number; records: Employee[] }>()
  for (const e of active) {
    const layer = buDepth(e) + 1
    buLayerOf.set(e.employeeId, layer)
    const row = buLayers.get(e.businessUnit) ?? { layers: 0, people: 0, records: [] }
    row.layers = Math.max(row.layers, layer)
    row.people++
    row.records.push(e)
    buLayers.set(e.businessUnit, row)
  }

  const chains: ChainRow[] = []
  const minBelow = p.set.chainMinBelow
  for (const [id, kids] of children) {
    if (kids.length !== 1) continue
    const m = byId.get(id)
    const r = kids[0]
    const n = below(r.employeeId)
    if (!m || n < minBelow) continue
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
      .map(([businessUnit, r]) => ({ businessUnit, layers: r.layers, people: r.people, records: r.records }))
      .sort((a, b) => b.layers - a.layers || b.people - a.people),
    chains,
    deep: { people: deepPeople, maxDepth: Math.max(0, maxDepth) },
    flags,
    activeWorkers: active.length,
    individuals: active.filter((e) => !children.has(e.employeeId)),
    layerOf,
    buLayerOf,
    peopleBelow: subtreeCollector(children),
  }
}
