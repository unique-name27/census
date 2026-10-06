/**
 * The "Filter to this" invariant, as a test helper (docs/FILTERS.md, part 4). Import it from
 * `*.test.ts` files only; it uses Vitest's `expect`.
 *
 * ── The producer pattern ─────────────────────────────────────────────────────────────────
 * A number that counts a group of a filterable dimension (a bar for Bengaluru, a department row,
 * a leader's row, a level column, a month bar) sets `DrillSpec.filter` to the scope that
 * reproduces that group. Then the records panel offers "Filter to X" and "Leave out X".
 *
 *  - In a chart or table, say the dimension once for the figure with `byGroup` (`@/charts`):
 *      const locDrill = byGroup('location', 'label', (d: CountRow) => () => countSpec(p, 'location', d))
 *      <BarList … onSelect={(d) => drill(locDrill(d))} />   and   { key: 'n', …, drill: locDrill }
 *  - In an engine that builds the spec, set it directly:
 *      drillSpec({ kind: 'employees', …, filter: groupFilter('location', row.location) })
 *    and for a month or quarter: `{ ...groupFilter(…), ...periodFilter(start, end) }`.
 *  - A group of several values that readers know by another name (a region's sites, a level band)
 *    also sets `filterLabel` ("Asia Pacific", "L1-L3"), so the actions say that name.
 *  - Set nothing for numbers that are not a filterable group (offer acceptance, one req, a survey
 *    driver), for "Other (k)" rows, and for groups keyed differently from the filters (a
 *    department at the time of exit, when the filters use the current department): "Filter to"
 *    must reproduce the number.
 *
 * Then test it: after "Filter to X" from number N, the same figure's number for X in the new
 * scope is N, and its total is N for a count (nothing else is left in scope); for a rate, the same
 * rate is shown; for a share of the scope, X is then the whole scope (100%) and keeps its count.
 * The actions narrow the scope you are in (`narrowFilters`, `groupScopes`), so check them from
 * inside other filters too: `{ variants: true }` repeats the check from the same dimension
 * included and excluded, one value only, a leader's org and everyone except a leader's org.
 *
 *   import { expectFilterTo } from '@/drill/testing'
 *   expectFilterTo(ctx, {
 *     name: 'headcount by location',
 *     rows: (c) => hrbpModel(c).workforce.byLocation,
 *     key: (r) => r.label,
 *     value: (r) => r.headcount,
 *     drill: (r, c) => locationDrill(hrbpModel(c).prep, r),   // the same DrillSource the UI opens
 *     kind: 'count',
 *   }, { variants: true })
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
import { expect } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { activeEmployees } from '@/data/exclusion'
import {
  type FilterDimension,
  type FilterMode,
  type Filters,
  hasOrgFilter,
  type ListDimension,
  periodWindows,
  scopeDatasets,
  scopeLabel,
  subtreeIds,
  withMode,
} from '@/data/scope'
import { type DrillSource, resolveDrill } from './Drill'
import { filterDimensions, groupScopes } from './filter'
import type { DrillFilter } from './types'

/** The same context under other filters: the data re-scoped, the windows recomputed. */
export function rescopeContext(base: AnalyticsContext, filters: Filters): AnalyticsContext {
  const { current, prior } = periodWindows(filters.period, base.asOf, {
    start: filters.customStart,
    end: filters.customEnd,
  })
  return {
    ...base,
    filters,
    window: current,
    prior,
    scopeLabel: scopeLabel(filters, base.org),
    isCompany: !hasOrgFilter(filters),
    data: scopeDatasets(base.all, filters, base.org),
  }
}

/**
 * The scope the records panel applies for "Filter to" (include) or "Leave out" (exclude) of a
 * drill's filter, or null when the panel doesn't offer that action from `base`.
 */
export function offeredScope(
  base: AnalyticsContext,
  filter: DrillFilter,
  mode: FilterMode = 'include',
): Filters | null {
  const scopes = groupScopes(base, filter)
  return mode === 'include' ? scopes.filterTo : scopes.leaveOut
}

/** The context after "Filter to" (include) or "Leave out" (exclude) of a drill's filter, as the panel applies it. */
export function applyDrillFilter(
  base: AnalyticsContext,
  filter: DrillFilter,
  mode: FilterMode = 'include',
): AnalyticsContext {
  const next = offeredScope(base, filter, mode)
  if (!next)
    throw new Error(
      `The records panel offers no ${mode === 'include' ? 'Filter to' : 'Leave out'} for ${JSON.stringify(filter)} from ${base.scopeLabel}`,
    )
  return rescopeContext(base, next)
}

