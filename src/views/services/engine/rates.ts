/**
 * Cases per 100 employees by business unit (docs/DESIGN-REFRESH.md, Appendix A): how heavily each
 * unit leans on HR ops, as cases opened in the period by its people for every 100 employees on its
 * average headcount, a year. Pure; recounted from the case facts and the roster.
 *
 * A case belongs to its requester's business unit on the roster (as the filters place it); a case
 * whose requester is unknown belongs to no unit and is counted in the note only. Units behind
 * fewer than the anonymity minimum of requesters fold into "Other (k)", and a rate is hidden when
 * its cases come from fewer than the minimum of requesters or its average headcount is under it.
 * Employee relations cases are counted, never listed.
 */
import { type Employee, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { avgHeadcount } from '@/lib/people'
import { openedIn } from './cases'
import type { CaseFact } from './facts'
import { foldGroups, isOther, peopleIn } from './util'

export interface UnitRateRow {
  unit: string
  /** Cases opened in the period by the unit's people; null when fewer than the minimum asked. */
  cases: number | null
  /** The unit's average headcount over the period (employees only). */
  headcount: number
  /** Cases per 100 employees a year; null when hidden. */
  rate: number | null
  records: CaseFact[]
  /** Units folded into this row ("Other (k)"); 0 for a real unit. */
  folded: number
}

export interface CasesPer100 {
  rows: UnitRateRow[]
  /** The whole company's rate, the reference rule. */
  company: number | null
  /** Cases in the period whose requester is not on the roster. */
  unplaced: number
}

/** Cases per 100 employees a year: cases ÷ average headcount × 100 × (12 ÷ window months). */
export const per100 = (cases: number, headcount: number, months: number, min = MIN_GROUP): number | null =>
  headcount >= min && months > 0 ? (cases / headcount) * 100 * (12 / months) : null

/**
 * Per business unit in the scope: its requesters' cases opened in the window over its average
 * headcount. `employees` is the scope's roster; `people` finds each requester.
 */
export function casesPer100(x: {
  facts: readonly CaseFact[]
  employees: readonly Employee[]
  people: ReadonlyMap<string, Employee>
  window: Window
  /** Cases and roster of the whole company, for the reference rule. */
  company: { cases: number; employees: readonly Employee[] }
  min?: number
}): CasesPer100 {
  const min = x.min ?? MIN_GROUP
  const opened = openedIn(x.facts, x.window)
  const byUnit = new Map<string, CaseFact[]>()
  let unplaced = 0
  for (const f of opened) {
    const unit = f.requesterId ? x.people.get(f.requesterId)?.businessUnit : undefined
    if (!unit) {
      unplaced++
      continue
    }
    const list = byUnit.get(unit)
    if (list) list.push(f)
    else byUnit.set(unit, [f])
  }
  const units = [...byUnit].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const groups = foldGroups(units, min)
  const headcountOf = (names: readonly string[]) =>
    avgHeadcount(
      x.employees.filter((e) => names.includes(e.businessUnit)),
      x.window,
    )
  const folded = new Set(units.map(([u]) => u).filter((u) => !groups.some((g) => g.key === u)))
  const rows = groups.map((g) => {
    const headcount = headcountOf(isOther(g.key) ? [...folded] : [g.key])
    // The view's rule for every case number: at least the minimum of cases from that many people.
    const shown = g.rows.length >= min && peopleIn(g.rows) >= min
    return {
      unit: g.key,
      cases: shown ? g.rows.length : null,
      headcount,
      rate: shown ? per100(g.rows.length, headcount, x.window.months, min) : null,
      records: g.rows,
      folded: g.folded,
    }
  })
  rows.sort((a, b) => {
    if (isOther(a.unit) !== isOther(b.unit)) return isOther(a.unit) ? 1 : -1
    return (b.rate ?? -1) - (a.rate ?? -1) || a.unit.localeCompare(b.unit)
  })
  const companyHeadcount = avgHeadcount(x.company.employees, x.window)
  return {
    rows,
    company: per100(x.company.cases, companyHeadcount, x.window.months, min),
    unplaced,
  }
}
