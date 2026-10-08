/**
 * Options and validation for the filter row. Org options are built from the unscoped roster as of
 * the reporting date.
 * Pure functions; every count is active employees (contractors and interns excluded), the same
 * population as `headcountAt` in src/lib/people.ts.
 */

import type { AccessContext } from '@/access/context'
import type { Mode } from '@/access/modes'
import { clampFilters, FILTER_DIMS_OF } from '@/access/scopes/clamp'
import { type FilterControl, S } from '@/access/surfaces'
import { type Employee, type ISODate, LEVEL_LABELS, type Level, levelIndex } from '@/data/schema'
import {
  DEFAULT_FILTERS,
  employeeMatcher,
  type Filters,
  isActiveAt,
  isEmployee,
  isExcluded,
  type OrgIndex,
} from '@/data/scope'
import { formatDate, formatMonthShort, isCalendarDate, isValidDate } from '@/lib/dates'

export type DimensionKey = 'businessUnit' | 'department' | 'location' | 'level'
export const DIMENSIONS: DimensionKey[] = ['businessUnit', 'department', 'location', 'level']

export interface DimensionOption {
  value: string
  label: string
  /** Active employees with this value on the as-of date. */
  count: number
  /** Can't be picked right now (excluding a group too small to leave out, `tooFewToLeaveOut`). */
  disabled?: boolean
}

export interface LeaderOption {
  id: string
  name: string
  title: string
  /** Active employees in the leader's org, the leader included (the scope size once selected). */
  size: number
  /** Can't be picked right now (excluding an org too small to leave out, `tooFewToLeaveOut`). */
  disabled?: boolean
}

/**
 * Exclude mode: whether leaving out a choice that removes `count` active employees from the scope
 * breaks the anonymity rule for exclusions (src/data/exclusion.ts): it removes some, but fewer
 * than the minimum, so comparing the scope with and without it would single them out. Ask refuses
 * such a scope and the records panel never offers it, so the filter menus don't either. An
 * option's count in Exclude mode is exactly who it removes: the other filters apply, and nobody
 * has two values of one dimension.
 */
export const tooFewToLeaveOut = (count: number, min: number): boolean => count > 0 && count < min

const counted = (e: Employee, asOf: ISODate) => isEmployee(e) && isActiveAt(e, asOf)

/** Display label for a dimension value (levels get their long label, e.g. "L4 Senior"). */
export function dimensionValueLabel(key: DimensionKey, value: string): string {
  return key === 'level' ? (LEVEL_LABELS[value as Level] ?? value) : value
}

/**
 * Distinct values of one org dimension with active-employee counts. Values that are selected but
 * no longer present (e.g. after an upload) are kept with a count of 0 so they can be cleared.
 * Levels follow the career ladder; everything else is alphabetical.
 *
 * `within` is the rest of the filter row (the leader and the other dimensions): counts are of the
 * people it lets through, so a count says how many would be in scope after picking the value.
 * Values with nobody left stay listed, with 0, after the others.
 */
