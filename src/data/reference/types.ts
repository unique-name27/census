/**
 * Reference mappings: your own fixes to how categories relate, stored in this browser and
 * applied before every metric. Moves change a department's business unit or a job function's
 * family; merges and renames change spellings of any categorical field.
 */
import type { FieldRef } from '../quality/fieldRef'
import type { Datasets } from '../schema'

interface Base {
  id: string
  /** Who made the change; null or '' reads "you". */
  by: string | null
  /** ISO date-time. */
  at: string
}

/** Move a department to another business unit (employees, requisitions and the hiring plan). */
export interface MoveDepartment extends Base {
  kind: 'move-department'
  department: string
  /** Only rows under this business unit; null moves every row of the department. */
  from: string | null
  to: string
}

/** Put a job function under a job family (employees): writes `employees.jobFamily`. */
export interface MoveFunction extends Base {
  kind: 'move-function'
  jobFunction: string
  /** Only rows under this family; null moves every row of the function. */
  from: string | null
  to: string
}

/**
 * Legacy: made before job families contained job functions, when it set the job function of a job
 * family's rows (writes `employees.jobFunction`). Saved ones keep applying exactly as saved; new
 * ones can't be made (it is not in `NewReferenceMapping`).
 */
export interface MoveFamily extends Base {
  kind: 'move-family'
  jobFamily: string
  /** Only rows under this function; null moves every row of the family. */
  from: string | null
  to: string
}

/** Merge spellings into one value, or rename a value. */
export interface ValueMapping extends Base {
  kind: 'merge' | 'rename'
  /** The field the change was made on. */
  ref: FieldRef
  /** Values to replace, exactly as they appear in the data. */
  from: string[]
  to: string
  /**
   * 'category' (default) applies to every field of the same category, so renaming a department
   * in Employees renames it in Requisitions and Job changes too; 'field' applies to `ref` only.
   */
  scope: 'category' | 'field'
}

export type ReferenceMapping = MoveDepartment | MoveFunction | MoveFamily | ValueMapping

type Made = 'id' | 'at' | 'by'

/** A mapping as the UI builds it; the store adds `id`, `at` and `by` (and `scope` defaults to 'category'). */
export type NewReferenceMapping =
  | Omit<MoveDepartment, Made>
  | Omit<MoveFunction, Made>
  | (Omit<ValueMapping, Made | 'scope'> & { scope?: ValueMapping['scope'] })

/** One line of the change list. */
export interface ReferenceAudit {
  id: string
  /** Plain sentence: "Moved Design Verification to Silicon Engineering." */
  what: string
  by: string | null
  at: string
  action: 'add' | 'remove'
  mappingId: string
  /** The mapping itself, so a removal can be undone. */
  mapping: ReferenceMapping
}

/** What is stored in this browser (IndexedDB key `census:reference`). */
export interface ReferenceState {
  mappings: ReferenceMapping[]
  audit: ReferenceAudit[]
}

/** The result of applying mappings: new datasets and what changed. */
export interface AppliedReference {
  /** The input object itself when nothing changed; each unchanged dataset keeps its identity. */
  datasets: Datasets
  mappings: readonly ReferenceMapping[]
  /** Rows changed per field. */
  changes: Partial<Record<FieldRef, number>>
  /** Indexes of the changed rows per field. */
  rows: Partial<Record<FieldRef, number[]>>
  /** Who made the latest mapping that touched each field. */
  by: Partial<Record<FieldRef, string | null>>
  /** Rows changed per mapping ID (by that mapping, before later mappings); a row counts once. */
  perMapping: Record<string, number>
  /** Mappings that were not applied, with the reason. */
  skipped: { id: string; reason: string }[]
  /** Total rows changed over every field. */
  total: number
}
