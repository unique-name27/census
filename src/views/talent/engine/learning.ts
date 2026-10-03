/**
 * Learning: required training on time, what is overdue today and where it concentrates,
 * completions over time and learning hours per employee.
 *
 * Definitions:
 *  - required = assignments with required = true;
 *  - on time = completed on or before the due date, for assignments due in the window to people
 *    still employed on the due date;
 *  - overdue = required, not completed and due before the as-of date, for people active today.
 * Pure: no React, no DOM.
 */
import type { Employee, ISODate, LearningRecord } from '@/data/schema'
import type { Window } from '@/data/scope'
import { daysBetween, monthsBetween } from '@/lib/dates'
import { decomposeRate, type Segment } from '@/lib/decompose'
import { avgHeadcount, isActiveAt, isEmployee } from '@/lib/people'
import { nameOf, orgDims, type TalentBase } from './base'

export const ON_TIME_TARGET = 0.95
const MIN_GROUP = 5

export interface CourseRow {
  course: string
  category: string
  due: number
  onTime: number
  late: number
  /** Not completed and past due. */
  open: number
  onTimeRate: number | null
}

export interface OverdueCell {
  course: string
  group: string
  /** Required assignments now past due, for people active today. */
  pastDue: number
  overdue: number
  share: number | null
}

export interface CompletionRow {
  month: string
  kind: 'Required' | 'Optional'
  completions: number
}

export interface HoursRow {
  businessUnit: string
  hours: number
  avgHeadcount: number
  perEmployee: number | null
}

export interface OverdueRow {
  employeeId: string
  name: string
  department: string
  location: string
  manager: string
  course: string
  dueDate: ISODate
  daysOverdue: number
}

export interface OverdueConcentration {
  course: string
  pastDue: number
  overdue: number
  rate: number
  dueDate: ISODate | null
  top: Segment | null
  /** A second segment on a different dimension, when one stands out too. */
  second: Segment | null
  people: OverdueRow[]
}

export interface OnTime {
  rate: number | null
  due: number
  onTime: number
}

export interface LearningResult {
  /** Required assignments carry due dates. */
  hasDueDates: boolean
  current: OnTime
  prior: OnTime
  byCourse: CourseRow[]
  overdueByDepartment: OverdueCell[]
  overdueByLocation: OverdueCell[]
  overdueCourses: string[]
  completions: CompletionRow[]
  hours: HoursRow[]
  overdue: OverdueRow[]
  concentration: OverdueConcentration | null
  /** Per-month on-time share for the KPI trend, oldest first. */
  trend: (number | null)[]
}

const rate = (k: number, n: number) => (n >= MIN_GROUP ? k / n : null)

function onTimeIn(
  rows: readonly LearningRecord[],
  byId: Map<string, Employee>,
  w: Pick<Window, 'start' | 'end'>,
  asOf: ISODate,
): OnTime {
  let due = 0
  let onTime = 0
  for (const l of rows) {
    if (!l.dueDate || l.dueDate < w.start || l.dueDate > w.end || l.dueDate > asOf) continue
    const e = byId.get(l.employeeId)
    if (e && !isActiveAt(e, l.dueDate)) continue
    due++
    if (l.completedDate && l.completedDate <= l.dueDate) onTime++
  }
  return { rate: rate(onTime, due), due, onTime }
}

function overdueCells(
  pastDue: readonly { l: LearningRecord; e: Employee; overdue: boolean }[],
  key: (e: Employee) => string,
): OverdueCell[] {
  const m = new Map<string, OverdueCell>()
  for (const { l, e, overdue } of pastDue) {
    const group = key(e)
    const k = `${l.course}\u0000${group}`
    const c = m.get(k) ?? { course: l.course, group, pastDue: 0, overdue: 0, share: null }
    c.pastDue++
    if (overdue) c.overdue++
    m.set(k, c)
  }
  for (const c of m.values()) c.share = rate(c.overdue, c.pastDue)
  return [...m.values()]
}

