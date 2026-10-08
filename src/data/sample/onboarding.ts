/**
 * Onboarding tasks (the Atlas ON-01 to ON-04 checklist in `ONBOARDING_TASKS`) for every employee
 * who started from 1 Jul 2025 and everyone about to start: pre-hires by employee ID, accepted
 * candidates who are not in the roster yet by application ID. Due dates follow the checklist
 * (Day -3, three business days, Day 30 and so on; probation decisions 10 business days before the
 * probation period ends, which depends on the country). US-only tasks (Form I-9) exist for US
 * sites only, probation decisions for sites outside the US only, and the export-control screening
 * is not needed outside Engineering and Operations.
 *
 * Planted (README, Onboarding):
 *  - laptops shipped after their Day -3 due date for 41% of the Asia Pacific starts in the last
 *    12 months (5% elsewhere), most of them arriving after the first day;
 *  - three people starting on 5 Oct 2026 whose background check has not cleared;
 *  - two pre-hires whose export-control screening is blocked by a pending license;
 *  - probation decisions overdue for four Sales starts outside the US;
 *  - 30/60/90-day check-ins missed or late in Software;
 *  - Form I-9 Section 2 completed after three business days for five US starts in the last 12
 *    months (the same dates as the Right to work extract).
 */
import { addBusinessDays, addDays, addMonths } from '@/lib/dates'
import {
  type Candidate,
  type Employee,
  ONBOARDING_TASKS,
  type OnboardingStatus,
  type OnboardingTask,
  type OnboardingTaskDef,
  type Requisition,
  siteByLocation,
} from '../schema'
import { AS_OF, iso } from './calendar'
import { OPS, SE, SS } from './departments'
import type { Rng } from './prng'

/** Starts covered: everyone who started from this date, and everyone about to start. */
export const ONBOARDING_FROM = '2025-07-01'
export const APAC_SITES: ReadonlySet<string> = new Set([
  'Bengaluru',
  'Hsinchu',
  'Shanghai',
  'Ho Chi Minh City',
])
/** Share of Asia Pacific starts in the last 12 months whose laptop shipped after Day -3. */
export const APAC_LAPTOP_LATE = 0.41
/** People starting next week (5 Oct 2026) whose background check has not cleared. */
export const BACKGROUND_NOT_CLEARED = 3
export const NEXT_WEEK = '2026-10-05'
/** Sales starts outside the US whose probation decision is overdue. */
export const SALES_PROBATION_OVERDUE = 4
/** US starts in the last 12 months whose I-9 Section 2 was completed after three business days. */
export const I9_LATE = 5
/** The department whose 30/60/90-day check-ins are missed or late. */
export const CHECKIN_DEPARTMENT = 'Software'

/** Probation period in months by country; the US has none (employment at will). */
export const PROBATION_MONTHS: Readonly<Record<string, number>> = {
  India: 6,
  Germany: 6,
  China: 6,
  Taiwan: 3,
  Israel: 3,
  Vietnam: 2,
  Canada: 3,
}

const T12_FROM = '2025-10-01'
/** Business units whose starts get export screening tasks (engineering and operations). */
const SCREENED_UNITS: ReadonlySet<string> = new Set([SE, SS, OPS])
const CHECK_INS = new Set(['30-day check-in', '60-day check-in', '90-day check-in'])

/** One person onboarding: a start in the roster (or a pre-hire), or an accepted candidate. */
export interface Starter {
  employeeId: string | null
  applicationId: string | null
  start: string
  site: string
  department: string
  businessUnit: string
  exit: string | null
}

/** Everyone the checklist covers, in start order: roster starts and pre-hires, then candidates. */
export function startersOf(
  employees: readonly Employee[],
  candidates: readonly Candidate[],
  requisitions: readonly Requisition[],
): Starter[] {
  const asOf = iso(AS_OF)
  const out: Starter[] = []
  const inRoster = new Set<string>()
  for (const e of employees) {
    if (e.employmentType !== 'Employee' || e.hireDate < ONBOARDING_FROM) continue
    inRoster.add(e.name)
    out.push({
      employeeId: e.employeeId,
      applicationId: null,
      start: e.hireDate,
      site: e.location,
      department: e.department,
      businessUnit: e.businessUnit,
      exit: e.terminationDate ?? null,
    })
  }
  const reqs = new Map(requisitions.map((r) => [r.reqId, r]))
  for (const c of candidates) {
    if (c.status !== 'Hired' || !c.startDate || c.startDate <= asOf || inRoster.has(c.candidateName)) continue
    const r = reqs.get(c.reqId)!
    out.push({
      employeeId: null,
      applicationId: c.applicationId,
      start: c.startDate,
      site: r.location,
      department: r.department,
      businessUnit: r.businessUnit,
      exit: null,
    })
  }
  return out.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      (a.employeeId ?? a.applicationId!).localeCompare(b.employeeId ?? b.applicationId!),
  )
}

