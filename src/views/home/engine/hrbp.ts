/**
 * The HRBP homes as data (docs/ROLES-V2.md 5.5; docs/ACTION-CENTER-AUDIT.md 5.7 and 5.8), for a
 * business unit or a region: voluntary attrition by department (unit) or site (region) against the
 * company, and the three lists of My list:
 *
 *  - "Leaders": the unit's leaders (directors and above, or every manager with 8 or more people in
 *    their org): headcount, net change, voluntary and regretted attrition against the company, open
 *    reqs, flags (span, new manager, single-report chain) and promotion rate, computed the way
 *    People stats' sub-org scorecard computes them (its rate settings and anonymity minimum).
 *  - "Sites": one row per site in the region: headcount, voluntary attrition, starts in 30 days,
 *    open reqs, open cases (employee relations counted, never listed), reverifications due and I-9
 *    Section 2 on time.
 *  - "Key talent at risk": Talent's retention list, kept to the scope (the UI reads it as is).
 *
 * Everything reads the scoped context, so no row is outside the scope. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, JobChange, Requisition } from '@/data/schema'
import { subtreeIds } from '@/data/scope'
import { addDays } from '@/lib/dates'
import { inWindow, isActiveAt } from '@/lib/people'
import { compute as complianceModel } from '@/views/compliance/engine'
import { isUsPerson } from '@/views/compliance/engine/base'
import type { I9Row } from '@/views/compliance/engine/i9'
import type { ExpiryRow } from '@/views/compliance/engine/work'
import { type HrbpModel, hrbpModel } from '@/views/hrbp/engine'
import type { GroupRateRow } from '@/views/hrbp/engine/attrition'
import { rateOptions } from '@/views/hrbp/engine/kpis'
import { promotionRate } from '@/views/hrbp/engine/movement'
import type { ManagerFlag } from '@/views/hrbp/engine/org'
import { attrition, exitsIn } from '@/views/hrbp/engine/population'
import { computeOnboarding } from '@/views/onboarding/engine'
import { computeRecruiting } from '@/views/recruiting/engine'
import { computeCached as servicesModel } from '@/views/services/engine'
import { isRowPrivate } from '@/views/services/engine/cases'
import type { CaseFact } from '@/views/services/engine/facts'

/* ───────── voluntary attrition by department or site ───────── */

export type GroupDim = 'department' | 'location'

export interface GroupBar extends GroupRateRow {
  [key: string]: unknown
  /** At least the readout rule's gap (3 pts by default) above the company, in a group large enough for it. */
  above: boolean
}

/** Departments (business unit) or sites (region) by voluntary attrition, highest first, hidden ones last. */
export function groupAttrition(m: HrbpModel, dim: GroupDim): { rows: GroupBar[]; company: number | null } {
  const p = m.prep
  const company = m.attrition.company.voluntary
  const { gap, minAvgHeadcount } = p.set.voluntaryAbove
  const list = dim === 'department' ? m.attrition.byDepartment : m.attrition.byLocation
  const rows = list
    .map((r) => ({
      ...r,
      above:
        r.voluntaryRate != null &&
        company != null &&
        r.voluntaryRate - company >= gap - 1e-12 &&
        r.avgHeadcount >= minAvgHeadcount,
    }))
    .sort(
      (a, b) =>
        (b.voluntaryRate ?? -1) - (a.voluntaryRate ?? -1) ||
        b.avgHeadcount - a.avgHeadcount ||
        a.group.localeCompare(b.group),
    )
  return { rows, company }
}

/* ───────── leaders ───────── */

/** A manager with this many people in their org is a leader on the list, whatever their level. */
export const LEADER_MIN_ORG = 8
const isLeaderLevel = (e: Employee) => e.level === 'M2' || (e.level?.startsWith('E') ?? false)

export interface LeaderListRow {
  [key: string]: unknown
  id: string
  leader: string
  title: string
  department: string
  headcount: number
  netChange: number | null
  voluntary: number | null
  voluntaryVsCompany: number | null
  regretted: number | null
  regrettedVsCompany: number | null
  openReqs: number
  /** Span flag, new manager, single-report chain, in words; empty when none. */
  flags: string
  promotionRate: number | null
  /** The records behind the numbers (not exported). */
  active: Employee[]
  voluntaryLeavers: Employee[]
  regrettedLeavers: Employee[]
  joined: Employee[]
  left: Employee[]
  promotions: JobChange[]
  reqs: Requisition[]
  avgHeadcount: number
  ids: ReadonlySet<string>
}

