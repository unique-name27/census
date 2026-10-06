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
 *
 * Each org filter includes or excludes its values (`Filters.modes`); exclusions follow the same
 * routes through every dataset, and a record with a blank value for an excluded dimension stays in.
 */
import { addDays, addMonths, formatRange, isCalendarDate, iso, monthEnd, ms, quarterStart } from '@/lib/dates'
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

/** The org filters: the leader and the four list dimensions. Each one includes or excludes its values. */
export type FilterDimension = 'leaderId' | 'businessUnit' | 'department' | 'location' | 'level'
/** The org filters that hold a list of values. */
export type ListDimension = Exclude<FilterDimension, 'leaderId'>
export const LIST_DIMENSIONS: readonly ListDimension[] = ['businessUnit', 'department', 'location', 'level']
export const FILTER_DIMENSIONS: readonly FilterDimension[] = ['leaderId', ...LIST_DIMENSIONS]

/**
 * Include keeps the chosen values (the default); exclude keeps everyone except them (for the
 * leader, everyone except that leader's whole org). A record with a blank value for an excluded
 * dimension stays in: it is not one of the excluded values.
 */
export type FilterMode = 'include' | 'exclude'
/** The mode of each org filter. Only exclusions are stored; a dimension left out includes. */
export type FilterModes = Partial<Record<FilterDimension, FilterMode>>

export interface Filters {
  period: PeriodPreset
  customStart: ISODate | null
  customEnd: ISODate | null
  /** Employee ID of a leader; selects the leader and everyone below them (or leaves them out). */
  leaderId: string | null
  businessUnit: string[]
  department: string[]
  location: string[]
  level: string[]
  /**
   * Which org filters exclude their values instead of including them (docs/FILTERS.md, part 3).
   * Filters saved before modes existed have none: every filter includes.
   */
  modes: FilterModes
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
  modes: {},
}

/** The mode of one org filter (include when not set, also for filters saved before modes). */
export const modeOf = (f: Pick<Filters, 'modes'> | Partial<Filters>, dim: FilterDimension): FilterMode =>
  f.modes?.[dim] === 'exclude' ? 'exclude' : 'include'

export const isExcluded = (f: Pick<Filters, 'modes'> | Partial<Filters>, dim: FilterDimension): boolean =>
  modeOf(f, dim) === 'exclude'

/** The modes with one dimension set; only exclusions are kept. */
export function withMode(
  modes: FilterModes | undefined,
  dim: FilterDimension,
  mode: FilterMode,
): FilterModes {
  const out: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) {
    const m = d === dim ? mode : modes?.[d]
    if (m === 'exclude') out[d] = 'exclude'
  }
  return out
}

/** Whether a dimension has a value set (a mode alone filters nothing). */
export const dimensionSet = (f: Filters, dim: FilterDimension): boolean =>
  dim === 'leaderId' ? !!f.leaderId : f[dim].length > 0

/** The leader the scope focuses on: the leader filter in include mode, else null. */
export const focusLeader = (f: Filters): string | null =>
  f.leaderId && !isExcluded(f, 'leaderId') ? f.leaderId : null

export const hasOrgFilter = (f: Filters): boolean =>
  !!f.leaderId ||
  f.businessUnit.length > 0 ||
  f.department.length > 0 ||
  f.location.length > 0 ||
  f.level.length > 0

/** True when some org filter with a value includes (an include filter can't be checked on an unknown person). */
const anyInclude = (f: Filters): boolean =>
  FILTER_DIMENSIONS.some((d) => dimensionSet(f, d) && !isExcluded(f, d))

const PERIODS: readonly PeriodPreset[] = ['t12m', 'ytd', 'lastQuarter', 't6m', 't3m', 'custom']
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))] : []

/**
 * Filters from untrusted input (browser storage, a saved view, a settings file): every field
 * checked, anything invalid at its default. Filters saved before modes existed load as include.
 */
export function normalizeFilters(raw: unknown): Filters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const period = PERIODS.includes(r.period as PeriodPreset) ? (r.period as PeriodPreset) : 't12m'
  const modesRaw = (r.modes && typeof r.modes === 'object' ? r.modes : {}) as Record<string, unknown>
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (modesRaw[d] === 'exclude') modes[d] = 'exclude'
  // Real calendar dates only ("2026-02-30" is not one), the start on or before the end.
  const dates =
    period === 'custom' &&
    isCalendarDate(r.customStart) &&
    isCalendarDate(r.customEnd) &&
    r.customStart <= r.customEnd
  return {
    period,
    customStart: dates ? (r.customStart as ISODate) : null,
    customEnd: dates ? (r.customEnd as ISODate) : null,
    leaderId: typeof r.leaderId === 'string' && r.leaderId ? r.leaderId : null,
    businessUnit: strings(r.businessUnit),
    department: strings(r.department),
    location: strings(r.location),
    level: strings(r.level),
    modes,
  }
}

