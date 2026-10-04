/**
 * Turns candidate rows into applications evaluated on the as-of date: the furthest stage reached
 * (stage dates first, the current stage only when its date is missing), the outcome on that date,
 * and when the current stage was entered. Every other recruiting module reads these.
 */
import type { Candidate, ISODate, Requisition } from '@/data/schema'
import { STAGE_DATE_FIELD, STAGES, stageIndex } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { defaultSettings, type NormRules } from './settings'
import { type App, type Coverage, HIRED, LAST_OPEN_STAGE, type Norms, type Outcome } from './types'

const EXIT_STATUSES = new Set<string>(['Rejected', 'Withdrawn', 'Declined'])

export function reqIndex(reqs: readonly Requisition[]): Map<string, Requisition> {
  const m = new Map<string, Requisition>()
  for (const r of reqs) m.set(r.reqId, r)
  return m
}

/** The candidate's stage dates by stage index (Applied = appliedDate). */
function rawDates(c: Candidate): (string | null)[] {
  return STAGES.map((s) => {
    const v = c[STAGE_DATE_FIELD[s]]
    return typeof v === 'string' && v ? v.slice(0, 10) : null
  })
}

export function prepareApp(c: Candidate, req: Requisition | null, asOf: ISODate): App | null {
  if (!c.appliedDate || c.appliedDate > asOf) return null
  const raw = rawDates(c)
  const exitDate =
    c.status === 'Hired'
      ? (c.hiredDate ?? null)
      : EXIT_STATUSES.has(c.status)
        ? (c.rejectedDate ?? null)
        : null
  const ended = c.status !== 'Active' && (exitDate == null || exitDate <= asOf)
  const outcome: Outcome = ended ? c.status : 'Active'
  const dates = raw.map((d) => (d && d <= asOf ? d : null))
  dates[0] = c.appliedDate
  let furthest = 0
  for (let i = dates.length - 1; i > 0; i--) {
    if (dates[i]) {
      furthest = i
      break
    }
  }
  // The current stage counts as reached when its own date is missing and the row describes the
  // state on the as-of date (still open, or closed by then).
  const current = stageIndex(c.currentStage)
  if ((c.status === 'Active' || ended) && current > furthest && !raw[current]) furthest = current
  if (outcome === 'Hired') furthest = HIRED
  if (outcome === 'Active') furthest = Math.min(furthest, LAST_OPEN_STAGE)
  const stageEntered =
    outcome === 'Active' && furthest === current && c.stageEnteredDate && c.stageEnteredDate <= asOf
      ? c.stageEnteredDate
      : null
  // Without a date for the stage itself, the latest known stage date is the best lower bound.
  let latest = c.appliedDate
  for (let i = furthest; i >= 0; i--) {
    const d = dates[i]
    if (d) {
      latest = d
      break
    }
  }
  const enteredDate = stageEntered ?? latest
  return {
    raw: c,
    id: c.applicationId,
    name: c.candidateName || c.candidateId || c.applicationId,
    reqId: c.reqId,
    req,
    title: req?.jobTitle || null,
    businessUnit: req?.businessUnit ?? null,
    department: req?.department ?? null,
    location: req?.location ?? null,
    level: req?.level ?? null,
    hiringManager: req?.hiringManager ?? null,
    hiringManagerId: req?.hiringManagerId ?? null,
    recruiter: c.recruiter ?? req?.recruiter ?? null,
    coordinator: c.coordinator ?? null,
    source: c.source || 'Unknown',
    appliedDate: c.appliedDate,
    dates,
    furthest,
    outcome,
    exitDate: ended ? exitDate : null,
    reason: ended ? (c.rejectionReason ?? null) : null,
    enteredDate,
    nextEventDate: c.status === 'Active' ? (c.nextEventDate ?? null) : null,
  }
}

export function prepareApps(
  candidates: readonly Candidate[],
  reqs: Map<string, Requisition>,
  asOf: ISODate,
): App[] {
  const out: App[] = []
  for (const c of candidates) {
    const a = prepareApp(c, reqs.get(c.reqId) ?? null, asOf)
    if (a) out.push(a)
  }
  return out
}

export function coverage(candidates: readonly Candidate[], reqs: readonly Requisition[]): Coverage {
  let hasNextEvent = false
  let hasStageDates = false
  let hasOfferDate = false
  let hasDeclined = false
  let hasRejectedDate = false
  for (const c of candidates) {
    if (c.nextEventDate) hasNextEvent = true
    if (c.screenDate || c.hmDate || c.onsiteDate) hasStageDates = true
    if (c.offerDate) hasOfferDate = true
    if (c.status === 'Declined') hasDeclined = true
    if (c.rejectedDate) hasRejectedDate = true
  }
  return {
    hasNextEvent,
    hasStageDates,
    hasOfferDate,
    hasDeclined,
    hasRejectedDate,
    hasFilledDate: reqs.some((r) => !!r.filledDate),
  }
}

/** Days from stage i to stage i + 1, or null when either date is missing. */
export function transitionDays(a: App, i: number): number | null {
  const from = a.dates[i]
  const to = a.dates[i + 1]
  if (!from || !to) return null
  const d = daysBetween(from, to)
  return d >= 0 ? d : null
}

/**
 * Historical median days from each stage to the next, over every application in the data. A stage
 * with fewer completed steps than `rules.minSteps` (5 by default) takes `rules.fallbackDays` (14).
 */
export function stageNorms(apps: readonly App[], rules: NormRules = defaultSettings().norms): Norms {
  const days: number[] = []
  const samples: number[] = []
  for (let i = 0; i < LAST_OPEN_STAGE + 1; i++) {
    const xs: number[] = []
    for (const a of apps) {
      const d = transitionDays(a, i)
      if (d != null) xs.push(d)
    }
    samples.push(xs.length)
    days.push(xs.length >= rules.minSteps ? (median(xs) ?? rules.fallbackDays) : rules.fallbackDays)
  }
  return { days, samples }
}

export const inWin = (d: string | null | undefined, w: { start: string; end: string }): boolean =>
  !!d && d.slice(0, 10) >= w.start && d.slice(0, 10) <= w.end

/** Whether a requisition counted as open on day d (on-hold reqs are left out: hold dates are unknown). */
export function isOpenAt(r: Requisition, d: ISODate): boolean {
  if (!r.openedDate || r.openedDate > d) return false
  switch (r.status) {
    case 'Open':
      return !r.closedDate || r.closedDate > d
    case 'Filled': {
      const end = r.filledDate ?? r.closedDate
      return !!end && end > d
    }
    case 'Cancelled': {
      const end = r.closedDate ?? r.filledDate
      return !!end && end > d
    }
    default:
      return false
  }
}