export function computeLearning(base: TalentBase): LearningResult {
  const { asOf, ctx } = base
  const w = ctx.window
  const all = ctx.data.learning
  const required = all.filter((l) => l.required === true)
  const byId = base.byId
  const hasDueDates = required.some((l) => !!l.dueDate)

  const current = onTimeIn(required, byId, w, asOf)
  const prior = onTimeIn(required, byId, ctx.prior, asOf)

  // By course: assignments due in the window.
  const courses = new Map<string, CourseRow>()
  for (const l of required) {
    if (!l.dueDate || l.dueDate < w.start || l.dueDate > w.end || l.dueDate > asOf) continue
    const e = byId.get(l.employeeId)
    if (e && !isActiveAt(e, l.dueDate)) continue
    const c = courses.get(l.course) ?? {
      course: l.course,
      category: l.category,
      due: 0,
      onTime: 0,
      late: 0,
      open: 0,
      onTimeRate: null,
    }
    c.due++
    if (l.completedDate && l.completedDate <= l.dueDate) c.onTime++
    else if (l.completedDate) c.late++
    else c.open++
    courses.set(l.course, c)
  }
  const byCourse = [...courses.values()]
    .map((c) => ({ ...c, onTimeRate: rate(c.onTime, c.due) }))
    .sort((a, b) => (a.onTimeRate ?? 2) - (b.onTimeRate ?? 2))

  // Overdue today, for people active today.
  const pastDue: { l: LearningRecord; e: Employee; overdue: boolean }[] = []
  for (const l of required) {
    if (!l.dueDate || l.dueDate >= asOf) continue
    const e = byId.get(l.employeeId)
    if (!e || !isActiveAt(e, asOf)) continue
    pastDue.push({ l, e, overdue: !l.completedDate })
  }
  const overdue: OverdueRow[] = pastDue
    .filter((p) => p.overdue)
    .map(({ l, e }) => ({
      employeeId: e.employeeId,
      name: e.name,
      department: e.department,
      location: e.location,
      manager: nameOf(base, e.managerId),
      course: l.course,
      dueDate: l.dueDate!,
      daysOverdue: daysBetween(l.dueDate!, asOf),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name))
  const overdueByCourse = new Map<string, number>()
  for (const o of overdue) overdueByCourse.set(o.course, (overdueByCourse.get(o.course) ?? 0) + 1)
  const overdueCourses = [...overdueByCourse.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  const inOverdueCourse = pastDue.filter((p) => overdueByCourse.has(p.l.course))

  // Where the most overdue course concentrates.
  let concentration: OverdueConcentration | null = null
  const topCourse = overdueCourses[0]
  if (topCourse && (overdueByCourse.get(topCourse) ?? 0) >= MIN_GROUP) {
    const rows = pastDue.filter((p) => p.l.course === topCourse)
    const segs = decomposeRate(
      rows,
      orgDims((r) => r.e),
      (r) => r.overdue,
      { minDev: 0.05, minPopulation: 10, top: 8 },
    )
    const top = segs[0] ?? null
    const second = top ? pickSecond(top, segs) : null
    const k = rows.filter((r) => r.overdue).length
    concentration = {
      course: topCourse,
      pastDue: rows.length,
      overdue: k,
      rate: k / rows.length,
      dueDate:
        rows
          .map((r) => r.l.dueDate!)
          .sort()
          .pop() ?? null,
      top,
      second,
      people: overdue.filter((o) => o.course === topCourse),
    }
  }

  // Completions by month over the window.
  const months = monthsBetween(w.start, w.end)
  const monthSet = new Set(months)
  const counts = new Map<string, number>()
  for (const l of all) {
    if (!l.completedDate || l.completedDate < w.start || l.completedDate > w.end) continue
    const m = l.completedDate.slice(0, 7)
    if (!monthSet.has(m)) continue
    const k = `${m}|${l.required ? 'Required' : 'Optional'}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const completions: CompletionRow[] = months.flatMap((month) =>
    (['Required', 'Optional'] as const).map((kind) => ({
      month,
      kind,
      completions: counts.get(`${month}|${kind}`) ?? 0,
    })),
  )

  // Learning hours per employee by business unit (completed in the window, employees only).
  const unitHours = new Map<string, number>()
  for (const l of all) {
    if (l.hours == null || !l.completedDate || l.completedDate < w.start || l.completedDate > w.end) continue
    const e = byId.get(l.employeeId)
    if (!e || !isEmployee(e)) continue
    unitHours.set(e.businessUnit, (unitHours.get(e.businessUnit) ?? 0) + l.hours)
  }
  const unitPeople = new Map<string, Employee[]>()
  for (const e of base.scoped) {
    const arr = unitPeople.get(e.businessUnit)
    if (arr) arr.push(e)
    else unitPeople.set(e.businessUnit, [e])
  }
  const hours: HoursRow[] = base.has.learningHours
    ? [...unitPeople.entries()]
        .map(([businessUnit, people]) => {
          const avg = avgHeadcount(people, w)
          const h = unitHours.get(businessUnit) ?? 0
          return { businessUnit, hours: h, avgHeadcount: avg, perEmployee: avg >= MIN_GROUP ? h / avg : null }
        })
        .filter((r) => r.avgHeadcount > 0)
        .sort((a, b) => (b.perEmployee ?? -1) - (a.perEmployee ?? -1))
    : []

  // Monthly on-time share across the window for the KPI sparkline.
  const trend = months.map((m) => onTimeIn(required, byId, { start: `${m}-01`, end: `${m}-31` }, asOf).rate)

  return {
    hasDueDates,
    current,
    prior,
    byCourse,
    overdueByDepartment: overdueCells(inOverdueCourse, (e) => e.department),
    overdueByLocation: overdueCells(inOverdueCourse, (e) => e.location),
    overdueCourses,
    completions,
    hours,
    overdue,
    concentration,
    trend,
  }
}

/**
 * A second segment worth naming next to the top one: prefer a location (it cuts across the org),
 * and skip departments inside a top business unit (they repeat it).
 */
export function pickSecond(top: Segment, segs: readonly Segment[]): Segment | null {
  const ok = (s: Segment) =>
    s !== top && !s.small && s.dim !== top.dim && !(top.dim === 'businessUnit' && s.dim === 'department')
  return (
    segs.find((s) => ok(s) && s.dim === 'location') ??
    segs.find((s) => ok(s) && s.dim !== 'businessUnit') ??
    null
  )
}
