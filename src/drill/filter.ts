/**
 * "Filter to this" (docs/FILTERS.md, part 4), the pure part: the filter that reproduces a group,
 * the two ways a group goes into the scope, when the records panel offers its actions, and their
 * labels. Pure.
 *
 * Records panel ("Filter to" and "Leave out", `narrowFilters` and `groupScopes`): the action
 * narrows the scope you are in. "Filter to X" keeps the people in both the scope and X; "Leave out
 * X" keeps the scope without X, so its numbers drop by exactly X's. Other filters stay as they
 * are. An action the filters can't say (one leader's org but not another's) or that changes
 * nothing, empties the scope, or would single out fewer people than the anonymity minimum is not
 * offered.
 *
 * Focus on (findings and person cards, `mergeFilter`): each org dimension the filter names
 * replaces that dimension's values and mode; a period it names replaces the period.
 */
import { clampFilters } from '@/access/lock'
import { describeFocus, type NameOf } from '@/components/filterLabels'
import type { AnalyticsContext } from '@/data/context'
import { activeEmployees, peopleIn, smallExcludedValues } from '@/data/exclusion'
import { DATASET_KEYS } from '@/data/schema'
import {
  employeeMatcher,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type FilterMode,
  type Filters,
  isExcluded,
  LIST_DIMENSIONS,
  type ListDimension,
  normalizeFilters,
  type OrgIndex,
  sameFilters,
  scopeDatasets,
  scopeLabel,
  subtreeIds,
  withMode,
} from '@/data/scope'
import type { ScopeVocabulary } from '@/data/urlScope'
import { minGroupOf } from '@/metrics/privacy'
import type { DrillFilter } from './types'

/**
 * Group names engines use for rows that are not one value: the folded "Other (k)" row, "Not
 * recorded", "No level", a dash. (A value the data doesn't have is caught by `filterInData`.)
 */
const NOT_A_GROUP = /^(other( \(\d+\))?|not recorded|no level|—|-|\(blank\))$/i

/**
 * The filter for one group of a filterable dimension, or undefined when the group is not one
 * ("Other", "Not recorded", a blank). Several values make one group too (`['L1', 'L2']`).
 */
export function groupFilter(
  dimension: FilterDimension,
  value: string | readonly string[] | null | undefined,
): DrillFilter | undefined {
  const values = (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '' && !NOT_A_GROUP.test(v.trim()),
  )
  if (!values.length || values.length !== (Array.isArray(value) ? value.length : 1)) return undefined
  if (dimension === 'leaderId') return values.length === 1 ? { leaderId: values[0] } : undefined
  return { [dimension]: [...new Set(values)] } as DrillFilter
}

/** A custom period for a month or quarter bar (inclusive ISO dates). */
export const periodFilter = (start: string, end: string): DrillFilter => ({
  period: 'custom',
  customStart: start,
  customEnd: end,
})

/** The org dimensions a filter sets a value for, in filter-row order. */
export function filterDimensions(patch: DrillFilter): FilterDimension[] {
  return FILTER_DIMENSIONS.filter((d) =>
    d === 'leaderId'
      ? typeof patch.leaderId === 'string' && patch.leaderId !== ''
      : (patch[d]?.length ?? 0) > 0,
  )
}

const setsPeriod = (patch: DrillFilter): boolean => patch.period !== undefined

/** Whether the filter names anything that can be applied. */
export const isFilterable = (patch: DrillFilter | null | undefined): patch is DrillFilter =>
  !!patch && (filterDimensions(patch).length > 0 || setsPeriod(patch))

/**
 * "Leave out" applies to one group of one dimension: leaving out "Silicon Engineering and Design
 * Verification" together has no single filter, and a period can't be left out.
 */
export const canLeaveOut = (patch: DrillFilter | null | undefined): boolean =>
  !!patch && filterDimensions(patch).length === 1 && !setsPeriod(patch)

