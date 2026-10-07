/**
 * Onboarding's open items for the Action center (docs/VIEWS.md, Action center): day-one tasks of
 * upcoming starts that are past due, due soon or an open contingency (owned by the task's team, or
 * the hiring manager), probation decisions due or overdue (the manager), and Form I-9 Section 2
 * due or late (People operations). Wording states what is open; notes are polite asks.
 */
import type { ISODate } from '@/data/schema'
import { addBusinessDays, daysBetween, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem, ActionOwnerRole } from '../../types'
import type { OnboardingBase } from './base'
import { tasksDrill } from './drills'
import type { First90Model } from './first90'
import { SITE, STARTERS, TASK_OWNER, TASKS, UPCOMING, union } from './lineage'
import { readinessTasks, type Start, type TaskView } from './starts'
import { CONTINGENCY_TASKS, type UpcomingModel } from './upcoming'

const ROLE: Record<string, ActionOwnerRole> = {
  'People ops': 'hr-ops',
  IT: 'it',
  Facilities: 'facilities',
  'Trade compliance': 'trade-compliance',
  Manager: 'manager',
  Recruiter: 'recruiter',
  Payroll: 'payroll',
  'New hire': 'hr-ops',
}

const TEAM: Partial<Record<ActionOwnerRole, string>> = {
  'hr-ops': 'People operations',
  it: 'IT',
  facilities: 'Facilities',
  'trade-compliance': 'Trade compliance',
  recruiter: 'Recruiting',
  payroll: 'Payroll',
}

/** The Action center owner group of a task: by its owner, else by the checklist's owner. */
export function roleOf(t: TaskView): ActionOwnerRole {
  return ROLE[t.owner] ?? (t.def ? ROLE[t.def.owner] : undefined) ?? 'hr-ops'
}

const STATE_WORD: Record<string, string> = {
  Overdue: 'overdue',
  Blocked: 'blocked',
  'In progress': 'in progress',
  'Not started': 'not started',
}

/** How a task reads in a polite ask: "the background check", "the laptop". */
const ASK_WORDS: Record<string, string> = {
  'Background check cleared': 'the background check',
  'Export-control screening': 'the export-control screening',
  'Laptop shipped': 'the laptop shipment',
  'Accounts created': 'the system accounts',
  'Badge ready': 'the badge',
  'Benefits packet sent': 'the benefits packet',
  'Orientation booked': 'the orientation booking',
  'Manager welcome': 'a welcome note or call',
  'Day -1 readiness check': 'the day -1 readiness check',
  'I-9 Section 1': 'I-9 Section 1',
  'I-9 Section 2': 'I-9 Section 2',
}

const subjectOf = (s: Start): ActionItem['subject'] =>
  s.employee
    ? { kind: 'employees', id: s.employee.employeeId, label: s.name }
    : { kind: 'candidates', id: s.candidate?.applicationId, label: s.name }

function ownerOf(t: TaskView, s: Start): Pick<ActionItem, 'ownerRole' | 'ownerId' | 'ownerName'> {
  const role = roleOf(t)
  if (role === 'manager')
    return { ownerRole: role, ownerId: s.hiringManagerId, ownerName: s.hiringManager ?? 'Hiring manager' }
  if (role === 'recruiter' && s.recruiter) return { ownerRole: role, ownerId: null, ownerName: s.recruiter }
  return { ownerRole: role, ownerId: null, ownerName: TEAM[role] ?? t.owner }
}

/** Open day-one tasks of upcoming starts that need someone now. */
function startItems(b: OnboardingBase, u: UpcomingModel): ActionItem[] {
  const s = b.settings
  const soon = addBusinessDays(b.asOf, s.dueSoonBusinessDays)
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  const out: ActionItem[] = []
  for (const { start, readiness } of u.rows) {
    const contingent = start.startDate <= u.contingencyEnd
    for (const t of readinessTasks(start)) {
      if (!t.open) continue
      const isContingency = CONTINGENCY_TASKS.includes(t.name)
      const dueSoon = !!t.due && t.due <= soon
      if (!t.pastDue && !(isContingency && contingent) && !dueSoon) continue
      const severity =
        t.pastDue && (isContingency || readiness.status === 'Not ready')
          ? 'critical'
          : t.pastDue || isContingency
            ? 'warning'
            : 'info'
      const word = STATE_WORD[t.state] ?? t.state.toLowerCase()
      const ask = ASK_WORDS[t.name] ?? `"${t.name}"`
      const dueText = t.due ? ` It ${t.pastDue ? 'was' : 'is'} due on ${formatDate(t.due)}.` : ''
      out.push({
        id: `onboarding:task:${start.key}:${t.name}`,
        kind: 'Day-one task',
        ...ownerOf(t, start),
        due: t.due,
        severity,
        what: `${t.name} is ${word} for ${start.name}, who starts on ${formatDate(start.startDate)}${t.due ? `. Due ${formatDate(t.due)}` : ''}.`,
        subject: subjectOf(start),
        view: 'onboarding',
        tab: 'upcoming',
        drill: () => tasksDrill(b, start.tasks, `Onboarding tasks, ${start.name}`, { uses }),
        note: `Could you confirm ${ask} for ${start.name}, who starts on ${formatDate(start.startDate)}?${dueText}`,
        uses,
      })
    }
  }
  return out
}

