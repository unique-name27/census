/**
 * Potential and succession: critical and key roles with their named successors, bench strength,
 * readiness and where high potentials sit. Successors who have left are not counted.
 * Pure: no React, no DOM.
 */
import { LEVELS, MIN_GROUP, READINESS, type Readiness, type SuccessionPlan } from '@/data/schema'
import { isActiveAt } from '@/lib/people'
import { type Cycle, nameOf, reviewIn, type TalentBase, UNKNOWN } from './base'
import type { PersonRisk, RiskBand } from './risk'

export type RoleStatus = 'Covered' | 'Thin' | 'No successor'
export type Coverage = Readiness | 'No successor'
export const COVERAGE_ORDER: readonly Coverage[] = [...READINESS, 'No successor']
export const READINESS_SHORT: Record<Readiness, string> = {
  'Ready now': 'ready now',
  'Ready in 1-2 years': 'in 1-2 yrs',
  'Ready in 3+ years': 'in 3+ yrs',
}

export interface RoleRow {
  roleId: string
  roleTitle: string
  incumbentId: string
  incumbent: string
  businessUnit: string
  department: string
  criticality: 'Critical' | 'Key' | null
  /** Risk of loss recorded in the succession plan. */
  riskOfLoss: 'High' | 'Medium' | 'Low' | null
  /** Flight-risk band from the Census model, for comparison. */
  modelRisk: RiskBand | null
  successors: number
  readyNow: number
  ready1to2: number
  ready3plus: number
  readiness: string
  successorNames: string
  status: RoleStatus
  /** Best readiness on the bench, or "No successor". */
  coverage: Coverage
  updatedDate: string | null
}

export interface CoverageRow {
  businessUnit: string
  coverage: Coverage
  roles: number
}

export interface BenchRow {
  businessUnit: string
  readiness: Readiness
  successors: number
}

export interface BenchTableRow {
  businessUnit: string
  roles: number
  successors: number
  perRole: number | null
  readyNow: number
  ready1to2: number
  ready3plus: number
  noSuccessor: number
}

export interface PipelineRow {
  readiness: Readiness
  criticality: 'Critical' | 'Key'
  successors: number
}

export interface HipoGroupRow {
  /** Level or business unit. */
  group: string
  assessed: number
  high: number
  share: number | null
}

export interface SuccessionResult {
  roles: RoleRow[]
  critical: number
  criticalCovered: number
  coverage: number | null
  coverageByUnit: CoverageRow[]
  bench: BenchRow[]
  benchTable: BenchTableRow[]
  pipeline: PipelineRow[]
  potentialCycle: Cycle | null
  hipoByLevel: HipoGroupRow[]
  hipoByUnit: HipoGroupRow[]
  hipoShare: number | null
  hipoHigh: number
  hipoAssessed: number
  /** Successors named in the plan who have since left. */
  departedSuccessors: number
}

const STATUS_RANK: Record<RoleStatus, number> = { 'No successor': 0, Thin: 1, Covered: 2 }

