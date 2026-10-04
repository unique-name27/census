/**
 * Records that lead to more records: a manager's direct reports and whole org, a person's open
 * HR cases and overdue required courses, the applications to a requisition. The person card and
 * the records panel count these and open them as drills, with one definition each so the count
 * and the list always agree. Pure (no React); tested in related.test.ts.
 */
import type { AnalyticsContext } from '@/data/context'
import type { KnownFieldRef } from '@/data/quality/fieldRef'
import {
  CASE_OPEN_STATUSES,
  type Candidate,
  type Employee,
  type HrCase,
  type LearningRecord,
  type Requisition,
} from '@/data/schema'
import { isActiveAt, type OrgIndex, subtreeIds } from '@/data/scope'
import { daysBetween, formatDate } from '@/lib/dates'
import { type DrillSpec, drillSpec } from './types'

export type RelatedContext = Pick<AnalyticsContext, 'org' | 'asOf' | 'all'>

const ORG_USES: readonly KnownFieldRef[] = [
  'employees.managerId',
  'employees.hireDate',
  'employees.terminationDate',
]
const asOfLine = (ctx: RelatedContext) => `As of ${formatDate(ctx.asOf)}`
const nameOf = (ctx: RelatedContext, id: string) => ctx.org.byId.get(id)?.name ?? id
/** Everyone listed is active, so the exit columns and the status say nothing. */
const ACTIVE_HIDE = ['status', 'terminationDate', 'terminationType', 'terminationReason', 'regrettable']

/* ───────── the org below a person ───────── */

/** Active people of every worker type who report to them directly. */
export function activeDirects(ctx: RelatedContext, id: string): Employee[] {
  return (ctx.org.children.get(id) ?? []).filter((d) => isActiveAt(d, ctx.asOf))
}

const orgCache = new WeakMap<OrgIndex, Map<string, Employee[]>>()

