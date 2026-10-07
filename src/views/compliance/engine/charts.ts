/**
 * The rows behind the Compliance charts added with the design refresh (docs/CHARTS.md,
 * Compliance): the reverification runway (one dot per person with an authorization ending or
 * ended), business days from start to I-9 Section 2, and licensed roles by site and status. Each
 * is a regrouping of the engine's own rows (work.ts, i9.ts, exportControl.ts), so a chart and the
 * tables beside it count the same people. Pure.
 *
 * The statutory calendar by jurisdiction and month spreads the Atlas calendar over the next year
 * for the jurisdictions where people in scope work (deadlines.ts names the next 60 days only).
 *
 * Privacy: expiry dates and reverification status per person are what people operations acts on,
 * so the runway shows them (the authorization type never). The I-9 bins need at least the
 * anonymity minimum of US starts with Section 2 done, or every bin is hidden. License status per
 * site is a count; names appear only in the drill, as in the tables.
 */
import { EXPORT_LICENSE_STATUSES } from '@/data/schema'
import { addMonths, formatDate, formatMonth, formatMonthShort, monthEnd, monthsBetween } from '@/lib/dates'
import { STATUTORY_CALENDAR } from '../reference/calendar'
import {
  type DeadlineRow,
  type DeadlinesModel,
  dateOf,
  monthsOf,
  occursIn,
  recurrenceWord,
} from './deadlines'
import type { LicenseRow } from './exportControl'
import type { I9Row } from './i9'
import { type ExpiryRow, type ReverificationStatus, STATUS_ORDER, type WorkModel } from './work'

/* ───────────── reverification runway ───────────── */

export interface RunwayDot {
  employeeId: string
  name: string
  businessUnit: string
  location: string
  status: ReverificationStatus
  /** Days from the as-of date to the expiry date (negative once it has ended). */
  daysToExpiry: number
  expiryDate: string
  dueBy: string
  startedDate: string | null
  x: ExpiryRow
}

export interface RunwayGroup {
  status: ReverificationStatus
  people: number
  rows: ExpiryRow[]
}

/**
 * Everyone the Expiring authorizations table lists (ended, or ending in the planning window),
 * one dot each, and the count in each reverification status, in action order.
 */
export function runway(w: Pick<WorkModel, 'expired' | 'expiringHorizon'>): {
  dots: RunwayDot[]
  groups: RunwayGroup[]
} {
  const listed = [...w.expired, ...w.expiringHorizon]
  const dots = listed.map((x) => ({
    employeeId: x.e.employeeId,
    name: x.e.name,
    businessUnit: x.e.businessUnit,
    location: x.e.location,
    status: x.status,
    daysToExpiry: x.daysToExpiry,
    expiryDate: x.expiryDate,
    dueBy: x.dueBy,
    startedDate: x.startedDate,
    x,
  }))
  const groups = STATUS_ORDER.flatMap((status) => {
    const rows = listed.filter((x) => x.status === status)
    return rows.length ? [{ status, people: rows.length, rows }] : []
  })
  return { dots, groups }
}

/* ───────────── business days to I-9 Section 2 ───────────── */

export interface I9DayBin {
  /** "0", "1", … and the last bin "10+". */
  bin: string
  /** Business days the bin starts at. */
  from: number
  starts: number | null
  /** Past the allowed business days. */
  late: boolean
  rows: I9Row[]
}

/** The last bin collects this many business days and more. */
export const I9_BIN_CAP = 10

/**
 * US starts judged on Section 2 in the window whose Section 2 is done, by business days from the
 * start (0 to 9, then 10 or more). Starts still past due without Section 2 are counted apart, for
 * the note. Every bin is null when fewer than `min` starts are behind the chart.
 */
export function i9DayBins(
  judged: readonly I9Row[],
  allowedDays: number,
  min: number,
): { bins: I9DayBin[]; done: number; missing: number; shown: boolean } {
  const done = judged.filter((x) => x.businessDays != null)
  const missing = judged.length - done.length
  const shown = done.length >= min
  const bins: I9DayBin[] = []
  for (let d = 0; d <= I9_BIN_CAP; d++) {
    const rows = done.filter((x) => {
      const b = x.businessDays as number
      return d === I9_BIN_CAP ? b >= I9_BIN_CAP : b === d
    })
    bins.push({
      bin: d === I9_BIN_CAP ? `${I9_BIN_CAP}+` : String(d),
      from: d,
      starts: shown ? rows.length : null,
      late: d > allowedDays,
      rows: shown ? rows : [],
    })
  }
  return { bins, done: done.length, missing, shown }
}