export function computeSuccession(base: TalentBase, risk: Map<string, PersonRisk>): SuccessionResult {
  const { asOf } = base
  const plans = base.ctx.data.succession
  const byRole = new Map<string, SuccessionPlan[]>()
  for (const p of plans) {
    const arr = byRole.get(p.roleId)
    if (arr) arr.push(p)
    else byRole.set(p.roleId, [p])
  }
  let departedSuccessors = 0
  const roles: RoleRow[] = []
  for (const [roleId, rows] of byRole) {
    const first = rows[0]
    const inc = base.byId.get(first.incumbentId)
    const seen = new Set<string>()
    const bench: { id: string; readiness: Readiness | null }[] = []
    for (const r of rows) {
      if (!r.successorId || seen.has(r.successorId)) continue
      seen.add(r.successorId)
      const s = base.byId.get(r.successorId)
      if (s && !isActiveAt(s, asOf)) {
        departedSuccessors++
        continue
      }
      bench.push({ id: r.successorId, readiness: r.readiness ?? null })
    }
    const count = (k: Readiness) => bench.filter((b) => b.readiness === k).length
    const readyNow = count('Ready now')
    const ready1to2 = count('Ready in 1-2 years')
    const ready3plus = count('Ready in 3+ years')
    const coverage: Coverage = readyNow
      ? 'Ready now'
      : ready1to2
        ? 'Ready in 1-2 years'
        : ready3plus
          ? 'Ready in 3+ years'
          : 'No successor'
    const parts: string[] = []
    for (const [k, v] of [
      ['Ready now', readyNow],
      ['Ready in 1-2 years', ready1to2],
      ['Ready in 3+ years', ready3plus],
    ] as const) {
      if (v) parts.push(`${v} ${READINESS_SHORT[k]}`)
    }
    const unknown = bench.length - readyNow - ready1to2 - ready3plus
    if (unknown > 0) parts.push(`${unknown} not assessed`)
    roles.push({
      roleId,
      roleTitle: first.roleTitle || roleId,
      incumbentId: first.incumbentId,
      incumbent: nameOf(base, first.incumbentId),
      businessUnit: inc?.businessUnit ?? UNKNOWN,
      department: inc?.department ?? UNKNOWN,
      criticality: first.criticality ?? null,
      riskOfLoss: rows.find((r) => r.incumbentRiskOfLoss)?.incumbentRiskOfLoss ?? null,
      modelRisk: risk.get(first.incumbentId)?.band ?? null,
      successors: bench.length,
      readyNow,
      ready1to2,
      ready3plus,
      readiness: parts.join(', ') || 'None named',
      successorNames: bench.map((b) => nameOf(base, b.id)).join(', '),
      status: readyNow ? 'Covered' : bench.length ? 'Thin' : 'No successor',
      coverage,
      updatedDate:
        rows
          .map((r) => r.updatedDate)
          .filter((d): d is string => !!d)
          .sort()
          .pop() ?? null,
    })
  }
  roles.sort(
    (a, b) =>
      (a.criticality === 'Critical' ? 0 : 1) - (b.criticality === 'Critical' ? 0 : 1) ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      riskRank(a.riskOfLoss) - riskRank(b.riskOfLoss) ||
      a.roleId.localeCompare(b.roleId),
  )

  const critical = roles.filter((r) => r.criticality === 'Critical')
  const criticalCovered = critical.filter((r) => r.readyNow > 0).length

  const units = [...new Set(roles.map((r) => r.businessUnit))].sort(
    (a, b) =>
      roles.filter((r) => r.businessUnit === b).length - roles.filter((r) => r.businessUnit === a).length,
  )
  const coverageByUnit: CoverageRow[] = units.flatMap((bu) =>
    COVERAGE_ORDER.map((coverage) => ({
      businessUnit: bu,
      coverage,
      roles: roles.filter((r) => r.businessUnit === bu && r.coverage === coverage).length,
    })),
  )
  const bench: BenchRow[] = units.flatMap((bu) =>
    READINESS.map((readiness) => {
      const list = roles.filter((r) => r.businessUnit === bu)
      const successors = list.reduce(
        (s, r) =>
          s +
          (readiness === 'Ready now'
            ? r.readyNow
            : readiness === 'Ready in 1-2 years'
              ? r.ready1to2
              : r.ready3plus),
        0,
      )
      return { businessUnit: bu, readiness, successors }
    }),
  )
  const benchTable: BenchTableRow[] = units.map((bu) => {
    const list = roles.filter((r) => r.businessUnit === bu)
    const successors = list.reduce((s, r) => s + r.successors, 0)
    return {
      businessUnit: bu,
      roles: list.length,
      successors,
      perRole: list.length ? successors / list.length : null,
      readyNow: list.reduce((s, r) => s + r.readyNow, 0),
      ready1to2: list.reduce((s, r) => s + r.ready1to2, 0),
      ready3plus: list.reduce((s, r) => s + r.ready3plus, 0),
      noSuccessor: list.filter((r) => r.successors === 0).length,
    }
  })
  const pipeline: PipelineRow[] = READINESS.flatMap((readiness) =>
    (['Critical', 'Key'] as const).map((criticality) => ({
      readiness,
      criticality,
      successors: roles
        .filter((r) => r.criticality === criticality)
        .reduce(
          (s, r) =>
            s +
            (readiness === 'Ready now'
              ? r.readyNow
              : readiness === 'Ready in 1-2 years'
                ? r.ready1to2
                : r.ready3plus),
          0,
        ),
    })),
  )

  // High potentials: active employees assessed in the latest annual cycle.
  const potentialCycle = base.latestAnnual
  const levelGroups = new Map<string, { assessed: number; high: number }>()
  const unitGroups = new Map<string, { assessed: number; high: number }>()
  let assessed = 0
  let high = 0
  if (potentialCycle) {
    for (const e of base.active) {
      const r = reviewIn(base, e.employeeId, potentialCycle.cycle)
      if (!r?.potential) continue
      assessed++
      const isHigh = r.potential === 'High'
      if (isHigh) high++
      const key = e.level ?? 'Unknown'
      const g = levelGroups.get(key) ?? { assessed: 0, high: 0 }
      g.assessed++
      if (isHigh) g.high++
      levelGroups.set(key, g)
      const u = unitGroups.get(e.businessUnit) ?? { assessed: 0, high: 0 }
      u.assessed++
      if (isHigh) u.high++
      unitGroups.set(e.businessUnit, u)
    }
  }
  const levelOrder = [...LEVELS, 'Unknown']
  const hipoByLevel: HipoGroupRow[] = levelOrder
    .filter((l) => levelGroups.has(l))
    .map((level) => {
      const g = levelGroups.get(level)!
      return {
        group: level,
        assessed: g.assessed,
        high: g.high,
        share: g.assessed >= MIN_GROUP ? g.high / g.assessed : null,
      }
    })

  const hipoByUnit: HipoGroupRow[] = [...unitGroups.entries()]
    .map(([group, g]) => ({
      group,
      assessed: g.assessed,
      high: g.high,
      share: g.assessed >= MIN_GROUP ? g.high / g.assessed : null,
    }))
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1))

  return {
    roles,
    critical: critical.length,
    criticalCovered,
    coverage: critical.length ? criticalCovered / critical.length : null,
    coverageByUnit,
    bench,
    benchTable,
    pipeline,
    potentialCycle,
    hipoByLevel,
    hipoByUnit,
    hipoShare: assessed >= MIN_GROUP ? high / assessed : null,
    hipoHigh: high,
    hipoAssessed: assessed,
    departedSuccessors,
  }
}

const riskRank = (r: RoleRow['riskOfLoss']) => (r === 'High' ? 0 : r === 'Medium' ? 1 : r === 'Low' ? 2 : 3)

/** Cheap headline: share of Critical roles with at least one Ready-now successor still employed. */
export function criticalCoverage(base: Pick<TalentBase, 'ctx' | 'byId' | 'asOf'>): {
  covered: number
  critical: number
} {
  const roles = new Map<string, boolean>()
  for (const p of base.ctx.data.succession) {
    if (p.criticality !== 'Critical') continue
    const ready =
      p.readiness === 'Ready now' &&
      !!p.successorId &&
      (() => {
        const s = base.byId.get(p.successorId!)
        return !s || isActiveAt(s, base.asOf)
      })()
    roles.set(p.roleId, (roles.get(p.roleId) ?? false) || ready)
  }
  return { covered: [...roles.values()].filter(Boolean).length, critical: roles.size }
}
