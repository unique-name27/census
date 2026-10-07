/**
 * My team, Talent (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): critical roles in the org by
 * the readiness of their best successor, required training on time by course, and the overdue
 * assignments and critical roles one by one. Read from Talent's model for the scope, whose
 * successor names already keep to the manager's org in Manager mode. Pure.
 */
import type { LearningRecord } from '@/data/schema'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import type { TalentModel } from '@/views/talent/engine'
import type { CourseRow, OverdueRow } from '@/views/talent/engine/learning'
import { COVERAGE_ORDER, type Coverage, type RoleRow } from '@/views/talent/engine/succession'

/** Critical roles in the plan (Key roles are on Talent's own charts). */
export const criticalRoles = (t: TalentModel): RoleRow[] =>
  t.succession.roles.filter((r) => r.criticality === 'Critical')

export interface CoverageCount {
  coverage: Coverage
  roles: number
  list: RoleRow[]
}

/** Critical roles by their best successor's readiness, in readiness order (no successor last). */
export function criticalCoverage(t: TalentModel): CoverageCount[] {
  const roles = criticalRoles(t)
  return COVERAGE_ORDER.map((coverage) => {
    const list = roles.filter((r) => r.coverage === coverage)
    return { coverage, roles: list.length, list }
  })
}

/** Courses shown by name before the rest fold into one "Other courses" row. */
export const COURSES_SHOWN = 6

export interface CourseBar extends CourseRow {
  /** The courses an "Other" row folds; the row's own course otherwise. */
  courses: string[]
  other: boolean
}

/**
 * Required training on time by course, the lowest on-time share first, at most six courses and an
 * "Other courses (k)" row whose share is recounted over the assignments it folds (hidden under the
 * anonymity minimum of assignments or of people, as each course's is).
 */
export function courseBars(t: TalentModel, shown = COURSES_SHOWN): CourseBar[] {
  const minGroup = t.settings.minGroup
  const sorted = [...t.learning.byCourse].sort(
    (a, b) => (a.onTimeRate ?? 2) - (b.onTimeRate ?? 2) || b.due - a.due || a.course.localeCompare(b.course),
  )
  const bars: CourseBar[] = sorted.map((c) => ({ ...c, courses: [c.course], other: false }))
  if (bars.length <= shown + 1) return bars
  const head = bars.slice(0, shown)
  const rest = bars.slice(shown)
  const due = rest.reduce((n, c) => n + c.due, 0)
  const onTime = rest.reduce((n, c) => n + c.onTime, 0)
  // The people behind the folded courses: a share needs 5 people as well as 5 assignments.
  const folded = new Set(rest.map((c) => c.course))
  const people = new Set(t.learning.records.due.filter((l) => folded.has(l.course)).map((l) => l.employeeId))
    .size
  return [
    ...head,
    {
      course: `Other courses (${rest.length})`,
      category: '',
      due,
      onTime,
      late: rest.reduce((n, c) => n + c.late, 0),
      open: rest.reduce((n, c) => n + c.open, 0),
      onTimeRate: due >= minGroup && people >= minGroup ? onTime / due : null,
      courses: rest.map((c) => c.course),
      other: true,
    },
  ]
}

/** The assignments behind one overdue row: the learning record itself, for its person. */
export function overdueRecords(t: TalentModel, row: OverdueRow): LearningRecord[] {
  return t.learning.records.pastDue
    .filter(
      (p) =>
        p.overdue &&
        p.l.employeeId === row.employeeId &&
        p.l.course === row.course &&
        p.l.dueDate === row.dueDate,
    )
    .map((p) => p.l)
}

/** One overdue assignment as records (the person's card opens from the row). */
export function overdueSpec(t: TalentModel, row: OverdueRow, scope: string): DrillSpec<'learning'> {
  return drillSpec({
    kind: 'learning',
    title: `${row.course}, ${row.name}`,
    subtitle: `${scope} · as of ${formatDate(t.asOf)}`,
    rows: overdueRecords(t, row),
    note: `Required and not completed, ${row.daysOverdue} d past its due date.`,
  })
}

/** The org's overdue required assignments, the longest overdue first. */
export const overdueRows = (t: TalentModel): OverdueRow[] =>
  [...t.learning.overdue].sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name))
