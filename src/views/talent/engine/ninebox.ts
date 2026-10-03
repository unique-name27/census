/**
 * The 9-box: performance (rating 1-2 Low, 3 Moderate, 4-5 High) against potential (Low, Moderate,
 * High) from the latest annual cycle, for employees active at the as-of date.
 * Pure: no React, no DOM.
 */
import { MIN_GROUP, POTENTIALS, type Potential } from '@/data/schema'
import {
  type Cycle,
  nameOf,
  normRating,
  PERF_BANDS,
  type PerfBand,
  perfBand,
  reviewIn,
  type TalentBase,
} from './base'
import type { PersonRisk, RiskBand } from './risk'

export interface NineBoxPerson {
  employeeId: string
  name: string
  jobTitle: string
  department: string
  location: string
  level: string | null
  manager: string
  rating: number
  potential: Potential
  riskBand: RiskBand | null
  riskScore: number | null
}

export interface NineBoxCell {
  performance: PerfBand
  potential: Potential
  /** Plain name, e.g. "High performance, high potential". */
  label: string
  count: number
  /** Share of everyone placed; null when fewer than 5 people are placed. */
  share: number | null
  /** People in the cell rated high flight risk. */
  highRisk: number
  people: NineBoxPerson[]
}

export interface NineBoxResult {
  cycle: Cycle | null
  cells: NineBoxCell[]
  placed: number
  /** Active employees without a rating and potential in that cycle. */
  notPlaced: number
}

export const cellLabel = (perf: PerfBand, pot: Potential): string =>
  `${perf} performance, ${pot.toLowerCase()} potential`

export const cellKey = (perf: PerfBand, pot: Potential): string => `${perf}|${pot}`

export function computeNineBox(base: TalentBase, risk: Map<string, PersonRisk>): NineBoxResult {
  const cycle = base.latestAnnual
  const cells = new Map<string, NineBoxCell>()
  for (const pot of POTENTIALS) {
    for (const perf of PERF_BANDS) {
      cells.set(cellKey(perf, pot), {
        performance: perf,
        potential: pot,
        label: cellLabel(perf, pot),
        count: 0,
        share: null,
        highRisk: 0,
        people: [],
      })
    }
  }
  let placed = 0
  if (cycle) {
    for (const e of base.active) {
      const r = reviewIn(base, e.employeeId, cycle.cycle)
      const rating = normRating(r?.rating)
      if (!r || rating == null || !r.potential) continue
      const cell = cells.get(cellKey(perfBand(rating), r.potential))
      if (!cell) continue
      const pr = risk.get(e.employeeId)
      cell.count++
      if (pr?.band === 'High') cell.highRisk++
      cell.people.push({
        employeeId: e.employeeId,
        name: e.name,
        jobTitle: e.jobTitle,
        department: e.department,
        location: e.location,
        level: e.level,
        manager: nameOf(base, e.managerId),
        rating,
        potential: r.potential,
        riskBand: pr?.band ?? null,
        riskScore: pr?.score ?? null,
      })
      placed++
    }
  }
  for (const c of cells.values()) {
    c.share = placed >= MIN_GROUP ? c.count / placed : null
    c.people.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
  }
  return { cycle, cells: [...cells.values()], placed, notPlaced: base.active.length - placed }
}
