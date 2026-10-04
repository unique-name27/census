/**
 * Global filters, reporting windows and dataset scoping. Pure functions, unit-tested.
 *
 * One filter row scopes every view. Org filters (leader, business unit, department, location,
 * level) select employees; every other dataset follows its people:
 *  - employee-keyed datasets (job changes, reviews, learning, comp, transactions) by employeeId;
 *  - cases by requesterId (or the case's own location when the requester is unknown);
 *  - requisitions by their own org fields, with the leader filter matching the hiring manager;
 *  - candidates by their requisition;
 *  - succession plans by the incumbent;
 *  - right to work by employeeId; onboarding tasks and survey answers by their person (the
 *    employee, else the candidate's requisition);
 *  - hiring plan lines by their own org fields (see `planMatcher`);
 *  - survey items (reference data) are never scoped.
 */
import { addDays, addMonths, formatRange, iso, monthEnd, ms, quarterStart } from '@/lib/dates'
import {
  type Datasets,
  type Employee,
  type HiringPlanLine,
  type ISODate,
  type Requisition,
  withAllDatasets,
} from './schema'

/* ───────────── periods ───────────── */

export type PeriodPreset = 't12m' | 'ytd' | 'lastQuarter' | 't6m' | 't3m' | 'custom'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  t12m: 'Last 12 months',
  ytd: 'Year to date',
  lastQuarter: 'Last full quarter',
  t6m: 'Last 6 months',
  t3m: 'Last 3 months',
  custom: 'Custom range',
}

/** Inclusive date window. `months` is the length used to annualize rates. */
export interface Window {
  start: ISODate
  end: ISODate
  months: number
  label: string
}

const DAY = 86_400_000
const monthsOf = (start: ISODate, end: ISODate) => (ms(end) - ms(start) + DAY) / DAY / 30.436875

/** Calendar-month windows carry their exact month count so annualizing a 12-month rate is a no-op. */
function win(start: ISODate, end: ISODate, months?: number): Window {
  return { start, end, months: months ?? monthsOf(start, end), label: formatRange(start, end) }
}

/**
 * First day of the n-month window ending on `end`. A month-end `end` gives whole calendar months
 * (6 months to 30 Sep starts 1 Apr, not 31 Mar).
 */
function trailingStart(end: ISODate, n: number): ISODate {
  if (addDays(end, 1).slice(8) === '01') return addDays(monthEnd(addMonths(`${end.slice(0, 7)}-01`, -n)), 1)
  return addDays(addMonths(end, -n), 1)
}

/** The reporting window and the comparison window right before it (prior year for YTD). */
export function periodWindows(
  preset: PeriodPreset,
  asOf: ISODate,
  custom?: { start: ISODate | null; end: ISODate | null },
): { current: Window; prior: Window } {
  const trailing = (n: number): { current: Window; prior: Window } => {
    const start = trailingStart(asOf, n)
    const pEnd = addDays(start, -1)
    const pStart = trailingStart(pEnd, n)
    return { current: win(start, asOf, n), prior: win(pStart, pEnd, n) }
  }
  switch (preset) {
    case 't12m':
      return trailing(12)
    case 't6m':
      return trailing(6)
    case 't3m':
      return trailing(3)
    case 'ytd': {
      const start = `${asOf.slice(0, 4)}-01-01`
      const pEnd = addMonths(asOf, -12)
      return { current: win(start, asOf), prior: win(`${pEnd.slice(0, 4)}-01-01`, pEnd) }
    }
    case 'lastQuarter': {
      // A quarter that ends on asOf is already complete; otherwise use the one before it.
      const next = addDays(asOf, 1)
      const cEnd = quarterStart(next) === next ? asOf : addDays(quarterStart(asOf), -1)
      const cStart = quarterStart(cEnd)
      const pEnd = addDays(cStart, -1)
      return { current: win(cStart, cEnd, 3), prior: win(quarterStart(pEnd), pEnd, 3) }
    }
    case 'custom': {
      const start = custom?.start ?? addDays(addMonths(asOf, -12), 1)
      const end = custom?.end ?? asOf
      const len = Math.max(1, Math.round((ms(end) - ms(start)) / DAY) + 1)
      const pEnd = addDays(start, -1)
      return { current: win(start, end), prior: win(iso(ms(pEnd) - (len - 1) * DAY), pEnd) }
    }
  }
}

/* ───────────── filters ───────────── */

