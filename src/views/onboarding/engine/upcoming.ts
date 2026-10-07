/**
 * Upcoming starts (docs/VIEWS.md, Onboarding > Upcoming starts): who starts in the next 90 days,
 * whether each of them will be ready on day one, open contingencies, notice periods and reneges.
 */
import type { AnalyticsContext } from '@/data/context'
import { type Candidate, type ISODate, onboardingTaskByName } from '@/data/schema'
import { addBusinessDays, addDays, daysBetween, formatDate, ms } from '@/lib/dates'
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

/** Form I-9 tasks: a Compliance measure, which Manager mode leaves out of readiness by task. */
export const isI9Task = (name: string): boolean => name.startsWith('I-9 ')

/**
 * The blocking item in words: "Background check cleared, due 16 Oct 2026". With `masked`
 * (Manager mode) a contingency task reads as the team holding it ("With People ops"), as the
 * countdown words it.
 */
export function blockingWords(r: Pick<Readiness, 'blocking'>, masked: boolean): string | null {
  const t = r.blocking
  if (!t) return null
  if (masked && CONTINGENCY_TASKS.includes(t.name)) return `With ${t.owner}`
  return `${t.name}${t.due ? `, due ${formatDate(t.due)}` : ''}`
}

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
    .filter((r) => !(b.masked && isI9Task(r.task)))
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

/* ───────────── countdown to day one ───────────── */

/** The row of a start with no day-one task open (every one done or not needed, or none at all). */
export const NOTHING_OPEN = 'Nothing open'

export interface CountdownRow {
  /** Employee ID, or the application ID for an accepted offer with no pre-hire yet. */
  key: string
  name: string
  startDate: ISODate
  daysToGo: number
  /** The team holding the blocking item (its owner), or "Nothing open". */
  owner: string
  /**
   * The blocking item in words. In Manager mode a background check or export-control screening
   * reads "With People ops" or "With Trade compliance", so a contingency outcome is never shown.
   */
  blocking: string | null
  status: Readiness['status']
  /** The tooltip title: "Ana Ruiz, Not ready". */
  label: string
  /** The start and their readiness (for the drill panel; not exported). */
  row: UpcomingRow
}

/**
 * Upcoming starts within `days` of the as-of date, each placed on the owner of the open day-one
 * task due first (the blocking item), soonest start first. `masked` words a contingency task as
 * the team holding it (Manager mode).
 */
export function countdownRows(rows: readonly UpcomingRow[], days: number, masked = false): CountdownRow[] {
  return rows
    .filter((r) => r.readiness.daysToGo <= days)
    .map((r) => {
      const blocking = r.readiness.blocking
      const status = r.readiness.status
      return {
        key: r.start.key,
        name: r.start.name,
        startDate: r.start.startDate,
        daysToGo: r.readiness.daysToGo,
        owner: blocking?.owner ?? NOTHING_OPEN,
        blocking: blocking
          ? masked && CONTINGENCY_TASKS.includes(blocking.name)
            ? `With ${blocking.owner}`
            : blocking.name
          : null,
        status,
        label: status === 'No tasks' ? `${r.start.name}, no day-one tasks` : `${r.start.name}, ${status}`,
        row: r,
      }
    })
    .sort((a, b) => a.daysToGo - b.daysToGo || a.name.localeCompare(b.name))
}

/** One cell of the countdown grid: the starts of one week whose blocking item one team holds. */
export interface CountdownCell {
  owner: string
  /** Monday of the start week. */
  week: ISODate
  /** "5 Oct", the column label. */
  weekLabel: string
  starts: number
  /** Not ready and behind starts in the cell (the ones a team is holding up). */
  atRisk: number
  /** "2 not ready · 9 on track": the readiness of the starts in the cell. */
  readiness: string
  rows: CountdownRow[]
}

const READINESS_ORDER: readonly Readiness['status'][] = [
  'Not ready',
  'Behind',
  'On track',
  'Ready',
  'No tasks',
]

/** "2 not ready · 1 behind · 9 on track": counts by readiness, worst first. */
export function readinessWords(rows: readonly Pick<CountdownRow, 'status'>[]): string {
  return READINESS_ORDER.flatMap((st) => {
    const n = rows.filter((r) => r.status === st).length
    return n ? [`${n} ${st === 'No tasks' ? 'with no day-one tasks' : st.toLowerCase()}`] : []
  }).join(' · ')
}

/**
 * The countdown as a grid: the team holding each start's blocking item (rows, in `owners` order,
 * only teams holding one, then "Nothing open") by start week, every week from the first start's
 * to `days` ahead of the as-of date, with the number of starts in each cell. A cell nobody falls in counts 0, so every
 * week keeps its place and every team its row. Starts on the same Monday land in one cell and
 * are counted, never drawn on top of each other.
 */
export function countdownGrid(
  rows: readonly CountdownRow[],
  asOf: ISODate,
  days: number,
  owners: readonly string[],
): CountdownCell[] {
  if (!rows.length) return []
  // From the first start's week to the look-ahead's last week, with no week left out between.
  const starts = rows.map((r) => weekOf(r.startDate)).sort()
  const first = starts[0]
  const end = weekOf(addDays(asOf, Math.max(1, days)))
  const last = starts[starts.length - 1] > end ? starts[starts.length - 1] : end
  const weeks: ISODate[] = []
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w)
  const held = new Set(rows.map((r) => r.owner))
  const order = [...owners.filter((o) => held.has(o)), ...[...held].filter((o) => !owners.includes(o)).sort()]
  const label = (w: ISODate) => formatDate(w).replace(/ \d{4}$/, '')
  return order.flatMap((owner) =>
    weeks.map((week) => {
      const inCell = rows.filter((r) => r.owner === owner && weekOf(r.startDate) === week)
      return {
        owner,
        week,
        weekLabel: label(week),
        starts: inCell.length,
        atRisk: inCell.filter((r) => r.status === 'Not ready' || r.status === 'Behind').length,
        readiness: readinessWords(inCell),
        rows: inCell,
      }
    }),
  )
}
