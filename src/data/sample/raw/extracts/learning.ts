/**
 * Learning as the LMS completion export writes it: item types with a suffix ("Compliance
 * Training"), Y/N mandatory flags and US dates. Five old optional assignments read "ASAP" in the
 * due date column.
 */
import type { Datasets, LearningRecord } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, mdy, toAoa, yn } from '../format'
import { FILES } from '../plan'

const ITEM_TYPE: Record<string, string> = {
  Compliance: 'Compliance Training',
  Security: 'Information Security',
  Leadership: 'Leadership Development',
  Technical: 'Technical Skills',
  Onboarding: 'New Hire Onboarding',
}

/** Completed optional assignments whose due date reads "ASAP". */
export const UNREADABLE_DUE = 5

export function unreadableDueRows(rows: readonly LearningRecord[]): Set<number> {
  return pickRows(
    rows,
    UNREADABLE_DUE,
    rngFor('raw-learning'),
    (r) => !r.required && !!r.completedDate && !!r.dueDate && r.assignedDate < '2025-01-01',
  )
}

/** The rows the import yields: "ASAP" is not a date, so the due date is blank. */
export function learningPlanted(base: Datasets): LearningRecord[] {
  const asap = unreadableDueRows(base.learning)
  return base.learning.map((r, i) => (asap.has(i) ? { ...r, dueDate: null } : r))
}

export function learningExtract(base: Datasets): RawExtract<'learning'> {
  const asap = unreadableDueRows(base.learning)
  const columns: Column<LearningRecord>[] = [
    { header: 'User ID', cell: (r) => r.employeeId },
    { header: 'Learning Item', cell: (r) => r.course },
    { header: 'Training Type', cell: (r) => ITEM_TYPE[r.category] ?? r.category },
    { header: 'Mandatory', cell: (r) => yn(r.required) },
    { header: 'Assigned', cell: (r) => mdy(r.assignedDate) },
    { header: 'Due', cell: (r, i) => (asap.has(i) ? 'ASAP' : mdy(r.dueDate)) },
    { header: 'Completed', cell: (r) => mdy(r.completedDate) },
    { header: 'Credit Hours', cell: (r) => r.hours ?? null },
  ]
  return {
    dataset: 'learning',
    ...FILES.learning,
    aoa: toAoa(base.learning, columns),
  }
}
