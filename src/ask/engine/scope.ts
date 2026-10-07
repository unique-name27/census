/**
 * The context a tool computes with (docs/ASK.md, Scope).
 *
 * Tools run against the app's live context: the user's filters, period, data standard and metric
 * dictionary. A tool call may give its own `filters`; the context for that scope reuses the live
 * context's mapped data, org index, quality index and metrics and only re-scopes the datasets, the
 * same way the app does when a filter changes. Pay amounts and immigration details are always off
 * in Ask, whatever the session switches say.
 *
 * Contexts are cached per live context and scope, so the views' own per-context caches are reused
 * across tool calls (and the live context itself is used whenever nothing differs from it).
 */

import { askOrgTooSmall } from '@/access/copy'
import { clampFilters } from '@/access/lock'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { activeEmployees, smallExcludedValues } from '@/data/exclusion'
import { LEVEL_LABELS, type Level, levelIndex } from '@/data/schema'
import {
  type FilterDimension,
  type FilterModes,
  type Filters,
  hasOrgFilter,
  isExcluded,
  PERIOD_LABELS,
  type PeriodPreset,
  periodWindows,
  scopeDatasets,
  scopeLabel,
} from '@/data/scope'
import { isCalendarDate } from '@/lib/dates'
import { minGroupOf } from '@/metrics/privacy'
import type { TokenMap } from './privacy'

/** The `filters` argument every scoped tool takes. */
export interface FilterInput {
  /** A person token from get_context ("{{P12}}" or "P12"): the leader and everyone below them. */
  leader?: string
  business_unit?: string[]
  department?: string[]
  location?: string[]
  level?: string[]
  period?: PeriodPreset
  /** YYYY-MM-DD, with period "custom". */
  start?: string
  end?: string
  /** The dimensions whose values are left out instead of kept ("everyone except"). */
  exclude?: ExcludeArg[]
}

/** The dimensions `filters.exclude` can name, as the tools call them. */
export const EXCLUDE_ARGS = ['leader', 'business_unit', 'department', 'location', 'level'] as const
export type ExcludeArg = (typeof EXCLUDE_ARGS)[number]
const EXCLUDE_DIM: Record<ExcludeArg, FilterDimension> = {
  leader: 'leaderId',
  business_unit: 'businessUnit',
  department: 'department',
  location: 'location',
  level: 'level',
}

export const PERIODS: readonly PeriodPreset[] = ['t12m', 'ytd', 'lastQuarter', 't6m', 't3m', 'custom']

const pays = new WeakMap<AnalyticsContext, AnalyticsContext>()

/** The live context with pay amounts and immigration details off (the same object when both are off). */
export function chatContext(live: AnalyticsContext): AnalyticsContext {
  if (!live.showPay && !live.showImmigration) return live
  let out = pays.get(live)
  if (!out) {
    out = { ...live, showPay: false, showImmigration: false }
    pays.set(live, out)
  }
  return out
}

const scoped = new WeakMap<AnalyticsContext, Map<string, AnalyticsContext>>()

const hasValue = (f: Filters, d: FilterDimension): boolean =>
  d === 'leaderId' ? !!f.leaderId : f[d].length > 0

const filterKey = (f: Filters): string =>
  JSON.stringify([
    f.period,
    f.customStart,
    f.customEnd,
    f.leaderId,
    [...f.businessUnit].sort(),
    [...f.department].sort(),
    [...f.location].sort(),
    [...f.level].sort(),
    // Only the modes of dimensions with values change who is in scope.
    EXCLUDE_ARGS.map((a) => EXCLUDE_DIM[a]).filter((d) => isExcluded(f, d) && hasValue(f, d)),
  ])

/** The context for other filters, built from `base` (cached; `base` itself when the filters are its own). */
export function contextFor(base: AnalyticsContext, asked: Filters): AnalyticsContext {
  // Manager mode: every scope stays inside the manager's org (defensive; resolveFilters clamps).
  const filters = base.access?.lock ? clampFilters(asked, base.access.lock) : asked
  const key = filterKey(filters)
  if (key === filterKey(base.filters)) return base
  let byKey = scoped.get(base)
  if (!byKey) {
    byKey = new Map()
    scoped.set(base, byKey)
  }
  let out = byKey.get(key)
  if (!out) {
    const { current, prior } = periodWindows(filters.period, base.asOf, {
      start: filters.customStart,
      end: filters.customEnd,
    })
    out = {
      ...base,
      filters,
      window: current,
      prior,
      scopeLabel: scopeLabel(filters, base.org),
      isCompany: !hasOrgFilter(filters),
      data: scopeDatasets(base.all, filters, base.org),
    }
    byKey.set(key, out)
  }
  return out
}

