/**
 * The hiring plan as the planning tool exports it: month periods ("Oct 2026"), the ATS's level
 * codes ("IC4"), "New Headcount" and "Backfill" hire types, and count rows next to position rows.
 * Finance and talent acquisition confirmed the mapping. Three Q1 position rows still carry a
 * legacy grade ("G7") the importer does not know, so their level is blank.
 */
import type { Datasets, HiringPlanLine } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, levelCode, toAoa } from '../format'
import { FILES } from '../plan'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct 2026" for 2026-10-01. */
const monthText = (iso: string) => `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`
const HIRE_TYPE: Record<string, string> = { New: 'New Headcount', Backfill: 'Backfill' }

/** Q1 2027 position rows whose grade reads "G7". */
export const LEGACY_GRADES = 3

export function legacyGradeRows(rows: readonly HiringPlanLine[]): Set<number> {
  return pickRows(
    rows,
    LEGACY_GRADES,
    rngFor('raw-hiring-plan'),
    (r) =>
      !!r.positionId && !!r.level && r.period >= '2027-01-01' && r.businessUnit !== 'Silicon Engineering',
  )
}

/** The rows the import yields: "G7" is not a level, so it is blank. */
export function hiringPlanPlanted(base: Datasets): HiringPlanLine[] {
  const g7 = legacyGradeRows(base.hiringPlan)
  return base.hiringPlan.map((r, i) => (g7.has(i) ? { ...r, level: null } : r))
}

export function hiringPlanExtract(base: Datasets): RawExtract<'hiringPlan'> {
  const g7 = legacyGradeRows(base.hiringPlan)
  const columns: Column<HiringPlanLine>[] = [
    { header: 'Version', cell: (r) => r.planVersion ?? null },
    { header: 'Position #', cell: (r) => r.positionId ?? null },
    { header: 'Start Month', cell: (r) => monthText(r.period) },
    { header: 'Business Group', cell: (r) => r.businessUnit },
    { header: 'Dept', cell: (r) => r.department },
    { header: 'Site', cell: (r) => r.location ?? null },
    { header: 'Grade', cell: (r, i) => (g7.has(i) ? 'G7' : levelCode(r.level)) },
    { header: 'Role', cell: (r) => r.jobTitle ?? null },
    { header: 'Hire Type', cell: (r) => (r.reqType ? HIRE_TYPE[r.reqType] : null) },
    { header: 'Requisition', cell: (r) => r.reqId ?? null },
    { header: 'Approved HC', cell: (r) => r.plannedHires },
  ]
  return { dataset: 'hiringPlan', ...FILES.hiringPlan, aoa: toAoa(base.hiringPlan, columns) }
}
