/**
 * Plain-English labels for filters: the removable chips under the filter row and the "Focus on …"
 * buttons in readouts. Pure.
 */

import { LEVEL_LABELS, type Level } from '@/data/schema'
import { type Filters, PERIOD_LABELS, type PeriodPreset } from '@/data/scope'

type ListKey = 'businessUnit' | 'department' | 'location' | 'level'
const LIST_KEYS: ListKey[] = ['businessUnit', 'department', 'location', 'level']

export const FILTER_DIMENSION_LABELS: Record<ListKey | 'leaderId' | 'period', string> = {
  leaderId: 'Leader',
  businessUnit: 'Business unit',
  department: 'Department',
  location: 'Location',
  level: 'Level',
  period: 'Period',
}

/** Resolves an employee ID to a display name (undefined when unknown). */
export type NameOf = (employeeId: string) => string | undefined

export interface FilterChip {
  id: string
  /** The filter field this chip belongs to. */
  key: ListKey | 'leaderId'
  /** Dimension name, e.g. "Location". */
  dimension: string
  /** Value label, e.g. "Hsinchu" or "Priya Raman's org". */
  label: string
  /** Patch that removes just this value. */
  remove: Partial<Filters>
}

const valueLabel = (key: ListKey, v: string) => (key === 'level' ? (LEVEL_LABELS[v as Level] ?? v) : v)

export const leaderOrgLabel = (id: string, nameOf: NameOf): string => {
  const name = nameOf(id)
  return name ? `${name}'s org` : 'Leader org'
}

/** One chip per active org-filter value, in filter-row order. */
export function filterChips(filters: Filters, nameOf: NameOf): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.leaderId)
    chips.push({
      id: `leaderId:${filters.leaderId}`,
      key: 'leaderId',
      dimension: FILTER_DIMENSION_LABELS.leaderId,
      label: leaderOrgLabel(filters.leaderId, nameOf),
      remove: { leaderId: null },
    })
  for (const key of LIST_KEYS)
    for (const v of filters[key])
      chips.push({
        id: `${key}:${v}`,
        key,
        dimension: FILTER_DIMENSION_LABELS[key],
        label: valueLabel(key, v),
        remove: { [key]: filters[key].filter((x) => x !== v) },
      })
  return chips
}

/** True when anything differs from the default (period included), i.e. "Reset" has work to do. */
export function isFiltered(filters: Filters): boolean {
  return filters.period !== 't12m' || !!filters.leaderId || LIST_KEYS.some((k) => filters[k].length > 0)
}

/**
 * Short description of a filter patch for a "Focus on …" button: "Hsinchu",
 * "Priya Raman's org · Design verification", "Last 6 months". Empty when the patch sets nothing.
 */
export function describeFocus(patch: Partial<Filters>, nameOf: NameOf): string {
  const parts: string[] = []
  if (patch.leaderId) parts.push(leaderOrgLabel(patch.leaderId, nameOf))
  for (const key of LIST_KEYS) {
    const xs = patch[key]
    if (!xs?.length) continue
    const labels = xs.map((v) => valueLabel(key, v))
    parts.push(labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`)
  }
  if (patch.period && patch.period !== 'custom') parts.push(PERIOD_LABELS[patch.period as PeriodPreset])
  return parts.join(' · ')
}
