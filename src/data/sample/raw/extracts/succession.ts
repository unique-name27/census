/**
 * Succession plans as a hand-kept spreadsheet: a title row above the header, "Tier 1" for
 * critical roles, H/M/L flight risk, day-month-year dates, a few incumbent IDs typed in lower
 * case, and 15% of named successors that do not match anyone in the roster (typed as a name, or
 * an external candidate).
 */
import type { Datasets, SuccessionPlan } from '../../../schema'
import { SAMPLE_AS_OF } from '../..'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, dMonY, toAoa } from '../format'
import { FILES } from '../plan'

const READINESS: Record<string, string> = {
  'Ready now': 'Ready Now',
  'Ready in 1-2 years': '1-2 yrs',
  'Ready in 3+ years': '3+ yrs',
}
const RISK: Record<string, string> = { High: 'H', Medium: 'M', Low: 'L' }

/** Share of named successors that do not match anyone in the roster. */
export const UNMATCHED_SUCCESSOR_SHARE = 0.15
/** Of those, how many are written as an external candidate rather than a person's name. */
export const EXTERNAL_SUCCESSORS = 5
/** Incumbent IDs typed in lower case (the importer matches them to the roster). */
export const LOWERCASE_INCUMBENTS = 5

export const TITLE_ROW = 'FY26 succession tracker (confidential)'

export interface SuccessionMess {
  /** Row index → what the sheet holds instead of the successor's ID (a name or an external candidate). */
  successor: Map<number, string>
  /** Rows whose incumbent ID is typed in lower case. */
  lowercase: Set<number>
}

export function successionMess(base: Datasets): SuccessionMess {
  const rows = base.succession
  const rng = rngFor('raw-succession')
  // Successors who already left are counted apart by the Talent view; leave those rows alone.
  const active = new Set(
    base.employees
      .filter((e) => !e.terminationDate || e.terminationDate > SAMPLE_AS_OF)
      .map((e) => e.employeeId),
  )
  const named = rows.filter((r) => r.successorId).length
  const unmatched = pickRows(
    rows,
    Math.round(named * UNMATCHED_SUCCESSOR_SHARE),
    rng,
    (r) => !!r.successorId && active.has(r.successorId),
  )
  const order = [...unmatched].sort((a, b) => a - b)
  const external = new Set(rng.sample(order, EXTERNAL_SUCCESSORS))
  const nameOf = new Map(base.employees.map((e) => [e.employeeId, e.name]))
  const externalsPerRole = new Map<string, number>()
  const successor = new Map<number, string>()
  for (const i of order) {
    const r = rows[i]
    if (external.has(i)) {
      // One role can have two external candidates; keep each row distinct.
      const n = (externalsPerRole.get(r.roleId) ?? 0) + 1
      externalsPerRole.set(r.roleId, n)
      successor.set(i, n === 1 ? 'External candidate' : `External candidate (${n})`)
    } else successor.set(i, nameOf.get(r.successorId as string) ?? (r.successorId as string))
  }
  const lowercase = pickRows(rows, LOWERCASE_INCUMBENTS, rng)
  return { successor, lowercase }
}

/** The rows the import yields: lower-case IDs are matched, names and external candidates are not. */
export function successionPlanted(base: Datasets): SuccessionPlan[] {
  const mess = successionMess(base)
  return base.succession.map((r, i) => {
    const written = mess.successor.get(i)
    return written == null ? r : { ...r, successorId: written }
  })
}

export function successionExtract(base: Datasets): RawExtract<'succession'> {
  const mess = successionMess(base)
  const columns: Column<SuccessionPlan>[] = [
    { header: 'Position ID', cell: (r) => r.roleId },
    { header: 'Critical Role', cell: (r) => r.roleTitle },
    {
      header: 'Incumbent',
      cell: (r, i) => (mess.lowercase.has(i) ? r.incumbentId.toLowerCase() : r.incumbentId),
    },
    { header: 'Role Tier', cell: (r) => (r.criticality === 'Critical' ? 'Tier 1' : 'Tier 2') },
    { header: 'Successor', cell: (r, i) => mess.successor.get(i) ?? r.successorId ?? null },
    { header: 'Readiness', cell: (r) => (r.readiness ? READINESS[r.readiness] : null) },
    { header: 'Flight Risk', cell: (r) => (r.incumbentRiskOfLoss ? RISK[r.incumbentRiskOfLoss] : null) },
    { header: 'Last Reviewed', cell: (r) => dMonY(r.updatedDate) },
  ]
  return {
    dataset: 'succession',
    ...FILES.succession,
    aoa: [[TITLE_ROW], [], ...toAoa(base.succession, columns)],
  }
}
