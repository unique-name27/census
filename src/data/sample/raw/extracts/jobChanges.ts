/**
 * Job changes as the HRIS job history report exports them: Workday-style action names, IC level
 * codes, and three old promotions that still carry a legacy grade code nobody can read.
 */
import type { ChangeType, Datasets, JobChange } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, levelCode, toAoa } from '../format'
import { FILES } from '../plan'

const ACTION: Record<ChangeType, string> = {
  Promotion: 'Promotion > Promote employee',
  Transfer: 'Transfer > Move to another department',
  'Lateral move': 'Lateral move > Same level',
  Demotion: 'Demotion > Move to lower level',
  'Manager change': 'Change manager > Reorganization',
}

/** Promotions before this date may carry a legacy grade code. */
export const LEGACY_BEFORE = '2023-01-01'
/** Promotions whose prior level is a legacy grade code ("G7"), not a level. */
export const LEGACY_GRADES = 3

/** Row indexes (in the sample's order) whose prior level is written as a legacy grade. */
export function legacyGradeRows(rows: readonly JobChange[]): Set<number> {
  return pickRows(
    rows,
    LEGACY_GRADES,
    rngFor('raw-jobChanges'),
    (r) => r.changeType === 'Promotion' && r.effectiveDate < LEGACY_BEFORE,
  )
}

/** The rows the import yields: the legacy grades cannot be read, so their prior level is blank. */
export function jobChangesPlanted(base: Datasets): JobChange[] {
  const legacy = legacyGradeRows(base.jobChanges)
  return base.jobChanges.map((r, i) => (legacy.has(i) ? { ...r, fromLevel: null } : r))
}

export function jobChangesExtract(base: Datasets): RawExtract<'jobChanges'> {
  const legacy = legacyGradeRows(base.jobChanges)
  const columns: Column<JobChange>[] = [
    { header: 'Worker ID', cell: (r) => r.employeeId },
    { header: 'Effective Date', cell: (r) => r.effectiveDate },
    { header: 'Action Type', cell: (r) => ACTION[r.changeType] },
    {
      header: 'Previous Level',
      cell: (r, i) =>
        legacy.has(i) ? `G${(Number(r.fromLevel?.slice(1)) || 1) + 5}` : levelCode(r.fromLevel),
    },
    { header: 'New Level', cell: (r) => levelCode(r.toLevel) },
    { header: 'Prior Department', cell: (r) => r.fromDepartment ?? null },
    { header: 'New Department', cell: (r) => r.toDepartment ?? null },
    { header: 'Prior Manager', cell: (r) => r.fromManagerId ?? null },
    { header: 'New Manager', cell: (r) => r.toManagerId ?? null },
  ]
  return {
    dataset: 'jobChanges',
    ...FILES.jobChanges,
    aoa: toAoa(base.jobChanges, columns),
  }
}
