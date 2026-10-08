/**
 * My team's My list (docs/ROLES-V2.md 5.12; docs/ACTION-CENTER-AUDIT.md 5.9): everyone active in
 * the manager's org, direct reports first, with what a manager acts on: their start date, whether
 * they are in their first 90 days, a probation decision still open, overdue required courses and
 * the open reqs they own as hiring manager. Read from Onboarding's tasks, Talent's learning records
 * and Recruiting's open reqs for the same context. No pay, rating, flight risk or case. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate, LearningRecord, OnboardingTask, Requisition } from '@/data/schema'
import { addDays } from '@/lib/dates'
import { isActiveAt } from '@/lib/people'
import type { TeamSources } from './sources'

/** The days after the start date that count as a person's first 90 days. */
export const FIRST_DAYS = 90

export interface TeamPersonRow {
  [key: string]: unknown
  employeeId: string
  name: string
  title: string
  /** Reports to the leader. */
  direct: boolean
  /** "Direct report", or the manager they report to. */
  reportsTo: string
  startDate: ISODate
  firstNinety: 'Yes' | 'No'
  /** The open probation decision's due date, when one is open. */
  probationDue: ISODate | null
  overdueCourses: number
  openReqs: number
  /** The records behind the numbers (not exported). */
  employee: Employee
  probation: OnboardingTask | null
  courses: LearningRecord[]
  reqs: Requisition[]
}

const isOpenTask = (t: OnboardingTask) => !t.completedDate && t.status !== 'Done' && t.status !== 'Not needed'

/**
 * The org's active employees and workers below the leader (the leader too when their own record
 * is in scope), direct reports first, then by name.
 */
export function teamPeople(
  ctx: Pick<AnalyticsContext, 'asOf' | 'data' | 'org'> & {
    access?: Pick<AnalyticsContext['access'], 'mode'>
  },
  s: Pick<TeamSources, 'onboarding' | 'talent' | 'recruiting'>,
  leaderId: string | null,
): TeamPersonRow[] {
  const asOf = ctx.asOf
  const since = addDays(asOf, -FIRST_DAYS)
  const tasks = s.onboarding.base.tasks.byEmployee
  const overdue = new Map<string, LearningRecord[]>()
  for (const p of s.talent.learning.records.pastDue) {
    if (!p.overdue) continue
    const list = overdue.get(p.l.employeeId)
    if (list) list.push(p.l)
    else overdue.set(p.l.employeeId, [p.l])
  }
  const reqs = new Map<string, Requisition[]>()
  for (const q of s.recruiting.base.req.open) {
    if (!q.hiringManagerId) continue
    const list = reqs.get(q.hiringManagerId)
    if (list) list.push(q)
    else reqs.set(q.hiringManagerId, [q])
  }
  const rows: TeamPersonRow[] = []
  for (const e of ctx.data.employees) {
    if (!isActiveAt(e, asOf) || e.employeeId === leaderId) continue
    const probation =
      (tasks.get(e.employeeId) ?? []).filter((t) => t.task === 'Probation decision' && isOpenTask(t))[0] ??
      null
    const courses = overdue.get(e.employeeId) ?? []
    const owned = reqs.get(e.employeeId) ?? []
    const direct = !!leaderId && e.managerId === leaderId
    rows.push({
      employeeId: e.employeeId,
      name: e.name,
      title: e.jobTitle,
      direct,
      // A manager reads "You" for their own reports, never their own name or a relationship word.
      reportsTo: direct
        ? ctx.access?.mode === 'manager'
          ? 'You'
          : (ctx.org.byId.get(leaderId ?? '')?.name ?? '—')
        : e.managerId
          ? (ctx.org.byId.get(e.managerId)?.name ?? '—')
          : '—',
      startDate: e.hireDate,
      firstNinety: e.hireDate >= since ? 'Yes' : 'No',
      probationDue: probation?.dueDate ?? null,
      overdueCourses: courses.length,
      openReqs: owned.length,
      employee: e,
      probation,
      courses,
      reqs: owned,
    })
  }
  return rows.sort((a, b) => Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name))
}
