/**
 * The CHRO's executive home as data (docs/ROLES-V2.md 5.4): measures by practice and status (from
 * the Scorecard's model), and My list, "Leaders' orgs": one row per direct report of the top
 * leader (the CEO's direct reports, or the leader the filters focus on), built from People stats'
 * sub-org scorecard for that leader's scope, with open reqs, open critical items, critical roles
 * covered and the HR business partner the org's people name. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, Requisition } from '@/data/schema'
import { focusLeader, hasOrgFilter, scopeDatasets, scopeLabel, subtreeIds, withMode } from '@/data/scope'
import { isActiveAt } from '@/lib/people'
import type { OpenAction } from '@/views/actions/engine'
import type { Prep } from '@/views/hrbp/engine'
import { prepare } from '@/views/hrbp/engine/base'
import { computeScorecard, type ScoreRow } from '@/views/hrbp/engine/scorecard'
import type { ScoreRow as Measure, ScorecardModel } from '@/views/scorecard/engine/model'
import type { ScoreStatus } from '@/views/scorecard/engine/status'
import type { RoleRow } from '@/views/talent/engine/succession'

/* ───────── measures by practice and status ───────── */

export const STATUS_ORDER = ['met', 'watch', 'missed', 'none', 'unknown'] as const
export const STATUS_WORD: Record<ScoreStatus, string> = {
  met: 'Met',
  watch: 'Watch',
  missed: 'Missed',
  none: 'No target',
  unknown: 'Not shown',
}

export interface PracticeSegment {
  [key: string]: unknown
  practice: string
  status: ScoreStatus
  statusWord: string
  measures: number
  /** The measures in the segment (for the list under the chart; not exported). */
  rows: Measure[]
}

export interface PracticeRow {
  [key: string]: unknown
  practice: string
  met: number
  watch: number
  missed: number
  none: number
  unknown: number
  measures: number
  rows: Measure[]
}

/** Each practice's measures by status, in folder-tab order; practices with no measure left out. */
export function practiceStatus(model: Pick<ScorecardModel, 'practices'>): {
  segments: PracticeSegment[]
  rows: PracticeRow[]
} {
  const segments: PracticeSegment[] = []
  const rows: PracticeRow[] = []
  for (const p of model.practices) {
    if (!p.rows.length) continue
    const by = (s: ScoreStatus) => p.rows.filter((r) => r.status === s)
    for (const s of STATUS_ORDER) {
      const list = by(s)
      if (list.length)
        segments.push({
          practice: p.label,
          status: s,
          statusWord: STATUS_WORD[s],
          measures: list.length,
          rows: list,
        })
    }
    rows.push({
      practice: p.label,
      met: by('met').length,
      watch: by('watch').length,
      missed: by('missed').length,
      none: by('none').length,
      unknown: by('unknown').length,
      measures: p.rows.length,
      rows: p.rows,
    })
  }
  return { segments, rows }
}

/* ───────── leaders' orgs ───────── */

/** The top of the reporting line: the active employee with no manager in the data and the largest team. */
export function topLeader(ctx: Pick<AnalyticsContext, 'all' | 'org' | 'asOf'>): Employee | null {
  let best: Employee | null = null
  let size = -1
  for (const e of ctx.all.employees) {
    if (!isActiveAt(e, ctx.asOf)) continue
    if (e.managerId && e.managerId !== e.employeeId && ctx.org.byId.has(e.managerId)) continue
    const n = ctx.org.children.get(e.employeeId)?.length ?? 0
    if (n > size) {
      best = e
      size = n
    }
  }
  return size > 0 ? best : null
}

const focused = new WeakMap<AnalyticsContext, AnalyticsContext>()

/** The context focused on a leader's org, other filters kept (People stats' sub-org scope). */
export function contextOn(ctx: AnalyticsContext, leaderId: string): AnalyticsContext {
  if (focusLeader(ctx.filters) === leaderId) return ctx
  const hit = focused.get(ctx)
  if (hit && hit.filters.leaderId === leaderId) return hit
  const filters = { ...ctx.filters, leaderId, modes: withMode(ctx.filters.modes, 'leaderId', 'include') }
  const out: AnalyticsContext = {
    ...ctx,
    filters,
    data: scopeDatasets(ctx.all, filters, ctx.org),
    isCompany: !hasOrgFilter(filters),
    scopeLabel: scopeLabel(filters, ctx.org),
  }
  focused.set(ctx, out)
  return out
}

