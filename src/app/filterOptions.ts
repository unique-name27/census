/**
 * Options and validation for the filter row. Org options are built from the unscoped roster as of
 * the reporting date.
 * Pure functions; every count is active employees (contractors and interns excluded), the same
 * population as `headcountAt` in src/lib/people.ts.
 */

import { type Employee, type ISODate, LEVEL_LABELS, type Level, levelIndex } from '@/data/schema'
import { isActiveAt, isEmployee, type OrgIndex } from '@/data/scope'
import { formatMonthShort, isValidDate } from '@/lib/dates'

export type DimensionKey = 'businessUnit' | 'department' | 'location' | 'level'
export const DIMENSIONS: DimensionKey[] = ['businessUnit', 'department', 'location', 'level']

export interface DimensionOption {
  value: string
  label: string
  /** Active employees with this value on the as-of date. */
  count: number
}

export interface LeaderOption {
  id: string
  name: string
  title: string
  /** Active employees in the leader's org, the leader included (the scope size once selected). */
  size: number
}

const counted = (e: Employee, asOf: ISODate) => isEmployee(e) && isActiveAt(e, asOf)

/** Display label for a dimension value (levels get their long label, e.g. "L4 Senior"). */
export function dimensionValueLabel(key: DimensionKey, value: string): string {
  return key === 'level' ? (LEVEL_LABELS[value as Level] ?? value) : value
}

/**
 * Distinct values of one org dimension with active-employee counts. Values that are selected but
 * no longer present (e.g. after an upload) are kept with a count of 0 so they can be cleared.
 * Levels follow the career ladder; everything else is alphabetical.
 */
export function dimensionOptions(
  employees: readonly Employee[],
  asOf: ISODate,
  key: DimensionKey,
  selected: readonly string[] = [],
): DimensionOption[] {
  const counts = new Map<string, number>()
  for (const e of employees) {
    if (!counted(e, asOf)) continue
    const v = e[key]
    if (typeof v !== 'string' || !v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  for (const v of selected) if (!counts.has(v)) counts.set(v, 0)
  const out = [...counts].map(([value, count]) => ({ value, label: dimensionValueLabel(key, value), count }))
  if (key === 'level') {
    const rank = (v: string) => {
      const i = levelIndex(v)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    return out.sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label))
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Active employees in each person's org (themselves included), keyed by employee ID. Walks each
 * active employee up their manager chain once; cycle-safe.
 */
export function orgSizes(index: OrgIndex, asOf: ISODate): Map<string, number> {
  const sizes = new Map<string, number>()
  const seen = new Set<string>()
  for (const e of index.byId.values()) {
    if (!counted(e, asOf)) continue
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
 * employees (directly or indirectly), largest org first.
 */
export function leaderOptions(index: OrgIndex, asOf: ISODate, minReports = 3): LeaderOption[] {
  const sizes = orgSizes(index, asOf)
  const out: LeaderOption[] = []
  for (const e of index.byId.values()) {
    if (!isActiveAt(e, asOf)) continue
    const size = sizes.get(e.employeeId) ?? 0
    const reports = size - (isEmployee(e) ? 1 : 0)
    if (reports < minReports) continue
    out.push({ id: e.employeeId, name: e.name || e.employeeId, title: e.jobTitle ?? '', size })
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

/** Validation message for a custom range, or null when it can be applied. */
export function customRangeError(start: string, end: string): string | null {
  if (!isValidDate(start) || !isValidDate(end)) return 'Enter both dates.'
  if (start > end) return 'The start date must be on or before the end date.'
  return null
}
