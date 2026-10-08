/**
 * Who starts and what their onboarding tasks say (docs/VIEWS.md, Onboarding, Definitions).
 *
 * Upcoming starts merge pre-hire employee records (hire date after the as-of date) with accepted
 * offers (status Hired) whose start date is after it. The HRIS creates a pre-hire as a copy of the
 * accepted candidate, so a candidate is dropped when a pre-hire with the same normalized name
 * starts in the req's department within the matching window; the pair becomes one start that
 * keeps both records (the pre-hire's date wins).
 *
 * Pure functions of the analytics context; no React.
 */
import type { RegionIndex } from '@/access/scopes/regions'
import {
  type Candidate,
  type Employee,
  type ISODate,
  type OnboardingTask,
  type OnboardingTaskDef,
  onboardingTaskByName,
  type Requisition,
  siteByLocation,
} from '@/data/schema'
import { addBusinessDays, addDays, addMonths, daysBetween } from '@/lib/dates'
import { inWindow, isEmployee } from '@/lib/people'
import { matchPreHires, normalizeName } from '@/lib/starts'
import type { OnboardingSettings } from './settings'

/* ───────────── places ───────────── */

/**
 * The sites of a region in the loaded data, from the one region index (docs/ROLES-V2.md 1.3: the
 * Locations list in force, so a region has one name everywhere, "APAC"); null when none. A region
 * is the set of its sites for the filters ("Filter to APAC").
 */
export function regionSites(regions: RegionIndex, region: string): string[] | null {
  const sites = regions.sitesOf(region)
  return sites.length ? [...sites] : null
}

/** The country of a site, or the record's own country. */
export function countryOf(location: string | null | undefined, fallback?: string | null): string | null {
  const s = location ? siteByLocation.get(location) : undefined
  return s?.country ?? fallback ?? null
}

/** A US site (Form I-9 applies). */
export function isUsSite(location: string | null | undefined, country?: string | null): boolean {
  const s = location ? siteByLocation.get(location) : undefined
  if (s) return s.jurisdiction.startsWith('us')
  return country === 'United States'
}

/* ───────────── tasks ───────────── */

export type TaskState =
  | 'Done'
  | 'Done late'
  | 'Overdue'
  | 'Blocked'
  | 'In progress'
  | 'Not started'
  | 'Not needed'

/** One task of one person, with its effective due date and where it stands on the as-of date. */
export interface TaskView {
  task: OnboardingTask
  /** The checklist entry when the task name is a known one. */
  def: OnboardingTaskDef | undefined
  /** The task name as shown. */
  name: string
  /** Who does it: the row's owner, else the checklist's. */
  owner: string
  /** The row's due date, else the checklist's offset from the start. */
  due: ISODate | null
  state: TaskState
  /** Completed or not needed. */
  done: boolean
  /** Not done and not needed. */
  open: boolean
  /** Open past its due date on the as-of date. */
  pastDue: boolean
}

/** Probation decision due date when the row has none: a lead time before the probation ends. */
export function probationDue(start: ISODate, country: string | null, s: OnboardingSettings): ISODate | null {
  const months = country ? (s.probationMonths[country] ?? 0) : 0
  if (!months) return null
  return addBusinessDays(addMonths(start, months), -s.probationLeadBusinessDays)
}

/** The due date of a task: the row's own, else the checklist offset from the start. */
export function dueOf(
  t: OnboardingTask,
  def: OnboardingTaskDef | undefined,
  start: ISODate | null,
  country: string | null,
  s: OnboardingSettings,
): ISODate | null {
  if (t.dueDate) return t.dueDate
  if (!start || !def) return null
  if (def.dueDay == null) return def.task === 'Probation decision' ? probationDue(start, country, s) : null
  return def.businessDays ? addBusinessDays(start, def.dueDay) : addDays(start, def.dueDay)
}

/**
 * Days a task ran past its due date: completed late, or still open past due (to the as-of date).
 * Null when it is not needed, has no due date, or is open and not yet due (nothing to measure).
 */
export function daysLateOf(
  t: Pick<OnboardingTask, 'completedDate'>,
  due: ISODate | null,
  state: TaskState,
  asOf: ISODate,
): number | null {
  if (state === 'Not needed' || !due) return null
  const end = t.completedDate ?? (state === 'Overdue' ? asOf : null)
  if (!end) return null
  return Math.max(0, daysBetween(due, end))
}

/** Where a task stands (the same words as the onboarding tasks drill). */
export function stateOf(t: OnboardingTask, due: ISODate | null, asOf: ISODate): TaskState {
  if (t.status === 'Not needed') return 'Not needed'
  if (t.completedDate || t.status === 'Done')
    return t.completedDate && due && t.completedDate > due ? 'Done late' : 'Done'
  if (due && due < asOf) return 'Overdue'
  if (t.status === 'Blocked') return 'Blocked'
  return t.status === 'In progress' ? 'In progress' : 'Not started'
}

