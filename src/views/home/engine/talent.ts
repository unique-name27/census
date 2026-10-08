/**
 * Talent management's home as data (docs/ROLES-V2.md 5.7): the hero's split of critical roles by
 * the readiness of their best successor, and My list's second list, the high potentials (the top
 * row of the 9-box in the latest annual cycle). Pure.
 */
import type { Employee } from '@/data/schema'
import type { NineBoxResult } from '@/views/talent/engine/ninebox'
import { COVERAGE_ORDER, type RoleRow } from '@/views/talent/engine/succession'
import type { SplitPaint, SplitPart } from './split'

const PAINT: Record<string, SplitPaint> = {
  'Ready now': 'seq-600',
  'Ready in 1-2 years': 'seq-400',
  'Ready in 3+ years': 'seq-250',
  'No successor': 'critical',
}

const WORD: Record<string, string> = {
  'Ready now': 'Ready now',
  'Ready in 1-2 years': '1-2 yrs',
  'Ready in 3+ years': '3+ yrs',
  'No successor': 'No successor',
}

export interface CoveragePart extends SplitPart {
  [key: string]: unknown
  share: number | null
}

/** Roles by their best successor's readiness, ready now first and no successor last. */
export function coverageParts(roles: readonly RoleRow[]): CoveragePart[] {
  const n = roles.length
  return COVERAGE_ORDER.map((c) => {
    const count = roles.filter((r) => r.coverage === c).length
    return { key: c, label: WORD[c] ?? c, count, paint: PAINT[c] ?? 'deemph', share: n ? count / n : null }
  })
}

export interface HipoRow {
  [key: string]: unknown
  employeeId: string
  name: string
  jobTitle: string
  department: string
  location: string
  level: string | null
  manager: string
  rating: number
  /** "High performance, high potential". */
  box: string
  riskBand: string | null
  employee: Employee
}

/**
 * Everyone assessed high potential in the latest annual cycle (the 9-box's top row), the highest
 * rated first. The flight-risk band only where the mode shows scores about named people.
 */
export function highPotentials(
  nineBox: Pick<NineBoxResult, 'cells'>,
  riskShown: boolean,
  byId: ReadonlyMap<string, Employee>,
): HipoRow[] {
  const rows: HipoRow[] = []
  for (const cell of nineBox.cells) {
    if (cell.potential !== 'High') continue
    for (const p of cell.people) {
      const employee = byId.get(p.employeeId)
      if (!employee) continue
      rows.push({
        employeeId: p.employeeId,
        name: p.name,
        jobTitle: p.jobTitle,
        department: p.department,
        location: p.location,
        level: p.level,
        manager: p.manager,
        rating: p.rating,
        box: cell.label,
        riskBand: riskShown ? p.riskBand : null,
        employee,
      })
    }
  }
  return rows.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
}
