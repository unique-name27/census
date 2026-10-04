/**
 * Statutory deadlines coming up: entries of the Atlas calendar (../reference/calendar.ts) that
 * fall after the as-of date and within the look-ahead (60 days by default), for the jurisdictions
 * where someone in scope works. US federal entries apply wherever someone works at a US site.
 *
 * An entry with a named day falls on that day; one without falls somewhere in its month, so it
 * counts when any day of the month is inside the look-ahead. Monthly entries show once, at their
 * next month. Pure.
 */
import type { Employee, ISODate } from '@/data/schema'
import { isActiveAt } from '@/data/scope'
import { addDays, formatDate, formatMonth, monthEnd } from '@/lib/dates'
import {
  ATLAS_JURISDICTIONS,
  type AtlasJurisdiction,
  type CalendarEntry,
  STATUTORY_CALENDAR,
} from '../reference/calendar'
import { jurisdictionsOf } from './base'

export const jurisdictionById = new Map(ATLAS_JURISDICTIONS.map((j) => [j.id, j]))

export interface DeadlineRow {
  key: string
  jurisdiction: AtlasJurisdiction
  entry: CalendarEntry
  /** First and last day the obligation can fall on (the same day when the Atlas names it). */
  start: ISODate
  end: ISODate
  /** "1 Nov 2026" or "During Nov 2026" or "Every month". */
  when: string
  recurrence: string
  /** People in scope the jurisdiction covers. */
  people: Employee[]
}

export interface JurisdictionRow {
  jurisdiction: AtlasJurisdiction
  people: Employee[]
}

export interface DeadlinesModel {
  /** Jurisdictions where someone in scope works, in Atlas order. */
  jurisdictions: JurisdictionRow[]
  upcoming: DeadlineRow[]
  /** Look-ahead end (inclusive). */
  until: ISODate
  /** Calendar entries per jurisdiction (the whole year), by Atlas id. */
  yearly: Map<string, number>
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`

function occursIn(entry: CalendarEntry, year: number): boolean {
  if (entry.years && !entry.years.includes(year)) return false
  if (entry.oddYears && year % 2 === 0) return false
  return true
}

/** The months (1-12) an entry falls in each year. */
function monthsOf(entry: CalendarEntry): number[] {
  if (entry.recurrence === 'monthly') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (entry.recurrence === 'quarterly') return [0, 3, 6, 9].map((k) => ((entry.month - 1 + k) % 12) + 1)
  return [entry.month]
}

const RECURRENCE_WORD: Record<CalendarEntry['recurrence'], string> = {
  annual: 'Every year',
  quarterly: 'Every quarter',
  monthly: 'Every month',
}

function recurrenceWord(e: CalendarEntry): string {
  if (e.years) return e.years.length === 1 ? `In ${e.years[0]} only` : `In ${e.years.join(', ')}`
  if (e.oddYears) return 'Odd years'
  return RECURRENCE_WORD[e.recurrence]
}

/**
 * The next occurrence of an entry that overlaps (from, until], or null. A day past the end of a
 * short month clamps to its last day.
 */
export function nextOccurrence(
  entry: CalendarEntry,
  from: ISODate,
  until: ISODate,
): { start: ISODate; end: ISODate } | null {
  const y0 = +from.slice(0, 4)
  const hits: { start: ISODate; end: ISODate }[] = []
  for (let y = y0; y <= +until.slice(0, 4); y++) {
    if (!occursIn(entry, y)) continue
    for (const m of monthsOf(entry)) {
      const first = dateOf(y, m, 1)
      const last = monthEnd(first)
      const start = entry.day ? (dateOf(y, m, entry.day) > last ? last : dateOf(y, m, entry.day)) : first
      const end = entry.day ? start : last
      if (end > from && start <= until) hits.push({ start, end })
    }
  }
  hits.sort((a, b) => a.start.localeCompare(b.start))
  return hits[0] ?? null
}

export function computeDeadlines(
  ctx: { asOf: ISODate; employees: readonly Employee[] },
  days: number,
): DeadlinesModel {
  const { asOf } = ctx
  const until = addDays(asOf, days)
  const people = new Map<string, Employee[]>()
  for (const e of ctx.employees) {
    if (!isActiveAt(e, asOf)) continue
    for (const j of jurisdictionsOf(e)) people.set(j, [...(people.get(j) ?? []), e])
  }
  const jurisdictions = ATLAS_JURISDICTIONS.filter((j) => people.has(j.id)).map((j) => ({
    jurisdiction: j,
    people: people.get(j.id)!,
  }))
  const upcoming: DeadlineRow[] = []
  STATUTORY_CALENDAR.forEach((entry, i) => {
    const j = jurisdictionById.get(entry.jurisdiction)
    const who = people.get(entry.jurisdiction)
    if (!j || !who) return
    const at = nextOccurrence(entry, asOf, until)
    if (!at) return
    upcoming.push({
      key: `${entry.jurisdiction}-${i}`,
      jurisdiction: j,
      entry,
      start: at.start,
      end: at.end,
      when:
        entry.recurrence === 'monthly'
          ? `Every month (next ${formatMonth(at.start)})`
          : entry.day
            ? formatDate(at.start)
            : `During ${formatMonth(at.start)}`,
      recurrence: recurrenceWord(entry),
      people: who,
    })
  })
  const order = ATLAS_JURISDICTIONS.map((j) => j.id)
  upcoming.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      Number(!a.entry.day) - Number(!b.entry.day) ||
      order.indexOf(a.jurisdiction.id) - order.indexOf(b.jurisdiction.id),
  )
  return { jurisdictions, upcoming, until, yearly: YEARLY }
}

const YEARLY = new Map<string, number>()
for (const e of STATUTORY_CALENDAR) YEARLY.set(e.jurisdiction, (YEARLY.get(e.jurisdiction) ?? 0) + 1)