export interface Filters {
  period: PeriodPreset
  customStart: ISODate | null
  customEnd: ISODate | null
  /** Employee ID of a leader; selects the leader and everyone below them. */
  leaderId: string | null
  businessUnit: string[]
  department: string[]
  location: string[]
  level: string[]
}

export const DEFAULT_FILTERS: Filters = {
  period: 't12m',
  customStart: null,
  customEnd: null,
  leaderId: null,
  businessUnit: [],
  department: [],
  location: [],
  level: [],
}

export const hasOrgFilter = (f: Filters): boolean =>
  !!f.leaderId ||
  f.businessUnit.length > 0 ||
  f.department.length > 0 ||
  f.location.length > 0 ||
  f.level.length > 0

/* ───────────── org index ───────────── */

export interface OrgIndex {
  byId: Map<string, Employee>
  children: Map<string, Employee[]>
}

export function buildOrgIndex(employees: readonly Employee[]): OrgIndex {
  const byId = new Map<string, Employee>()
  for (const e of employees) byId.set(e.employeeId, e)
  const children = new Map<string, Employee[]>()
  for (const e of employees) {
    if (!e.managerId || e.managerId === e.employeeId || !byId.has(e.managerId)) continue
    const arr = children.get(e.managerId)
    if (arr) arr.push(e)
    else children.set(e.managerId, [e])
  }
  return { byId, children }
}

/** The leader plus everyone below them (current and former), cycle-safe. */
export function subtreeIds(index: OrgIndex, leaderId: string): Set<string> {
  const out = new Set<string>()
  if (!index.byId.has(leaderId)) return out
  const stack = [leaderId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const c of index.children.get(id) ?? []) if (!out.has(c.employeeId)) stack.push(c.employeeId)
  }
  return out
}

/* ───────────── scoping ───────────── */

export function employeeMatcher(filters: Filters, index: OrgIndex): (e: Employee | undefined) => boolean {
  const sub = filters.leaderId ? subtreeIds(index, filters.leaderId) : null
  const bu = new Set(filters.businessUnit)
  const dept = new Set(filters.department)
  const loc = new Set(filters.location)
  const lvl = new Set(filters.level)
  return (e) => {
    if (!e) return false
    if (sub && !sub.has(e.employeeId)) return false
    if (bu.size && !bu.has(e.businessUnit)) return false
    if (dept.size && !dept.has(e.department)) return false
    if (loc.size && !loc.has(e.location)) return false
    if (lvl.size && !lvl.has(e.level ?? '')) return false
    return true
  }
}

function reqMatcher(filters: Filters, index: OrgIndex): (r: Requisition | undefined) => boolean {
  const sub = filters.leaderId ? subtreeIds(index, filters.leaderId) : null
  const bu = new Set(filters.businessUnit)
  const dept = new Set(filters.department)
  const loc = new Set(filters.location)
  const lvl = new Set(filters.level)
  return (r) => {
    if (!r) return false
    if (sub && !(r.hiringManagerId && sub.has(r.hiringManagerId))) return false
    if (bu.size && !bu.has(r.businessUnit)) return false
    if (dept.size && !dept.has(r.department)) return false
    if (loc.size && !loc.has(r.location)) return false
    if (lvl.size && !lvl.has(r.level ?? '')) return false
    return true
  }
}

/**
 * Plan lines in scope: by their own org fields like requisitions. A leader filter keeps lines
 * linked to a requisition in scope, and lines for a business unit and department where the
 * leader's org (current and former people) works.
 */
function planMatcher(
  filters: Filters,
  index: OrgIndex,
  reqIds: ReadonlySet<string>,
): (p: HiringPlanLine) => boolean {
  let depts: Set<string> | null = null
  if (filters.leaderId) {
    depts = new Set<string>()
    for (const id of subtreeIds(index, filters.leaderId)) {
      const e = index.byId.get(id)
      if (e) depts.add(`${e.businessUnit}\u0001${e.department}`)
    }
  }
  const bu = new Set(filters.businessUnit)
  const dept = new Set(filters.department)
  const loc = new Set(filters.location)
  const lvl = new Set(filters.level)
  return (p) => {
    if (depts && !(p.reqId && reqIds.has(p.reqId)) && !depts.has(`${p.businessUnit}\u0001${p.department}`))
      return false
    if (bu.size && !bu.has(p.businessUnit)) return false
    if (dept.size && !dept.has(p.department)) return false
    if (loc.size && !loc.has(p.location ?? '')) return false
    if (lvl.size && !lvl.has(p.level ?? '')) return false
    return true
  }
}