/* ───────────── licensed roles by site and status ───────────── */

/** License statuses in the order the chart stacks them: in force first, then what blocks work. */
export const LICENSE_SERIES: readonly string[] = [
  'Approved',
  'Pending',
  'Expired',
  'Denied',
  ...EXPORT_LICENSE_STATUSES.filter((s) => !['Approved', 'Pending', 'Expired', 'Denied'].includes(s)),
  'Not recorded',
]

export interface SiteStatusRow {
  location: string
  status: string
  people: number
  rows: LicenseRow[]
  /** Everyone at the site whose role needs a license (the whole bar). */
  siteRows: LicenseRow[]
}

/**
 * Roles that need a license (active or starting), by the person's site and the license status at
 * the as-of date: one row per site and status present, sites with the most such roles first.
 */
export function licensesBySite(required: readonly LicenseRow[]): SiteStatusRow[] {
  const sites = new Map<string, LicenseRow[]>()
  for (const x of required) {
    const site = x.e.location || 'Unknown site'
    sites.set(site, [...(sites.get(site) ?? []), x])
  }
  const order = (s: string) => {
    const i = LICENSE_SERIES.indexOf(s)
    return i < 0 ? LICENSE_SERIES.length : i
  }
  return [...sites.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .flatMap(([location, siteRows]) =>
      [...new Set(siteRows.map((x) => x.status))]
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
        .map((status) => {
          const rows = siteRows.filter((x) => x.status === status)
          return { location, status, people: rows.length, rows, siteRows }
        }),
    )
}

/* ───────────── statutory calendar by jurisdiction and month ───────────── */

export interface CalendarCell {
  jurisdictionId: string
  jurisdiction: string
  /** YYYY-MM */
  month: string
  /** "Jan '27" */
  monthLabel: string
  /** Calendar entries falling in the month ("Every month" entries count in each one). */
  entries: number
  /** The entries, each with the employees its jurisdiction covers (for their drill). */
  items: DeadlineRow[]
}

/**
 * The Atlas calendar entries of each jurisdiction in scope, by month, over the `n` months after
 * the as-of month. Jurisdictions run in Atlas order; every one has a cell for every month.
 */
export function calendarByMonth(
  d: Pick<DeadlinesModel, 'jurisdictions'>,
  asOf: string,
  n = 12,
): { months: string[]; cells: CalendarCell[] } {
  const first = addMonths(`${asOf.slice(0, 7)}-01`, 1)
  const months = monthsBetween(first, addMonths(first, n - 1))
  const cells: CalendarCell[] = []
  for (const { jurisdiction: j, people } of d.jurisdictions) {
    const entries = STATUTORY_CALENDAR.map((entry, i) => ({ entry, i })).filter(
      (x) => x.entry.jurisdiction === j.id,
    )
    for (const month of months) {
      const year = +month.slice(0, 4)
      const mo = +month.slice(5, 7)
      const items: DeadlineRow[] = entries
        .filter(({ entry }) => occursIn(entry, year) && monthsOf(entry).includes(mo))
        .map(({ entry, i }) => {
          const last = monthEnd(`${month}-01`)
          const start = entry.day
            ? dateOf(year, mo, entry.day) > last
              ? last
              : dateOf(year, mo, entry.day)
            : `${month}-01`
          return {
            key: `${j.id}-${i}-${month}`,
            jurisdiction: j,
            entry,
            start,
            end: entry.day ? start : last,
            when: entry.day ? formatDate(start) : `During ${formatMonth(start)}`,
            recurrence: recurrenceWord(entry),
            people,
          }
        })
        .sort((a, b) => a.start.localeCompare(b.start) || a.entry.title.localeCompare(b.entry.title))
      cells.push({
        jurisdictionId: j.id,
        jurisdiction: j.shortName,
        month,
        monthLabel: formatMonthShort(`${month}-01`, true),
        entries: items.length,
        items,
      })
    }
  }
  return { months, cells }
}
