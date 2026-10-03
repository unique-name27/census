/**
 * UTC calendar helpers over ISO strings. Every date in Census is a calendar date with no time
 * zone ("2026-09-30"); case timestamps add a time ("2026-09-30T14:05"). Parsing is cached
 * because metric engines call it in tight loops.
 */
import type { ISODate } from '@/data/schema'

const DAY = 86_400_000
const cache = new Map<string, number>()

/** Milliseconds since epoch (UTC) for an ISO date or date-time; NaN when unparseable. */
export function ms(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  let v = cache.get(iso)
  if (v === undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso)
    v = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0) : Number.NaN
    if (cache.size > 200_000) cache.clear()
    cache.set(iso, v)
  }
  return v
}

export const isValidDate = (iso: string | null | undefined): iso is string => Number.isFinite(ms(iso))

/** ISO date (YYYY-MM-DD) for a UTC millisecond value. */
export function iso(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10)
}
/** ISO date-time (YYYY-MM-DDTHH:mm) for a UTC millisecond value. */
export function isoDateTime(t: number): string {
  return new Date(t).toISOString().slice(0, 16)
}
/** Date part of an ISO date or date-time. */
export const dateOf = (s: string): ISODate => s.slice(0, 10)

export function todayISO(): ISODate {
  const d = new Date()
  return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function addDays(d: ISODate, n: number): ISODate {
  return iso(ms(d) + n * DAY)
}

/** Calendar-month arithmetic; the day clamps to the end of a shorter month. */
export function addMonths(d: ISODate, n: number): ISODate {
  const t = new Date(ms(d))
  const y = t.getUTCFullYear()
  const m = t.getUTCMonth() + n
  const day = t.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return iso(Date.UTC(y, m, Math.min(day, last)))
}

/** Whole days from a to b (b - a). Works for dates and date-times (fractional for the latter via hoursBetween). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ms(dateOf(b)) - ms(dateOf(a))) / DAY)
}
export function hoursBetween(a: string, b: string): number {
  return (ms(b) - ms(a)) / 3_600_000
}

/** Monday-to-Friday days from a (exclusive) to b (inclusive); negative when b < a. No holiday calendar. */
export function businessDaysBetween(a: ISODate, b: ISODate): number {
  const sign = ms(b) >= ms(a) ? 1 : -1
  let [from, to] = sign > 0 ? [ms(a), ms(b)] : [ms(b), ms(a)]
  let n = 0
  while (from < to) {
    from += DAY
    const wd = new Date(from).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n * sign
}

export function addBusinessDays(d: ISODate, n: number): ISODate {
  let t = ms(d)
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  while (left > 0) {
    t += step * DAY
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return iso(t)
}

export const monthKey = (d: string): string => d.slice(0, 7)
export const monthStart = (d: string): ISODate => `${d.slice(0, 7)}-01`
export function monthEnd(d: string): ISODate {
  const t = new Date(ms(monthStart(d)))
  return iso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0))
}
export function quarterKey(d: string): string {
  const m = +d.slice(5, 7)
  return `${d.slice(0, 4)} Q${Math.ceil(m / 3)}`
}
export function quarterStart(d: string): ISODate {
  const m = +d.slice(5, 7)
  const q0 = Math.floor((m - 1) / 3) * 3 + 1
  return `${d.slice(0, 4)}-${String(q0).padStart(2, '0')}-01`
}

/** Month keys (YYYY-MM) from the month of `start` to the month of `end`, inclusive. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let cur = monthStart(start)
  const stop = monthKey(end)
  for (let guard = 0; guard < 600 && monthKey(cur) <= stop; guard++) {
    out.push(monthKey(cur))
    cur = addMonths(cur, 1)
  }
  return out
}

/** Month-end snapshot dates for the `n` months ending at (and including) the month of `asOf`. The last point is asOf itself. */
export function monthEndPoints(asOf: ISODate, n: number): ISODate[] {
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 1; i--) pts.push(monthEnd(addMonths(monthStart(asOf), -i)))
  pts.push(asOf)
  return pts
}

export const inRange = (d: string | null | undefined, start: ISODate, end: ISODate): boolean => {
  if (!d) return false
  const x = dateOf(d)
  return x >= start && x <= end
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "30 Sep 2026" */
export function formatDate(d: string | null | undefined): string {
  if (!d || !isValidDate(d)) return '—'
  return `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
}
/** "Sep 2026" */
export function formatMonth(d: string): string {
  return `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
}
/** "Sep" or "Sep '26" */
export function formatMonthShort(d: string, withYear = false): string {
  const m = MONTHS[+d.slice(5, 7) - 1]
  return withYear ? `${m} '${d.slice(2, 4)}` : m
}
/** "1 Oct 2025 – 30 Sep 2026" */
export function formatRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`
}