/**
 * Focus on (findings' "Focus on", a person card's "Focus on their org"): the current filters with
 * a group merged in. `mode` sets the mode of every dimension the filter names; without it each
 * dimension takes the filter's own mode (include unless `modes` says exclude). Each named
 * dimension replaces that dimension's values and mode; keys the filter leaves out are untouched.
 */
export function mergeFilter(current: Filters, patch: DrillFilter, mode?: FilterMode): Filters {
  const next: Filters = { ...current }
  let modes = current.modes
  for (const d of FILTER_DIMENSIONS) {
    if (!(d in patch) || patch[d] === undefined) continue
    if (d === 'leaderId') next.leaderId = patch.leaderId ?? null
    else next[d] = [...(patch[d] as string[])]
    modes = withMode(modes, d, mode ?? (isExcluded(patch, d) ? 'exclude' : 'include'))
  }
  if (setsPeriod(patch)) {
    next.period = patch.period ?? next.period
    next.customStart = patch.period === 'custom' ? (patch.customStart ?? null) : null
    next.customEnd = patch.period === 'custom' ? (patch.customEnd ?? null) : null
  }
  next.modes = modes
  return normalizeFilters(next)
}

/** The records panel's two actions on a group. */
export type GroupAction = 'filterTo' | 'leaveOut'

/** One dimension after the action: its values (or leader) and mode, or null when the filters can't say it. */
type DimensionAfter = { values: string[]; mode: FilterMode } | null

/**
 * A list dimension after keeping (`out` false) or leaving out a group of values. Keeping: the
 * values in both the scope and the group (none left: the group is not in the scope). Leaving out:
 * an included list loses the group's values (none left: the scope would be empty), an excluded
 * list gains them.
 */
function listAfter(
  current: Filters,
  d: ListDimension,
  group: readonly string[],
  out: boolean,
): DimensionAfter {
  const now = current[d]
  const excluding = now.length > 0 && isExcluded(current, d)
  if (!out) {
    const values = !now.length
      ? [...group]
      : group.filter((v) => (excluding ? !now.includes(v) : now.includes(v)))
    return values.length ? { values, mode: 'include' } : null
  }
  if (!now.length) return { values: [...group], mode: 'exclude' }
  if (excluding) return { values: [...new Set([...now, ...group])], mode: 'exclude' }
  const values = now.filter((v) => !group.includes(v))
  return values.length ? { values, mode: 'include' } : null
}

/**
 * The leader filter after keeping or leaving out leader `id`'s org. There is one leader slot, so
 * when the current leader filter and the org overlap in a way one leader can't say ("L's org but
 * not M's", "neither L's nor M's"), or the result holds no one, it is null.
 */
function leaderAfter(current: Filters, id: string, out: boolean, org: OrgIndex): DimensionAfter {
  const lead = current.leaderId
  const one = (leaderId: string, mode: FilterMode): DimensionAfter => ({ values: [leaderId], mode })
  if (!lead) return one(id, out ? 'exclude' : 'include')
  const excluding = isExcluded(current, 'leaderId')
  const idInLead = subtreeIds(org, lead).has(id)
  const leadInId = subtreeIds(org, id).has(lead)
  if (!out) {
    if (!excluding) {
      if (idInLead) return one(id, 'include') // a narrower org (or the same one)
      if (leadInId) return one(lead, 'include') // the scope is already inside it
      return null // apart: no one is in both
    }
    // Inside the left-out org there is no one; around it, "M's org but not L's" needs two leaders.
    if (idInLead || leadInId) return null
    return one(id, 'include') // apart: M's org has no one from L's
  }
  if (excluding) {
    if (idInLead) return one(lead, 'exclude') // already left out
    if (leadInId) return one(id, 'exclude') // the wider org covers the one left out now
    return null // two orgs left out
  }
  if (leadInId) return null // leaving out the whole scope
  if (idInLead) return null // "L's org but not M's"
  return one(lead, 'include') // apart: none of it is in the scope
}

