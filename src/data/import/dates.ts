/**
 * Date reading for imports. Output is always a calendar value (`YYYY-MM-DD` or
 * `YYYY-MM-DDTHH:mm`) taken from the components as written: nothing is ever shifted by a time
 * zone. Accepts Date cells (read as UTC by `readWorkbook`), Excel serial numbers, ISO text,
 * `YYYY/MM/DD`, `YYYYMMDD`, slashed dates in either day order, and month-name forms
 * ("30-Sep-2026", "Sep 30, 2026", "Tue, 30 September 2026 2:05 PM").
 */
import type { DateOrder, DateOrderGuess } from './types'

export interface DateParts {
  y: number
  m: number
  d: number
  hh: number
  mi: number
}

export type DateRead = { ok: true; parts: DateParts } | { ok: false; reason: 'unreadable' | 'out-of-range' }

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

/** Earliest and latest years accepted as real HR dates; anything outside is a misread value. */
const MIN_YEAR = 1920
const MAX_YEAR = 2100
const DAY_MS = 86_400_000
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

const TIME = String.raw`(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([ap])?\.?m?\.?)?`
const ZONE = String.raw`(?:\s*(?:Z|UTC|GMT|[+-]\d{2}:?\d{2}))?`
const RE_ISO = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME}${ZONE}$`, 'i')
const RE_COMPACT = /^(\d{4})(\d{2})(\d{2})$/
const RE_SLASH = new RegExp(String.raw`^(\d{1,2})([-/.])(\d{1,2})[-/.](\d{2}|\d{4})${TIME}${ZONE}$`, 'i')
const RE_DMONY = new RegExp(
  String.raw`^(\d{1,2})(?:st|nd|rd|th)?[-\s/.]+([a-z]{3,9})\.?,?[-\s/.]+(\d{2}|\d{4})${TIME}${ZONE}$`,
  'i',
)
const RE_MONDY = new RegExp(
  String.raw`^([a-z]{3,9})\.?[-\s/.]+(\d{1,2})(?:st|nd|rd|th)?,?[-\s/.]+(\d{2}|\d{4})${TIME}${ZONE}$`,
  'i',
)
const RE_WEEKDAY = /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const fullYear = (y: string) => (y.length === 4 ? +y : +y < 50 ? 2000 + +y : 1900 + +y)

function hour24(h: string | undefined, ampm: string | undefined): number {
  const n = h ? +h : 0
  if (!ampm) return n
  const pm = ampm.toLowerCase() === 'p'
  return (n % 12) + (pm ? 12 : 0)
}

function check(y: number, m: number, d: number, hh: number, mi: number): DateRead {
  if (!(m >= 1 && m <= 12 && d >= 1 && hh >= 0 && hh < 24 && mi >= 0 && mi < 60))
    return { ok: false, reason: 'unreadable' }
  if (d > daysIn(y, m)) return { ok: false, reason: 'unreadable' }
  if (y < MIN_YEAR || y > MAX_YEAR) return { ok: false, reason: 'out-of-range' }
  return { ok: true, parts: { y, m, d, hh, mi } }
}

function fromMs(t: number): DateRead {
  if (!Number.isFinite(t)) return { ok: false, reason: 'unreadable' }
  // Round to the minute: spreadsheet times often carry float noise (14:04:59.999).
  const x = new Date(Math.round(t / 60_000) * 60_000)
  return check(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes())
}

/** Excel serial day number (1 = 1900-01-01) to parts. Serials up to 60 sit before Excel's phantom 29 Feb 1900. */
export function excelSerialToParts(serial: number): DateRead {
  if (!(serial >= 1 && serial < 80_001)) return { ok: false, reason: 'unreadable' }
  const adj = serial < 61 ? serial + 1 : serial
  return fromMs(EXCEL_EPOCH + adj * DAY_MS)
}

/** Read one value. `order` decides ambiguous slashed dates such as 03/04/2026. */
export function readDate(v: unknown, order: DateOrder = 'MDY'): DateRead {
  if (v instanceof Date) return fromMs(v.getTime())
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 19_000_101 && v <= 21_001_231) {
      const s = String(v)
      return check(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8), 0, 0)
    }
    return excelSerialToParts(v)
  }
  if (typeof v !== 'string') return { ok: false, reason: 'unreadable' }
  const s = v.trim().replace(RE_WEEKDAY, '')
  if (!s) return { ok: false, reason: 'unreadable' }

  let m = RE_ISO.exec(s)
  if (m) return check(+m[1], +m[2], +m[3], hour24(m[4], m[7]), m[5] ? +m[5] : 0)
  m = RE_COMPACT.exec(s)
  if (m) return check(+m[1], +m[2], +m[3], 0, 0)
  if (/^\d{5}(?:\.\d+)?$/.test(s) && +s >= 20_000) return excelSerialToParts(+s)
  m = RE_SLASH.exec(s)
  if (m) {
    const a = +m[1]
    const b = +m[3]
    const dayFirst = a > 12 || (b <= 12 && order === 'DMY')
    return check(fullYear(m[4]), dayFirst ? b : a, dayFirst ? a : b, hour24(m[5], m[8]), m[6] ? +m[6] : 0)
  }
  m = RE_DMONY.exec(s)
  if (m && MONTHS[m[2].toLowerCase()])
    return check(fullYear(m[3]), MONTHS[m[2].toLowerCase()], +m[1], hour24(m[4], m[7]), m[5] ? +m[5] : 0)
  m = RE_MONDY.exec(s)
  if (m && MONTHS[m[1].toLowerCase()])
    return check(fullYear(m[3]), MONTHS[m[1].toLowerCase()], +m[2], hour24(m[4], m[7]), m[5] ? +m[5] : 0)
  return { ok: false, reason: 'unreadable' }
}

const pad = (n: number) => String(n).padStart(2, '0')
export const partsToDate = (p: DateParts): string => `${p.y}-${pad(p.m)}-${pad(p.d)}`
export const partsToDateTime = (p: DateParts): string => `${partsToDate(p)}T${pad(p.hh)}:${pad(p.mi)}`

/**
 * Day order of a column of slashed dates. Any first part above 12 means day-first; any second
 * part above 12 means month-first. With no telling value, dotted dates (30.09.2026) lean
 * day-first and everything else month-first, marked uncertain.
 */
export function detectDateOrder(values: readonly unknown[]): DateOrderGuess {
  let dmy = 0
  let mdy = 0
  let dotted = 0
  let slashed = 0
  for (const v of values) {
    if (typeof v !== 'string') continue
    const m = RE_SLASH.exec(v.trim().replace(RE_WEEKDAY, ''))
    if (!m) continue
    slashed++
    if (m[2] === '.') dotted++
    if (+m[1] > 12) dmy++
    else if (+m[3] > 12) mdy++
  }
  if (dmy && !mdy) return { order: 'DMY', certain: true }
  if (mdy && !dmy) return { order: 'MDY', certain: true }
  if (dmy && mdy) return { order: dmy >= mdy ? 'DMY' : 'MDY', certain: false }
  return { order: slashed > 0 && dotted / slashed > 0.5 ? 'DMY' : 'MDY', certain: false }
}

/** True when the value reads as a date without relying on Excel serial numbers. */
export function looksLikeDate(v: unknown): boolean {
  if (typeof v === 'number') return false
  return readDate(v).ok
}
