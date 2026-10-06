/**
 * The scope in the address (docs/FILTERS.md, part 1). Pure.
 *
 * The route stays as it was (`#view.tab`, with the views' own suffixes such as
 * `#data.metrics/hrbp/attrition/voluntary` or `#ai.agents:compliance`); the scope follows a `?` at
 * the end of the hash, written with URLSearchParams:
 *
 *   #hrbp.attrition?period=t6m&bu=Silicon+Engineering&dept=Design+Verification&level=L4
 *
 * Keys: `period`, `from` and `to` (custom only), `leader` (an employee ID, never a name), `bu`,
 * `dept`, `loc`, `level` (repeated for several values), `not` (the dimensions in exclude mode),
 * `std` (the data standard, when not the default) and `lens=1` (the data quality lens). Defaults
 * are left out, so the whole company over the last 12 months is just `#hrbp.attrition`; a link that
 * must reset a recipient's filters says `scope=all`. The hash never reaches a server.
 */
import { formatDate, isCalendarDate } from '@/lib/dates'
import { type DataStandard, DEFAULT_STANDARD, isDataStandard } from './quality/tier'
import type { Datasets, ISODate } from './schema'
import {
  canonicalFilters,
  DEFAULT_FILTERS,
  dropIdleModes,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type FilterModes,
  type Filters,
  isExcluded,
  LIST_DIMENSIONS,
  type ListDimension,
  type PeriodPreset,
  sameFilters,
} from './scope'

/** Everything the address carries besides the route. */
export interface UrlScope {
  filters: Filters
  standard: DataStandard
  /** The data quality lens (the view header's "Show data quality"). */
  lens: boolean
}

export const DEFAULT_SCOPE: UrlScope = { filters: DEFAULT_FILTERS, standard: DEFAULT_STANDARD, lens: false }

/** The parameter name of each org filter. */
export const DIM_PARAM: Record<FilterDimension, string> = {
  leaderId: 'leader',
  businessUnit: 'bu',
  department: 'dept',
  location: 'loc',
  level: 'level',
}
const PARAM_DIM = new Map<string, FilterDimension>(
  FILTER_DIMENSIONS.map((d) => [DIM_PARAM[d], d] as [string, FilterDimension]),
)

/** Every key the scope uses; a query with any of them is a scope. */
export const SCOPE_KEYS: readonly string[] = [
  'scope',
  'period',
  'from',
  'to',
  ...FILTER_DIMENSIONS.map((d) => DIM_PARAM[d]),
  'not',
  'std',
  'lens',
]

const PERIODS: readonly PeriodPreset[] = ['t12m', 'ytd', 'lastQuarter', 't6m', 't3m', 'custom']