/**
 * The records panel's narrowing: the current scope kept to (`filterTo`) or without (`leaveOut`)
 * the group a drill names, or null when the filters can't say it or it would keep no one. A
 * dimension the filter itself excludes (`modes`) flips the action for that dimension. "Filter to"
 * also sets the period the filter names; "Leave out" takes one group of one dimension and no
 * period.
 */
export function narrowFilters(
  current: Filters,
  patch: DrillFilter,
  action: GroupAction,
  org: OrgIndex,
): Filters | null {
  if (action === 'leaveOut' ? !canLeaveOut(patch) : !isFilterable(patch)) return null
  const next: Filters = { ...current }
  let modes = current.modes
  for (const d of filterDimensions(patch)) {
    const out = (action === 'leaveOut') !== isExcluded(patch, d)
    const after =
      d === 'leaderId'
        ? leaderAfter(current, patch.leaderId as string, out, org)
        : listAfter(current, d, patch[d] as string[], out)
    if (!after) return null
    if (d === 'leaderId') next.leaderId = after.values[0]
    else next[d] = after.values
    modes = withMode(modes, d, after.mode)
  }
  if (action === 'filterTo' && setsPeriod(patch)) {
    next.period = patch.period ?? next.period
    next.customStart = patch.period === 'custom' ? (patch.customStart ?? null) : null
    next.customEnd = patch.period === 'custom' ? (patch.customEnd ?? null) : null
  }
  next.modes = modes
  return normalizeFilters(next)
}

/** What `groupScopes` reads from the analytics context. */
export type ScopeContext = Pick<AnalyticsContext, 'filters' | 'all' | 'data' | 'org' | 'asOf' | 'metrics'> &
  Partial<Pick<AnalyticsContext, 'access'>>

/** The scope each records-panel action would apply, or null when the panel doesn't offer it. */
export interface GroupScopes {
  filterTo: Filters | null
  leaveOut: Filters | null
}

const samePeriod = (a: Filters, b: Filters): boolean =>
  a.period === b.period &&
  (a.period !== 'custom' || (a.customStart === b.customStart && a.customEnd === b.customEnd))

/** Every dataset keeps every record (the scope is a narrowing, so equal counts mean the same rows). */
function sameRecords(ctx: ScopeContext, next: Filters): boolean {
  const data = scopeDatasets(ctx.all, next, ctx.org)
  return DATASET_KEYS.every((k) => data[k].length === ctx.data[k].length)
}

/**
 * Which of "Filter to" and "Leave out" the records panel offers for a drill's group, and the scope
 * each one applies (`narrowFilters`). Neither is offered when the filters can't say it or it
 * changes nothing. "Filter to" is also hidden when the group is the whole scope: a leader's org
 * that holds everyone in scope, or a group that keeps every record. "Leave out" is hidden when
 * it would leave no one, or remove fewer active employees than the anonymity minimum (comparing
 * the two scopes would single them out). Neither may add an exclusion that breaks that rule
 * (`smallExcludedValues`, the check Ask applies to its own scopes).
 */