export interface FilterCase<R> {
  /** Named in failures: "headcount by location". */
  name: string
  /** The figure's rows in a context: exactly what the figure draws. */
  rows: (ctx: AnalyticsContext) => readonly R[]
  /** The group a row stands for; the same group's row in the new scope has the same key. */
  key: (row: R) => string
  /** The number the mark shows (null when hidden). */
  value: (row: R) => number | null | undefined
  /** The records the mark opens, as the UI builds them (its `filter` is what gets applied). */
  drill: (row: R, ctx: AnalyticsContext) => DrillSource
  /**
   * 'count' (default): the group's number and the figure's total in the new scope are both N.
   * 'rate': a rate; the group's value in the new scope is the same.
   * 'share': a share of the scope; the group is then the whole scope (its share is the figure's
   * whole) and its `count`, when given, is the same.
   */
  kind?: 'count' | 'rate' | 'share'
  /** For a share: the count behind it, which "Filter to" keeps. */
  count?: (row: R) => number | null | undefined
}

export interface FilterCheck {
  key: string
  before: number
  after: number | null
  /** The figure's total in the new scope (counts and shares). */
  total: number | null
  /** A share's count before and after. */
  count?: { before: number | null; after: number | null }
  filter: DrillFilter
}

export interface CheckOptions {
  /** How many rows to check per scope (the first ones, then evenly spread). Default 6. */
  sample?: number
  /** Also check from inside other filters (`scopeVariants`). */
  variants?: boolean
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

const sumOf = <R>(c: FilterCase<R>, rows: readonly R[]) =>
  rows.reduce((s, x) => s + (Number(c.value(x)) || 0), 0)

/**
 * Apply "Filter to" from each sampled row's drill and read the figure again. Rows without a value,
 * without a filter or whose Filter to the panel doesn't offer from `base` are skipped (and counted
 * in `skipped`). `sample` caps how many rows are checked (the first ones, then evenly spread).
 */
export function checkFilterTo<R>(
  base: AnalyticsContext,
  c: FilterCase<R>,
  opts: { sample?: number } = {},
): { checks: FilterCheck[]; skipped: number } {
  const rows = c.rows(base)
  const offered = rows.flatMap((r) => {
    const v = c.value(r)
    if (v == null || !Number.isFinite(v)) return []
    const filter = resolveDrill(c.drill(r, base))?.filter
    const next = filter ? offeredScope(base, filter) : null
    return filter && next ? [{ r, filter, next }] : []
  })
  const n = opts.sample ?? 6
  const step = Math.max(1, Math.floor(offered.length / n))
  const picked = offered.filter((_, i) => i % step === 0).slice(0, n)
  const checks: FilterCheck[] = []
  const kind = c.kind ?? 'count'
  for (const { r, filter, next } of picked) {
    const after = c.rows(rescopeContext(base, next))
    const same = after.find((x) => c.key(x) === c.key(r))
    checks.push({
      key: c.key(r),
      before: c.value(r) as number,
      after: same ? (c.value(same) ?? null) : null,
      total: kind === 'rate' ? null : sumOf(c, after),
      count:
        kind === 'share' && c.count
          ? { before: c.count(r) ?? null, after: same ? (c.count(same) ?? null) : null }
          : undefined,
      filter,
    })
  }
  return { checks, skipped: rows.length - offered.length }
}

/** One base scope to check the actions from. */
export interface ScopeVariant {
  name: string
  filters: Filters
}

/** Values of a list dimension by active headcount, largest first. */
function valuesBySize(base: AnalyticsContext, dim: ListDimension): string[] {
  const n = new Map<string, number>()
  for (const e of activeEmployees(base.all.employees, base.asOf)) {
    const v = e[dim]
    if (typeof v === 'string' && v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v)
}

/** The top leader's direct reports who lead someone, largest org first. */
function topOrgs(base: AnalyticsContext): string[] {
  const people = activeEmployees(base.all.employees, base.asOf)
  const roots = people.filter((e) => !e.managerId || !base.org.byId.has(e.managerId))
  const size = (id: string) => subtreeIds(base.org, id).size
  const top = roots.map((e) => e.employeeId).sort((a, b) => size(b) - size(a))[0]
  if (!top) return []
  return (base.org.children.get(top) ?? [])
    .filter((e) => people.includes(e) && (base.org.children.get(e.employeeId)?.length ?? 0) > 0)
    .map((e) => e.employeeId)
    .sort((a, b) => size(b) - size(a) || a.localeCompare(b))
}

/**
 * Base scopes to check "Filter to" and "Leave out" from, beyond `base` itself: for a list
 * dimension, two of its values included, one excluded and one alone; for every figure, a large
 * leader's org and everyone except another leader's org. Other filters of `base` stay.
 */
export function scopeVariants(base: AnalyticsContext, dim: FilterDimension | null): ScopeVariant[] {
  const out: ScopeVariant[] = []
  const f = base.filters
  const list: ListDimension = dim && dim !== 'leaderId' ? dim : 'location'
  const [v1, v2] = valuesBySize(base, list)
  if (v1 && v2) {
    const set = (values: string[], mode: FilterMode): Filters => ({
      ...f,
      [list]: values,
      modes: withMode(f.modes, list, mode),
    })
    out.push(
      { name: `${list} ${v1} and ${v2}`, filters: set([v1, v2], 'include') },
      { name: `${list} not ${v2}`, filters: set([v2], 'exclude') },
      { name: `${list} ${v1} only`, filters: set([v1], 'include') },
    )
  }
  const [o1, o2] = topOrgs(base)
  if (o1)
    out.push({
      name: `leader ${o1}`,
      filters: { ...f, leaderId: o1, modes: withMode(f.modes, 'leaderId', 'include') },
    })
  if (o2)
    out.push({
      name: `not leader ${o2}`,
      filters: { ...f, leaderId: o2, modes: withMode(f.modes, 'leaderId', 'exclude') },
    })
  return out
}

/** The dimension a figure's groups are of: the first dimension the first row with a filter names. */
function caseDimension<R>(base: AnalyticsContext, c: FilterCase<R>): FilterDimension | null {
  for (const r of c.rows(base)) {
    const filter = resolveDrill(c.drill(r, base))?.filter
    if (filter) return filterDimensions(filter)[0] ?? null
  }
  return null
}

/** `base`, then (with `variants`) each variant scope as a context. */
function baseScopes<R>(base: AnalyticsContext, c: FilterCase<R>, variants: boolean | undefined) {
  const out: { name: string; ctx: AnalyticsContext }[] = [{ name: base.scopeLabel, ctx: base }]
  if (variants)
    for (const v of scopeVariants(base, caseDimension(base, c)))
      out.push({ name: v.name, ctx: rescopeContext(base, v.filters) })
  return out
}

/**
 * The invariant as an assertion: after "Filter to X" from number N, the same figure shows N for
 * X (and in total, for a count). Fails when no row of the figure offers Filter to from `base`,
 * or (with `variants`) from none of the variant scopes.
 */
export function expectFilterTo<R>(base: AnalyticsContext, c: FilterCase<R>, opts: CheckOptions = {}): void {
  let fromVariants = 0
  for (const [i, s] of baseScopes(base, c, opts.variants).entries()) {
    const { checks } = checkFilterTo(s.ctx, c, opts)
    if (i === 0) expect(checks.length, `${c.name}: no mark offers Filter to`).toBeGreaterThan(0)
    else fromVariants += checks.length
    for (const k of checks) {
      const where = `${c.name} from ${s.name}, ${k.key} (${JSON.stringify(k.filter)})`
      expect(k.after, `${where}: the group is missing after Filter to`).not.toBeNull()
      if (c.kind === 'share') {
        expect(
          near(k.after as number, k.total as number),
          `${where}: share ${k.after}, whole ${k.total}`,
        ).toBe(true)
        if (k.count) expect(k.count.after, `${where}: count`).toBe(k.count.before)
        continue
      }
      expect(near(k.after as number, k.before), `${where}: ${k.before} before, ${k.after} after`).toBe(true)
      if (k.total != null)
        expect(near(k.total, k.before), `${where}: total ${k.total}, expected ${k.before}`).toBe(true)
    }
  }
  if (opts.variants) expect(fromVariants, `${c.name}: no variant scope offers Filter to`).toBeGreaterThan(0)
}

/**
 * "Leave out X" for a count whose groups split the scope: the group is gone and the figure's total
 * drops by exactly N. Rows the panel offers no Leave out for are skipped.
 */
export function expectLeaveOut<R>(base: AnalyticsContext, c: FilterCase<R>, opts: CheckOptions = {}): void {
  let fromVariants = 0
  for (const [i, s] of baseScopes(base, c, opts.variants).entries()) {
    const rows = c.rows(s.ctx)
    const total = sumOf(c, rows)
    const offered = rows.flatMap((r) => {
      const v = c.value(r)
      if (v == null || !Number.isFinite(v)) return []
      const filter = resolveDrill(c.drill(r, s.ctx))?.filter
      const next = filter ? offeredScope(s.ctx, filter, 'exclude') : null
      return filter && next ? [{ r, next }] : []
    })
    const n = opts.sample ?? 6
    const step = Math.max(1, Math.floor(offered.length / n))
    const picked = offered.filter((_, j) => j % step === 0).slice(0, n)
    if (i === 0) expect(picked.length, `${c.name}: no mark offers Leave out`).toBeGreaterThan(0)
    else fromVariants += picked.length
    for (const { r, next } of picked) {
      const key = c.key(r)
      const after = c.rows(rescopeContext(s.ctx, next))
      const same = after.find((x) => c.key(x) === key)
      const where = `${c.name} from ${s.name}, ${key}`
      expect(same ? (c.value(same) ?? 0) : 0, `${where}: still there after Leave out`).toBe(0)
      expect(sumOf(c, after), `${where}: total after Leave out`).toBe(total - (c.value(r) as number))
    }
  }
  if (opts.variants) expect(fromVariants, `${c.name}: no variant scope offers Leave out`).toBeGreaterThan(0)
}