/** Everyone below them at every level who is active on the as-of date, not counting them. */
export function activeOrg(ctx: RelatedContext, id: string): Employee[] {
  let byKey = orgCache.get(ctx.org)
  if (!byKey) {
    byKey = new Map()
    orgCache.set(ctx.org, byKey)
  }
  const key = `${ctx.asOf}|${id}`
  const hit = byKey.get(key)
  if (hit) return hit
  const out: Employee[] = []
  for (const sid of subtreeIds(ctx.org, id)) {
    const p = ctx.org.byId.get(sid)
    if (sid !== id && p && isActiveAt(p, ctx.asOf)) out.push(p)
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  byKey.set(key, out)
  return out
}

export function directsSpec(ctx: RelatedContext, id: string): DrillSpec<'employees'> | null {
  const rows = activeDirects(ctx, id).sort((a, b) => a.name.localeCompare(b.name))
  if (!rows.length) return null
  return drillSpec({
    kind: 'employees',
    title: `Direct reports of ${nameOf(ctx, id)}`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ACTIVE_HIDE,
    note: 'Active people of every worker type who report to them directly.',
    uses: ORG_USES,
  })
}

export function orgSpec(ctx: RelatedContext, id: string): DrillSpec<'employees'> | null {
  const rows = activeOrg(ctx, id)
  if (!rows.length) return null
  const name = nameOf(ctx, id)
  return drillSpec({
    kind: 'employees',
    title: `Everyone in ${name}'s org`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ACTIVE_HIDE,
    note: `Everyone below ${name} at every level who is active on the as-of date, every worker type, not counting them.`,
    uses: ORG_USES,
  })
}

/* ───────── a person's open items ───────── */

const isOpenCase = (c: HrCase) => CASE_OPEN_STATUSES.includes(c.status)
const isEmployeeRelations = (c: HrCase) => c.category === 'Employee relations'

/**
 * Cases they raised that are still open, employee relations left out. Employee relations is
 * reported as counts and timeliness on aggregate tables only, so nothing tied to a named person
 * (a count, a missing link, a note) may reveal that they have an open ER case.
 */
export function openCases(ctx: RelatedContext, id: string): HrCase[] {
  return ctx.all.cases.filter((c) => c.requesterId === id && isOpenCase(c) && !isEmployeeRelations(c))
}

/** Their open cases (the count on the person card), oldest first; null when there are none. */
export function openCasesSpec(ctx: RelatedContext, id: string): DrillSpec<'cases'> | null {
  const rows = openCases(ctx, id).sort((a, b) => a.openedAt.localeCompare(b.openedAt))
  if (!rows.length) return null
  return drillSpec({
    kind: 'cases',
    title: `Open HR cases raised by ${nameOf(ctx, id)}`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ['requester', 'resolvedAt', 'hoursToResolve', 'withinTarget'],
    extra: {
      columns: [{ key: 'daysOpen', label: 'Days open', format: 'days' }],
      values: (c) => ({ daysOpen: Math.max(0, daysBetween(c.openedAt.slice(0, 10), ctx.asOf)) }),
    },
    note: 'Cases they raised that are not yet resolved or closed, oldest first.',
    uses: ['cases.requesterId', 'cases.status'] satisfies KnownFieldRef[],
  })
}

/** Required courses past their due date and not completed on the as-of date. */
export function overdueRequired(ctx: RelatedContext, id: string): LearningRecord[] {
  return ctx.all.learning.filter(
    (l) => l.employeeId === id && l.required && !l.completedDate && !!l.dueDate && l.dueDate < ctx.asOf,
  )
}

export function overdueSpec(ctx: RelatedContext, id: string): DrillSpec<'learning'> | null {
  const rows = overdueRequired(ctx, id).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  if (!rows.length) return null
  return drillSpec({
    kind: 'learning',
    title: `Overdue required courses for ${nameOf(ctx, id)}`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ['employeeId', 'name', 'department', 'location', 'required', 'completedDate', 'state'],
    extra: {
      columns: [{ key: 'daysOverdue', label: 'Days overdue', format: 'days' }],
      values: (l) => ({ daysOverdue: l.dueDate ? daysBetween(l.dueDate, ctx.asOf) : null }),
    },
    note: 'Required courses past their due date and not completed, most overdue first.',
    uses: ['learning.required', 'learning.dueDate', 'learning.completedDate'] satisfies KnownFieldRef[],
  })
}

/* ───────── a requisition's applications ───────── */

const appCache = new WeakMap<readonly Candidate[], Map<string, Candidate[]>>()

/** Every application to the req received by the as-of date, active and closed. */
export function reqApplications(ctx: RelatedContext, reqId: string): Candidate[] {
  let byReq = appCache.get(ctx.all.candidates)
  if (!byReq) {
    byReq = new Map()
    for (const c of ctx.all.candidates) {
      const list = byReq.get(c.reqId)
      if (list) list.push(c)
      else byReq.set(c.reqId, [c])
    }
    appCache.set(ctx.all.candidates, byReq)
  }
  return (byReq.get(reqId) ?? []).filter((c) => c.appliedDate <= ctx.asOf)
}

/** Its applications still active (status Active). */
export function reqActive(ctx: RelatedContext, reqId: string): Candidate[] {
  return reqApplications(ctx, reqId).filter((c) => c.status === 'Active')
}

const reqName = (r: Requisition) => (r.jobTitle ? `${r.reqId} ${r.jobTitle}` : r.reqId)
const byApplied = (a: Candidate, b: Candidate) =>
  b.appliedDate.localeCompare(a.appliedDate) || a.candidateName.localeCompare(b.candidateName)

export function reqApplicationsSpec(ctx: RelatedContext, req: Requisition): DrillSpec<'candidates'> | null {
  const rows = reqApplications(ctx, req.reqId).sort(byApplied)
  if (!rows.length) return null
  return drillSpec({
    kind: 'candidates',
    title: `Applications to ${reqName(req)}`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ['reqId', 'jobTitle', 'department'],
    note: 'Every application received by the as-of date, active and closed, latest first.',
    uses: ['candidates.reqId', 'candidates.appliedDate'] satisfies KnownFieldRef[],
  })
}

export function reqActiveSpec(ctx: RelatedContext, req: Requisition): DrillSpec<'candidates'> | null {
  const rows = reqActive(ctx, req.reqId).sort(byApplied)
  if (!rows.length) return null
  return drillSpec({
    kind: 'candidates',
    title: `Active candidates for ${reqName(req)}`,
    subtitle: asOfLine(ctx),
    rows,
    hide: ['reqId', 'jobTitle', 'department', 'status', 'rejectionReason'],
    note: 'Applications to this req still in process.',
    uses: ['candidates.reqId', 'candidates.status'] satisfies KnownFieldRef[],
  })
}