export function groupScopes(ctx: ScopeContext, patch: DrillFilter): GroupScopes {
  const current = ctx.filters
  const min = minGroupOf(ctx.metrics)
  const people = activeEmployees(ctx.all.employees, ctx.asOf)
  // Exclusions already too small in the scope you are in (set in the filter row) don't hide the actions.
  const small = (f: Filters) => smallExcludedValues(people, f, ctx.org, min).map((x) => `${x.dim}:${x.value}`)
  let known: ReadonlySet<string> | null = null
  const safe = (next: Filters) => {
    known ??= new Set(small(current))
    const seen = known
    return small(next).every((k) => seen.has(k))
  }

  let filterTo = narrowFilters(current, patch, 'filterTo', ctx.org)
  if (filterTo && sameFilters(filterTo, current)) filterTo = null
  if (filterTo && samePeriod(filterTo, current)) {
    const ok = employeeMatcher(filterTo, ctx.org)
    let kept = 0
    for (const e of ctx.data.employees) if (ok(e)) kept++
    const samePeople = kept === ctx.data.employees.length
    const leaderOnly = filterDimensions(patch).every((d) => d === 'leaderId')
    if (samePeople && (leaderOnly || sameRecords(ctx, filterTo))) filterTo = null
  }
  if (filterTo && !safe(filterTo)) filterTo = null

  let leaveOut = narrowFilters(current, patch, 'leaveOut', ctx.org)
  if (leaveOut && sameFilters(leaveOut, current)) leaveOut = null
  if (leaveOut) {
    const before = peopleIn(people, current, ctx.org)
    const after = peopleIn(people, leaveOut, ctx.org)
    const removed = before - after
    if ((before > 0 && after === 0) || (removed > 0 && removed < min) || !safe(leaveOut)) leaveOut = null
  }
  // Manager mode (docs/ROLES.md, 3.13): only a scope the lock leaves unchanged (it stays inside the
  // org) is offered, and leaving out a leader never is.
  const lock = ctx.access?.lock
  if (lock) {
    if (filterTo && clampFilters(filterTo, lock) !== filterTo) filterTo = null
    if (leaveOut && (patch.leaderId || clampFilters(leaveOut, lock) !== leaveOut)) leaveOut = null
  }
  return { filterTo, leaveOut }
}

/** Every value the filter names is in the loaded data (so the action can reproduce the group). */
export function filterInData(patch: DrillFilter, vocab: ScopeVocabulary): boolean {
  for (const d of filterDimensions(patch)) {
    if (d === 'leaderId') {
      if (!vocab.hasLeader(patch.leaderId as string)) return false
    } else if (!(patch[d] as string[]).every((v) => vocab.hasValue(d as ListDimension, v))) return false
  }
  return true
}

/**
 * What the group is called on the actions: "Bengaluru", "Allison Carter's org", "L4 Senior",
 * "Mar 2026". A drill's own `filterLabel` ("Asia Pacific", "L1-L3") wins when it has one.
 */
export function groupName(patch: DrillFilter, nameOf: NameOf, label?: string | null): string {
  if (label?.trim()) return label.trim()
  const { modes: _modes, ...plain } = patch
  return describeFocus(plain, nameOf)
}

/** The records panel's two actions: "Filter to Bengaluru" and "Leave out Bengaluru" (null when it can't). */
export function filterActionLabels(
  patch: DrillFilter,
  nameOf: NameOf,
  label?: string | null,
): { filterTo: string; leaveOut: string | null } {
  const name = groupName(patch, nameOf, label)
  return { filterTo: `Filter to ${name}`, leaveOut: canLeaveOut(patch) ? `Leave out ${name}` : null }
}

/**
 * The scope's label after an action, with the group's own name (`filterLabel`) in place of its
 * values when the scope holds exactly them: "Whole company except Americas", not "Whole company
 * except Austin +6"; "Design Verification L1-L3", not "Design Verification · L1 Entry +2". For the
 * toast that confirms the action.
 */
export function namedScopeLabel(
  next: Filters,
  patch: DrillFilter,
  org: OrgIndex,
  label?: string | null,
): string {
  const name = label?.trim()
  const dims = LIST_DIMENSIONS.filter((d) => (patch[d]?.length ?? 0) > 0)
  const exact = (d: ListDimension) => {
    const group = patch[d] as string[]
    return next[d].length === new Set(group).size && next[d].every((v) => group.includes(v))
  }
  if (!name || patch.leaderId || !dims.length || !dims.every(exact)) return scopeLabel(next, org)
  // The name stands for the whole group: it takes the first dimension's place, the rest go.
  const named: Filters = { ...next }
  for (const d of dims) named[d] = d === dims[0] ? [name] : []
  return scopeLabel(named, org)
}
