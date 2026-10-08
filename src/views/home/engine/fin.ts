/**
 * Finance's home as data (docs/ROLES-V2.md 5.10 and "Decisions made": actual against the headcount
 * and cost budget, falling back to the hiring plan when no budget is loaded):
 *
 *  - the hero's split: business units by headcount against budget (over, on, under), or, without a
 *    budget, by starts against the plan year to date (behind, on plan, ahead);
 *  - open reqs against the plan by business unit: in the plan, not in it (new roles and backfills
 *    apart), and planned roles with no req;
 *  - My list: the plan lines behind (coverage rows with status Behind).
 *
 * Every row is a business unit or department total; no row is about one person's pay. Pure.
 */

import type { Requisition } from '@/data/schema'
import type { BudgetModel, BudgetRow, BudgetStatus } from '@/lib/budget'
import type { CoverageRow, PlanLineView, PlanModel, PlanStatus } from '@/views/onboarding/engine/plan'
import type { SplitPaint, SplitPart } from './split'

/** Actual against budget can be compared for this scope. */
export const comparable = (b: BudgetModel | null): b is BudgetModel & { total: BudgetRow } =>
  !!b && !b.unavailable && !!b.total

const BUDGET_ORDER: readonly BudgetStatus[] = ['under', 'on', 'over']
const BUDGET_PAINT: Record<BudgetStatus, SplitPaint> = { under: 'seq-400', on: 'good', over: 'warning' }
const BUDGET_WORD: Record<BudgetStatus, string> = {
  under: 'Under budget',
  on: 'On budget',
  over: 'Over budget',
}

export interface UnitPart extends SplitPart {
  [key: string]: unknown
  /** The business units in the part (for the drill). */
  units: string[]
  /** Employees in those units (budget) or starts to date (plan). */
  people: number
}

/** Business units by headcount against budget in the compared month, Other left out. */
export function budgetParts(b: BudgetModel): UnitPart[] {
  const units = b.byUnit.filter((r) => !r.isOther && r.headcountStatus)
  return BUDGET_ORDER.map((s) => {
    const rows = units.filter((r) => r.headcountStatus === s)
    return {
      key: s,
      label: BUDGET_WORD[s],
      count: rows.length,
      paint: BUDGET_PAINT[s],
      units: rows.map((r) => r.businessUnit ?? r.label),
      people: rows.reduce((n, r) => n + r.headcount, 0),
    }
  })
}

const PLAN_ORDER: readonly PlanStatus[] = ['Behind', 'On plan', 'Ahead']
const PLAN_PAINT: Record<PlanStatus, SplitPaint> = { Behind: 'warning', 'On plan': 'good', Ahead: 'seq-400' }

/** Business units by starts against the plan to date. */
export function planParts(p: PlanModel): UnitPart[] {
  const units = p.byUnit.filter((r) => r.status)
  return PLAN_ORDER.map((s) => {
    const rows = units.filter((r) => r.status === s)
    return {
      key: s,
      label: s,
      count: rows.length,
      paint: PLAN_PAINT[s],
      units: rows.map((r) => r.businessUnit),
      people: rows.reduce((n, r) => n + r.actualYtd, 0),
    }
  })
}

/* ───────── open reqs against the plan ───────── */

export const REQ_SERIES = ['In the plan', 'Not in the plan', 'Backfill', 'Planned, no req'] as const
export type ReqSeries = (typeof REQ_SERIES)[number]

export interface ReqPlanSegment {
  [key: string]: unknown
  group: string
  series: ReqSeries
  count: number
  /** The open reqs behind the segment (none for planned roles with no req). */
  reqs: Requisition[]
  /** The plan lines behind the segment (planned roles with no req). */
  lines: PlanLineView[]
}

export interface ReqPlanRow {
  [key: string]: unknown
  group: string
  inPlan: number
  notInPlan: number
  backfills: number
  noReq: number
  segments: ReqPlanSegment[]
}