export function viewTask(
  t: OnboardingTask,
  start: ISODate | null,
  country: string | null,
  asOf: ISODate,
  s: OnboardingSettings,
): TaskView {
  const def = onboardingTaskByName.get(t.task)
  const due = dueOf(t, def, start, country, s)
  const state = stateOf(t, due, asOf)
  const done = state === 'Done' || state === 'Done late' || state === 'Not needed'
  return {
    task: t,
    def,
    name: t.task,
    owner: t.owner?.trim() || def?.owner || 'Unassigned',
    due,
    state,
    done,
    open: !done,
    pastDue: !done && !!due && due < asOf,
  }
}

/** Tasks by employee ID and by application ID. */
export interface TaskIndex {
  byEmployee: Map<string, OnboardingTask[]>
  byApplication: Map<string, OnboardingTask[]>
}

export function taskIndex(tasks: readonly OnboardingTask[]): TaskIndex {
  const byEmployee = new Map<string, OnboardingTask[]>()
  const byApplication = new Map<string, OnboardingTask[]>()
  const add = (m: Map<string, OnboardingTask[]>, k: string, t: OnboardingTask) => {
    const list = m.get(k)
    if (list) list.push(t)
    else m.set(k, [t])
  }
  for (const t of tasks) {
    if (t.employeeId) add(byEmployee, t.employeeId, t)
    else if (t.applicationId) add(byApplication, t.applicationId, t)
  }
  return { byEmployee, byApplication }
}

/** A person's tasks: the employee's, then the candidate's for any task the employee has no row for. */
function tasksOf(idx: TaskIndex, employeeId: string | null, applicationId: string | null): OnboardingTask[] {
  const own = (employeeId && idx.byEmployee.get(employeeId)) || []
  const app = (applicationId && idx.byApplication.get(applicationId)) || []
  if (!app.length) return own
  if (!own.length) return app
  const names = new Set(own.map((t) => t.task))
  return [...own, ...app.filter((t) => !names.has(t.task))]
}

/* ───────────── people ───────────── */

/** One person who starts (or started): a pre-hire or employee, an accepted candidate, or both. */
export interface Start {
  /** Employee ID when in the roster, else application ID. */
  key: string
  employee: Employee | null
  candidate: Candidate | null
  req: Requisition | null
  name: string
  role: string | null
  businessUnit: string | null
  department: string | null
  location: string | null
  country: string | null
  region: string | null
  us: boolean
  hiringManager: string | null
  hiringManagerId: string | null
  recruiter: string | null
  startDate: ISODate
  /** Offer accepted date, when the candidate is known. */
  acceptedDate: ISODate | null
  tasks: TaskView[]
}

/** Moved to `@/lib/starts` (docs/ROLES-V2.md, 2.2): Recruiter mode's scope matches starts by the same rule. */
export { isAccepted, normalizeName } from '@/lib/starts'

export interface StartSources {
  /** The one region index (`ctx.regions`): each location's region. */
  regions: RegionIndex
  employees: readonly Employee[]
  candidates: readonly Candidate[]
  reqs: ReadonlyMap<string, Requisition>
  byId: ReadonlyMap<string, Employee>
  tasks: TaskIndex
  asOf: ISODate
  settings: OnboardingSettings
}

/** One person's start from their employee record, accepted candidate, or both. */
export function startOf(
  src: StartSources,
  employee: Employee | null,
  candidate: Candidate | null,
  startDate: ISODate,
): Start {
  const req = candidate ? (src.reqs.get(candidate.reqId) ?? null) : null
  const location = employee?.location ?? req?.location ?? null
  const country = countryOf(location, employee?.country)
  const manager = employee?.managerId ? src.byId.get(employee.managerId) : undefined
  const tasks = tasksOf(src.tasks, employee?.employeeId ?? null, candidate?.applicationId ?? null).map((t) =>
    viewTask(t, startDate, country, src.asOf, src.settings),
  )
  return {
    key: employee?.employeeId ?? candidate?.applicationId ?? '',
    employee,
    candidate,
    req,
    name: employee?.name ?? candidate?.candidateName ?? '',
    role: employee?.jobTitle ?? req?.jobTitle ?? null,
    businessUnit: employee?.businessUnit ?? req?.businessUnit ?? null,
    department: employee?.department ?? req?.department ?? null,
    location,
    country,
    region: src.regions.regionOf(location),
    us: isUsSite(location, country),
    hiringManager: req?.hiringManager ?? manager?.name ?? null,
    hiringManagerId: req?.hiringManagerId ?? employee?.managerId ?? null,
    recruiter: candidate?.recruiter ?? req?.recruiter ?? null,
    startDate,
    acceptedDate: candidate?.hiredDate ?? null,
    tasks,
  }
}

/**
 * The record key Action center items about a start use: the application ID when the accepted
 * candidate is known, else the employee ID. A start's `key` turns from the application ID to the
 * employee ID when the HRIS enters the hire; this one does not, so a handled or snoozed mark
 * survives the hire (docs/ACTION-CENTER-AUDIT.md 4.2).
 */
