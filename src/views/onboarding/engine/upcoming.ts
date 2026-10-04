/**
 * Upcoming starts (docs/VIEWS.md, Onboarding > Upcoming starts): who starts in the next 90 days,
 * whether each of them will be ready on day one, open contingencies, notice periods and reneges.
 */
import type { AnalyticsContext } from '@/data/context'
import { type Candidate, type ISODate, onboardingTaskByName } from '@/data/schema'
import { addBusinessDays, addDays, daysBetween, ms } from '@/lib/dates'
import { inWindow } from '@/lib/people'
import { median } from '@/lib/stats'
import type { OnboardingBase } from './base'
import {
  byUrgency,
  countryOf,
  isAccepted,
  type Readiness,
  readinessOf,
  readinessTasks,
  type Start,
  type TaskView,
} from './starts'

/** The tasks that clear the contingencies of an offer (Atlas ON-01 weekly exception). */
export const CONTINGENCY_TASKS: readonly string[] = ['Background check cleared', 'Export-control screening']

export interface UpcomingRow {
  start: Start
  readiness: Readiness
}

export interface StartWithTasks {
  start: Start
  tasks: TaskView[]
}

export interface CalendarRow {
  /** Monday of the start week. */
  week: ISODate
  businessUnit: string
  starts: number
  people: Start[]
}

export interface DaysRow {
  location: string
  /** Median days, null when hidden under the anonymity minimum. */
  days: number | null
  offers: number
  records: Candidate[]
}

export interface RenegeCount {
  accepted: Candidate[]
  reneged: Candidate[]
  rate: number | null
}

export interface RenegeRow extends RenegeCount {
  location: string
}

export interface TaskReadinessRow {
  task: string
  owner: string
  starts: number
  done: number
  open: number
  pastDue: number
  share: number | null
  items: StartWithTasks[]
}

export interface OwnerReadinessRow {
  owner: string
  tasks: number
  done: number
  open: number
  pastDue: number
  share: number | null
  items: StartWithTasks[]
}

export interface UpcomingModel {
  rows: UpcomingRow[]
  in30: Start[]
  in60: Start[]
  in90: Start[]
  /** Starts in the Day -3 look-ahead with an open task due on or before start − 3 days. */
  dayMinus3: StartWithTasks[]
  dayMinus3End: ISODate
  /** Starts in the contingency look-ahead with an open background check or screening. */
  contingencies: StartWithTasks[]
  contingencyEnd: ISODate
  weeks: ISODate[]
  calendar: CalendarRow[]
  /** Upcoming starts after the calendar's last week. */
  beyondCalendar: number
  acceptToStart: { days: number | null; offers: Candidate[]; byLocation: DaysRow[] }
  renege: RenegeCount & {
    prior: RenegeCount
    company: RenegeCount
    tracked: RenegeCount & { country: string }
    byLocation: RenegeRow[]
  }
  horizonEnd: ISODate
  byTask: TaskReadinessRow[]
  byOwner: OwnerReadinessRow[]
}

/** Monday of the week a date falls in. */
export function weekOf(d: ISODate): ISODate {
  const wd = new Date(ms(d)).getUTCDay()
  return addDays(d, -((wd + 6) % 7))
}

const share = (n: number, d: number): number | null => (d > 0 ? n / d : null)

/** Accepted offers in a window and those later withdrawn (reneges). */
export function renegeCount(
  candidates: readonly Candidate[],
  w: { start: ISODate; end: ISODate },
): RenegeCount {
  const accepted = candidates.filter(
    (c) => !!c.hiredDate && inWindow(c.hiredDate, w) && (c.status === 'Hired' || c.status === 'Withdrawn'),
  )
  const reneged = accepted.filter((c) => c.status === 'Withdrawn')
  return { accepted, reneged, rate: share(reneged.length, accepted.length) }
}

