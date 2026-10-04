/**
 * Drill-down: every number in Census can open the records behind it, down to the employee.
 *
 * A view hands over the RAW schema rows that make up a number (the leavers behind an attrition
 * rate, the applications behind a funnel bar, the cases behind an SLA miss) plus a title. The
 * drill panel turns them into a readable, sortable, exportable table with standard columns for
 * that kind of record, and any row that names a person opens that person's card.
 */
import type { Column } from '@/charts/types'
import type {
  Candidate,
  CompRecord,
  Employee,
  HrCase,
  HrTransaction,
  JobChange,
  LearningRecord,
  Requisition,
  Review,
  SuccessionPlan,
} from '@/data/schema'

export interface DrillRecordMap {
  employees: Employee
  jobChanges: JobChange
  requisitions: Requisition
  candidates: Candidate
  cases: HrCase
  transactions: HrTransaction
  reviews: Review
  succession: SuccessionPlan
  learning: LearningRecord
  comp: CompRecord
}
export type DrillKind = keyof DrillRecordMap

export interface DrillExtra<R> {
  /** Extra columns shown after the standard ones (e.g. "Days waiting", "Compa-ratio"). */
  columns: Column[]
  /** Values for the extra columns, keyed by column key. (Bivariant so a typed spec fits DrillSpec.) */
  values: { bivarianceHack(row: R): Record<string, unknown> }['bivarianceHack']
}

export interface DrillSpec<K extends DrillKind = DrillKind> {
  kind: K
  /** What the number is, in plain words: "Voluntary leavers in Bengaluru". */
  title: string
  /** Window and scope: "1 Oct 2025 – 30 Sep 2026 · Whole company". */
  subtitle?: string
  rows: readonly DrillRecordMap[K][]
  extra?: DrillExtra<DrillRecordMap[K]>
  /** Standard column keys to leave out (e.g. termination fields for an active headcount list). */
  hide?: string[]
  /** One-line explanation of how the rows were selected. */
  note?: string
}

/** Build a typed spec without repeating the kind's record type. */
export function drillSpec<K extends DrillKind>(spec: DrillSpec<K>): DrillSpec<K> {
  return spec
}