/** The route part and the query part of a hash: "#hrbp.attrition?bu=X" → "hrbp.attrition", "bu=X". */
export function splitHash(hash: string): { route: string; query: string | null } {
  const h = hash.replace(/^#/, '')
  const at = h.indexOf('?')
  return at < 0 ? { route: h, query: null } : { route: h.slice(0, at), query: h.slice(at + 1) }
}

/**
 * The scope as query parameters, in a fixed order with defaults left out. `explicit` writes
 * `scope=all` when everything is at its default, so a copied link resets the recipient's filters.
 */
export function scopeParams(scope: UrlScope, opts: { explicit?: boolean } = {}): URLSearchParams {
  // Idle modes and stray custom dates drop out; values keep the order they were picked in.
  const f = canonicalFilters(scope.filters)
  const p = new URLSearchParams()
  if (f.period !== 't12m') p.append('period', f.period)
  if (f.period === 'custom') {
    if (f.customStart) p.append('from', f.customStart)
    if (f.customEnd) p.append('to', f.customEnd)
  }
  if (f.leaderId) p.append('leader', f.leaderId)
  for (const d of LIST_DIMENSIONS) for (const v of new Set(scope.filters[d])) p.append(DIM_PARAM[d], v)
  for (const d of FILTER_DIMENSIONS) if (isExcluded(f, d)) p.append('not', DIM_PARAM[d])
  if (scope.standard !== DEFAULT_STANDARD) p.append('std', scope.standard)
  if (scope.lens) p.append('lens', '1')
  if (opts.explicit && ![...p.keys()].length) p.append('scope', 'all')
  return p
}

/** The query string for a scope ('' at the defaults unless `explicit`). */
export const scopeQuery = (scope: UrlScope, opts: { explicit?: boolean } = {}): string =>
  scopeParams(scope, opts).toString()

/** "#view.tab" plus "?scope" when there is one. `route` is the hash route without "#" or "?". */
export function hashWithScope(route: string, scope: UrlScope, opts: { explicit?: boolean } = {}): string {
  const q = scopeQuery(scope, opts)
  return `#${route}${q ? `?${q}` : ''}`
}

/** A value a link named that this browser's data doesn't have. */
export interface LeftOut {
  dim: FilterDimension
  value: string
}

export interface ReadScope {
  /** The query names a scope (any scope key); false means "keep your own filters". */
  present: boolean
  scope: UrlScope
  /** Parts that could not be read (a period or date that isn't one); they were left at the default. */
  unreadable: string[]
}

/**
 * The scope a query names. Missing keys take their defaults (a link applies exactly its scope);
 * values that can't be read are left at the default and listed in `unreadable`. With no scope key
 * at all, `present` is false and `scope` is the defaults.
 */
export function readScope(query: string | null | undefined): ReadScope {
  const p = new URLSearchParams(query ?? '')
  const present = SCOPE_KEYS.some((k) => p.has(k))
  const unreadable: string[] = []
  const filters: Filters = { ...DEFAULT_FILTERS, modes: {} }
  const period = p.get('period')
  if (period != null) {
    if (PERIODS.includes(period as PeriodPreset)) filters.period = period as PeriodPreset
    else unreadable.push(`period "${period}"`)
  }
  if (filters.period === 'custom') {
    const from = p.get('from')
    const to = p.get('to')
    // Real calendar dates only: "2026-02-30" is not one.
    if (isCalendarDate(from) && isCalendarDate(to) && from <= to) {
      filters.customStart = from
      filters.customEnd = to
    } else {
      unreadable.push('custom dates')
      filters.period = 't12m'
    }
  }
  const leader = p.get('leader')
  if (leader) filters.leaderId = leader
  for (const d of LIST_DIMENSIONS) {
    const vs = [...new Set(p.getAll(DIM_PARAM[d]).filter((v) => v !== ''))]
    filters[d] = vs
  }
  const modes: FilterModes = {}
  for (const n of p.getAll('not')) {
    const d = PARAM_DIM.get(n)
    if (d) modes[d] = 'exclude'
  }
  filters.modes = modes
  // A mode without values filters nothing, and the address never writes one.
  const read = dropIdleModes(filters)
  const std = p.get('std')
  let standard: DataStandard = DEFAULT_STANDARD
  if (std != null) {
    if (isDataStandard(std)) standard = std
    else unreadable.push(`data standard "${std}"`)
  }
  return { present, scope: { filters: read, standard, lens: p.get('lens') === '1' }, unreadable }
}

/** What the loaded data has, to check a link's values against. */
export interface ScopeVocabulary {
  /** The employee ID is on the roster. */
  hasLeader: (id: string) => boolean
  /** The value occurs in the data for this dimension. */
  hasValue: (dim: ListDimension, value: string) => boolean
  /** The reporting date: a custom period may not end after it (there is no data past it). */
  asOf?: ISODate
}

const vocabularies = new WeakMap<object, ScopeVocabulary>()

/**
 * What the loaded data has: leaders on the roster, and each dimension's values on employees,
 * requisitions and hiring plan lines (built once per dataset object).
 */
export function vocabularyOf(ctx: {
  all: Pick<Datasets, 'employees' | 'requisitions' | 'hiringPlan'>
  org: { byId: ReadonlyMap<string, unknown> }
  asOf?: ISODate
}): ScopeVocabulary {
  // The org index is built from the same employees, so one vocabulary per dataset object.
  const cached = vocabularies.get(ctx.all)
  if (cached) return withAsOf(cached, ctx.asOf)
  const sets = new Map<ListDimension, Set<string>>()
  const valuesOf = (dim: ListDimension) => {
    let s = sets.get(dim)
    if (!s) {
      const out = new Set<string>()
      const add = (v: string | null | undefined) => {
        if (v) out.add(v)
      }
      for (const e of ctx.all.employees) add(e[dim])
      for (const r of ctx.all.requisitions) add(r[dim])
      for (const p of ctx.all.hiringPlan) add(p[dim])
      sets.set(dim, out)
      s = out
    }
    return s
  }
  const v: ScopeVocabulary = {
    hasLeader: (id) => ctx.org.byId.has(id),
    hasValue: (dim, x) => valuesOf(dim).has(x),
  }
  vocabularies.set(ctx.all, v)
  return withAsOf(v, ctx.asOf)
}

const withAsOf = (v: ScopeVocabulary, asOf: ISODate | undefined): ScopeVocabulary =>
  asOf ? { ...v, asOf } : v

/** Why a scope's custom period can't be used as it is: dates that are not dates, or past the reporting date. */
export type PeriodProblem =
  | { kind: 'dates' }
  /** It ended after the reporting date: it now ends on it. */
  | { kind: 'clamped'; asOf: ISODate }
  /** It started after the reporting date: the default period applies. */
  | { kind: 'after'; asOf: ISODate }

/**
 * The scope without the values the data doesn't have (and which ones those were), and with a
 * custom period the period control would accept: real dates, the start on or before the end, and
 * not past the reporting date (a later end would report invented zeros and annualize real events
 * over empty months). A period that ends after it is cut to end on it; one that starts after it,
 * or has no readable dates, gives way to the default. A mode left without values is dropped.
 */
export function checkScope(
  scope: UrlScope,
  vocab: ScopeVocabulary,
): { scope: UrlScope; leftOut: LeftOut[]; period: PeriodProblem | null } {
  const leftOut: LeftOut[] = []
  let period: PeriodProblem | null = null
  const f: Filters = { ...scope.filters }
  if (f.period === 'custom') {
    const { customStart: start, customEnd: end } = f
    const asOf = vocab.asOf
    if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) period = { kind: 'dates' }
    else if (asOf && start > asOf) period = { kind: 'after', asOf }
    else if (asOf && end > asOf) {
      period = { kind: 'clamped', asOf }
      f.customEnd = asOf
    }
    if (period && period.kind !== 'clamped') {
      f.period = DEFAULT_FILTERS.period
      f.customStart = null
      f.customEnd = null
    }
  }
  if (f.leaderId && !vocab.hasLeader(f.leaderId)) {
    leftOut.push({ dim: 'leaderId', value: f.leaderId })
    f.leaderId = null
  }
  for (const d of LIST_DIMENSIONS) {
    const keep: string[] = []
    for (const v of f[d]) {
      if (vocab.hasValue(d, v)) keep.push(v)
      else leftOut.push({ dim: d, value: v })
    }
    f[d] = keep
  }
  const out = dropIdleModes(f)
  const changed = leftOut.length > 0 || period != null || out !== f
  return { scope: changed ? { ...scope, filters: out } : scope, leftOut, period }
}

