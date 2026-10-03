/**
 * Day-number calendar for the generator. A Day is an integer count of days since 1970-01-01 (UTC).
 * All generator arithmetic happens on Days and minutes; ISO strings are produced only when rows
 * are emitted, through a small cache because the same few thousand dates repeat constantly.
 */
import type { ISODate, ISODateTime } from '../schema'

export type Day = number

const MS_PER_DAY = 86_400_000
const isoCache = new Map<Day, ISODate>()

export const ymd = (y: number, m: number, d: number): Day => Date.UTC(y, m - 1, d) / MS_PER_DAY

export const day = (s: string): Day => ymd(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10))

export function iso(d: Day): ISODate {
  let s = isoCache.get(d)
  if (s === undefined) {
    s = new Date(d * MS_PER_DAY).toISOString().slice(0, 10)
    isoCache.set(d, s)
  }
  return s
}

export const isoOrNull = (d: Day | null | undefined): ISODate | null => (d == null ? null : iso(d))

/** `YYYY-MM-DDTHH:mm` for a count of minutes since the epoch. */
export function isoMinute(minute: number): ISODateTime {
  const d = Math.floor(minute / 1440)
  const m = minute - d * 1440
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${iso(d)}T${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export const weekday = (d: Day): number => (((d + 4) % 7) + 7) % 7

export function isWeekend(d: Day): boolean {
  const w = weekday(d)
  return w === 0 || w === 6
}

/** d itself on a weekday, otherwise the following Monday. */
export function onOrAfterWeekday(d: Day): Day {
  const w = weekday(d)
  return w === 6 ? d + 2 : w === 0 ? d + 1 : d
}

/** d itself on a weekday, otherwise the preceding Friday. */
export function onOrBeforeWeekday(d: Day): Day {
  const w = weekday(d)
  return w === 6 ? d - 1 : w === 0 ? d - 2 : d
}

/** The first Monday on or after d (start dates fall on Mondays). */
export const nextMonday = (d: Day): Day => d + ((8 - weekday(d)) % 7)

/** The first Friday on or after d. */
export const nextFriday = (d: Day): Day => d + ((12 - weekday(d)) % 7)

export function addBusinessDays(d: Day, n: number): Day {
  let t = d
  let left = Math.abs(n)
  const step = n >= 0 ? 1 : -1
  while (left > 0) {
    t += step
    if (!isWeekend(t)) left--
  }
  return t
}

function parts(d: Day): [number, number, number] {
  const t = new Date(d * MS_PER_DAY)
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]
}

export const yearOf = (d: Day): number => parts(d)[0]

export function monthStart(d: Day): Day {
  const [y, m] = parts(d)
  return ymd(y, m, 1)
}

export function monthEnd(d: Day): Day {
  const [y, m] = parts(d)
  return Date.UTC(y, m, 0) / MS_PER_DAY
}

/** Fixed reference date of the sample company. */
export const AS_OF: Day = day('2026-09-30')
/** First day of the company. */
export const FOUNDED: Day = day('2014-03-03')
/** Start of the trailing-12-month window (inclusive). */
export const T12_START: Day = day('2025-10-01')
/** Start of the 24-month operational window (inclusive). */
export const T24_START: Day = day('2024-10-01')