/** Apply the org filters to every dataset. Period filters are applied by each metric engine. */
export function scopeDatasets(input: Datasets, filters: Filters, index: OrgIndex): Datasets {
  const all = withAllDatasets(input)
  if (!hasOrgFilter(filters)) return all
  const empOk = employeeMatcher(filters, index)
  const byEmp = <T extends { employeeId: string }>(rows: T[]) =>
    rows.filter((r) => empOk(index.byId.get(r.employeeId)))
  const reqOk = reqMatcher(filters, index)
  const reqs = all.requisitions.filter(reqOk)
  const reqIds = new Set(reqs.map((r) => r.reqId))
  const candidates = all.candidates.filter((c) => reqIds.has(c.reqId))
  const appIds = new Set(candidates.map((c) => c.applicationId))
  const locOnly =
    !filters.leaderId && !filters.businessUnit.length && !filters.department.length && !filters.level.length
  const loc = new Set(filters.location)
  // A task or survey answer follows its person: the employee when in the roster, else the
  // candidate's requisition.
  const personOk = (employeeId: string | null | undefined, applicationId: string | null | undefined) => {
    const e = employeeId ? index.byId.get(employeeId) : undefined
    if (e) return empOk(e)
    return !!applicationId && appIds.has(applicationId)
  }
  const planOk = planMatcher(filters, index, reqIds)
  return {
    employees: all.employees.filter(empOk),
    jobChanges: byEmp(all.jobChanges),
    requisitions: reqs,
    candidates,
    hiringPlan: all.hiringPlan.filter(planOk),
    onboardingTasks: all.onboardingTasks.filter((t) => personOk(t.employeeId, t.applicationId)),
    rightToWork: byEmp(all.rightToWork),
    surveyResponses: all.surveyResponses.filter((r) => personOk(r.respondentKey, r.respondentKey)),
    // Reference data: what each item measures, the same for every org.
    surveyItems: all.surveyItems,
    cases: all.cases.filter((c) => {
      const e = c.requesterId ? index.byId.get(c.requesterId) : undefined
      if (e) return empOk(e)
      return locOnly && !!c.location && loc.has(c.location)
    }),
    transactions: byEmp(all.transactions),
    reviews: byEmp(all.reviews),
    succession: all.succession.filter((s) => empOk(index.byId.get(s.incumbentId))),
    learning: byEmp(all.learning),
    comp: byEmp(all.comp),
  }
}

/* ───────────── people helpers shared by every engine ───────────── */

/** Employees (not contractors or interns) count toward headcount and every rate. */
export const isEmployee = (e: Employee): boolean => e.employmentType === 'Employee'

/** Active on date d: hired on or before d, and no termination date or one after d. */
export function isActiveAt(e: Employee, d: ISODate): boolean {
  if (!e.hireDate || e.hireDate > d) return false
  return !e.terminationDate || e.terminationDate > d
}

/** Plain-English label for the current scope, e.g. "Design Verification · Hsinchu". */
export function scopeLabel(filters: Filters, index: OrgIndex): string {
  const parts: string[] = []
  if (filters.leaderId) {
    const l = index.byId.get(filters.leaderId)
    parts.push(l ? `${l.name}'s org` : 'Leader org')
  }
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)
  if (filters.businessUnit.length) parts.push(list(filters.businessUnit))
  if (filters.department.length) parts.push(list(filters.department))
  if (filters.location.length) parts.push(list(filters.location))
  if (filters.level.length) parts.push(list(filters.level))
  return parts.length ? parts.join(' · ') : 'Whole company'
}

/**
 * The as-of date: the override when set, else the latest event date found in the data, capped at
 * today. Sample data passes its fixed reference date.
 */
export function resolveAsOf(data: Datasets, today: ISODate, override?: ISODate | null): ISODate {
  if (override) return override
  let latest = ''
  const see = (d: string | null | undefined) => {
    if (d && d.length >= 10) {
      const x = d.slice(0, 10)
      if (x <= today && x > latest) latest = x
    }
  }
  for (const e of data.employees) {
    see(e.hireDate)
    see(e.terminationDate)
  }
  for (const c of data.candidates) {
    see(c.appliedDate)
    see(c.lastActivityDate)
  }
  for (const c of data.cases) see(c.openedAt)
  for (const t of data.transactions) see(t.submittedDate)
  for (const r of data.requisitions) see(r.openedDate)
  return latest || today
}