export function dimensionOptions(
  employees: readonly Employee[],
  asOf: ISODate,
  key: DimensionKey,
  selected: readonly string[] = [],
  within?: (e: Employee) => boolean,
): DimensionOption[] {
  const counts = new Map<string, number>()
  for (const e of employees) {
    if (!counted(e, asOf)) continue
    const v = e[key]
    if (typeof v !== 'string' || !v) continue
    counts.set(v, (counts.get(v) ?? 0) + (!within || within(e) ? 1 : 0))
  }
  for (const v of selected) if (!counts.has(v)) counts.set(v, 0)
  const out = [...counts].map(([value, count]) => ({ value, label: dimensionValueLabel(key, value), count }))
  const empty = (o: DimensionOption) => (within && o.count === 0 ? 1 : 0)
  if (key === 'level') {
    const rank = (v: string) => {
      const i = levelIndex(v)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    return out.sort(
      (a, b) => empty(a) - empty(b) || rank(a.value) - rank(b.value) || a.label.localeCompare(b.label),
    )
  }
  return out.sort((a, b) => empty(a) - empty(b) || a.label.localeCompare(b.label))
}

/**
 * Whether a list filter offers its Include / Exclude switch in a mode: where the mode's clamp keeps
 * an exclusion. Finance filters by whole business units, so its clamp turns one into no filter and
 * its business unit menu is include only (docs/ROLES-V2.md 2.3 and 2.5).
 */
export function offersExclude(mode: Mode, key: DimensionKey): boolean {
  const probe: Filters = { ...DEFAULT_FILTERS, [key]: ['probe'], modes: { [key]: 'exclude' } }
  return isExcluded(clampFilters(probe, null, mode), key)
}

/** Which parts of the filter row a mode shows: its `filter:*` decisions, read in one place. */
export interface FilterRowParts {
  views: boolean
  period: boolean
  leader: boolean
  /** The leader filter's Include / Exclude switch (a list's switch also needs `offersExclude`). */
  leaderExclude: boolean
  /** The leader chips' chain of the leaders above (widening). */
  chain: boolean
  /** The list filters the row offers, in row order (Finance: business unit only). */
  dims: readonly DimensionKey[]
  inScope: boolean
  chips: boolean
  reset: boolean
  /** The data standard: a control, the saved one read only, or nothing. */
  standard: 'shown' | 'read-only' | 'hidden'
}

/**
 * The filter row for a mode (docs/ROLES-V2.md 2.5 and 4.10): each control follows its `filter:*`
 * decision (so the Security center's overrides reach the row), and the list filters are the mode's
 * dimensions (`FILTER_DIMS_OF`). Finance's row is the saved views, the period and the business
 * unit, include only. Pure.
 */
export function filterRowParts(access: Pick<AccessContext, 'mode' | 'decide'>): FilterRowParts {
  const can = (c: FilterControl) => access.decide(S.filter(c)).access !== 'hidden'
  const dims = FILTER_DIMS_OF[access.mode]
  const standard = access.decide(S.filter('standard')).access
  return {
    views: can('saved-views'),
    period: can('period'),
    leader: dims.includes('leaderId') && can('leader'),
    leaderExclude: can('exclude'),
    chain: can('chain'),
    dims: can('lists') ? DIMENSIONS.filter((k) => dims.includes(k)) : [],
    inScope: can('in-scope'),
    chips: can('chips'),
    reset: can('reset'),
    standard: standard === 'hidden' ? 'hidden' : standard === 'limited' ? 'read-only' : 'shown',
  }
}

/**
 * For each dimension, who the rest of the filter row lets through: the leader's org and every
 * other dimension's choice, leaving out the dimension's own (so its options can still widen it).
 */
export function otherFilters(
  filters: Filters,
  index: OrgIndex,
  key: DimensionKey | 'leaderId',
): (e: Employee) => boolean {
  return employeeMatcher(
    key === 'leaderId' ? { ...filters, leaderId: null } : { ...filters, [key]: [] },
    index,
  )
}

/**
 * Active employees in each person's org (themselves included), keyed by employee ID. Walks each
 * active employee up their manager chain once; cycle-safe.
 */
export function orgSizes(
  index: OrgIndex,
  asOf: ISODate,
  within?: (e: Employee) => boolean,
): Map<string, number> {
  const sizes = new Map<string, number>()
  const seen = new Set<string>()
  for (const e of index.byId.values()) {
    if (!counted(e, asOf) || (within && !within(e))) continue
    seen.clear()
    let cur: Employee | undefined = e
    while (cur && !seen.has(cur.employeeId)) {
      seen.add(cur.employeeId)
      sizes.set(cur.employeeId, (sizes.get(cur.employeeId) ?? 0) + 1)
      cur = cur.managerId && cur.managerId !== cur.employeeId ? index.byId.get(cur.managerId) : undefined
    }
  }
  return sizes
}

/**
 * People managers who are active on the as-of date and lead at least `minReports` active
 * employees (directly or indirectly), largest org first. With `within` (the rest of the filter
 * row, exclusions included), each size counts only the people it lets through: who would be in
 * scope after picking that leader.
 */
export function leaderOptions(
  index: OrgIndex,
  asOf: ISODate,
  minReports = 3,
  within?: (e: Employee) => boolean,
): LeaderOption[] {
  const sizes = orgSizes(index, asOf)
  const scoped = within ? orgSizes(index, asOf, within) : null
  const out: LeaderOption[] = []
  for (const e of index.byId.values()) {
    if (!isActiveAt(e, asOf)) continue
    const size = sizes.get(e.employeeId) ?? 0
    const reports = size - (isEmployee(e) ? 1 : 0)
    if (reports < minReports) continue
    out.push({
      id: e.employeeId,
      name: e.name || e.employeeId,
      title: e.jobTitle ?? '',
      size: scoped ? (scoped.get(e.employeeId) ?? 0) : size,
    })
  }
  return out.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
}

/**
 * Inside a business unit or region scope (docs/ROLES-V2.md 2.5): leaders with `minReports` or more
 * active employees inside the scope (themselves left out), largest first. Someone above the scope
 * whose org holds it qualifies, as the clamp allows. With `within` (the rest of the filter row),
 * each size counts the scope's people it lets through: who would be in scope after picking them.
 */
export function scopedLeaderOptions(
  index: OrgIndex,
  asOf: ISODate,
  inScope: (e: Employee) => boolean,
  minReports = 3,
  within?: (e: Employee) => boolean,
): LeaderOption[] {
  const inside = orgSizes(index, asOf, inScope)
  const sized = within ? orgSizes(index, asOf, (e) => inScope(e) && within(e)) : inside
  const out: LeaderOption[] = []
  for (const e of index.byId.values()) {
    if (!isActiveAt(e, asOf)) continue
    const reports = (inside.get(e.employeeId) ?? 0) - (counted(e, asOf) && inScope(e) ? 1 : 0)
    if (reports < minReports) continue
    out.push({
      id: e.employeeId,
      name: e.name || e.employeeId,
      title: e.jobTitle ?? '',
      size: sized.get(e.employeeId) ?? 0,
    })
  }
  return out.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
}

/** The management chain from the top of the org down to the leader (inclusive); cycle-safe. */
export function leaderChain(index: OrgIndex, leaderId: string): Employee[] {
  const chain: Employee[] = []
  const seen = new Set<string>()
  let cur = index.byId.get(leaderId)
  while (cur && !seen.has(cur.employeeId)) {
    seen.add(cur.employeeId)
    chain.push(cur)
    cur = cur.managerId && cur.managerId !== cur.employeeId ? index.byId.get(cur.managerId) : undefined
  }
  return chain.reverse()
}

/* ───────── period ───────── */

/** "Oct '25 – Sep '26", the compact hint next to each period preset. */
export const shortRange = (start: ISODate, end: ISODate): string =>
  `${formatMonthShort(start, true)} – ${formatMonthShort(end, true)}`

/**
 * Validation message for a custom range, or null when it can be applied. With `asOf`, the range
 * may not end after the reporting date: there is no data past it, so a later end would report
 * invented zeros and annualize real events over empty months.
 */
export function customRangeError(start: string, end: string, asOf?: ISODate): string | null {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return 'Enter both dates.'
  if (start > end) return 'The start date must be on or before the end date.'
  if (asOf && isValidDate(asOf) && end > asOf)
    return `The end date must be on or before the reporting date, ${formatDate(asOf)}.`
  return null
}