export function computeUpcoming(b: OnboardingBase, ctx: AnalyticsContext): UpcomingModel {
  const s = b.settings
  const { asOf } = b
  const starts = b.upcoming.starts
  const rows = starts.map((start) => ({ start, readiness: readinessOf(start, asOf, s) }))
  const until = (days: number) => addDays(asOf, days)
  const within = (end: ISODate) => starts.filter((p) => p.startDate <= end)

  // Day -3 tasks not done.
  const dayMinus3End = until(s.dayMinus3Days)
  const dayMinus3 = within(dayMinus3End).flatMap((start) => {
    const cut = addDays(start.startDate, -3)
    const tasks = start.tasks.filter((t) => t.open && !!t.due && t.due <= cut).sort(byUrgency)
    return tasks.length ? [{ start, tasks }] : []
  })

  // Open contingencies in the next business days.
  const contingencyEnd = addBusinessDays(asOf, s.contingencyBusinessDays)
  const contingencies = within(contingencyEnd).flatMap((start) => {
    const tasks = start.tasks.filter((t) => t.open && CONTINGENCY_TASKS.includes(t.name)).sort(byUrgency)
    return tasks.length ? [{ start, tasks }] : []
  })

  // Start calendar by week and business unit.
  const first = weekOf(addDays(asOf, 1))
  const weeks = Array.from({ length: s.calendarWeeks }, (_, i) => addDays(first, 7 * i))
  const lastDay = addDays(weeks[weeks.length - 1], 6)
  const cells = new Map<string, CalendarRow>()
  for (const p of starts) {
    if (p.startDate > lastDay) continue
    const week = weekOf(p.startDate)
    const bu = p.businessUnit ?? 'Unknown'
    const k = `${week}|${bu}`
    const row = cells.get(k) ?? { week, businessUnit: bu, starts: 0, people: [] }
    row.starts++
    row.people.push(p)
    cells.set(k, row)
  }
  const calendar = [...cells.values()].sort(
    (a, b2) => a.week.localeCompare(b2.week) || a.businessUnit.localeCompare(b2.businessUnit),
  )

  // Offer accepted to start, by location (internal moves have no notice period).
  const offers = ctx.data.candidates.filter(
    (c) =>
      isAccepted(c) &&
      !!c.startDate &&
      c.source !== 'Internal' &&
      inWindow(c.hiredDate, b.window) &&
      c.startDate >= c.hiredDate!,
  )
  const daysOf = (c: Candidate) => daysBetween(c.hiredDate!, c.startDate!)
  const locOf = (c: Candidate) => b.reqs.get(c.reqId)?.location ?? 'Unknown'
  const byLoc = new Map<string, Candidate[]>()
  for (const c of offers) {
    const k = locOf(c)
    byLoc.set(k, [...(byLoc.get(k) ?? []), c])
  }
  const hide = (v: number | null, n: number) => (n >= s.minGroup ? v : null)
  const acceptToStart = {
    days: hide(median(offers.map(daysOf)), offers.length),
    offers,
    byLocation: [...byLoc.entries()]
      .map(([location, records]) => ({
        location,
        days: hide(median(records.map(daysOf)), records.length),
        offers: records.length,
        records,
      }))
      .sort((a, b2) => (b2.days ?? -1) - (a.days ?? -1) || b2.offers - a.offers),
  }

  // Reneges.
  const scoped = renegeCount(ctx.data.candidates, b.window)
  const trackedCountry = s.trackedCountry
  const inCountry = (c: Candidate) => countryOf(locOf(c)) === trackedCountry
  const tracked = {
    country: trackedCountry,
    ...renegeCount(ctx.data.candidates.filter(inCountry), b.window),
  }
  const locs = new Map<string, Candidate[]>()
  for (const c of scoped.accepted) {
    const k = locOf(c)
    locs.set(k, [...(locs.get(k) ?? []), c])
  }
  const byLocation = [...locs.entries()]
    .map(([location, list]) => ({ location, ...renegeCount(list, b.window) }))
    .map((r) => ({ ...r, rate: r.accepted.length >= s.minGroup ? r.rate : null }))
    .sort((a, b2) => b2.reneged.length - a.reneged.length || (b2.rate ?? -1) - (a.rate ?? -1))
  const renege = {
    ...scoped,
    prior: renegeCount(ctx.data.candidates, b.prior),
    company: renegeCount(ctx.all.candidates, b.window),
    tracked,
    byLocation,
  }

  // Readiness by task and by owner, for starts in the look-ahead.
  const horizonEnd = until(s.readinessHorizonDays)
  const soon = within(horizonEnd)
  const taskRows = new Map<string, TaskReadinessRow>()
  const ownerRows = new Map<string, OwnerReadinessRow>()
  for (const start of soon) {
    for (const t of readinessTasks(start)) {
      const tr = taskRows.get(t.name) ?? {
        task: t.name,
        owner: t.owner,
        starts: 0,
        done: 0,
        open: 0,
        pastDue: 0,
        share: null,
        items: [],
      }
      tr.starts++
      if (t.done) tr.done++
      else tr.open++
      if (t.pastDue) tr.pastDue++
      if (t.open) tr.items.push({ start, tasks: [t] })
      taskRows.set(t.name, tr)
      const or = ownerRows.get(t.owner) ?? {
        owner: t.owner,
        tasks: 0,
        done: 0,
        open: 0,
        pastDue: 0,
        share: null,
        items: [],
      }
      or.tasks++
      if (t.done) or.done++
      else or.open++
      if (t.pastDue) or.pastDue++
      if (t.open) {
        const it = or.items.find((x) => x.start === start)
        if (it) it.tasks.push(t)
        else or.items.push({ start, tasks: [t] })
      }
      ownerRows.set(t.owner, or)
    }
  }
  const order = (task: string) => {
    const i = [...onboardingTaskByName.keys()].indexOf(task)
    return i < 0 ? 99 : i
  }
  const byTask = [...taskRows.values()]
    .map((r) => ({ ...r, share: share(r.done, r.starts) }))
    .sort((a, b2) => order(a.task) - order(b2.task) || a.task.localeCompare(b2.task))
  const byOwner = [...ownerRows.values()]
    .map((r) => ({ ...r, share: share(r.done, r.tasks) }))
    .sort((a, b2) => (a.share ?? 2) - (b2.share ?? 2) || a.owner.localeCompare(b2.owner))

  return {
    rows,
    in30: within(until(30)),
    in60: within(until(60)),
    in90: within(until(90)),
    dayMinus3,
    dayMinus3End,
    contingencies,
    contingencyEnd,
    weeks,
    calendar,
    beyondCalendar: starts.filter((p) => p.startDate > lastDay).length,
    acceptToStart,
    renege,
    horizonEnd,
    byTask,
    byOwner,
  }
}
