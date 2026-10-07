/**
 * `get_context`: the as-of date, the period and comparison windows, the scope (leader as a
 * token), the data standard, each dataset, the feature switches, the views and their tabs, and the
 * filter vocabularies (business units, departments, locations, levels; leaders as tokens with the
 * size of their org).
 */
import { leaderOptions } from '@/app/filterOptions'
import { STANDARD_DESCRIPTION } from '@/data/quality/tier'
import { DATASETS, LEVEL_LABELS, type Level } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { minGroupOf } from '@/metrics/privacy'
import { DATA_TABS } from '@/views/data/links'
import { ownScopeProblem, PERIODS, scopeOut } from '../scope'
import { liveViews, lockOf, ok, type ToolOutput, type ToolRuntime } from './shared'

/** How many leaders get_context lists (largest orgs first). */
export const LEADERS_LISTED = 60

export function getContext(rt: ToolRuntime): ToolOutput {
  const ctx = rt.base
  // Manager mode (docs/ROLES.md, 3.9): vocabularies, leaders and datasets come from the org.
  const lock = lockOf(rt)
  const inOrg = (id: string) => !lock || lock.orgIds.has(id)
  const active = ctx.all.employees.filter(
    (e) => isEmployee(e) && isActiveAt(e, ctx.asOf) && inOrg(e.employeeId),
  )
  const counts = (dim: 'businessUnit' | 'department' | 'location' | 'level') => {
    const m = new Map<string, number>()
    for (const e of active) {
      const v = e[dim]
      if (typeof v === 'string' && v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, headcount]) => ({ value, headcount }))
  }
  const departments = new Map<string, { business_unit: string; headcount: number }>()
  for (const e of active) {
    const d = departments.get(e.department)
    if (d) d.headcount++
    else departments.set(e.department, { business_unit: e.businessUnit, headcount: 1 })
  }
  // Leaders a scope can be cut to: the app's leader filter, without orgs under the anonymity minimum.
  const leaders = leaderOptions(ctx.org, ctx.asOf).filter(
    (l) => l.size >= minGroupOf(ctx.metrics) && inOrg(l.id),
  )
  const access = ctx.access
  // The user's scope can break the exclusion rule tool filters follow; then tools need filters.
  const own = ownScopeProblem(ctx, rt.tokens)
  return ok({
    as_of: ctx.asOf,
    ...scopeOut(ctx, rt.tokens),
    ...(own ? { scope_usable: false, scope_problem: own } : {}),
    periods: PERIODS,
    data_standard: { standard: ctx.standard, means: STANDARD_DESCRIPTION[ctx.standard] },
    sample_data: ctx.isSample,
    anonymity_minimum: minGroupOf(ctx.metrics),
    ...(lock
      ? {
          mode: 'manager',
          mode_note: `Census is in Manager mode for ${rt.tokens.forEmployee(lock.managerId)}'s org. Every scope stays inside it; company numbers are comparisons only.`,
        }
      : {}),
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
    vocabularies: {
      business_unit: counts('businessUnit'),
      department: [...departments]
        .sort((a, b) => b[1].headcount - a[1].headcount || a[0].localeCompare(b[0]))
        .map(([value, d]) => ({ value, ...d })),
      location: counts('location'),
      level: counts('level').map((l) => ({ ...l, label: LEVEL_LABELS[l.value as Level] ?? l.value })),
      // Leaders as tokens with the size of their org; no title, which can single a person out.
      leaders: leaders.slice(0, LEADERS_LISTED).map((l) => ({
        leader: rt.tokens.forEmployee(l.id),
        org_size: l.size,
      })),
      leaders_total: leaders.length,
    },
    notes: [
      'Headcounts are active employees on the as-of date (contractors and interns excluded).',
      'Pass filters to a tool to use another scope; leave them out to use the user’s scope.',
      'filters.exclude lists the filters whose values are left out rather than kept: business_unit ["Sales"] with exclude ["business_unit"] is the whole company except Sales; an excluded leader leaves out their whole org. The user’s scope can include exclusions too.',
      'Each value left out must remove none, or at least the anonymity minimum, of the people in the scope. The user’s scope follows the same rule: when it breaks it, scope_problem says why, and tools need filters.',
    ],
  })
}
