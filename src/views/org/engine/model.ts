/**
 * Everything the Org chart view derives from the analytics context, computed once per context:
 * the as-of tree over the whole roster (filters dim cards rather than remove them), flags, open
 * requisitions per hiring manager, the reviews index and the chart root.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Requisition } from '@/data/schema'
import { employeeMatcher, type Filters } from '@/data/scope'
import { buildReviewIndex, type ReviewIndex } from '@/lib/people'
import { computeFlags, type Flag } from './flags'
import { type ReqStub, reqCardId } from './layout'
import { buildOrgTree, type OrgTree } from './tree'

export interface OrgModel {
  tree: OrgTree
  flags: Map<string, Flag[]>
  /** Open requisitions per hiring manager (managers in the tree only). */
  reqs: Map<string, ReqStub[]>
  /** The same requisitions keyed by card id. */
  reqByCardId: Map<string, ReqStub>
  /** The raw requisition records behind the stubs, by req ID (for drill-down). */
  reqRecords: Map<string, Requisition>
  reviews: ReviewIndex
  /** Root from the global leader filter, else the tree's root. */
  rootId: string
  /** True when the business unit, department, location or level filters are set. */
  dims: boolean
  /** Whether a person matches those filters (always true without them). */
  matches: (id: string) => boolean
}

/** The non-leader part of the filters, which dims cards in the chart. */
export const dimFilters = (f: Filters): Filters => ({ ...f, leaderId: null })
export const hasDimFilters = (f: Filters) =>
  f.businessUnit.length > 0 || f.department.length > 0 || f.location.length > 0 || f.level.length > 0

export function buildOrgModel(ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'filters' | 'org'>): OrgModel {
  const tree = buildOrgTree(ctx.all.employees, ctx.asOf)
  const flags = computeFlags(tree, ctx.all.jobChanges)
  const reqs = new Map<string, ReqStub[]>()
  const reqByCardId = new Map<string, ReqStub>()
  const reqRecords = new Map<string, Requisition>()
  for (const r of ctx.all.requisitions) {
    if (r.status !== 'Open' || !r.hiringManagerId || !tree.people.has(r.hiringManagerId)) continue
    if (r.openedDate > ctx.asOf) continue
    const stub: ReqStub = {
      reqId: r.reqId,
      jobTitle: r.jobTitle,
      level: r.level,
      openings: Math.max(1, r.openings || 1),
      openedDate: r.openedDate,
      location: r.location,
    }
    const arr = reqs.get(r.hiringManagerId)
    if (arr) arr.push(stub)
    else reqs.set(r.hiringManagerId, [stub])
    reqByCardId.set(reqCardId(r.reqId), stub)
    reqRecords.set(r.reqId, r)
  }
  for (const arr of reqs.values()) arr.sort((a, b) => a.openedDate.localeCompare(b.openedDate))

  const leader = ctx.filters.leaderId
  const rootId = leader && tree.people.has(leader) ? leader : tree.rootId
  const dims = hasDimFilters(ctx.filters)
  const m = employeeMatcher(dimFilters(ctx.filters), ctx.org)
  const matches = dims ? (id: string) => m(tree.people.get(id)) : () => true
  return {
    tree,
    flags,
    reqs,
    reqByCardId,
    reqRecords,
    reviews: buildReviewIndex(ctx.all.reviews),
    rootId,
    dims,
    matches,
  }
}

/** People managers on the as-of date among the scoped people: anyone with an active direct report. */
export function peopleManagers(ctx: Pick<AnalyticsContext, 'all' | 'data' | 'asOf'>): {
  managers: number
  people: number
} {
  const active = new Set<string>()
  for (const e of ctx.all.employees)
    if (e.hireDate <= ctx.asOf && (!e.terminationDate || e.terminationDate > ctx.asOf))
      active.add(e.employeeId)
  const mgrs = new Set<string>()
  for (const e of ctx.all.employees) {
    if (!active.has(e.employeeId) || !e.managerId || e.managerId === e.employeeId) continue
    if (active.has(e.managerId)) mgrs.add(e.managerId)
  }
  let managers = 0
  let people = 0
  for (const e of ctx.data.employees) {
    if (!active.has(e.employeeId)) continue
    people++
    if (mgrs.has(e.employeeId)) managers++
  }
  return { managers, people }
}
