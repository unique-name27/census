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
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { LEVEL_LABELS, type Level, levelIndex } from '@/data/schema'
import {
  type Filters,
  hasOrgFilter,
  PERIOD_LABELS,
  type PeriodPreset,
  periodWindows,
  scopeDatasets,
  scopeLabel,
} from '@/data/scope'
import { isValidDate } from '@/lib/dates'
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
  ])

/** The context for other filters, built from `base` (cached; `base` itself when the filters are its own). */
export function contextFor(base: AnalyticsContext, filters: Filters): AnalyticsContext {
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
 * The filters a tool call asks for. Omitted: the user's own. Given: they replace the user's org
 * filters (a dimension left out means no filter on it), and the period is the user's unless given.
 * Values are matched to the data's own spelling; an unknown value is an error naming the values
 * that exist, so Claude can correct itself.
 */
export function resolveFilters(base: AnalyticsContext, input: unknown, tokens: TokenMap): FilterResult {
  if (input == null) return { ok: true, filters: base.filters }
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
  ])
  const unknownKeys = Object.keys(f).filter((k) => !known.has(k))
  if (unknownKeys.length)
    return {
      ok: false,
      error: `Unknown filter ${unknownKeys.map((k) => `"${k}"`).join(', ')}. Filters are leader, business_unit, department, location, level, period, start and end.`,
    }
  const out: Filters = {
    period: base.filters.period,
    customStart: base.filters.customStart,
    customEnd: base.filters.customEnd,
    leaderId: null,
    businessUnit: [],
    department: [],
    location: [],
    level: [],
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
    if (typeof start !== 'string' || typeof end !== 'string' || !isValidDate(start) || !isValidDate(end))
      return { ok: false, error: 'A custom period needs start and end as YYYY-MM-DD.' }
    if (start > end) return { ok: false, error: 'start must be on or before end.' }
    if (end > base.asOf) return { ok: false, error: `end must be on or before the as-of date, ${base.asOf}.` }
    out.period = 'custom'
    out.customStart = start
    out.customEnd = end
  }
  return { ok: true, filters: out }
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

/** The scope in words with the leader as a token: "{{P3}}'s org · Bengaluru", or "Whole company". */
export function scopeWords(filters: Filters, tokens: TokenMap): string {
  const parts: string[] = []
  if (filters.leaderId) parts.push(`${tokens.forEmployee(filters.leaderId)}'s org`)
  for (const list of [filters.businessUnit, filters.department, filters.location, filters.level])
    if (list.length) parts.push(list.join(', '))
  return parts.length ? parts.join(' · ') : 'Whole company'
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
  const words = scopeWords(r.filters, tokens)
  return words === 'Whole company' ? ' for the whole company' : ` for ${words.replaceAll(' · ', ', ')}`
}