const FLAG_WORD: Partial<Record<ManagerFlag, string>> = {
  Overloaded: 'Overloaded span',
  Heavy: 'Heavy span',
  Light: 'Light span',
}

/**
 * The scope's leaders, the largest org first: directors and above, or managers with 8 or more
 * people in their org, each with their org's numbers inside the scope. Rates under the anonymity
 * minimum are null, as on People stats.
 */
export function leaderList(
  ctx: AnalyticsContext,
  m: HrbpModel,
  openReqs: readonly Requisition[],
): LeaderListRow[] {
  const p = m.prep
  const opts = rateOptions(p)
  const minGroup = p.set.minGroup
  const company = m.attrition.company
  const yearAgo = addDays(p.t12.start, -1)
  const chains = new Set(m.org.chains.map((c) => c.managerId))
  const changesById = new Map<string, JobChange[]>()
  for (const c of ctx.data.jobChanges) {
    const arr = changesById.get(c.employeeId)
    if (arr) arr.push(c)
    else changesById.set(c.employeeId, [c])
  }
  const typed = p.has.terminationDate && p.has.terminationType
  const rows: LeaderListRow[] = []
  for (const mgr of m.org.managers) {
    const leader = isLeaderLevel(mgr.employee)
    if (mgr.totalOrg < LEADER_MIN_ORG && !leader) continue
    const ids = subtreeIds(ctx.org, mgr.managerId)
    // The org below the leader (not the leader), current and former, inside the scope.
    const people = p.emps.filter((e) => e.employeeId !== mgr.managerId && ids.has(e.employeeId))
    const active = people.filter((e) => isActiveAt(e, p.asOf))
    // Employees in the scope, not every worker type: a manager of 8 with contractors may have fewer.
    if (!active.length || (active.length < LEADER_MIN_ORG && !leader)) continue
    const vol = attrition(people, p.window, 'voluntary', opts)
    const reg = attrition(people, p.window, 'regretted', opts)
    const big = vol.avgHeadcount >= minGroup
    const voluntary = typed && big ? vol.rate : null
    const regretted = p.regrettedReady && big ? reg.rate : null
    const exits = exitsIn(people, p.window, p.counts)
    const joined: Employee[] = []
    const left: Employee[] = []
    for (const e of people) {
      const was = isActiveAt(e, yearAgo)
      const is = isActiveAt(e, p.asOf)
      if (is && !was) joined.push(e)
      if (was && !is) left.push(e)
    }
    const changes = people.flatMap((e) => changesById.get(e.employeeId) ?? [])
    const promo = promotionRate(people, changes, p.window, p.has.jobChanges, { counts: p.counts, minGroup })
    const flags = [
      FLAG_WORD[mgr.flag],
      mgr.newManager ? 'New manager' : null,
      chains.has(mgr.managerId) ? 'Single-report chain' : null,
    ]
      .filter(Boolean)
      .join(', ')
    rows.push({
      id: mgr.managerId,
      leader: mgr.name,
      title: mgr.jobTitle,
      department: mgr.department,
      headcount: active.length,
      netChange: p.has.terminationDate ? joined.length - left.length : null,
      voluntary,
      voluntaryVsCompany:
        voluntary != null && company.voluntary != null ? voluntary - company.voluntary : null,
      regretted,
      regrettedVsCompany:
        regretted != null && company.regretted != null ? regretted - company.regretted : null,
      openReqs: 0,
      flags,
      promotionRate: promo.rate,
      active,
      voluntaryLeavers: voluntary == null ? [] : exits.filter((e) => e.terminationType === 'Voluntary'),
      regrettedLeavers: regretted == null ? [] : exits.filter(p.isRegretted),
      joined,
      left,
      promotions:
        promo.rate == null
          ? []
          : changes.filter((c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, p.window)),
      reqs: openReqs.filter((q) => !!q.hiringManagerId && ids.has(q.hiringManagerId)),
      avgHeadcount: vol.avgHeadcount,
      ids,
    })
  }
  for (const r of rows) r.openReqs = r.reqs.length
  return rows.sort((a, b) => b.headcount - a.headcount || a.leader.localeCompare(b.leader))
}

/* ───────── sites ───────── */

