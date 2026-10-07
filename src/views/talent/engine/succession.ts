/**
 * Potential and succession: critical and key roles with their named successors, bench strength,
 * readiness and where high potentials sit. Successors who have left are not counted.
 * Pure: no React, no DOM.
 */
import { LEVELS, READINESS, type Readiness, type Review, type SuccessionPlan } from '@/data/schema'
import { isActiveAt } from '@/lib/people'
import {
  type Cycle,
  foldSmallGroups,
  nameOf,
  pushTo,
  recordsByLabel,
  reviewIn,
  type TalentBase,
  UNKNOWN,
} from './base'
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

/** Which roles the bench chart counts. */
export type BenchScope = 'All' | 'Critical' | 'Key'
export const BENCH_SCOPES: readonly BenchScope[] = ['All', 'Critical', 'Key']

export interface HipoGroupRow {
  /** Level or business unit, or "Other (k)" for groups under 5 folded together. */
  group: string
  assessed: number
  /** Null on a folded row still under 5 people. */
  high: number | null
  share: number | null
  other?: boolean
}

/**
 * The records behind each Succession number, for drill-down. Potential groups whose numbers are
 * hidden (fewer than 5 assessed) carry no records.
 */
export interface SuccessionRecords {
  /** Every plan row of each role, as loaded, by role ID. */
  plans: Map<string, SuccessionPlan[]>
  /** The plan rows of the successors counted on each role's bench: still employed, one per person. */
  bench: Map<string, SuccessionPlan[]>
  /** Potential assessments in the latest annual cycle of active employees in scope. */
  assessed: Review[]
  /** Assessments per row label of the folded level and business unit breakdowns. */
  hipoByLevel: Map<string, Review[]>
  hipoByUnit: Map<string, Review[]>
}

export interface SuccessionResult {
  roles: RoleRow[]
  critical: number
  criticalCovered: number
  coverage: number | null
  coverageByUnit: CoverageRow[]
  /** Named successors by business unit and readiness, for all, critical or key roles. */
  bench: Record<BenchScope, BenchRow[]>
  benchTable: Record<BenchScope, BenchTableRow[]>
  potentialCycle: Cycle | null
  hipoByLevel: HipoGroupRow[]
  hipoByUnit: HipoGroupRow[]
  hipoShare: number | null
  hipoHigh: number
  hipoAssessed: number
  /** Successors named in the plan who have since left. */
  departedSuccessors: number
  records: SuccessionRecords
}

const STATUS_RANK: Record<RoleStatus, number> = { 'No successor': 0, Thin: 1, Covered: 2 }

/**
 * The successors' names. In Manager mode (docs/ROLES.md, 4.5) a successor outside the manager's
 * org shows by readiness only, never by name: "Ann Lee, 1 outside your org, ready now".
 */
function successorNames(
  base: TalentBase,
  bench: readonly { id: string; readiness: Readiness | null }[],
): string {
  const lock = base.ctx.access?.lock
  if (!lock) return bench.map((b) => nameOf(base, b.id)).join(', ')
  const inside = bench.filter((b) => lock.orgIds.has(b.id)).map((b) => nameOf(base, b.id))
  const outside = new Map<string, number>()
  for (const b of bench)
    if (!lock.orgIds.has(b.id)) {
      const k = b.readiness ? READINESS_SHORT[b.readiness] : 'not assessed'
      outside.set(k, (outside.get(k) ?? 0) + 1)
    }
  const groups = [...outside].map(([k, n]) => `${n} outside your org, ${k}`)
  return [...inside, ...groups].join(', ')
}

/**
 * The plans the scope shows. Manager mode leaves out the plan for the manager's own role: their
 * succession status stays with HR and their own leader (docs/ROLES.md, 4.5).
 */
export const plansInScope = (base: Pick<TalentBase, 'ctx'>): readonly SuccessionPlan[] => {
  const self = base.ctx.access.lock?.managerId
  const plans = base.ctx.data.succession
  return self ? plans.filter((p) => p.incumbentId !== self) : plans
}