export interface LeaderRow {
  [key: string]: unknown
  id: string
  leader: string
  title: string
  headcount: number
  voluntary: number | null
  /** Points above (+) or below the company. */
  voluntaryVsCompany: number | null
  regretted: number | null
  regrettedVsCompany: number | null
  openReqs: number
  /** Open critical items about or owned by someone in the org; null until the items are collected. */
  critical: number | null
  criticalRoles: number
  covered: number
  /** Critical roles with a ready-now successor, of the org's critical roles; null without any. */
  coverage: number | null
  hrbp: string
  /** The sub-org scorecard row (for its drills; not exported). */
  score: ScoreRow
  reqs: Requisition[]
  criticalItems: OpenAction[]
  roles: RoleRow[]
  /** Everyone in the leader's org, current and former (to count items). */
  ids: ReadonlySet<string>
}

export interface Leaders {
  /** The leader whose direct reports the rows are. */
  top: Employee | null
  /** People stats' preparation for that leader's scope, for the drills. */
  prep: Prep | null
  rows: LeaderRow[]
  /** The company rates the rows compare with. */
  company: { voluntary: number | null; regretted: number | null }
  /** Direct reports' orgs folded into Other (under the anonymity minimum). */
  folded: number
}

const mostCommon = (xs: readonly (string | null | undefined)[]): string => {
  const n = new Map<string, number>()
  for (const x of xs) {
    const t = x?.trim()
    if (t) n.set(t, (n.get(t) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '—'
}

const gap = (v: number | null, company: number | null) => (v == null || company == null ? null : v - company)

/**
 * One row per direct report of the top leader (or of the leader the filters focus on): People
 * stats' sub-org scorecard for that scope, with open reqs whose hiring manager is in the org,
 * open critical items about or owned by someone in it, critical roles held in it and how many have
 * a ready-now successor, and the HR business partner most of its people name. Orgs under the
 * anonymity minimum fold into Other and are not listed.
 */
export function leaderRows(
  ctx: AnalyticsContext,
  opts: {
    /** Succession's roles (critical ones count). */
    roles: readonly RoleRow[]
    /** Recruiting's open reqs in the context. */
    openReqs: readonly Requisition[]
  },
): Leaders {
  const focus = focusLeader(ctx.filters)
  const top = focus && ctx.org.byId.has(focus) ? (ctx.org.byId.get(focus) ?? null) : topLeader(ctx)
  if (!top)
    return { top: null, prep: null, rows: [], company: { voluntary: null, regretted: null }, folded: 0 }
  const scoped = contextOn(ctx, top.employeeId)
  const prep = prepare(scoped)
  const card = computeScorecard(prep)
  const companyRow = card.rows.find((r) => r.kind === 'company')
  const company = { voluntary: companyRow?.voluntary ?? null, regretted: companyRow?.regretted ?? null }
  const other = card.rows.find((r) => r.kind === 'other')
  const rows: LeaderRow[] = card.rows
    .filter((r) => r.kind === 'leader')
    .map((r) => {
      const ids = subtreeIds(ctx.org, r.key)
      const reqs = opts.openReqs.filter((q) => !!q.hiringManagerId && ids.has(q.hiringManagerId))
      const roles = opts.roles.filter((x) => x.criticality === 'Critical' && ids.has(x.incumbentId))
      const covered = roles.filter((x) => x.readyNow > 0).length
      const leader = ctx.org.byId.get(r.key)
      return {
        id: r.key,
        leader: r.label,
        title: leader?.jobTitle ?? r.sublabel,
        headcount: r.headcount,
        voluntary: r.voluntary,
        voluntaryVsCompany: gap(r.voluntary, company.voluntary),
        regretted: r.regretted,
        regrettedVsCompany: gap(r.regretted, company.regretted),
        openReqs: reqs.length,
        critical: null,
        criticalRoles: roles.length,
        covered,
        coverage: roles.length ? covered / roles.length : null,
        hrbp: mostCommon(r.records.active.map((e) => e.hrbp)),
        score: r,
        reqs,
        criticalItems: [],
        roles,
        ids,
      }
    })
  return { top, prep, rows, company, folded: other ? Number(/\((\d+)\)/.exec(other.label)?.[1] ?? 0) : 0 }
}

/** The rows with their open critical items: about someone in the org, or owned by someone in it. */
export function withCritical(rows: readonly LeaderRow[], open: readonly OpenAction[] | null): LeaderRow[] {
  if (!open) return [...rows]
  return rows.map((r) => {
    const criticalItems = open.filter(
      (a) =>
        a.item.severity === 'critical' &&
        ((!!a.ownerId && r.ids.has(a.ownerId)) || (!!a.personId && r.ids.has(a.personId))),
    )
    return { ...r, critical: criticalItems.length, criticalItems }
  })
}