export const itemKeyOf = (s: Pick<Start, 'candidate' | 'key'>): string => s.candidate?.applicationId || s.key

export interface UpcomingPeople {
  /** Upcoming starts, soonest first. */
  starts: Start[]
  /** Accepted offers dropped as copies of a pre-hire. */
  duplicates: Candidate[]
  /** Recent accepted offers with no start date and no roster record yet. */
  unknownStart: Candidate[]
}

/**
 * Upcoming starts from the pre-hires and accepted offers given (already scoped). Pre-hires and
 * accepted offers are paired by `matchPreHires` (`@/lib/starts`).
 */
export function upcomingPeople(src: StartSources, unknownLookbackDays: number): UpcomingPeople {
  const { asOf } = src
  const { preHires, matched, duplicates, solo, noStart } = matchPreHires(
    src.employees,
    src.candidates,
    src.reqs,
    asOf,
    src.settings.dedupDays,
  )
  const lookback = addDays(asOf, -unknownLookbackDays)
  const unknownStart = noStart.filter(
    (c) => c.hiredDate! > lookback && c.hiredDate! <= asOf && !startedAs(c, src.employees),
  )
  const starts = [
    ...preHires.map((e) => startOf(src, e, matched.get(e.employeeId) ?? null, e.hireDate)),
    ...solo.map((c) => startOf(src, null, c, c.startDate!)),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))
  return { starts, duplicates, unknownStart }
}

/** The accepted candidate is already in the roster: same name, hired on or after the accept date. */
function startedAs(c: Candidate, employees: readonly Employee[]): boolean {
  const n = normalizeName(c.candidateName)
  return employees.some((e) => e.hireDate >= c.hiredDate! && normalizeName(e.name) === n)
}

/** Employees (not contractors or interns) who started in the window, by the as-of date. */
export function startersIn(
  src: StartSources,
  window: { start: ISODate; end: ISODate },
  employees: readonly Employee[] = src.employees,
): Start[] {
  return employees
    .filter((e) => isEmployee(e) && inWindow(e.hireDate, window) && e.hireDate <= src.asOf)
    .map((e) => startOf(src, e, null, e.hireDate))
}

/* ───────────── readiness of one person ───────────── */

export type ReadyStatus = 'Ready' | 'On track' | 'Behind' | 'Not ready' | 'No tasks'

export const READY_STATUSES: readonly ReadyStatus[] = ['Not ready', 'Behind', 'On track', 'Ready', 'No tasks']

/** The tasks that count toward day one for this person (Form I-9 only at US sites). */
export function readinessTasks(p: Pick<Start, 'tasks' | 'us'>): TaskView[] {
  return p.tasks.filter((t) => t.def?.readiness && (!t.def.usOnly || p.us))
}

export interface Readiness {
  tasks: TaskView[]
  done: number
  total: number
  status: ReadyStatus
  /** The open readiness task due first (Blocked before others on the same day). */
  blocking: TaskView | null
  daysToGo: number
}

const CHECKLIST_ORDER = new Map([...onboardingTaskByName.keys()].map((k, i) => [k, i]))

/** Open tasks, the most pressing first: due date, then Blocked, then checklist order. */
export function byUrgency(a: TaskView, b: TaskView): number {
  const da = a.due ?? '9999-12-31'
  const db = b.due ?? '9999-12-31'
  if (da !== db) return da.localeCompare(db)
  const ba = a.state === 'Blocked' ? 0 : 1
  const bb = b.state === 'Blocked' ? 0 : 1
  if (ba !== bb) return ba - bb
  return (CHECKLIST_ORDER.get(a.name) ?? 99) - (CHECKLIST_ORDER.get(b.name) ?? 99)
}

export function readinessOf(p: Start, asOf: ISODate, s: OnboardingSettings): Readiness {
  const tasks = readinessTasks(p)
  const done = tasks.filter((t) => t.done).length
  const open = tasks.filter((t) => t.open).sort(byUrgency)
  const daysToGo = daysBetween(asOf, p.startDate)
  const status: ReadyStatus = !tasks.length
    ? 'No tasks'
    : !open.length
      ? 'Ready'
      : daysToGo <= s.notReadyDays
        ? 'Not ready'
        : open.some((t) => t.pastDue)
          ? 'Behind'
          : 'On track'
  return { tasks, done, total: tasks.length, status, blocking: open[0] ?? null, daysToGo }
}

/** Every readiness task completed (or not needed) on or before the start date. */
export function readyOnDayOne(p: Start): boolean | null {
  const tasks = readinessTasks(p)
  if (!tasks.length) return null
  return tasks.every(
    (t) =>
      t.state === 'Not needed' || (t.done && (!t.task.completedDate || t.task.completedDate <= p.startDate)),
  )
}

/** A task finished after its due date, or still open past it. */
export const isLate = (t: TaskView): boolean => t.state === 'Done late' || t.state === 'Overdue'