/**
 * The filters without a mode on a dimension that has no values (an exclude switch left on after
 * its last value went). The same object when there is none. A menu keeps its mode while it is
 * open, so you can switch to exclude before picking; everything else drops it, as the address does.
 */
export function dropIdleModes(f: Filters): Filters {
  const idle = FILTER_DIMENSIONS.filter((d) => isExcluded(f, d) && !dimensionSet(f, d))
  if (!idle.length) return f
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (isExcluded(f, d) && !idle.includes(d)) modes[d] = 'exclude'
  return { ...f, modes }
}

/**
 * The scope with nothing that filters nothing: a mode on a dimension without values is dropped,
 * list values sorted, custom dates only on a custom period. Two filters that pick the same people
 * over the same window are equal after this.
 */
export function canonicalFilters(f: Filters): Filters {
  const modes: FilterModes = {}
  for (const d of FILTER_DIMENSIONS) if (dimensionSet(f, d) && isExcluded(f, d)) modes[d] = 'exclude'
  const custom = f.period === 'custom'
  return {
    period: f.period,
    customStart: custom ? f.customStart : null,
    customEnd: custom ? f.customEnd : null,
    leaderId: f.leaderId || null,
    businessUnit: [...f.businessUnit].sort(),
    department: [...f.department].sort(),
    location: [...f.location].sort(),
    level: [...f.level].sort(),
    modes,
  }
}

/** The same scope (period, custom dates, leader, values and modes), ignoring order and idle modes. */
export const sameFilters = (a: Filters, b: Filters): boolean =>
  JSON.stringify(canonicalFilters(a)) === JSON.stringify(canonicalFilters(b))

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

/**
 * A test for one list dimension, or null when it has no values. Include: the value is one of
 * them. Exclude: it is not (a blank value stays in).
 */
function listTest(filters: Filters, dim: ListDimension): ((v: string | null | undefined) => boolean) | null {
  const set = new Set(filters[dim])
  if (!set.size) return null
  return isExcluded(filters, dim)
    ? (v) => !(v != null && v !== '' && set.has(v))
    : (v) => v != null && set.has(v)
}

/** The leader's org as a test on a person ID (in it for include, outside it for exclude), or null. */
function leaderTest(filters: Filters, index: OrgIndex): ((id: string | null | undefined) => boolean) | null {
  if (!filters.leaderId) return null
  const sub = subtreeIds(index, filters.leaderId)
  return isExcluded(filters, 'leaderId') ? (id) => !(id && sub.has(id)) : (id) => !!id && sub.has(id)
}

/**
 * Who the org filters let through. A person who is not on the roster (`undefined`) passes only an
 * exclusion-only scope: nothing says they are one of the excluded values.
 */
export function employeeMatcher(filters: Filters, index: OrgIndex): (e: Employee | undefined) => boolean {
  const leader = leaderTest(filters, index)
  const bu = listTest(filters, 'businessUnit')
  const dept = listTest(filters, 'department')
  const loc = listTest(filters, 'location')
  const lvl = listTest(filters, 'level')
  const unknownOk = !anyInclude(filters)
  return (e) => {
    if (!e) return unknownOk
    if (leader && !leader(e.employeeId)) return false
    if (bu && !bu(e.businessUnit)) return false
    if (dept && !dept(e.department)) return false
    if (loc && !loc(e.location)) return false
    if (lvl && !lvl(e.level)) return false
    return true
  }
}

function reqMatcher(filters: Filters, index: OrgIndex): (r: Requisition | undefined) => boolean {
  const leader = leaderTest(filters, index)
  const bu = listTest(filters, 'businessUnit')
  const dept = listTest(filters, 'department')
  const loc = listTest(filters, 'location')
  const lvl = listTest(filters, 'level')
  return (r) => {
    if (!r) return false
    // The leader filter matches the hiring manager: in their org, or (exclude) not in it.
    if (leader && !leader(r.hiringManagerId)) return false
    if (bu && !bu(r.businessUnit)) return false
    if (dept && !dept(r.department)) return false
    if (loc && !loc(r.location)) return false
    if (lvl && !lvl(r.level)) return false
    return true
  }
}

/**
 * Plan lines in scope: by their own org fields like requisitions. A leader filter keeps lines
 * linked to a requisition in scope, and lines for a business unit and department where the
 * leader's org (current and former people) works. Excluding the leader keeps exactly the lines
 * that including them would not (linked to none of their org's requisitions, and in a department
 * where their org does not work), so "Filter to" and "Leave out" split the plan between them.
 */