const isUs = (site: string) => siteByLocation.get(site)?.country === 'United States'
const countryOf = (site: string) => siteByLocation.get(site)?.country ?? ''

/** The checklist due date for a person who starts on `start`. */
export function dueFor(def: OnboardingTaskDef, start: string, site: string): string | null {
  if (def.dueDay == null) {
    const months = PROBATION_MONTHS[countryOf(site)]
    return months ? addBusinessDays(addMonths(start, months), -10) : null
  }
  return def.businessDays ? addBusinessDays(start, def.dueDay) : addDays(start, def.dueDay)
}

/** The tasks that apply to a person: I-9 in the US, probation outside it. */
export function tasksFor(site: string): OnboardingTaskDef[] {
  return ONBOARDING_TASKS.filter((t) => {
    if (t.usOnly && !isUs(site)) return false
    if (t.dueDay == null && !PROBATION_MONTHS[countryOf(site)]) return false
    return true
  })
}

/** People who started with a pending export license (one) or are about to (two), by key. */
export interface ExportPlants {
  startedPending: string | null
  upcomingPending: string[]
}

export function onboardingTaskRows(
  employees: readonly Employee[],
  candidates: readonly Candidate[],
  requisitions: readonly Requisition[],
  rng: Rng,
  exportPlants: ExportPlants,
): OnboardingTask[] {
  const asOf = iso(AS_OF)
  const starters = startersOf(employees, candidates, requisitions)
  const past = starters.filter((s) => s.start <= asOf)
  const upcoming = starters.filter((s) => s.start > asOf)
  const keyOf = (s: Starter) => s.employeeId ?? s.applicationId!

  // Planted people, chosen from the data.
  const apacT12 = past.filter((s) => APAC_SITES.has(s.site) && s.start >= T12_FROM)
  const lateLaptop = new Set(rng.sample(apacT12, Math.round(apacT12.length * APAC_LAPTOP_LATE)).map(keyOf))
  const usT12 = past.filter((s) => isUs(s.site) && s.start >= T12_FROM)
  const lateI9 = new Set(rng.sample(usT12, I9_LATE).map(keyOf))
  const salesProbation = past.filter((s) => {
    if (s.department !== 'Sales' || s.exit) return false
    const due = dueFor(ONBOARDING_TASKS.find((t) => t.dueDay == null)!, s.start, s.site)
    return !!due && due <= iso(AS_OF - 5)
  })
  const overdueProbation = new Set(salesProbation.slice(-SALES_PROBATION_OVERDUE).map(keyOf))
  const bgcOpen = new Set(
    upcoming
      .filter((s) => s.start === NEXT_WEEK)
      .slice(0, BACKGROUND_NOT_CLEARED)
      .map(keyOf),
  )
  const exportBlocked = new Set(exportPlants.upcomingPending)

  const rows: OnboardingTask[] = []
  const add = (
    s: Starter,
    def: OnboardingTaskDef,
    due: string | null,
    status: OnboardingStatus,
    done: string | null,
  ) =>
    rows.push({
      employeeId: s.employeeId,
      applicationId: s.applicationId,
      task: def.task,
      owner: def.owner,
      dueDate: due,
      completedDate: done,
      status,
      processId: def.processId,
    })
  /** On time: on or a few days before the due date (never before the offer was accepted). */
  const onTime = (due: string, s: Starter, slack: number) => {
    const d = addDays(due, -rng.int(0, slack))
    const floor = addDays(s.start, -30)
    return d < floor ? floor : d
  }

  for (const s of past) {
    const key = keyOf(s)
    const screened = SCREENED_UNITS.has(s.businessUnit)
    for (const def of tasksFor(s.site)) {
      const due = dueFor(def, s.start, s.site)!
      const notNeeded = def.task === 'Export-control screening' && !screened
      if (notNeeded) {
        add(s, def, due, 'Not needed', null)
        continue
      }
      // Tasks due after the person left are not needed.
      if (def.phase === 'First 90 days' && s.exit && s.exit < due) {
        add(s, def, due, 'Not needed', null)
        continue
      }
      // Check-ins and probation decisions not due yet are open; anything else may be done early.
      const notDue = due > asOf
      let done: string | null
      switch (def.task) {
        case 'Laptop shipped': {
          const late =
            lateLaptop.has(key) ||
            (APAC_SITES.has(s.site) ? s.start < T12_FROM && rng.chance(APAC_LAPTOP_LATE) : rng.chance(0.05))
          done = late ? addDays(due, rng.int(1, 8)) : onTime(due, s, 6)
          break
        }
        case 'Background check cleared':
          done = rng.chance(0.015) ? addDays(due, rng.int(1, 2)) : onTime(due, s, 12)
          break
        case 'I-9 Section 1':
          done = rng.chance(0.01) ? addDays(due, 1) : onTime(due, s, 8)
          break
        case 'I-9 Section 2':
          done = lateI9.has(key)
            ? addBusinessDays(s.start, rng.int(4, 8))
            : addBusinessDays(s.start, notDue ? rng.int(0, 1) : rng.int(0, 3))
          break
        case 'Policy acknowledgments':
          done = rng.chance(0.07)
            ? addBusinessDays(s.start, rng.int(6, 12))
            : addBusinessDays(s.start, rng.int(0, 5))
          break
        case 'Probation decision':
          done = notDue
            ? null
            : overdueProbation.has(key)
              ? null
              : rng.chance(0.08)
                ? addDays(due, rng.int(1, 10))
                : addDays(due, -rng.int(0, 10))
          break
        default:
          if (CHECK_INS.has(def.task)) {
            const roll = rng.next()
            const [missed, late] = s.department === CHECKIN_DEPARTMENT ? [0.4, 0.15] : [0.03, 0.07]
            done = notDue
              ? null
              : roll < missed
                ? null
                : roll < missed + late
                  ? addDays(due, rng.int(3, 20))
                  : onTime(due, s, 4)
          } else {
            // Most pre-start tasks are done ahead; a late one usually still lands before the start.
            done = rng.chance(0.015) ? addDays(due, rng.int(1, 4)) : onTime(due, s, 8)
          }
      }
      if (done && done > asOf) done = null
      add(s, def, due, done ? 'Done' : rng.chance(0.4) ? 'In progress' : 'Not started', done)
    }
  }

  for (const s of upcoming) {
    const key = keyOf(s)
    const days = Math.round((Date.parse(s.start) - Date.parse(asOf)) / 86_400_000)
    const screened = SCREENED_UNITS.has(s.businessUnit)
    const apac = APAC_SITES.has(s.site)
    for (const def of tasksFor(s.site)) {
      const due = dueFor(def, s.start, s.site)
      const done = (status: OnboardingStatus) => {
        if (status !== 'Done') return add(s, def, due, status, null)
        const d = addDays(asOf, -rng.int(0, 12))
        add(s, def, due, 'Done', d)
      }
      switch (def.task) {
        case 'Background check cleared':
          done(
            bgcOpen.has(key)
              ? rng.chance(0.5)
                ? 'Blocked'
                : 'In progress'
              : days <= 16
                ? 'Done'
                : 'In progress',
          )
          break
        case 'Export-control screening':
          if (!screened) add(s, def, due, 'Not needed', null)
          else done(exportBlocked.has(key) ? 'Blocked' : days <= 45 ? 'Done' : 'In progress')
          break
        case 'Laptop shipped':
          done(days <= 7 && !apac ? 'Done' : days <= 21 ? 'In progress' : 'Not started')
          break
        case 'Accounts created':
          done(days <= 7 ? 'Done' : days <= 21 ? 'In progress' : 'Not started')
          break
        case 'Badge ready':
          done(days <= 7 && rng.chance(0.85) ? 'Done' : 'Not started')
          break
        case 'Benefits packet sent':
          done(days <= 14 ? 'Done' : 'Not started')
          break
        case 'Orientation booked':
          done(days <= 21 ? 'Done' : 'Not started')
          break
        case 'Manager welcome':
          done(days <= 7 && rng.chance(0.7) ? 'Done' : 'Not started')
          break
        case 'I-9 Section 1':
          done(days <= 7 && rng.chance(0.6) ? 'Done' : 'Not started')
          break
        default:
          done('Not started')
      }
    }
  }
  return rows
}
