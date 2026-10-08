/**
 * `get_context`: the as-of date, the period and comparison windows, the scope (leader as a
 * token), the data standard, each dataset, the feature switches, the views and their tabs, and the
 * filter vocabularies (business units, departments, locations, levels; leaders as tokens with the
 * size of their org).
 *
 * Every mode (docs/ROLES-V2.md 7): the datasets, views and pages are the mode's; a scoped mode's
 * vocabularies come from its scope (a manager's org, a business unit, a region's people, a
 * recruiter's reqs), and Finance's from business units only, since it filters by nothing else.
 */
import { MODE_NAME } from '@/access/modes'
import { applyScope } from '@/access/scopes/apply'
import { scopeOfAccess } from '@/access/scopes/records'
import { leaderOptions, scopedLeaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { STANDARD_DESCRIPTION } from '@/data/quality/tier'
import { DATASETS, type Employee, LEVEL_LABELS, type Level } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { minGroupOf } from '@/metrics/privacy'
import { DATA_TABS } from '@/views/data/links'
import type { TokenMap } from '../privacy'
import { scopeText } from '../roles'
import { ownScopeProblem, PERIODS, scopeOut } from '../scope'
import { liveViews, ok, type ToolOutput, type ToolRuntime } from './shared'

/** How many leaders get_context lists (largest orgs first). */
export const LEADERS_LISTED = 60

type Dim = 'businessUnit' | 'department' | 'location' | 'level'

/** One line on the mode for Claude, or null in HR and Developer mode. */
function modeNote(ctx: AnalyticsContext, tokens: TokenMap): string | null {
  const access = ctx.access
  const scope = scopeOfAccess(access)
  const where = scopeText(scope, tokens)
  switch (scope?.kind) {
    case 'org':
      return `Census is in Manager mode for ${where}. Every scope stays inside it; company numbers are comparisons only.`
    case 'unit':
      return `Census is in HRBP mode for ${where}, at every location. Every scope stays inside it; company numbers are comparisons only.`
    case 'region':
      return `Census is in HRBP mode for ${where}${scope.sites.length ? ` (${scope.sites.join(', ')})` : ''}, across business units. Every scope stays inside it; company numbers are comparisons only.`
    case 'reqs':
      return `Census is in Recruiter mode for ${where}. Every scope stays inside them: their candidates and their starts; numbers for all reqs are comparisons only.`
  }
  switch (access.mode) {
    case 'hr':
    case 'developer':
      return null
    case 'recruiter':
      return "Census is in Recruiter mode for every recruiter's reqs."
    case 'finance':
      return 'Census is in Finance mode: the filters are business unit and period only, and cost totals and pay are never sent.'
    default:
      return `Census is in ${MODE_NAME[access.mode]} mode for the whole company. The views and datasets listed here are the ones it shows.`
  }
}

/** Value counts of a dimension over rows, largest first. */
function countsOf<T>(rows: readonly T[], get: (r: T) => unknown): [string, number][] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const v = get(r)
    if (typeof v === 'string' && v) m.set(v, (m.get(v) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Each employee's management chain (inclusive), counted once per row: how many rows sit in each leader's org. */
function perLeader(ctx: AnalyticsContext, ids: readonly (string | null | undefined)[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const id of ids) {
    const seen = new Set<string>()
    let cur = id ? ctx.org.byId.get(id) : undefined
    while (cur && !seen.has(cur.employeeId)) {
      seen.add(cur.employeeId)
      out.set(cur.employeeId, (out.get(cur.employeeId) ?? 0) + 1)
      cur = cur.managerId && cur.managerId !== cur.employeeId ? ctx.org.byId.get(cur.managerId) : undefined
    }
  }
  return out
}

/** The filter vocabularies of the mode's scope. */
function vocabularies(rt: ToolRuntime) {
  const ctx = rt.base
  const access = ctx.access
  const scope = scopeOfAccess(access)
  const min = minGroupOf(ctx.metrics)
  const tokens = rt.tokens
  // A recruiter's reqs: the values and hiring managers' leaders of those reqs, counted in reqs.
  if (scope?.kind === 'reqs') {
    const reqs = applyScope(ctx.all, scope).requisitions
    const counted = (dim: Dim) => countsOf(reqs, (r) => r[dim]).map(([value, n]) => ({ value, reqs: n }))
    const byLeader = perLeader(
      ctx,
      reqs.map((r) => r.hiringManagerId),
    )
    const leaders = leaderOptions(ctx.org, ctx.asOf).filter(
      (l) => l.size >= min && (byLeader.get(l.id) ?? 0) > 0,
    )
    return {
      business_unit: counted('businessUnit'),
      department: counted('department'),
      location: counted('location'),
      level: counted('level').map((l) => ({ ...l, label: LEVEL_LABELS[l.value as Level] ?? l.value })),
      leaders: leaders.slice(0, LEADERS_LISTED).map((l) => ({
        leader: tokens.forEmployee(l.id),
        reqs: byLeader.get(l.id) ?? 0,
      })),
      leaders_total: leaders.length,
      note: "Counted in the recruiter's reqs (open or opened in the last 12 months); a leader's reqs are those whose hiring manager is in their org.",
    }
  }
  // Manager's org, a business unit or a region: its people. Elsewhere, everyone.
  const inScope = (e: Employee): boolean => {
    switch (scope?.kind) {
      case 'org':
        return scope.orgIds.has(e.employeeId)
      case 'unit':
      case 'region':
        return scope.memberIds.has(e.employeeId)
      default:
        return true
    }
  }
  const active = ctx.all.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && inScope(e))
  const counts = (dim: Dim) =>
    countsOf(active, (e) => e[dim]).map(([value, headcount]) => ({ value, headcount }))
  // Finance filters by business unit and period only (docs/ROLES-V2.md 2.3).
  if (!scope && access.mode === 'finance')
    return {
      business_unit: counts('businessUnit'),
      note: 'Finance mode filters by business unit and period only, so no other filter is listed.',
    }
  const departments = new Map<string, { business_unit: string; headcount: number }>()
  for (const e of active) {
    const d = departments.get(e.department)
    if (d) d.headcount++
    else departments.set(e.department, { business_unit: e.businessUnit, headcount: 1 })
  }
  // Leaders a scope can be cut to: the app's leader filter (inside a business unit or region, sized
  // inside it), without orgs under the anonymity minimum.
  const leaders =
    scope?.kind === 'unit' || scope?.kind === 'region'
      ? scopedLeaderOptions(ctx.org, ctx.asOf, inScope).filter((l) => l.size >= min)
      : leaderOptions(ctx.org, ctx.asOf).filter(
          (l) => l.size >= min && inScope(ctx.org.byId.get(l.id) as Employee),
        )
  return {
    business_unit: counts('businessUnit'),
    department: [...departments]
      .sort((a, b) => b[1].headcount - a[1].headcount || a[0].localeCompare(b[0]))
      .map(([value, d]) => ({ value, ...d })),
    location: counts('location'),
    level: counts('level').map((l) => ({ ...l, label: LEVEL_LABELS[l.value as Level] ?? l.value })),
    // Leaders as tokens with the size of their org; no title, which can single a person out.
    leaders: leaders.slice(0, LEADERS_LISTED).map((l) => ({
      leader: tokens.forEmployee(l.id),
      org_size: l.size,
    })),
    leaders_total: leaders.length,
  }
}

export function getContext(rt: ToolRuntime): ToolOutput {
  const ctx = rt.base
  const access = ctx.access
  // The user's scope can break the exclusion rule tool filters follow; then tools need filters.
  const own = ownScopeProblem(ctx, rt.tokens)
  const note = modeNote(ctx, rt.tokens)
  return ok({
    as_of: ctx.asOf,
    ...scopeOut(ctx, rt.tokens),
    ...(own ? { scope_usable: false, scope_problem: own } : {}),
    periods: PERIODS,
    data_standard: { standard: ctx.standard, means: STANDARD_DESCRIPTION[ctx.standard] },
    sample_data: ctx.isSample,
    anonymity_minimum: minGroupOf(ctx.metrics),
    ...(note ? { mode: access.mode, mode_note: note } : {}),
    datasets: DATASETS.filter((d) => !access || access.can(`dataset:${d.key}`)).map((d) => {
      const rows = ctx.all[d.key].length
      return {
        dataset: d.key,
        label: d.label,
        loaded: rows > 0,
        source: rows > 0 ? ctx.sources[d.key]?.kind : null,
        rows,
        tier: ctx.quality.datasetTier(d.key),
      }
    }),
    features: {
      engagement_surveys: ctx.features.engagementSurveys,
      pay_amounts: 'never sent to Claude',
      ...(access.pay === 'totals' ? { cost_totals: 'never sent to Claude' } : {}),
      immigration_details: 'never sent to Claude',
    },
    views: liveViews(rt).map((v) => ({
      view: v.key,
      label: v.label,
      tabs: v.tabs.map((t) => ({ tab: t.key, label: t.label })),
      reads: v.datasets,
      has_key_figures: typeof v.summary === 'function' || v.key === 'scorecard',
    })),
    pages: [
      ...(!access || access.can('page:data')
        ? [
            {
              view: 'data',
              label: 'Data room',
              tabs: DATA_TABS.map((t) => ({ tab: t.route, label: t.label })),
            },
          ]
        : []),
      ...(!access || access.can('page:actions')
        ? [{ view: 'actions', label: 'Action center', tabs: [] }]
        : []),
    ],
    vocabularies: vocabularies(rt),
    notes: [
      'Headcounts are active employees on the as-of date (contractors and interns excluded).',
      'Pass filters to a tool to use another scope; leave them out to use the user’s scope.',
      'filters.exclude lists the filters whose values are left out rather than kept: business_unit ["Sales"] with exclude ["business_unit"] is the whole company except Sales; an excluded leader leaves out their whole org. The user’s scope can include exclusions too.',
      'Each value left out must remove none, or at least the anonymity minimum, of the people in the scope. The user’s scope follows the same rule: when it breaks it, scope_problem says why, and tools need filters.',
    ],
  })
}
