/**
 * Forecast starts from open requisitions (docs/VIEWS.md, Onboarding > Hiring plan), with
 * Recruiting's own numbers: its stage pass rates and median days per stage, its median time to
 * fill (with the clock its dictionary sets) and the active pipeline per req. Imported from the
 * Recruiting engine, never copied, so both views mean the same thing.
 *
 * Per open req (openings not yet covered by an accepted offer):
 *  - the furthest active candidate is hired with the chance the pass rates give from their stage
 *    (P), on the as-of date plus the median days left from that stage;
 *  - the rest of the historical fill rate, max(0, fill rate − P), lands at the req's opened date
 *    plus the median time to fill (never earlier than one full median cycle from today);
 *  - both then add the median days from offer accepted to start for the req's location.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Candidate, ISODate, Requisition } from '@/data/schema'
import { addDays, daysBetween, monthKey } from '@/lib/dates'
import { median } from '@/lib/stats'
import { computeRecruiting } from '@/views/recruiting/engine'
import { cohort, stageFlow } from '@/views/recruiting/engine/flow'
import { medianTtf } from '@/views/recruiting/engine/reqs'
import { LAST_OPEN_STAGE } from '@/views/recruiting/engine/types'
import type { OnboardingBase } from './base'
import { isAccepted } from './starts'

export interface ForecastPart {
  /** Expected starts (a share of an opening). */
  weight: number
  /** Expected start date. */
  start: ISODate
  basis: 'pipeline' | 'time to fill'
}

export interface ForecastReq {
  req: Requisition
  /** Openings not yet covered by an accepted offer. */
  openings: number
  /** The furthest active candidate's stage (0 Applied … 4 Offer), or null without one. */
  leadStage: number | null
  /** Chance the furthest candidate is hired, from the stage pass rates. */
  pLead: number | null
  parts: ForecastPart[]
  /** Σ weights. */
  expected: number
}

export interface ForecastModel {
  /** Reqs filled ÷ reqs filled or cancelled in the window, company-wide. */
  fillRate: number | null
  filled: number
  cancelled: number
  /** Company median time to fill (days), with Recruiting's clock. */
  ttf: number | null
  ttfEndsAtStart: boolean
  /** Company stage pass rates (Applied … Offer) for the window's cohort. */
  passRates: (number | null)[]
  /** Median days to the next stage (Applied … Offer). */
  stageDays: (number | null)[]
  /** Median days from offer accepted to start, company and by location. */
  acceptToStart: number | null
  acceptToStartByLocation: ReadonlyMap<string, number>
  reqs: ForecastReq[]
}

/** Chance an application at `stage` reaches Hired: the product of the pass rates from there. */
export function chanceFrom(stage: number, pass: readonly (number | null)[]): number | null {
  let p = 1
  for (let i = stage; i <= LAST_OPEN_STAGE; i++) {
    const r = pass[i]
    if (r == null) return null
    p *= r
  }
  return p
}

/** Median days left from `stage` to an accepted offer (missing medians count as 0). */
export function daysFrom(stage: number, days: readonly (number | null)[]): number {
  let d = 0
  for (let i = stage; i <= LAST_OPEN_STAGE; i++) d += days[i] ?? 0
  return Math.round(d)
}

/** Median offer-accepted-to-start days, company and by req location (groups of the minimum or more). */
export function acceptToStartIndex(
  candidates: readonly Candidate[],
  reqs: ReadonlyMap<string, Requisition>,
  w: { start: ISODate; end: ISODate },
  min: number,
): { company: number | null; byLocation: Map<string, number> } {
  const by = new Map<string, number[]>()
  const all: number[] = []
  for (const c of candidates) {
    if (!isAccepted(c) || !c.startDate || c.source === 'Internal') continue
    if (c.hiredDate! < w.start || c.hiredDate! > w.end || c.startDate < c.hiredDate!) continue
    const d = daysBetween(c.hiredDate!, c.startDate)
    all.push(d)
    const loc = reqs.get(c.reqId)?.location
    if (loc) by.set(loc, [...(by.get(loc) ?? []), d])
  }
  const byLocation = new Map<string, number>()
  for (const [loc, xs] of by) if (xs.length >= min) byLocation.set(loc, median(xs)!)
  return { company: all.length >= min ? median(all) : null, byLocation }
}