/** Probation decisions overdue or due soon: the person's manager. */
function probationItems(b: OnboardingBase, f: First90Model): ActionItem[] {
  const uses = union(STARTERS, TASKS, [
    'employees.managerId',
    'employees.terminationDate',
    'employees.country',
  ])
  return f.probation.map((x) => {
    const mgr = x.person.employee?.managerId ?? null
    const overdue = x.state === 'Overdue'
    return {
      id: `onboarding:probation:${x.person.key}`,
      kind: 'Probation decision',
      ownerRole: 'manager' as const,
      ownerId: mgr,
      ownerName: (mgr && b.byId.get(mgr)?.name) || 'Manager',
      due: x.due,
      severity: overdue ? ('warning' as const) : ('info' as const),
      what: overdue
        ? `The probation decision for ${x.person.name} is ${fmt(x.daysLate, 'days')} past its due date of ${formatDate(x.due)}.`
        : `The probation decision for ${x.person.name} is due on ${formatDate(x.due)}.`,
      subject: { kind: 'employees' as const, id: x.person.key, label: x.person.name },
      view: 'onboarding' as const,
      tab: 'first90',
      drill: () => tasksDrill(b, [x.task], `Probation decision, ${x.person.name}`, { uses }),
      note: `Could you record the probation decision for ${x.person.name}${overdue ? '' : ` by ${formatDate(x.due)}`}?`,
      uses,
    }
  })
}

/** Form I-9 Section 2 for US starts: late, or due within the look-ahead. */
function i9Items(b: OnboardingBase, u: UpcomingModel, ctxStarted: readonly Start[]): ActionItem[] {
  const s = b.settings
  const soon = addBusinessDays(b.asOf, s.dueSoonBusinessDays)
  const uses = union(STARTERS, UPCOMING, TASKS, SITE)
  const out: ActionItem[] = []
  const seen = new Set<string>()
  for (const p of [...ctxStarted, ...u.rows.map((r) => r.start)]) {
    if (!p.us || seen.has(p.key)) continue
    seen.add(p.key)
    const t = p.tasks.find((x) => x.name === 'I-9 Section 2')
    if (!t?.open) continue
    const deadline: ISODate = addBusinessDays(p.startDate, s.i9BusinessDays)
    if (deadline > soon) continue
    const late = deadline < b.asOf
    out.push({
      id: `onboarding:i9:${p.key}`,
      kind: 'I-9 Section 2',
      ownerRole: 'hr-ops',
      ownerId: null,
      ownerName: 'People operations',
      due: deadline,
      severity: late ? 'critical' : 'info',
      what: late
        ? `I-9 Section 2 is not complete for ${p.name}, ${fmt(daysBetween(deadline, b.asOf), 'days')} past its deadline of ${formatDate(deadline)}.`
        : `I-9 Section 2 for ${p.name} is due by ${formatDate(deadline)}, ${fmt(s.i9BusinessDays, 'int')} business days after the start on ${formatDate(p.startDate)}.`,
      subject: subjectOf(p),
      view: 'onboarding',
      tab: p.startDate > b.asOf ? 'upcoming' : 'first90',
      drill: () => tasksDrill(b, [t], `I-9 Section 2, ${p.name}`, { uses }),
      note: `Could you complete I-9 Section 2 for ${p.name} by ${formatDate(deadline)}?`,
      uses,
    })
  }
  return out
}

/** Everything open, in the order the Action center groups it. */
export function onboardingActions(
  b: OnboardingBase,
  u: UpcomingModel,
  f: First90Model,
  recentStarters: readonly Start[],
): ActionItem[] {
  return [...startItems(b, u), ...probationItems(b, f), ...i9Items(b, u, recentStarters)]
}
