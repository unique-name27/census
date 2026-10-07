/**
 * The records behind the HR ops trends (engine/trends.ts), as specs for the shared drill panel.
 * Each goes through the view's own gate: nothing opens in a small scope or for a group behind
 * fewer than the anonymity minimum of people, employee relations cases are counted in the note
 * and never listed, and leave lists never carry the leave reason.
 *
 * A quarter cell of the on-time heatmap carries its quarter as a custom period, so the records
 * panel offers "Filter to" that quarter: the period figures on the tab then show the same rate.
 * A month end is no group of a filter dimension, so the backlog and on-leave points set none.
 */
import { withFilter } from '@/charts/kit/groupDrill'
import { periodFilter } from '@/drill/filter'
import type { DrillSpec } from '@/drill/types'
import { formatDate, formatRange } from '@/lib/dates'
import { caseDrill, type DrillScope, onTimeDrill } from './drills'
import { leaveDrill } from './leaveDrills'
import type { BacklogPoint, OnLeavePoint, TypeQuarterCell } from './trends'

const at = (s: DrillScope, date: string) => `At ${formatDate(date)} · ${s.scope}`

/** "Transactions", "New hire transactions". */
const typeWords = (type: string) => `${type} transactions`

/** The cases open at a month end (or only those past the age limit), oldest first. */
export function backlogPointDrill(
  s: DrillScope,
  p: BacklogPoint,
  aged: false | number,
): DrillSpec<'cases'> | null {
  const rows = aged === false ? p.records : p.agedRecords
  return caseDrill(s, rows, {
    title:
      aged === false
        ? `Cases open at ${formatDate(p.date)}`
        : `Cases open longer than ${aged} days at ${formatDate(p.date)}`,
    subtitle: at(s, p.date),
    order: (a, b) => a.opened.localeCompare(b.opened),
  })
}

/** The judged transactions of one type due in one quarter, with that quarter as the period. */
export function typeQuarterDrill(s: DrillScope, c: TypeQuarterCell): DrillSpec<'transactions'> | null {
  if (c.rate == null) return null
  const spec = onTimeDrill(s, c.records, `${typeWords(c.type)} due in ${c.quarter}`, {
    subtitle: `${formatRange(c.start, c.end)} · ${s.scope}`,
  })
  return spec ? withFilter(spec, periodFilter(c.start, c.end), c.quarter) : null
}

/** The people on leave at a month end, listed by their leave start (no reason). */
export function onLeavePointDrill(s: DrillScope, p: OnLeavePoint): DrillSpec<'transactions'> | null {
  if (p.people == null) return null
  return leaveDrill(s, p.records, {
    title: `On leave at ${formatDate(p.date)}`,
    subtitle: at(s, p.date),
    columns: ['expected', 'returned'],
    order: (a, b) => a.start.localeCompare(b.start),
  })
}