export function computeForecast(b: OnboardingBase, ctx: AnalyticsContext): ForecastModel {
  const rec = computeRecruiting(ctx)
  const rb = rec.base
  const flow = stageFlow(cohort(rb.companyApps, rb.window), [], rb.settings.minGroup)
  const passRates = flow.stages.map((s) => s.pass)
  const stageDays = flow.stages.map((s) => s.medianDays)
  const ttf = medianTtf(rb.companyFilled, rb.ttf)
  const ttfEndsAtStart = rb.settings.ttfEnd === 'start'
  const filled = rb.companyFilled.length
  const cancelled = rb.companyReqs.filter(
    (r) =>
      r.status === 'Cancelled' &&
      !!r.closedDate &&
      r.closedDate >= b.window.start &&
      r.closedDate <= b.window.end,
  ).length
  const fillRate = filled + cancelled > 0 ? filled / (filled + cancelled) : null
  const ats = acceptToStartIndex(ctx.all.candidates, b.reqs, b.window, b.settings.minGroup)
  const atsOf = (loc: string) => ats.byLocation.get(loc) ?? ats.company ?? 0

  // Accepted offers per req, and the furthest active candidate per req.
  const acceptedOn = new Map<string, number>()
  for (const c of ctx.all.candidates)
    if (isAccepted(c)) acceptedOn.set(c.reqId, (acceptedOn.get(c.reqId) ?? 0) + 1)
  const lead = new Map<string, number>()
  for (const x of rb.actives) {
    const prev = lead.get(x.app.reqId)
    if (prev == null || x.stage > prev) lead.set(x.app.reqId, x.stage)
  }
  const cycle = daysFrom(0, stageDays)
  const reqs: ForecastReq[] = []
  for (const r of ctx.data.requisitions) {
    if (r.status !== 'Open') continue
    const openings = Math.max(0, (r.openings || 1) - (acceptedOn.get(r.reqId) ?? 0))
    if (!openings) continue
    const leadStage = lead.get(r.reqId) ?? null
    const pLead = leadStage == null ? null : chanceFrom(leadStage, passRates)
    const parts: ForecastPart[] = []
    if (leadStage != null && pLead != null && pLead > 0) {
      const accepted = addDays(b.asOf, Math.max(1, daysFrom(leadStage, stageDays)))
      parts.push({ weight: openings * pLead, start: addDays(accepted, atsOf(r.location)), basis: 'pipeline' })
    }
    const rest = Math.max(0, (fillRate ?? 0) - (pLead ?? 0))
    if (rest > 0 && ttf != null) {
      const byTtf = addDays(r.openedDate, Math.round(ttf))
      const earliest = addDays(b.asOf, Math.max(1, cycle))
      const accepted = byTtf > earliest ? byTtf : earliest
      const start = ttfEndsAtStart && byTtf > earliest ? accepted : addDays(accepted, atsOf(r.location))
      parts.push({ weight: openings * rest, start, basis: 'time to fill' })
    }
    reqs.push({
      req: r,
      openings,
      leadStage,
      pLead,
      parts,
      expected: parts.reduce((s, p) => s + p.weight, 0),
    })
  }
  return {
    fillRate,
    filled,
    cancelled,
    ttf,
    ttfEndsAtStart,
    passRates,
    stageDays,
    acceptToStart: ats.company,
    acceptToStartByLocation: ats.byLocation,
    reqs,
  }
}

/** Expected starts by start month ("YYYY-MM") between two dates. */
export function forecastByMonth(f: ForecastModel, from: ISODate, to: ISODate): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of f.reqs)
    for (const p of r.parts)
      if (p.start >= from && p.start <= to)
        out.set(monthKey(p.start), (out.get(monthKey(p.start)) ?? 0) + p.weight)
  return out
}

/** Expected starts per req between two dates. */
export function forecastWithin(r: ForecastReq, from: ISODate, to: ISODate): number {
  return r.parts.reduce((s, p) => s + (p.start >= from && p.start <= to ? p.weight : 0), 0)
}
