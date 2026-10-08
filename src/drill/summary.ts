/**
 * The records panel's Summary (docs/DESIGN-REFRESH.md 3.4): how the people behind a list split by
 * department and by level, so a reader sees at a glance where a list concentrates without
 * sorting it. Pure: groups the rows of a drill table by a field of the person each row names.
 * Rows that name nobody (a req with no hiring manager, an employee relations case) are left out
 * and counted. Each group keeps the indexes of its rows, so a bar opens exactly those records.
 */
import type { Employee } from '@/data/schema'

export interface SummaryGroup {
  label: string
  count: number
  /** Indexes into the drill's rows. */
  rows: number[]
}

export interface SummaryCut {
  groups: SummaryGroup[]
  /** Rows that name a person on the roster. */
  people: number
  /** Rows left out because they name nobody. */
  unnamed: number
}

/** Fewest rows naming a person before the Summary shows. */
export const SUMMARY_MIN_ROWS = 10

/**
 * Whether the Summary describes the list: at least ten rows name a person, and they are most of
 * the rows. A list of offers where most candidates never joined (declined offers) would otherwise
 * be summarized by the few hires' departments and levels, not by the offers.
 */
export const showsSummary = (cut: Pick<SummaryCut, 'people' | 'unnamed'>): boolean =>
  cut.people >= SUMMARY_MIN_ROWS && cut.people >= cut.unnamed

/** Group rows by a field of the person each names, largest first (ties by name); "Not set" for blanks. */
export function summaryCut(
  people: readonly (Employee | null | undefined)[],
  field: 'department' | 'level',
): SummaryCut {
  const by = new Map<string, number[]>()
  let unnamed = 0
  people.forEach((p, i) => {
    if (!p) {
      unnamed++
      return
    }
    const v = p[field]
    const label = v == null || v === '' ? 'Not set' : String(v)
    const list = by.get(label)
    if (list) list.push(i)
    else by.set(label, [i])
  })
  const groups = [...by.entries()]
    .map(([label, rows]) => ({ label, count: rows.length, rows }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { numeric: true }))
  return { groups, people: people.length - unnamed, unnamed }
}