/** Distinct values of an org dimension across the roster and requisitions, in a stable order. */
export function dimensionValues(
  ctx: AnalyticsContext,
  dim: 'businessUnit' | 'department' | 'location' | 'level',
) {
  const seen = new Set<string>()
  for (const e of ctx.all.employees) {
    const v = e[dim]
    if (typeof v === 'string' && v) seen.add(v)
  }
  for (const r of ctx.all.requisitions) {
    const v = r[dim]
    if (typeof v === 'string' && v) seen.add(v)
  }
  const out = [...seen]
  return dim === 'level'
    ? out.sort((a, b) => levelIndex(a) - levelIndex(b) || a.localeCompare(b))
    : out.sort((a, b) => a.localeCompare(b))
}

export type FilterResult = { ok: true; filters: Filters } | { ok: false; error: string }

const DIMS = [
  ['business_unit', 'businessUnit', 'business unit'],
  ['department', 'department', 'department'],
  ['location', 'location', 'location'],
  ['level', 'level', 'level'],
] as const

/**
 * The filters a tool call asks for. Omitted: the user's own, unless one of their exclusions breaks
 * the anonymity rule (`ownScopeProblem`). Given: they replace the user's org filters (a dimension
 * left out means no filter on it), and the period is the user's unless given. Values are matched
 * to the data's own spelling; an unknown value is an error naming the values that exist, so Claude
 * can correct itself.
 */
export function resolveFilters(base: AnalyticsContext, input: unknown, tokens: TokenMap): FilterResult {
  const r = resolveAsked(base, input, tokens)
  const lock = base.access?.lock
  // Manager mode (docs/ROLES.md, 4.7): the result goes through the same clamp as every other scope.
  return r.ok && lock ? { ok: true, filters: clampFilters(r.filters, lock) } : r
}

/** Why Ask is off for this context, or null (Manager mode needs an org of the anonymity minimum). */
export function askOffReason(ctx: Pick<AnalyticsContext, 'access' | 'metrics'>): string | null {
  const lock = ctx.access?.lock
  if (!lock) return null
  const min = minGroupOf(ctx.metrics)
  return lock.size < min ? askOrgTooSmall(min) : null
}

