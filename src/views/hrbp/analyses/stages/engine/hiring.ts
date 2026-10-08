/**
 * Hiring in flight by stage (docs/ANALYSES.md, 4.4), never counted twice:
 *
 *  - accepted, not started: Onboarding's upcoming starts (accepted offers starting after the as-of
 *    date and pre-hire rows, matched so a person is one start);
 *  - open reqs: the openings of reqs open on the as-of date (on hold left out, and noted);
 *  - planned, no req yet: hiring plan starts in the planned starts window on lines with no req
 *    (Onboarding's plan coverage "No req"), so no open req covers them.
 *
 * A pre-hire row counts in its own job function's stage; an accepted offer and a req take the
 * stage of their department's most common job function. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate, Requisition } from '@/data/schema'
import { addDays, addMonths, monthEnd, monthKey } from '@/lib/dates'
import { onboardingBase } from '@/views/onboarding/engine/base'
import { coverageOf, linesOf, type PlanLineView, planVersions } from '@/views/onboarding/engine/plan'
import { isAccepted, type Start } from '@/views/onboarding/engine/starts'
import { isOpenAt } from '@/views/recruiting/engine/prepare'
import type { Placed, StagesBase } from './base'

export interface PlacedStart {
  start: Start
  place: Placed
}
export interface PlacedReq {
  req: Requisition
  place: Placed
}
export interface PlacedLine {
  view: PlanLineView
  place: Placed
}

export interface InFlight {
  starts: PlacedStart[]
  /** Reqs open on the as-of date, in engineering. */
  reqs: PlacedReq[]
  /** Engineering reqs on hold: left out of open reqs, and noted. */
  onHold: PlacedReq[]
  /** Plan lines with no req in the window; null when the mode hides planned starts. */
  planned: PlacedLine[] | null
  /** The planned starts window, first and last day. */
  window: { start: ISODate; end: ISODate; months: number }
  hasReqs: boolean
  hasPlan: boolean
  hasCandidates: boolean
}

/** The planned starts window: from the first open month after the as-of date, `months` long. */
export function plannedWindow(
  asOf: ISODate,
  months: number,
): { start: ISODate; end: ISODate; months: number } {
  const start = `${monthKey(addDays(asOf, 1))}-01`
  return { start, end: monthEnd(addMonths(start, Math.max(1, months) - 1)), months }
}

/** Openings on reqs open on a date, in engineering (the Open engineering reqs tile and its change). */
export function openReqsAt(b: StagesBase, date: ISODate): PlacedReq[] {
  const out: PlacedReq[] = []
  for (const req of b.ctx.data.requisitions) {
    if (!isOpenAt(req, date)) continue
    const place = b.placeOfDepartment(req.department)
    if (place) out.push({ req, place })
  }
  return out
}

export const openings = (reqs: readonly PlacedReq[]): number =>
  reqs.reduce((n, r) => n + Math.max(0, r.req.openings || 0), 0)

export function inFlight(b: StagesBase, showPlanned: boolean): InFlight {
  const ctx: AnalyticsContext = b.ctx
  const ob = onboardingBase(ctx)
  const starts: PlacedStart[] = []
  for (const start of ob.upcoming.starts) {
    // Interns joining count only while interns count with employees.
    if (start.employee?.employmentType === 'Intern' && !b.set.countInterns) continue
    const place = start.employee
      ? b.placeOf(start.employee)
      : b.placeOfDepartment(start.req?.department ?? start.department)
    if (place) starts.push({ start, place })
  }

  const reqs = openReqsAt(b, b.asOf)
  const onHold: PlacedReq[] = []
  for (const req of ctx.data.requisitions) {
    if (req.status !== 'On hold') continue
    const place = b.placeOfDepartment(req.department)
    if (place) onHold.push({ req, place })
  }

  const window = plannedWindow(b.asOf, b.set.planMonths)
  let planned: PlacedLine[] | null = null
  if (showPlanned) {
    planned = []
    const { latest } = planVersions(ctx.all.hiringPlan)
    const lines = linesOf(ctx.data.hiringPlan, latest)
    const acceptedOn = new Map<string, number>()
    for (const c of ctx.all.candidates)
      if (isAccepted(c)) acceptedOn.set(c.reqId, (acceptedOn.get(c.reqId) ?? 0) + 1)
    for (const view of coverageOf(lines, ob.reqs, acceptedOn)) {
      if (view.coverage !== 'no-req') continue
      if (view.line.period < window.start || view.line.period > window.end) continue
      if (!(view.line.plannedHires > 0)) continue
      const place = b.placeOfDepartment(view.req?.department ?? view.line.department)
      if (place) planned.push({ view, place })
    }
  }
  return {
    starts,
    reqs,
    onHold,
    planned,
    window,
    hasReqs: ctx.all.requisitions.length > 0,
    hasPlan: ctx.all.hiringPlan.length > 0,
    hasCandidates: ctx.all.candidates.length > 0,
  }
}

export const plannedStarts = (lines: readonly PlacedLine[]): number =>
  lines.reduce((n, l) => n + l.view.line.plannedHires, 0)
