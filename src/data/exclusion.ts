/**
 * The anonymity rule for exclusions (docs/FILTERS.md, parts 3 and 4; docs/ASK.md). Leaving out a
 * group of fewer active employees than the anonymity minimum would let a scope be compared with
 * the same scope without the exclusion, and the difference is that small group. So each exclusion
 * must remove none, or at least the minimum, of the active employees the scope would have without
 * it. Ask refuses a scope that breaks this, the records panel never offers one, and the filter
 * row's Exclude greys out a value or leader that would (`tooFewToLeaveOut` in
 * src/app/filterOptions.ts). Pure.
 */
import type { Employee, ISODate } from './schema'
import {
  dimensionSet,
  employeeMatcher,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type Filters,
  isActiveAt,
  isEmployee,
  isExcluded,
  type OrgIndex,
} from './scope'

const actives = new WeakMap<readonly Employee[], Map<ISODate, readonly Employee[]>>()

/** Active employees on the as-of date: the people exclusion sizes are counted in. Cached per roster and date. */
export function activeEmployees(employees: readonly Employee[], asOf: ISODate): readonly Employee[] {
  let byDate = actives.get(employees)
  if (!byDate) {
    byDate = new Map()
    actives.set(employees, byDate)
  }
  let out = byDate.get(asOf)
  if (!out) {
    out = employees.filter((e) => isEmployee(e) && isActiveAt(e, asOf))
    byDate.set(asOf, out)
  }
  return out
}

/** How many of `people` a scope keeps. */
export function peopleIn(people: readonly Employee[], filters: Filters, org: OrgIndex): number {
  const ok = employeeMatcher(filters, org)
  let n = 0
  for (const e of people) if (ok(e)) n++
  return n
}

/** The scope without one dimension's filter. */
export const withoutDimension = (f: Filters, d: FilterDimension): Filters =>
  d === 'leaderId' ? { ...f, leaderId: null } : { ...f, [d]: [] }

/** The scope without one excluded value (the leader, or one value of a list dimension). */
export const withoutValue = (f: Filters, d: FilterDimension, value: string): Filters =>
  d === 'leaderId' ? { ...f, leaderId: null } : { ...f, [d]: f[d].filter((v) => v !== value) }

/**
 * Each excluded value that removes between 1 and `min` − 1 of the active employees the scope
 * would have without it, in filter-row order (empty when there are none). Checked value by value:
 * leaving out a large value together with a small one passes a check of the whole dimension, yet
 * the scope then differs by the small one from the scope that leaves out the large one alone.
 * `people` are the active employees (`activeEmployees`).
 */
export function smallExcludedValues(
  people: readonly Employee[],
  filters: Filters,
  org: OrgIndex,
  min: number,
): { dim: FilterDimension; value: string }[] {
  const out: { dim: FilterDimension; value: string }[] = []
  let scoped: number | null = null
  for (const d of FILTER_DIMENSIONS) {
    if (!isExcluded(filters, d) || !dimensionSet(filters, d)) continue
    const values = d === 'leaderId' ? [filters.leaderId as string] : filters[d]
    for (const value of values) {
      scoped ??= peopleIn(people, filters, org)
      const removed = peopleIn(people, withoutValue(filters, d, value), org) - scoped
      if (removed > 0 && removed < min) out.push({ dim: d, value })
    }
  }
  return out
}

/**
 * The exclusions in a scope with a value that removes between 1 and `min` − 1 of the active
 * employees the scope would have without it (`smallExcludedValues`), in filter-row order (empty
 * when there are none). A whole dimension that removes that few always has such a value.
 */
export function smallExclusions(
  people: readonly Employee[],
  filters: Filters,
  org: OrgIndex,
  min: number,
): FilterDimension[] {
  return [...new Set(smallExcludedValues(people, filters, org, min).map((x) => x.dim))]
}
