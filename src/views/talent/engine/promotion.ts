/**
 * High performers overdue for promotion: active employees below executive level, with the company
 * at least the overdue setting's years (3 by default), rated at or above the high performer
 * rating (4) in each of the last two annual cycles, and no promotion in that many years. Needs
 * job changes (promotion history) and reviews; null otherwise.
 * Pure: no React, no DOM.
 */
import type { ISODate } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { decomposeRate, type Segment } from '@/lib/decompose'
import { tenureYears } from '@/lib/people'
import { type Cycle, lastPromotion, nameOf, normRating, orgDims, reviewIn, type TalentBase } from './base'
import type { PersonRisk, RiskBand } from './risk'
import { monthsIn } from './settings'

export interface OverdueRow {
  employeeId: string
  name: string
  jobTitle: string
  department: string
  location: string
  level: string | null
  manager: string
  tenure: number
  /** Last promotion date, or null when never promoted here. */
  lastPromotion: ISODate | null
  ratings: string
  riskBand: RiskBand | null
}

export interface OverdueResult {
  /** The two annual cycles the rule reads, oldest first. */
  cycles: Cycle[]
  rows: OverdueRow[]
  /** Everyone the rule could apply to (tenure, level and both ratings present). */
  eligible: number
  top: Segment | null
  /** Second segment on another dimension (e.g. level inside the top department). */
  second: Segment | null
  /** Null when job changes or two annual cycles are missing. */
  available: boolean
  reason?: string
}

export function computeOverdue(base: TalentBase, risk: Map<string, PersonRisk>): OverdueResult {
  const { asOf } = base
  const annual = base.reviews.cycles.filter(
    (c) =>
      c.cycleDate <= asOf && base.ctx.all.reviews.some((r) => r.cycle === c.cycle && r.potential != null),
  )
  const cycles = (annual.length >= 2 ? annual : base.reviews.cycles.filter((c) => c.cycleDate <= asOf)).slice(
    -2,
  )
  if (!base.has.jobChanges) {
    return {
      cycles,
      rows: [],
      eligible: 0,
      top: null,
      second: null,
      available: false,
      reason: 'Upload Job changes to see promotion history.',
    }
  }
  if (cycles.length < 2) {
    return {
      cycles,
      rows: [],
      eligible: 0,
      top: null,
      second: null,
      available: false,
      reason: 'Two review cycles are needed.',
    }
  }
  const { highRating, promotionYears } = base.settings
  const cutoff = addMonths(asOf, -monthsIn(promotionYears))
  const eligible: { id: string; overdue: boolean; row: OverdueRow }[] = []
  for (const e of base.active) {
    if (!e.level || e.level.startsWith('E') || e.hireDate > cutoff) continue
    const r1 = normRating(reviewIn(base, e.employeeId, cycles[0].cycle)?.rating)
    const r2 = normRating(reviewIn(base, e.employeeId, cycles[1].cycle)?.rating)
    if (r1 == null || r2 == null) continue
    const promo = lastPromotion(base, e.employeeId, asOf)
    const overdue = r1 >= highRating && r2 >= highRating && (!promo || promo <= cutoff)
    eligible.push({
      id: e.employeeId,
      overdue,
      row: {
        employeeId: e.employeeId,
        name: e.name,
        jobTitle: e.jobTitle,
        department: e.department,
        location: e.location,
        level: e.level,
        manager: nameOf(base, e.managerId),
        tenure: tenureYears(e, asOf),
        lastPromotion: promo,
        ratings: `${r1}, ${r2}`,
        riskBand: risk.get(e.employeeId)?.band ?? null,
      },
    })
  }
  const rows = eligible
    .filter((x) => x.overdue)
    .map((x) => x.row)
    .sort((a, b) => a.department.localeCompare(b.department) || b.tenure - a.tenure)
  const segs = rows.length
    ? decomposeRate(
        eligible,
        orgDims((x) => base.byId.get(x.id)),
        (x) => x.overdue,
        { minDev: 0.03, top: 8 },
      )
    : []
  const top = segs.find((s) => s.dim === 'department' && !s.small) ?? segs[0] ?? null
  const second = top
    ? (segs.find((s) => s.dim !== top.dim && s.dim !== 'businessUnit' && !s.small) ?? null)
    : null
  return { cycles, rows, eligible: eligible.length, top, second, available: true }
}