function planMatcher(
  filters: Filters,
  index: OrgIndex,
  reqIds: ReadonlySet<string>,
  reqs: readonly Requisition[],
): (p: HiringPlanLine) => boolean {
  let depts: Set<string> | null = null
  let leaderReqs: ReadonlySet<string> = reqIds
  const out = isExcluded(filters, 'leaderId')
  if (filters.leaderId) {
    depts = new Set<string>()
    const sub = subtreeIds(index, filters.leaderId)
    for (const id of sub) {
      const e = index.byId.get(id)
      if (e) depts.add(`${e.businessUnit}\u0001${e.department}`)
    }
    // Excluding: the leader's own requisitions, whatever the other filters say.
    if (out)
      leaderReqs = new Set(
        reqs.filter((r) => r.hiringManagerId && sub.has(r.hiringManagerId)).map((r) => r.reqId),
      )
  }
  const bu = listTest(filters, 'businessUnit')
  const dept = listTest(filters, 'department')
  const loc = listTest(filters, 'location')
  const lvl = listTest(filters, 'level')
  return (p) => {
    if (depts) {
      const inOrg =
        (!!p.reqId && leaderReqs.has(p.reqId)) || depts.has(`${p.businessUnit}\u0001${p.department}`)
      if (inOrg === out) return false
    }
    if (bu && !bu(p.businessUnit)) return false
    if (dept && !dept(p.department)) return false
    if (loc && !loc(p.location)) return false
    if (lvl && !lvl(p.level)) return false
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
  // Someone the data can't place (no roster record, no application) stays in an exclusion-only scope.
  const unknownOk = !anyInclude(filters)
  // A candidate follows their requisition; one whose requisition is not in the data stays in an
  // exclusion-only scope, like any record the scope cannot place.
  const knownReqs = unknownOk ? new Set(all.requisitions.map((r) => r.reqId)) : null
  const candidates = all.candidates.filter(
    (c) => reqIds.has(c.reqId) || (knownReqs != null && !knownReqs.has(c.reqId)),
  )
  const appIds = new Set(candidates.map((c) => c.applicationId))
  const knownApps = new Set(all.candidates.map((c) => c.applicationId))
  // A task or survey answer follows its person: the employee when in the roster, else the
  // candidate's requisition.
  const personOk = (employeeId: string | null | undefined, applicationId: string | null | undefined) => {
    const e = employeeId ? index.byId.get(employeeId) : undefined
    if (e) return empOk(e)
    if (applicationId && knownApps.has(applicationId)) return appIds.has(applicationId)
    return unknownOk
  }
  // A case whose requester is not on the roster: only its own location can be checked. Any other
  // include filter leaves it out; an exclude filter keeps it (it is not one of the excluded values).
  const caseLoc = listTest(filters, 'location')
  const otherInclude = FILTER_DIMENSIONS.some(
    (d) => d !== 'location' && dimensionSet(filters, d) && !isExcluded(filters, d),
  )
  const unknownCaseOk = (location: string | null | undefined) =>
    !otherInclude && (!caseLoc || caseLoc(location || null))
  const planOk = planMatcher(filters, index, reqIds, all.requisitions)
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
      return unknownCaseOk(c.location)
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

/** "A, B" for up to two values, else "A +2". */
const listText = (xs: readonly string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs[0]} +${xs.length - 1}`)

/** "A", "A and B", "A, B and C". */
const andList = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * Plain-English label for the current scope: "Design Verification · Hsinchu" for inclusions,
 * "Whole company except Sales" when everything is an exclusion, and "Silicon Engineering · not
 * Bengaluru · not in Allison Carter's org" for a mix.
 */
export function scopeLabel(filters: Filters, index: OrgIndex): string {
  const inc: string[] = []
  const exc: { text: string; leader: boolean }[] = []
  if (filters.leaderId) {
    const l = index.byId.get(filters.leaderId)
    const text = l ? `${l.name}'s org` : 'Leader org'
    if (isExcluded(filters, 'leaderId')) exc.push({ text, leader: true })
    else inc.push(text)
  }
  for (const dim of LIST_DIMENSIONS) {
    const xs = filters[dim]
    if (!xs.length) continue
    if (isExcluded(filters, dim)) exc.push({ text: listText(xs), leader: false })
    else inc.push(listText(xs))
  }
  if (!inc.length && !exc.length) return 'Whole company'
  if (!inc.length) return `Whole company except ${andList(exc.map((x) => x.text))}`
  return [...inc, ...exc.map((x) => (x.leader ? `not in ${x.text}` : `not ${x.text}`))].join(' · ')
}

/**
 * A scope label inside a sentence: "the whole company except Sales" instead of "Whole company
 * except Sales" ("Voluntary attrition in the whole company except Sales is 12.1%"). Other labels
 * are names and stay as they are.
 */
export const scopeInSentence = (label: string): string =>
  label.startsWith('Whole company') ? `the whole company${label.slice('Whole company'.length)}` : label

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