/**
 * The toast line for a custom period that was changed: "The link's custom period ends after the
 * reporting date, 30 Sep 2026, so it ends there instead." `source` names where the scope came from.
 */
export function periodMessage(problem: PeriodProblem, source = "The link's"): string {
  if (problem.kind === 'dates')
    return `${source} custom dates could not be read, so the default period was used.`
  const date = formatDate(problem.asOf)
  return problem.kind === 'clamped'
    ? `${source} custom period ends after the reporting date, ${date}, so it ends there instead.`
    : `${source} custom period starts after the reporting date, ${date}, so the default period was used.`
}

const DIM_WORD: Record<FilterDimension, [string, string]> = {
  leaderId: ['leader', 'leaders'],
  businessUnit: ['business unit', 'business units'],
  department: ['department', 'departments'],
  location: ['location', 'locations'],
  level: ['level', 'levels'],
}

const andList = (xs: readonly string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/**
 * "The link's department Photonics is not in your data, so it was left out." Leaders are named by
 * their employee ID (the link carries no names). `source` names where the scope came from.
 */
export function leftOutMessage(leftOut: readonly LeftOut[], source = "The link's"): string {
  if (!leftOut.length) return ''
  const groups: string[] = []
  for (const d of FILTER_DIMENSIONS) {
    const vs = leftOut
      .filter((x) => x.dim === d)
      .map((x) => (d === 'leaderId' ? `with ID ${x.value}` : x.value))
    if (!vs.length) continue
    groups.push(`${DIM_WORD[d][vs.length === 1 ? 0 : 1]} ${andList(vs)}`)
  }
  const one = leftOut.length === 1
  return `${source} ${andList(groups)} ${one ? 'is' : 'are'} not in your data, so ${one ? 'it was' : 'they were'} left out.`
}

/** The same scope: the same people over the same window (value order aside), standard and lens. */
export const sameScope = (a: UrlScope, b: UrlScope): boolean =>
  a.standard === b.standard && a.lens === b.lens && sameFilters(a.filters, b.filters)
