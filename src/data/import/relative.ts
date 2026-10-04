/**
 * Two date forms only some fields accept:
 *  - relative days for onboarding due dates ("Day -3", "D+30", "3 business days after start"),
 *    converted once the person's start date is known;
 *  - month-only periods for the hiring plan ("Nov 2026", "2026-11", "11/2026"), stored as the
 *    first day of the month.
 * Pure; tested in relative.test.ts.
 */
import { addBusinessDays, addDays } from '@/lib/dates'
import type { ISODate } from '../schema'
import { readDate } from './dates'
import type { DateOrder } from './types'

/** A due date written relative to the start date (day 0). */
export interface RelativeDay {
  /** Days from the start; negative is before it. */
  offset: number
  /** Working days (Mon-Fri) rather than calendar days. */
  business: boolean
  /** The value as written, for the import log. */
  text: string
}

const MINUS = /[−–—]/g
const BUSINESS = /\b(?:bd|bds|business days?|working days?|wd|wds)\b/

/**
 * Read "Day -3", "day 0", "D-1", "T-3", "Day +30", "-3 BD", "3 business days after start" or
 * "2 days before start". A bare number is not relative (it may be a date serial); it needs a
 * day prefix, a sign or a unit.
 */
export function readRelativeDay(v: unknown): RelativeDay | null {
  if (typeof v !== 'string') return null
  const text = v.trim()
  const t = text.toLowerCase().replace(MINUS, '-').replace(/\s+/g, ' ')
  if (!t) return null
  const business = BUSINESS.test(t)
  // "3 business days after start", "2 days before the start date"
  let m =
    /^(\d{1,3}) ?(?:calendar |business |working )?(?:days?|bds?|wds?) (before|after|from) (?:the )?(?:start|start date|first day|day 1|hire date)$/.exec(
      t,
    )
  if (m) return { offset: (m[2] === 'before' ? -1 : 1) * Number(m[1]), business, text }
  // "Day -3", "D-1", "T-3", "Day +30 BD", "Day 0"
  m =
    /^(?:day|d|t|start) ?([+-])? ?(\d{1,3})(?: ?\(?(?:bd|bds|business days?|working days?|wd|wds)\)?)?$/.exec(
      t,
    )
  if (m) return { offset: (m[1] === '-' ? -1 : 1) * Number(m[2]), business, text }
  // "-3", "+5 BD", "3 BD"
  m = /^([+-]) ?(\d{1,3})(?: ?(?:bd|bds|business days?|working days?|wd|wds|days?))?$/.exec(t)
  if (m) return { offset: (m[1] === '-' ? -1 : 1) * Number(m[2]), business, text }
  m = /^(\d{1,3}) ?(?:bd|bds|business days?|working days?|wd|wds)$/.exec(t)
  if (m) return { offset: Number(m[1]), business: true, text }
  return null
}

/** The calendar date of a relative day, counted from the start date. */
export function resolveRelativeDay(start: ISODate, r: Pick<RelativeDay, 'offset' | 'business'>): ISODate {
  return r.business ? addBusinessDays(start, r.offset) : addDays(start, r.offset)
}

/** "3 days before the start", "on the start date", "3 business days after the start". */
export function describeRelativeDay(r: Pick<RelativeDay, 'offset' | 'business'>): string {
  if (r.offset === 0) return 'on the start date'
  const n = Math.abs(r.offset)
  const unit = r.business ? (n === 1 ? 'business day' : 'business days') : n === 1 ? 'day' : 'days'
  return `${n} ${unit} ${r.offset < 0 ? 'before' : 'after'} the start`
}

/** A relative due date waiting for its start date inside the importer (never stored). */
export interface PendingRelative {
  __relative: RelativeDay
}
export const isPendingRelative = (v: unknown): v is PendingRelative =>
  !!v && typeof v === 'object' && '__relative' in (v as object)

/* ───────────── months ───────────── */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: string) => (y.length === 4 ? Number(y) : 2000 + Number(y))
const monthStart = (y: number, m: number): ISODate | null =>
  y >= 1990 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${pad(m)}-01` : null

/**
 * The first day of the month a value names: a full date, "2026-11", "2026/11", "202611",
 * "11/2026", "Nov 2026", "November-26" or "Nov '26". Null when it names no month.
 */
export function readMonth(v: unknown, order: DateOrder = 'MDY'): ISODate | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 199_001 && v <= 210_012)
    return monthStart(Math.floor(v / 100), v % 100)
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase().replace(/[’']/g, '')
    let m = /^(\d{4})[-/. ](\d{1,2})$/.exec(t) ?? /^(\d{4})(\d{2})$/.exec(t)
    if (m) return monthStart(Number(m[1]), Number(m[2]))
    m = /^(\d{1,2})[-/. ](\d{4})$/.exec(t)
    if (m) return monthStart(Number(m[2]), Number(m[1]))
    m = /^([a-z]{3,9})\.?[-/ ,]*(\d{2}|\d{4})$/.exec(t)
    if (m) {
      const month = MONTHS[m[1].slice(0, m[1].startsWith('sept') ? 4 : 3)]
      if (month) return monthStart(fullYear(m[2]), month)
    }
    m = /^(\d{4})[-/ ,]*([a-z]{3,9})\.?$/.exec(t)
    if (m) {
      const month = MONTHS[m[2].slice(0, 3)]
      if (month) return monthStart(Number(m[1]), month)
    }
  }
  const d = readDate(v, order)
  return d.ok ? monthStart(d.parts.y, d.parts.m) : null
}
