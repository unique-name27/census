/**
 * Plain-English labels for filters: the removable chips under the filter row and the "Focus on …"
 * buttons in readouts. Pure.
 */

import { LEVEL_LABELS, type Level } from '@/data/schema'
import { type Filters, isExcluded, PERIOD_LABELS, type PeriodPreset, withMode } from '@/data/scope'
import { formatMonth, formatRange, monthEnd, quarterKey, quarterStart } from '@/lib/dates'

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
  /** Value label, e.g. "Hsinchu" or "Priya Raman's org"; "Not Sales" or "Not in Priya Raman's org" when excluded. */
  label: string
  /** The value alone, without "Not": "Sales", "Priya Raman's org" (for the remove button's name). */
  value: string
  /** The filter excludes this value. */
  excluded: boolean
  /** Patch that removes just this value (and the exclude mode with the last one). */
  remove: Partial<Filters>
}

const valueLabel = (key: ListKey, v: string) => (key === 'level' ? (LEVEL_LABELS[v as Level] ?? v) : v)

export const leaderOrgLabel = (id: string, nameOf: NameOf): string => {
  const name = nameOf(id)
  return name ? `${name}'s org` : 'Leader org'
}

/** "Not in Priya Raman's org", or "Not in the leader's org" when the name is unknown. */
export const leaderExcludedLabel = (id: string, nameOf: NameOf): string => {
  const name = nameOf(id)
  return `Not in ${name ? `${name}'s org` : "the leader's org"}`
}

/** One chip per active org-filter value, in filter-row order. Excluded values read "Not Sales". */
export function filterChips(filters: Filters, nameOf: NameOf): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.leaderId) {
    const excluded = isExcluded(filters, 'leaderId')
    const org = leaderOrgLabel(filters.leaderId, nameOf)
    chips.push({
      id: `leaderId:${filters.leaderId}`,
      key: 'leaderId',
      dimension: FILTER_DIMENSION_LABELS.leaderId,
      label: excluded ? leaderExcludedLabel(filters.leaderId, nameOf) : org,
      value: org,
      excluded,
      remove: {
        leaderId: null,
        ...(excluded ? { modes: withMode(filters.modes, 'leaderId', 'include') } : {}),
      },
    })
  }
  for (const key of LIST_KEYS) {
    const excluded = isExcluded(filters, key)
    for (const v of filters[key]) {
      const rest = filters[key].filter((x) => x !== v)
      chips.push({
        id: `${key}:${v}`,
        key,
        dimension: FILTER_DIMENSION_LABELS[key],
        label: excluded ? `Not ${valueLabel(key, v)}` : valueLabel(key, v),
        value: valueLabel(key, v),
        excluded,
        // The last excluded value takes the exclude mode with it, as the address does.
        remove:
          excluded && !rest.length
            ? { [key]: rest, modes: withMode(filters.modes, key, 'include') }
            : { [key]: rest },
      })
    }
  }
  return chips
}

/** True when anything differs from the default (period included), i.e. "Reset" has work to do. */
export function isFiltered(filters: Filters): boolean {
  return filters.period !== 't12m' || !!filters.leaderId || LIST_KEYS.some((k) => filters[k].length > 0)
}

/**
 * Short description of a filter patch for a "Focus on …" button: "Hsinchu",
 * "Priya Raman's org · Design verification", "Last 6 months", "1 Jan – 31 Mar 2026". Empty when
 * the patch sets nothing. A dimension the patch excludes reads "not Sales" (`modes`), or with
 * `exclude` every dimension does: "Leave out" describes the group it leaves out the same way.
 */
export function describeFocus(patch: Partial<Filters>, nameOf: NameOf): string {
  const parts: string[] = []
  const not = (key: ListKey | 'leaderId', text: string) =>
    isExcluded(patch, key) ? (key === 'leaderId' ? `not in ${text}` : `not ${text}`) : text
  if (patch.leaderId) parts.push(not('leaderId', leaderOrgLabel(patch.leaderId, nameOf)))
  for (const key of LIST_KEYS) {
    const xs = patch[key]
    if (!xs?.length) continue
    const labels = xs.map((v) => valueLabel(key, v))
    parts.push(not(key, labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`))
  }
  if (patch.period === 'custom') {
    if (patch.customStart && patch.customEnd) parts.push(customPeriodText(patch.customStart, patch.customEnd))
  } else if (patch.period) parts.push(PERIOD_LABELS[patch.period as PeriodPreset])
  return parts.join(' · ')
}

/**
 * A custom period in words: "Mar 2026" for a whole month, "Q1 2026" for a whole quarter (as the
 * figures write quarters), else the dates.
 */
export function customPeriodText(start: string, end: string): string {
  const wholeMonth = start.slice(8) === '01' && monthEnd(start) === end
  if (wholeMonth) return formatMonth(start)
  if (quarterStart(start) === start) {
    const quarterEnd = monthEnd(`${start.slice(0, 4)}-${String(+start.slice(5, 7) + 2).padStart(2, '0')}-01`)
    if (end === quarterEnd) return quarterKey(start).replace(/^(\d{4}) (Q\d)$/, '$2 $1')
  }
  return formatRange(start, end)
}