export interface SiteListRow {
  [key: string]: unknown
  site: string
  headcount: number
  voluntary: number | null
  starts30: number
  openReqs: number
  /** Open cases, employee relations counted (never listed). */
  openCases: number
  /** Employee relations cases among them (counted, never listed). */
  privateCases: number
  reverifications: number
  i9OnTime: number | null
  /** A US site, where I-9 Section 2 applies (Compliance's own rule, `isUsPerson`). */
  usSite: boolean
  active: Employee[]
  group: GroupRateRow | null
  startIds: string[]
  reqs: Requisition[]
  /** Open cases at the site (employee relations ones too: their drill lists the others). */
  cases: CaseFact[]
  expiring: ExpiryRow[]
  i9: I9Row[]
}

export interface SiteInputs {
  sites: readonly string[]
  /** People stats: attrition by location. */
  byLocation: readonly GroupRateRow[]
  /** Onboarding: the starts in the next 30 days, with their site. */
  starts: readonly { id: string; location: string | null }[]
  openReqs: readonly Requisition[]
  /** HR ops: open cases with the requester's site. */
  cases: readonly { f: CaseFact; location: string | null }[]
  /** Count employee relations cases (a scope of 5 or more): else they are left out of every count. */
  countPrivate: boolean
  /** Compliance: authorizations expiring in the headline window, and I-9s judged in the period. */
  expiring: readonly ExpiryRow[]
  i9: readonly I9Row[]
}

/** One row per site of the region, in the region's order (sites with nobody and nothing left out). */
export function siteList(m: HrbpModel, input: SiteInputs): SiteListRow[] {
  const p = m.prep
  return input.sites
    .map((site) => {
      const active = p.emps.filter((e) => e.location === site && isActiveAt(e, p.asOf))
      const group = input.byLocation.find((g) => g.group === site) ?? null
      const cases = input.cases
        .filter((x) => x.location === site && (input.countPrivate || !isRowPrivate(x.f)))
        .map((x) => x.f)
      const i9 = input.i9.filter((x) => x.site === site)
      const judged = i9.length
      const onTime = i9.filter((x) => x.onTime).length
      return {
        site,
        headcount: active.length,
        voluntary: group?.voluntaryRate ?? null,
        starts30: input.starts.filter((s) => s.location === site).length,
        openReqs: input.openReqs.filter((q) => q.location === site).length,
        openCases: cases.length,
        privateCases: cases.filter(isRowPrivate).length,
        reverifications: input.expiring.filter((x) => x.e.location === site).length,
        i9OnTime: judged >= p.set.minGroup ? onTime / judged : null,
        usSite: isUsPerson({ location: site, country: active[0]?.country ?? '' }),
        active,
        group,
        startIds: input.starts.filter((s) => s.location === site).map((s) => s.id),
        reqs: input.openReqs.filter((q) => q.location === site),
        cases,
        expiring: input.expiring.filter((x) => x.e.location === site),
        i9,
      }
    })
    .filter((r) => r.headcount > 0 || r.openReqs > 0 || r.starts30 > 0)
}

/** The scope's sites (region) or nothing (business unit). */
export function regionSitesOf(ctx: Pick<AnalyticsContext, 'access'>): readonly string[] {
  const s = ctx.access.scope
  return s?.kind === 'region' ? s.sites : []
}

/* ───────── the lists, for the page ───────── */

/**
 * My list's leaders (a business unit) or sites (a region) for the context on screen, from the
 * producing views' models (each cached per context).
 */
export function hrbpLists(ctx: AnalyticsContext): { leaders: LeaderListRow[]; sites: SiteListRow[] } {
  const m = hrbpModel(ctx)
  const r = computeRecruiting(ctx)
  const region = ctx.access.scope?.kind === 'region'
  if (!region) return { leaders: leaderList(ctx, m, r.base.req.open), sites: [] }
  const s = servicesModel(ctx)
  const c = complianceModel(ctx)
  const o = computeOnboarding(ctx)
  const sites = siteList(m, {
    sites: regionSitesOf(ctx),
    byLocation: m.attrition.byLocation,
    starts: o.upcoming.in30.map((x) => ({ id: x.key, location: x.location })),
    openReqs: r.base.req.open,
    cases: s.cases
      .filter((f) => f.open)
      .map((f) => ({
        f,
        location:
          (f.requesterId ? ctx.org.byId.get(f.requesterId)?.location : null) ?? f.record.location ?? null,
      })),
    countPrivate: !s.smallScope,
    expiring: c.work.expiringHeadline,
    i9: c.i9.current.judged,
  })
  return { leaders: [], sites }
}