/**
 * Open reqs by business unit: those a plan line names, those on no line (new roles, and backfills
 * apart), and the future planned roles with no open req behind them. Units by open reqs, most first.
 */
export function reqsAgainstPlan(p: PlanModel, openReqs: readonly Requisition[]): ReqPlanRow[] {
  const added = new Set(p.notInPlan.added.map((r) => r.reqId))
  const backfills = new Set(p.notInPlan.backfills.map((r) => r.reqId))
  const unit = (s: string | null | undefined) => s?.trim() || 'Not recorded'
  const by = new Map<string, ReqPlanRow>()
  const rowOf = (g: string) => {
    let r = by.get(g)
    if (!r) {
      r = { group: g, inPlan: 0, notInPlan: 0, backfills: 0, noReq: 0, segments: [] }
      by.set(g, r)
    }
    return r
  }
  const seg = (r: ReqPlanRow, series: ReqSeries) => {
    let s = r.segments.find((x) => x.series === series)
    if (!s) {
      s = { group: r.group, series, count: 0, reqs: [], lines: [] }
      r.segments.push(s)
    }
    return s
  }
  for (const q of openReqs) {
    const r = rowOf(unit(q.businessUnit))
    const series: ReqSeries = added.has(q.reqId)
      ? 'Not in the plan'
      : backfills.has(q.reqId)
        ? 'Backfill'
        : 'In the plan'
    const s = seg(r, series)
    s.count++
    s.reqs.push(q)
  }
  const seen = new Set<string>()
  for (const v of p.noReq) {
    const key = `${v.month}|${v.line.positionId ?? ''}|${v.line.businessUnit}|${v.line.department}|${v.line.jobTitle ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    const r = rowOf(unit(v.line.businessUnit))
    const s = seg(r, 'Planned, no req')
    s.count++
    s.lines.push(v)
  }
  for (const r of by.values()) {
    const n = (series: ReqSeries) => r.segments.find((s) => s.series === series)?.count ?? 0
    r.inPlan = n('In the plan')
    r.notInPlan = n('Not in the plan')
    r.backfills = n('Backfill')
    r.noReq = n('Planned, no req')
    r.segments.sort((a, b) => REQ_SERIES.indexOf(a.series) - REQ_SERIES.indexOf(b.series))
  }
  return [...by.values()].sort(
    (a, b) =>
      b.inPlan + b.notInPlan + b.backfills - (a.inPlan + a.notInPlan + a.backfills) ||
      b.noReq - a.noReq ||
      a.group.localeCompare(b.group),
  )
}

/* ───────── plan lines behind ───────── */

export interface BehindRow {
  [key: string]: unknown
  businessUnit: string
  department: string
  planYtd: number
  actualYtd: number
  vsPlan: number | null
  committed: number
  openReqs: number
  forecast: number
  /** Full-year gap: planned starts with nothing behind them yet. */
  gap: number
  planFull: number
  status: string
  row: CoverageRow
}

/** Departments behind plan to date, the largest full-year gap first. */
export function behindRows(p: PlanModel): BehindRow[] {
  return p.byDepartment
    .filter((r) => r.status === 'Behind')
    .map((r) => ({
      businessUnit: r.businessUnit,
      department: r.department ?? 'All departments',
      planYtd: r.planYtd,
      actualYtd: r.actualYtd,
      vsPlan: r.vsPlan,
      committed: r.committed,
      openReqs: r.openReqs,
      forecast: Math.round(r.forecast * 10) / 10,
      gap: Math.max(0, Math.round(r.gap)),
      planFull: r.planFull,
      status: r.status ?? '',
      row: r,
    }))
    .sort(
      (a, b) =>
        b.gap - a.gap ||
        a.businessUnit.localeCompare(b.businessUnit) ||
        a.department.localeCompare(b.department),
    )
}
