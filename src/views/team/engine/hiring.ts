/**
 * My team, Hiring (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): who starts in each of the next
 * weeks and whether they will be ready on day one, the org's open reqs with their pipeline health,
 * and the upcoming starts one by one. Read from Onboarding's and Recruiting's models for the scope,
 * so every count is theirs. Pure.
 */
import type { Severity } from '@/components/types'
import type { ISODate } from '@/data/schema'
import { addDays, formatDate } from '@/lib/dates'
import type { OnboardingModel } from '@/views/onboarding/engine'
import type { ReadyStatus, Start } from '@/views/onboarding/engine/starts'
import { blockingWords, type UpcomingRow } from '@/views/onboarding/engine/upcoming'
import type { RecruitingModel } from '@/views/recruiting/engine'
import type { OpenReqRow } from '@/views/recruiting/engine/reqs'

/** Readiness in the calendar's stack order: ready at the base, not ready on top. */
export const READY_ORDER: readonly ReadyStatus[] = ['Ready', 'On track', 'Behind', 'Not ready', 'No tasks']

export interface WeekRow {
  /** Monday of the start week. */
  week: ISODate
  /** "5 Oct", the axis label. */
  weekOf: string
  status: ReadyStatus
  starts: number
  /** The people starting that week in that state. */
  people: Start[]
}

const weekLabel = (iso: ISODate) => formatDate(iso).replace(/ \d{4}$/, '')

/**
 * Starts per week for the Onboarding start calendar's weeks (13 by default), split by day-one
 * readiness. Every week has a row per state (zero when nobody), so the axis keeps every week.
 */
export function startCalendar(o: OnboardingModel): WeekRow[] {
  const u = o.upcoming
  const out: WeekRow[] = []
  for (const week of u.weeks) {
    const end = addDays(week, 6)
    const inWeek = u.rows.filter((r) => r.start.startDate >= week && r.start.startDate <= end)
    for (const status of READY_ORDER) {
      const people = inWeek.filter((r) => r.readiness.status === status).map((r) => r.start)
      out.push({ week, weekOf: weekLabel(week), status, starts: people.length, people })
    }
  }
  return out
}

/** Upcoming starts after the calendar's last week (said in the note, not drawn). */
export function startsAfterCalendar(o: OnboardingModel): number {
  const last = o.upcoming.weeks.at(-1)
  if (!last) return o.upcoming.rows.length
  const end = addDays(last, 6)
  return o.upcoming.rows.filter((r) => r.start.startDate > end).length
}

export interface StartRow {
  name: string
  role: string | null
  hiringManager: string | null
  startDate: ISODate
  daysToGo: number
  /** "7 of 9 done", or null without day-one tasks. */
  readiness: string | null
  status: ReadyStatus | null
  /** The open day-one task due first, with its due date. */
  blocking: string | null
  r: UpcomingRow
}

/** Everyone who starts after the as-of date, soonest first (Onboarding's upcoming starts). */
export function startRows(o: OnboardingModel): StartRow[] {
  return o.upcoming.rows.map((r) => ({
    name: r.start.name,
    role: r.start.role,
    hiringManager: r.start.hiringManager,
    startDate: r.start.startDate,
    daysToGo: r.readiness.daysToGo,
    readiness: r.readiness.total ? `${r.readiness.done} of ${r.readiness.total} done` : null,
    status: r.readiness.status === 'No tasks' ? null : r.readiness.status,
    // Manager mode words a background check or screening as the team holding it, as Onboarding does.
    blocking: blockingWords(r.readiness, o.base.masked),
    r,
  }))
}

export interface ReqRow {
  reqId: string
  title: string | null
  daysOpen: number
  /** Active candidates on the req. */
  active: number
  /** Active candidates past the usual time for their stage without a next step. */
  lacking: number
  health: string
  severity: Severity | null
  row: OpenReqRow
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** The org's open reqs, the ones that need attention first, then the longest open. */
export function openReqRows(r: RecruitingModel): ReqRow[] {
  return r.base.req.rows
    .map((row) => ({
      reqId: row.reqId,
      title: row.title,
      daysOpen: row.daysOpen,
      active: row.active,
      lacking: row.lacking,
      health: row.health,
      severity: row.severity,
      row,
    }))
    .sort(
      (a, b) =>
        (a.severity ? SEVERITY_RANK[a.severity] : 9) - (b.severity ? SEVERITY_RANK[b.severity] : 9) ||
        b.daysOpen - a.daysOpen ||
        a.reqId.localeCompare(b.reqId),
    )
}
