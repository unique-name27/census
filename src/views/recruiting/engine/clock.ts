/**
 * Where the time-to-fill clock stops, a dictionary setting: on the date the req's offer was
 * accepted (its filled date, the default), or at the hire's start date when the Employees data
 * has one. The start date is the employee the req's hire became (`rosterLink`: same name, started
 * within 200 days of accepting); a req without one, or whose start is after the as-of date, keeps
 * the offer accepted date.
 */
import type { Employee, ISODate, Requisition } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import type { TtfEnd } from '../metrics'
import { rosterLink } from './drills'
import { ttfDays } from './reqs'
import type { App } from './types'

/** Days to fill one filled requisition. */
export type TtfDays = (r: Requisition) => number

/** The start date of the hire who filled a req, or null when none is known by the as-of date. */
export function fillStartDate(
  r: Requisition,
  hires: readonly App[],
  roster: readonly Employee[],
  asOf: ISODate,
): ISODate | null {
  const filled = r.filledDate
  if (!filled || !hires.length) return null
  const startOf = (a: App) => {
    const s = rosterLink(a, roster)?.hireDate
    return s && s <= asOf && s >= r.openedDate ? s : null
  }
  // The hire whose acceptance filled the req (the filled date is the last offer accepted); with
  // several openings filled that day, the latest start. Else the latest hire accepted by then.
  let best: ISODate | null = null
  for (const a of hires) {
    if (a.exitDate !== filled) continue
    const s = startOf(a)
    if (s && (!best || s > best)) best = s
  }
  if (best) return best
  const earlier = hires
    .filter((a) => a.exitDate != null && a.exitDate < filled)
    .sort((x, y) => (y.exitDate ?? '').localeCompare(x.exitDate ?? ''))
  for (const a of earlier) {
    const s = startOf(a)
    if (s) return s
  }
  return null
}

/**
 * Days to fill under the setting in force. 'accepted' is `ttfDays` itself; 'start' measures to the
 * hire's start date where one is known (results are kept per requisition).
 */
export function ttfClock(
  end: TtfEnd,
  apps: readonly App[],
  roster: readonly Employee[],
  asOf: ISODate,
): TtfDays {
  if (end !== 'start') return ttfDays
  const byReq = new Map<string, App[]>()
  for (const a of apps) {
    if (a.outcome !== 'Hired' || !a.exitDate) continue
    const list = byReq.get(a.reqId)
    if (list) list.push(a)
    else byReq.set(a.reqId, [a])
  }
  const memo = new Map<Requisition, number>()
  return (r) => {
    let d = memo.get(r)
    if (d === undefined) {
      const start = fillStartDate(r, byReq.get(r.reqId) ?? [], roster, asOf)
      d = start ? Math.max(0, daysBetween(r.openedDate, start)) : ttfDays(r)
      memo.set(r, d)
    }
    return d
  }
}
