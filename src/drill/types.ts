/**
 * Drill-down: every number in Census can open the records behind it, down to the employee.
 *
 * A view hands over the RAW schema rows that make up a number (the leavers behind an attrition
 * rate, the applications behind a funnel bar, the cases behind an SLA miss) plus a title. The
 * drill panel turns them into a readable, sortable, exportable table with standard columns for
 * that kind of record, and any row that names a person opens that person's card.
 */
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type {
  Candidate,
  CompRecord,
  DatasetKey,
  Employee,
  HiringPlanLine,
  HrCase,
  HrTransaction,
  ISODate,
  JobChange,
  LearningRecord,
  OnboardingTask,
  Requisition,
  Review,
  RightToWork,
  SuccessionPlan,
  SurveyItem,
  SurveyResponse,
} from '@/data/schema'
import type { Format } from '@/lib/format'
import type { SurveyGroupRow } from '@/lib/surveys'
import type { DrillSource } from './Drill'

/**
 * A leave number cut by leave reason (drill kind `leaveGroups`): counts and one measure per
 * group, never a named person, so a leave reason never sits beside a name (HR ops > Leave &
 * return). Groups under the anonymity minimum are folded or show no counts.
 */
export interface LeaveGroupRow {
  /** What the rows are grouped by, e.g. "Leave reason and business unit". */
  groupBy: string
  group: string
  /** The Atlas leave category, or null when the row is not split by reason. */
  reason: string | null
  /** Distinct people; null when the group is under the anonymity minimum. */
  people: number | null
  leaves: number | null
  /** What `value` measures, e.g. "Median days on leave"; null for a count only. */
  measure: string | null
  value: number | null
  format: Format
  /** Under the anonymity minimum: no counts or measure. */
  suppressed: boolean
}

/**
 * An Action center item as a record (drill kind `actionItems`): what is open, who it waits on and
 * when it is due. The About cell opens the item's own records (`subjectDrill`); a row opens the
 * person the item is about when they are on the roster. An employee relations item names no
 * person and opens nothing.
 */
export interface ActionItemRow {
  /** Stable item id (internal; never shown or exported). */
  id: string
  severity: Severity
  /** "Critical", "Watch", "Note". */
  severityLabel: string
  what: string
  /** What the item is about: a person, candidate, req, case or group. */
  subject: string
  /** Employee ID of the person the item is about, when it names one. */
  personId: string | null
  /** The item's own records, opened from the About cell. */
  subjectDrill: DrillSource
  /** The owner group: "Managers", "People operations". */
  ownerGroup: string
  /** The person or team it waits on. */
  owner: string
  due: ISODate | null
  /** "4 d overdue", "Due in 3 d", "Due today", "No due date". */
  dueText: string
  /** The view it comes from: "Recruiting · Pipeline". */
  from: string
  /** "Open", "Handled 4 Oct 2026", "Snoozed until 11 Oct 2026". */
  status: string
}

/**
 * The records each drill kind shows. One kind per dataset, plus two grouped kinds: survey
 * numbers drill to grouped counts and scores (`surveyGroups`, `SurveyGroupRow`), never to an
 * individual's answers, and leave numbers cut by reason drill to grouped counts
 * (`leaveGroups`, `LeaveGroupRow`), never to named people. The `surveyResponses` kind exists for
 * the Data room's quality checks only and shows no respondent, date or score.
 */
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
  hiringPlan: HiringPlanLine
  onboardingTasks: OnboardingTask
  rightToWork: RightToWork
  surveyResponses: SurveyResponse
  surveyItems: SurveyItem
  surveyGroups: SurveyGroupRow
  leaveGroups: LeaveGroupRow
  actionItems: ActionItemRow
}
export type DrillKind = keyof DrillRecordMap

/** The dataset a drill kind's records come from (for its tier and its Quality panel). */
export const drillDataset = (kind: DrillKind): DatasetKey =>
  kind === 'surveyGroups'
    ? 'surveyResponses'
    : kind === 'leaveGroups'
      ? 'transactions'
      : // Action items come from every dataset; their specs always name the fields they read.
        kind === 'actionItems'
        ? 'employees'
        : kind

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
  /**
   * The fields the drilled number is computed from (its figure's `uses`). The panel and its
   * exports then show that number's tier; without them, the tier of the records' dataset.
   */
  uses?: readonly FieldRef[]
}

/** Build a typed spec without repeating the kind's record type. */
export function drillSpec<K extends DrillKind>(spec: DrillSpec<K>): DrillSpec<K> {
  return spec
}