export function computeSuccession(base: TalentBase, risk: Map<string, PersonRisk>): SuccessionResult {
  const { asOf } = base
  const plans = plansInScope(base)
  const byRole = new Map<string, SuccessionPlan[]>()
  for (const p of plans) {
    const arr = byRole.get(p.roleId)
    if (arr) arr.push(p)
    else byRole.set(p.roleId, [p])
  }
  let departedSuccessors = 0
  const roles: RoleRow[] = []
  const benchPlans = new Map<string, SuccessionPlan[]>()
  for (const [roleId, rows] of byRole) {
    const first = rows[0]
    const inc = base.byId.get(first.incumbentId)
    const seen = new Set<string>()
    const bench: { id: string; readiness: Readiness | null }[] = []
    const counted: SuccessionPlan[] = []
    for (const r of rows) {
      if (!r.successorId || seen.has(r.successorId)) continue
      seen.add(r.successorId)
      const s = base.byId.get(r.successorId)
      if (s && !isActiveAt(s, asOf)) {
        departedSuccessors++
        continue
      }
      bench.push({ id: r.successorId, readiness: r.readiness ?? null })
      counted.push(r)
    }
    benchPlans.set(roleId, counted)
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
      successorNames: successorNames(base, bench),
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
  const inScope = (scope: BenchScope) => (r: RoleRow) => scope === 'All' || r.criticality === scope
  const countAt = (r: RoleRow, readiness: Readiness) =>
    readiness === 'Ready now' ? r.readyNow : readiness === 'Ready in 1-2 years' ? r.ready1to2 : r.ready3plus
  const benchRows = (scope: BenchScope): BenchRow[] =>
    units.flatMap((bu) =>
      READINESS.map((readiness) => ({
        businessUnit: bu,
        readiness,
        successors: roles
          .filter((r) => r.businessUnit === bu && inScope(scope)(r))
          .reduce((s, r) => s + countAt(r, readiness), 0),
      })),
    )
  const benchTableRows = (scope: BenchScope): BenchTableRow[] =>
    units
      .map((bu) => {
        const list = roles.filter((r) => r.businessUnit === bu && inScope(scope)(r))
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
      .filter((r) => r.roles > 0)
  const bench = Object.fromEntries(BENCH_SCOPES.map((k) => [k, benchRows(k)])) as Record<
    BenchScope,
    BenchRow[]
  >
  const benchTable = Object.fromEntries(BENCH_SCOPES.map((k) => [k, benchTableRows(k)])) as Record<
    BenchScope,
    BenchTableRow[]
  >

  // High potentials: active employees assessed in the latest annual cycle.
  const { minGroup } = base.settings
  const potentialCycle = base.latestAnnual
  const levelGroups = new Map<string, Review[]>()
  const unitGroups = new Map<string, Review[]>()
  const assessedReviews: Review[] = []
  if (potentialCycle) {
    for (const e of base.active) {
      const r = reviewIn(base, e.employeeId, potentialCycle.cycle)
      if (!r?.potential) continue
      assessedReviews.push(r)
      pushTo(levelGroups, e.level ?? 'Unknown', r)
      pushTo(unitGroups, e.businessUnit, r)
    }
  }
  const assessed = assessedReviews.length
  const high = assessedReviews.filter(isHipo).length
  const groupRow = (group: string, list: readonly Review[]): HipoGroupRow => {
    const h = list.filter(isHipo).length
    return { group, assessed: list.length, high: h, share: list.length >= minGroup ? h / list.length : null }
  }
  const levelOrder = [...LEVELS, 'Unknown']
  const hipoByLevel = foldHipo(
    levelOrder.filter((l) => levelGroups.has(l)).map((level) => groupRow(level, levelGroups.get(level)!)),
    minGroup,
  )

  const hipoByUnit = foldHipo(
    [...unitGroups.entries()]
      .map(([group, list]) => groupRow(group, list))
      .sort((a, b) => (b.share ?? -1) - (a.share ?? -1)),
    minGroup,
  )
  const hipoRecords = (rows: readonly HipoGroupRow[], byGroup: Map<string, Review[]>) =>
    recordsByLabel(rows, byGroup, {
      label: (r) => r.group,
      folded: (r) => !!r.other,
      shown: (r) => r.high != null,
    })

  return {
    roles,
    critical: critical.length,
    criticalCovered,
    coverage: critical.length ? criticalCovered / critical.length : null,
    coverageByUnit,
    bench,
    benchTable,
    potentialCycle,
    hipoByLevel,
    hipoByUnit,
    hipoShare: assessed >= minGroup ? high / assessed : null,
    hipoHigh: high,
    hipoAssessed: assessed,
    departedSuccessors,
    records: {
      plans: byRole,
      bench: benchPlans,
      assessed: assessedReviews,
      hipoByLevel: hipoRecords(hipoByLevel, levelGroups),
      hipoByUnit: hipoRecords(hipoByUnit, unitGroups),
    },
  }
}

const isHipo = (r: Review) => r.potential === 'High'

/**
 * Groups under the anonymity minimum (`min`) fold into a last "Other (k)" row, so no count over
 * fewer people is exported.
 */
function foldHipo(rows: HipoGroupRow[], min: number): HipoGroupRow[] {
  return foldSmallGroups(
    rows,
    (r) => r.assessed,
    (folded, label) => {
      const assessed = folded.reduce((s, r) => s + r.assessed, 0)
      const high = folded.reduce((s, r) => s + (r.high ?? 0), 0)
      const ok = assessed >= min
      return {
        group: label,
        assessed,
        high: ok ? high : null,
        share: ok ? high / assessed : null,
        other: true,
      }
    },
    min,
  )
}

const riskRank = (r: RoleRow['riskOfLoss']) => (r === 'High' ? 0 : r === 'Medium' ? 1 : r === 'Low' ? 2 : 3)

/** Cheap headline: share of Critical roles with at least one Ready-now successor still employed. */
export function criticalCoverage(base: Pick<TalentBase, 'ctx' | 'byId' | 'asOf'>): {
  covered: number
  critical: number
} {
  const roles = new Map<string, boolean>()
  for (const p of plansInScope(base)) {
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