function resolveAsked(base: AnalyticsContext, input: unknown, tokens: TokenMap): FilterResult {
  if (input == null) {
    const own = ownScopeProblem(base, tokens)
    return own ? { ok: false, error: own } : { ok: true, filters: base.filters }
  }
  const lock = base.access?.lock ?? null
  if (typeof input !== 'object' || Array.isArray(input))
    return { ok: false, error: 'filters must be an object.' }
  const f = input as Record<string, unknown>
  const known = new Set([
    'leader',
    'business_unit',
    'department',
    'location',
    'level',
    'period',
    'start',
    'end',
    'exclude',
  ])
  const unknownKeys = Object.keys(f).filter((k) => !known.has(k))
  if (unknownKeys.length)
    return {
      ok: false,
      error: `Unknown filter ${unknownKeys.map((k) => `"${k}"`).join(', ')}. Filters are leader, business_unit, department, location, level, period, start, end and exclude.`,
    }
  // Exclude: the dimensions whose values are left out. Each must also be given values.
  const modes: FilterModes = {}
  if (f.exclude != null) {
    const list = Array.isArray(f.exclude) ? f.exclude : [f.exclude]
    for (const a of list) {
      if (typeof a !== 'string' || !(EXCLUDE_ARGS as readonly string[]).includes(a))
        return {
          ok: false,
          error: `exclude takes the names of filters to leave out: ${EXCLUDE_ARGS.join(', ')}.`,
        }
      const v = f[a]
      if (v == null || v === '' || (Array.isArray(v) && !v.length))
        return {
          ok: false,
          error: `exclude names ${a}, but no ${a} is given. Give the values to leave out in ${a} as well.`,
        }
      if (a === 'leader' && lock)
        return {
          ok: false,
          error: `In Manager mode the scope is ${tokens.forEmployee(lock.managerId)}'s org, so a leader cannot be left out. Narrow to a leader inside it instead.`,
        }
      modes[EXCLUDE_DIM[a as ExcludeArg]] = 'exclude'
    }
  }
  const out: Filters = {
    period: base.filters.period,
    customStart: base.filters.customStart,
    customEnd: base.filters.customEnd,
    // Manager mode: no leader means the manager's org, never the whole company.
    leaderId: lock ? lock.managerId : null,
    businessUnit: [],
    department: [],
    location: [],
    level: [],
    modes,
  }
  if (f.leader != null && f.leader !== '') {
    if (typeof f.leader !== 'string')
      return { ok: false, error: 'leader must be a person token such as {{P3}}.' }
    const id = tokens.employeeIdOf(f.leader)
    if (!id || !base.org.byId.has(id))
      return {
        ok: false,
        error: `leader "${f.leader}" is not a person token for someone on the roster. Use a leader token from get_context.`,
      }
    if (lock && !lock.orgIds.has(id))
      return {
        ok: false,
        error: `In Manager mode a leader filter must be someone in ${tokens.forEmployee(lock.managerId)}'s org.`,
      }
    const problem = leaderProblem(base, id, f.leader)
    if (problem) return { ok: false, error: problem }
    out.leaderId = id
  }
  for (const [arg, dim, word] of DIMS) {
    const raw = f[arg]
    if (raw == null) continue
    const list = Array.isArray(raw) ? raw : [raw]
    if (!list.every((v) => typeof v === 'string'))
      return { ok: false, error: `${arg} must be a list of names.` }
    const values = dimensionValues(base, dim)
    const byLower = new Map(values.map((v) => [v.toLowerCase(), v]))
    if (dim === 'level')
      for (const [code, label] of Object.entries(LEVEL_LABELS))
        byLower.set(label.toLowerCase(), code as Level)
    const picked: string[] = []
    for (const v of list as string[]) {
      const hit = byLower.get(v.trim().toLowerCase())
      if (!hit)
        return {
          ok: false,
          error: `No ${word} "${v}" in the data. ${capFirst(word)}s: ${values.slice(0, 40).join(', ')}${values.length > 40 ? ' ...' : ''}.`,
        }
      if (!picked.includes(hit)) picked.push(hit)
    }
    out[dim] = picked
  }
  if (f.period != null) {
    if (!PERIODS.includes(f.period as PeriodPreset))
      return { ok: false, error: `period must be one of ${PERIODS.join(', ')}.` }
    out.period = f.period as PeriodPreset
    if (out.period !== 'custom') {
      out.customStart = null
      out.customEnd = null
    }
  }
  if (f.start != null || f.end != null || out.period === 'custom') {
    const start = f.start ?? out.customStart
    const end = f.end ?? out.customEnd
    if (
      typeof start !== 'string' ||
      typeof end !== 'string' ||
      !isCalendarDate(start) ||
      !isCalendarDate(end)
    )
      return { ok: false, error: 'A custom period needs start and end as YYYY-MM-DD.' }
    if (start > end) return { ok: false, error: 'start must be on or before end.' }
    if (end > base.asOf) return { ok: false, error: `end must be on or before the as-of date, ${base.asOf}.` }
    out.period = 'custom'
    out.customStart = start
    out.customEnd = end
  }
  const left = exclusionProblem(base, out, tokens)
  if (left) return { ok: false, error: left }
  return { ok: true, filters: out }
}

/**
 * The first excluded value of a scope that removes between 1 and the anonymity minimum − 1 active
 * employees from it (checked value by value), in words with a leader as a token; null when none.
 */
function smallExclusionWords(
  base: Pick<AnalyticsContext, 'all' | 'org' | 'asOf' | 'metrics'>,
  filters: Filters,
  tokens: TokenMap,
): string | null {
  const min = minGroupOf(base.metrics)
  // The same rule as the records panel's "Leave out" (src/data/exclusion.ts), in filter-row order.
  const [hit] = smallExcludedValues(activeEmployees(base.all.employees, base.asOf), filters, base.org, min)
  if (!hit) return null
  return hit.dim === 'leaderId' ? `${tokens.forEmployee(hit.value)}'s org` : hit.value
}

/**
 * Why a scope's exclusions can't be used, or null. Leaving out a group of fewer people than the
 * anonymity minimum would let the scope be compared with the same scope without the exclusion,
 * and the difference is that small group: so each excluded value must remove none, or at least
 * the minimum, of the active employees the scope would have without it. Value by value, so a
 * small value can't hide behind a large one left out with it. (An excluded leader also passes the
 * leader checks, in `resolveFilters`.)
 */
export function exclusionProblem(
  base: Pick<AnalyticsContext, 'all' | 'org' | 'asOf' | 'metrics'>,
  filters: Filters,
  tokens: TokenMap,
): string | null {
  const what = smallExclusionWords(base, filters, tokens)
  if (!what) return null
  const min = minGroupOf(base.metrics)
  return `Leaving out ${what} removes fewer than ${min} people from the scope, the anonymity minimum, so it could single them out by comparison with the scope without it. Leave it in, or leave out a larger group.`
}

/**
 * Why the user's own scope can't be used, or null: the same rule as tool filters. A tool call can
 * ask for the scope without the user's exclusion, so comparing the two would single out the few
 * people it leaves out.
 */
