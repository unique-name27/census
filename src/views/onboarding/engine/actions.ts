/**
 * Onboarding's open items for the Action center (docs/VIEWS.md, Action center; docs/ROLES-V2.md
 * 5.14; docs/ACTION-CENTER-AUDIT.md 4.2 and 4.3):
 *
 *  - day-one tasks of upcoming starts that need someone now: overdue, blocked, or not started and
 *    due inside the due-soon look-ahead (an open contingency of a start inside the contingency
 *    window counts too). Tasks in progress and not yet due stay on the countdown;
 *  - probation decisions due or overdue (the manager);
 *  - Form I-9 Section 2 due or late (People operations), folding into Compliance's item for the
 *    same person through `matter`; the export-control screening task folds into Compliance's
 *    export license item the same way;
 *  - the hiring plan, for Finance: open reqs on no plan line, departments behind plan, and future
 *    planned roles with no open req.
 *
 * An item about a start is keyed by the application ID when the accepted candidate is known
 * (`itemKeyOf`), so a handled or snoozed mark survives the hire being entered in the HRIS. Wording
 * states what is open with no closing full stop; a date keeps its year outside the as-of year;
 * notes are polite asks. No plan item names a person.
 */
import type { ISODate, Requisition } from '@/data/schema'
import { addBusinessDays, addDays, dateWords, daysBetween, formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { TEAM_OWNER } from '../../hrbp/engine/places'
import type { ActionItem, ActionOwnerRole } from '../../types'
import type { OnboardingBase } from './base'
import { groupScope, planDrill, reqsDrill, tasksDrill, withScope } from './drills'
import type { First90Model } from './first90'
import { OPEN_REQS, PLAN, PLAN_REQ, SITE, STARTERS, TASK_OWNER, TASKS, UPCOMING, union } from './lineage'
import type { CoverageRow, PlanLineView, PlanModel } from './plan'
import { itemKeyOf, readinessTasks, type Start, type TaskView } from './starts'
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
  'hr-ops': TEAM_OWNER.peopleOps,
  it: TEAM_OWNER.it,
  facilities: TEAM_OWNER.facilities,
  'trade-compliance': TEAM_OWNER.trade,
  recruiter: TEAM_OWNER.recruiting,
  payroll: TEAM_OWNER.payroll,
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

/** The checklist task that clears an export license before day one; Compliance owns the matter. */
const SCREENING = 'Export-control screening'

const subjectOf = (s: Start): ActionItem['subject'] =>
  s.employee
    ? { kind: 'employees', id: s.employee.employeeId, label: s.name }
    : { kind: 'candidates', id: s.candidate?.applicationId, label: s.name }

/** The person a matter is about: their employee ID once the HRIS has them, else the application. */
const personKey = (s: Start): string => s.employee?.employeeId || itemKeyOf(s)

function placeOfStart(b: OnboardingBase, s: Pick<Start, 'businessUnit' | 'location'>): ActionItem['place'] {
  return {
    businessUnit: s.businessUnit,
    location: s.location,
    region: s.location ? b.regions.regionOf(s.location) : null,
  }
}

function ownerOf(t: TaskView, s: Start): Pick<ActionItem, 'ownerRole' | 'ownerId' | 'ownerName'> {
  const role = roleOf(t)
  if (role === 'manager')
    return { ownerRole: role, ownerId: s.hiringManagerId, ownerName: s.hiringManager ?? 'Hiring manager' }
  if (role === 'recruiter' && s.recruiter) return { ownerRole: role, ownerId: null, ownerName: s.recruiter }
  return { ownerRole: role, ownerId: null, ownerName: TEAM[role] ?? t.owner }
}

/**
 * Open day-one tasks of upcoming starts that need someone now: overdue, blocked, or not started
 * and due inside the due-soon look-ahead (a contingency not started counts once the start is
 * inside the contingency window). A task in progress and not yet due is normal workflow.
 */
function startItems(b: OnboardingBase, u: UpcomingModel): ActionItem[] {
  const s = b.settings
  const soon = addBusinessDays(b.asOf, s.dueSoonBusinessDays)
  const uses = union(UPCOMING, TASKS, TASK_OWNER)
  const out: ActionItem[] = []
  for (const { start, readiness } of u.rows) {
    const contingent = start.startDate <= u.contingencyEnd
    const key = itemKeyOf(start)
    for (const t of readinessTasks(start)) {
      if (!t.open) continue
      const isContingency = CONTINGENCY_TASKS.includes(t.name)
      const dueSoon = !!t.due && t.due <= soon
      const notStarted = t.state === 'Not started' && (dueSoon || (isContingency && contingent))
      if (!t.pastDue && t.state !== 'Blocked' && !notStarted) continue
      const severity =
        t.pastDue && (isContingency || readiness.status === 'Not ready')
          ? 'critical'
          : t.pastDue || isContingency || t.state === 'Blocked'
            ? 'warning'
            : 'info'
      const word = STATE_WORD[t.state] ?? t.state.toLowerCase()
      const ask = ASK_WORDS[t.name] ?? `"${t.name}"`
      const dueText = t.due ? ` It ${t.pastDue ? 'was' : 'is'} due on ${formatDate(t.due)}.` : ''
      out.push({
        id: `onboarding:task:${key}:${t.name}`,
        kind: 'Day-one task',
        ...ownerOf(t, start),
        due: t.due,
        severity,
        what: `${t.name} is ${word} for ${start.name}, who starts on ${dateWords(start.startDate, b.asOf)}${t.due ? `, due ${dateWords(t.due, b.asOf)}` : ''}`,
        subject: subjectOf(start),
        view: 'onboarding',
        tab: 'upcoming',
        drill: () => tasksDrill(b, start.tasks, `Onboarding tasks, ${start.name}`, { uses }),
        note: `Could you confirm ${ask} for ${start.name}, who starts on ${formatDate(start.startDate)}?${dueText}`,
        uses,
        // The screening clears the export license: Compliance's license item is the same matter.
        ...(t.name === SCREENING ? { matter: `license:${personKey(start)}` } : {}),
        closesWhen: 'A completed date on the task, or the status Not needed',
        place: placeOfStart(b, start),
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
        ? `The probation decision for ${x.person.name} is ${fmt(x.daysLate, 'days')} past its due date of ${dateWords(x.due, b.asOf)}`
        : `The probation decision for ${x.person.name} is due on ${dateWords(x.due, b.asOf)}`,
      subject: { kind: 'employees' as const, id: x.person.key, label: x.person.name },
      view: 'onboarding' as const,
      tab: 'first90',
      drill: () => tasksDrill(b, [x.task], `Probation decision, ${x.person.name}`, { uses }),
      note: `Could you record the probation decision for ${x.person.name}${overdue ? '' : ` by ${formatDate(x.due)}`}?`,
      uses,
      closesWhen: 'A completed date on the probation decision task',
      place: placeOfStart(b, x.person),
    }
  })
}

/**
 * Form I-9 Section 2 for US starts: late, or due within the look-ahead. One person's I-9 is one
 * matter with Compliance's item (`i9:<employee ID>`), which survives when both fire.
 */
function i9Items(b: OnboardingBase, u: UpcomingModel, ctxStarted: readonly Start[]): ActionItem[] {
  const s = b.settings
  const soon = addBusinessDays(b.asOf, s.dueSoonBusinessDays)
  const uses = union(STARTERS, UPCOMING, TASKS, SITE)
  const out: ActionItem[] = []
  const seen = new Set<string>()
  for (const p of [...ctxStarted, ...u.rows.map((r) => r.start)]) {
    const who = personKey(p)
    if (!p.us || seen.has(who)) continue
    seen.add(who)
    const t = p.tasks.find((x) => x.name === 'I-9 Section 2')
    if (!t?.open) continue
    const deadline: ISODate = addBusinessDays(p.startDate, s.i9BusinessDays)
    if (deadline > soon) continue
    const late = deadline < b.asOf
    out.push({
      id: `onboarding:i9:${itemKeyOf(p)}`,
      kind: 'I-9 Section 2',
      ownerRole: 'hr-ops',
      ownerId: null,
      ownerName: TEAM_OWNER.peopleOps,
      due: deadline,
      severity: late ? 'critical' : 'info',
      what: late
        ? `I-9 Section 2 is not complete for ${p.name}, ${fmt(daysBetween(deadline, b.asOf), 'days')} past its deadline of ${dateWords(deadline, b.asOf)}`
        : `I-9 Section 2 for ${p.name} is due by ${dateWords(deadline, b.asOf)}, ${fmt(s.i9BusinessDays, 'int')} business days after the start on ${dateWords(p.startDate, b.asOf)}`,
      subject: subjectOf(p),
      view: 'onboarding',
      tab: p.startDate > b.asOf ? 'upcoming' : 'first90',
      drill: () => tasksDrill(b, [t], `I-9 Section 2, ${p.name}`, { uses }),
      note: `Could you complete I-9 Section 2 for ${p.name} by ${formatDate(deadline)}?`,
      uses,
      matter: `i9:${who}`,
      ...(late ? { exposure: true } : {}),
      closesWhen: 'A completed date on the I-9 Section 2 task',
      place: placeOfStart(b, p),
    })
  }
  return out
}

/* ───────────── the hiring plan, for Finance ───────────── */

const FINANCE = TEAM_OWNER.finance
/** "Nov" in the as-of year, "Nov 2027" in another. */
const monthWords = (d: ISODate, asOf: ISODate): string =>
  d.slice(0, 4) === asOf.slice(0, 4) ? formatMonth(d).slice(0, 3) : formatMonth(d)
const planName = (p: PlanModel): string => (p.version ? `the ${p.version} plan` : 'the hiring plan')
const reqLabel = (r: Requisition): string => (r.jobTitle ? `${r.reqId} ${r.jobTitle}` : r.reqId)

function reqPlace(b: OnboardingBase, r: Requisition): ActionItem['place'] {
  return placeOfStart(b, { businessUnit: r.businessUnit ?? null, location: r.location ?? null })
}

/** Open reqs on no line of the plan, backfills apart (they replace a leaver): one item per req. */
function notInPlanItems(b: OnboardingBase, p: PlanModel): ActionItem[] {
  const uses = union(OPEN_REQS, ['hiringPlan.reqId', 'hiringPlan.planVersion', 'requisitions.reqType'])
  return p.notInPlan.added.map((r) => ({
    id: `onboarding:not-in-plan:${r.reqId}`,
    kind: 'Req not in the hiring plan',
    ownerRole: 'finance' as const,
    ownerId: null,
    ownerName: FINANCE,
    due: null,
    severity: 'warning' as const,
    what: `Req ${reqLabel(r)} is open but on no line of ${planName(p)}`,
    subject: { kind: 'requisitions' as const, id: r.reqId, label: reqLabel(r) },
    view: 'onboarding' as const,
    tab: 'plan',
    drill: () =>
      reqsDrill(b, [r], `${reqLabel(r)}: open, not in the plan`, {
        note: `No line of ${planName(p)} names this req.`,
        uses,
      }),
    note: 'Could you confirm whether this req has budget, or add it to the plan?',
    uses,
    closesWhen: 'A plan line naming the req, or the req closing',
    place: reqPlace(b, r),
  }))
}

/**
 * Departments behind plan to date (the coverage rows with status Behind, by the on-plan band):
 * one roll-up per business unit and department, critical when the full-year gap is the critical
 * share of the full-year plan or more. The fingerprint is starts and plan to date, so a handled
 * mark reopens when either moves.
 */
function behindItems(b: OnboardingBase, p: PlanModel): ActionItem[] {
  const uses = union(PLAN, ['employees.hireDate', 'employees.businessUnit', 'employees.department'])
  const out: ActionItem[] = []
  for (const r of p.byDepartment) {
    if (r.status !== 'Behind') continue
    const where = `${r.department}, ${r.businessUnit}`
    const gapShare = r.planFull > 0 ? Math.max(0, r.gap) / r.planFull : 0
    out.push({
      id: `onboarding:plan-behind:${r.businessUnit}:${r.department}`,
      kind: 'Hiring behind plan',
      ownerRole: 'finance',
      ownerId: null,
      ownerName: FINANCE,
      due: null,
      severity: gapShare >= b.settings.behindCritical ? 'critical' : 'warning',
      // The share only over 5 or more planned starts (a rate over a smaller group is hidden).
      what: `${where} has ${plural(r.actualYtd, 'start')} against ${fmt(r.planYtd, 'int')} planned to date${r.vsPlan != null && r.planYtd >= b.settings.minGroup ? ` (${fmt(r.vsPlan, 'pct0')})` : ''}; the full-year gap is ${fmt(Math.max(0, Math.round(r.gap)), 'int')} of ${plural(r.planFull, 'planned start')}`,
      subject: { kind: 'none', label: where },
      view: 'onboarding',
      tab: 'plan',
      drill: () => behindDrill(b, p, r, where),
      note: `Could we review the hiring forecast for ${r.department} with its leader this month?`,
      uses,
      fingerprint: `${r.actualYtd}/${r.planYtd}`,
      closesWhen: 'Starts to date reaching the plan within the on-plan band',
      place: { businessUnit: r.businessUnit, region: null, location: null },
    })
  }
  return out
}

/** A behind-plan row's plan lines, with "Filter to" its business unit. */
function behindDrill(b: OnboardingBase, p: PlanModel, r: CoverageRow, where: string) {
  const lines = new Set(r.lines)
  const views = p.views.filter((v) => lines.has(v.line))
  return withScope(
    planDrill(b, views, `Plan lines, ${where}`, {
      note: `${plural(r.actualYtd, 'start')} against ${fmt(r.planYtd, 'int')} planned to date.`,
      uses: PLAN,
    }),
    groupScope('businessUnit', r.businessUnit),
  )
}

/** The plan line's id: its position ID, else its month, org and title. */
export function lineKey(v: PlanLineView): string {
  const l = v.line
  if (l.positionId?.trim()) return l.positionId.trim()
  return [v.month, l.businessUnit, l.department, l.jobTitle ?? l.level ?? '', l.location ?? '']
    .map((x) => String(x).trim())
    .join('|')
}

/** Future planned roles with no open req, or whose req is on hold or cancelled: one item per line. */
function noReqItems(b: OnboardingBase, p: PlanModel): ActionItem[] {
  const uses = union(PLAN, PLAN_REQ)
  const soon = addDays(b.asOf, b.settings.noReqSoonDays)
  const seen = new Set<string>()
  const out: ActionItem[] = []
  for (const v of p.noReq) {
    const key = lineKey(v)
    if (seen.has(key)) continue
    seen.add(key)
    const l = v.line
    const role = l.jobTitle || (l.level ? `${l.level} role` : 'Planned role')
    const req = v.req?.reqId ? `its req ${v.req.reqId}` : 'its req'
    const why =
      v.coverage === 'on-hold'
        ? `${req} is on hold`
        : v.coverage === 'cancelled'
          ? `${req} was cancelled`
          : 'no req is open'
    out.push({
      id: `onboarding:plan-no-req:${key}`,
      kind: 'Planned role with no open req',
      ownerRole: 'finance',
      ownerId: null,
      ownerName: FINANCE,
      due: l.period,
      severity: l.period <= soon ? 'warning' : 'info',
      what: `${role} in ${l.department}, ${l.businessUnit} is planned to start in ${monthWords(l.period, b.asOf)}; ${why}`,
      subject: { kind: 'none', label: `${role}, ${l.department}` },
      view: 'onboarding',
      tab: 'plan',
      drill: () => planDrill(b, [v], `Planned role: ${role}, ${l.department}`, { uses }),
      note: 'Could you confirm whether this role is still planned, and when its req will open?',
      uses,
      closesWhen: 'An open req or accepted offer behind the plan line',
      place: placeOfStart(b, { businessUnit: l.businessUnit, location: l.location ?? null }),
    })
  }
  return out
}

/** The hiring plan's items (none without a plan). */
export function planActions(b: OnboardingBase, p: PlanModel | null): ActionItem[] {
  if (!p) return []
  return [...notInPlanItems(b, p), ...behindItems(b, p), ...noReqItems(b, p)]
}

/** Everything open, in the order the Action center groups it. */
export function onboardingActions(
  b: OnboardingBase,
  u: UpcomingModel,
  f: First90Model,
  recentStarters: readonly Start[],
  plan: PlanModel | null = null,
): ActionItem[] {
  return [
    ...startItems(b, u),
    ...probationItems(b, f),
    ...i9Items(b, u, recentStarters),
    ...planActions(b, plan),
  ]
}