export function ownScopeProblem(
  base: Pick<AnalyticsContext, 'all' | 'org' | 'asOf' | 'metrics' | 'filters'>,
  tokens: TokenMap,
): string | null {
  const what = smallExclusionWords(base, base.filters, tokens)
  if (!what) return null
  const min = minGroupOf(base.metrics)
  return `The user's scope leaves out ${what}, which removes fewer than ${min} people from it, the anonymity minimum, so Ask does not answer within that scope: comparing it with the scope without that exclusion would single them out. Pass filters for another scope, or ask the user to change the filter row.`
}

const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const leaderSizes = new WeakMap<object, Map<string, ReadonlyMap<string, number>>>()

/**
 * The people a scope may be cut to by leader, with the size of their org: the leaders the app's
 * own leader filter offers (active, leading 3 or more people). Anyone else (an individual
 * contributor, a leaver, a manager of one or two) would make the scope one person or a couple.
 */
export function leaderSizesOf(base: Pick<AnalyticsContext, 'org' | 'asOf'>): ReadonlyMap<string, number> {
  let byAsOf = leaderSizes.get(base.org)
  if (!byAsOf) {
    byAsOf = new Map()
    leaderSizes.set(base.org, byAsOf)
  }
  let out = byAsOf.get(base.asOf)
  if (!out) {
    out = new Map(leaderOptions(base.org, base.asOf).map((l) => [l.id, l.size]))
    byAsOf.set(base.asOf, out)
  }
  return out
}

/**
 * Why someone cannot be a leader filter in Ask, or null when they can: they must be a leader the
 * app's leader filter offers, with an org at least the anonymity minimum.
 */
export function leaderProblem(
  base: Pick<AnalyticsContext, 'org' | 'asOf' | 'metrics'>,
  id: string,
  token: string,
): string | null {
  const size = leaderSizesOf(base).get(id)
  const min = minGroupOf(base.metrics)
  if (size == null)
    return `${token} is not a leader: a leader filter takes someone active who leads 3 or more people, as the app's leader filter does. Use a leader token from get_context.`
  if (size < min)
    return `${token}'s org has fewer than ${min} people, the anonymity minimum, so it cannot be a scope on its own. Use a larger org.`
  return null
}

/**
 * The scope in words with the leader as a token: "{{P3}}'s org · Bengaluru", "Whole company",
 * "Whole company except Sales", or "Silicon Engineering · not Bengaluru".
 */
export function scopeWords(filters: Filters, tokens: TokenMap): string {
  const inc: string[] = []
  const exc: string[] = []
  if (filters.leaderId) {
    const org = `${tokens.forEmployee(filters.leaderId)}'s org`
    if (isExcluded(filters, 'leaderId')) exc.push(org)
    else inc.push(org)
  }
  for (const d of ['businessUnit', 'department', 'location', 'level'] as const) {
    const list = filters[d]
    if (!list.length) continue
    if (isExcluded(filters, d)) exc.push(list.join(', '))
    else inc.push(list.join(', '))
  }
  if (!inc.length && !exc.length) return 'Whole company'
  if (!inc.length) return `Whole company except ${exc.join('; ')}`
  return [...inc, ...exc.map((x) => `not ${x}`)].join(' · ')
}

/** The scope and period of a context as tool output. */
export function scopeOut(ctx: AnalyticsContext, tokens: TokenMap) {
  const f = ctx.filters
  return {
    scope: scopeWords(f, tokens),
    filters: {
      leader: f.leaderId ? tokens.forEmployee(f.leaderId) : null,
      business_unit: f.businessUnit,
      department: f.department,
      location: f.location,
      level: f.level,
      // The filters above whose values are left out ("everyone except"), as the tools name them.
      exclude: EXCLUDE_ARGS.filter((a) => isExcluded(f, EXCLUDE_DIM[a]) && hasValue(f, EXCLUDE_DIM[a])),
    },
    period: {
      preset: f.period,
      label: PERIOD_LABELS[f.period],
      start: ctx.window.start,
      end: ctx.window.end,
    },
    comparison: { start: ctx.prior.start, end: ctx.prior.end },
  }
}

/** For progress lines: " for Bengaluru", " for {{P3}}'s org", or "" for the user's own scope. */
export function scopePhrase(base: AnalyticsContext, input: unknown, tokens: TokenMap): string {
  if (input == null) return ''
  const r = resolveFilters(base, input, tokens)
  if (!r.ok) return ''
  const words = scopeWords(r.filters, tokens).replace(/^Whole company/, 'the whole company')
  return ` for ${words.replaceAll(' · ', ', ')}`
}
