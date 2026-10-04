/**
 * Sources and offers: source effectiveness, applications by source by month, offer acceptance
 * (overall, by location, by quarter), why offers were declined and why candidates left.
 */
import { STAGES } from '@/data/schema'
import type { Window } from '@/data/scope'
import {
  addDays,
  addMonths,
  daysBetween,
  monthKey,
  monthStart,
  monthsBetween,
  quarterKey,
  quarterStart,
} from '@/lib/dates'
import { median } from '@/lib/stats'
import { inWin } from './prepare'
import { defaultSettings } from './settings'
import { type App, HIRED } from './types'

/** The anonymity minimum by default (the engine passes the value in force). */
const minGroupDefault = (): number => defaultSettings().minGroup

/* ───────── offers ───────── */

/** Offers resolved in a window: hired (by hired date) or declined (by decline date). */
export function resolvedOffers(apps: readonly App[], w: Pick<Window, 'start' | 'end'>): App[] {
  return apps.filter((a) => (a.outcome === 'Hired' || a.outcome === 'Declined') && inWin(a.exitDate, w))
}

export interface Acceptance {
  rate: number | null
  hired: number
  declined: number
}

export function acceptance(offers: readonly App[]): Acceptance {
  let hired = 0
  let declined = 0
  for (const a of offers) {
    if (a.outcome === 'Hired') hired++
    else if (a.outcome === 'Declined') declined++
  }
  const n = hired + declined
  return { rate: n ? hired / n : null, hired, declined }
}

/** Quarter windows: the `n` quarters ending with the quarter that contains `end`. */
export function quarterWindows(end: string, n: number): { key: string; start: string; end: string }[] {
  const out: { key: string; start: string; end: string }[] = []
  let qs = quarterStart(end)
  for (let i = 0; i < n; i++) {
    const qe = addDays(addMonths(qs, 3), -1)
    out.unshift({ key: quarterKey(qs), start: qs, end: qe < end ? qe : end })
    qs = addMonths(qs, -3)
  }
  return out
}

export interface QuarterAcceptance {
  quarter: string
  /** "Q3 2026" */
  label: string
  /** Last day of the quarter (or the window end for the quarter in progress). */
  end: string
  /** Null under the anonymity minimum of resolved offers, so the counts can't give the hidden rate away. */
  rate: number | null
  hired: number | null
  declined: number | null
  offers: number
  /** The resolved offers behind the rate; empty when the rate is hidden, so it never drills. */
  apps: App[]
}

export function acceptanceByQuarter(
  apps: readonly App[],
  end: string,
  n = 8,
  minGroup: number = minGroupDefault(),
): QuarterAcceptance[] {
  return quarterWindows(end, n).map((q) => {
    const list = resolvedOffers(apps, q)
    const acc = acceptance(list)
    const offers = acc.hired + acc.declined
    const show = offers >= minGroup
    return {
      quarter: q.key,
      label: q.key.replace(/^(\d{4}) (Q\d)$/, '$2 $1'),
      end: q.end,
      rate: show ? acc.rate : null,
      hired: show ? acc.hired : null,
      declined: show ? acc.declined : null,
      offers,
      apps: show ? list : [],
    }
  })
}

export interface GroupAcceptance {
  group: string
  /** Null under the anonymity minimum of resolved offers (hidden to protect anonymity). */
  rate: number | null
  /** Null with the rate, so the counts can't give the hidden rate away. */
  hired: number | null
  declined: number | null
  offers: number
  /** The resolved offers behind the rate; empty when the rate is hidden, so it never drills. */
  apps: App[]
}

/**
 * Offer acceptance per group, largest first. Groups under the anonymity minimum of resolved offers
 * (5 by default) fold into one "Other (k)" row (a single small group keeps its name, since folding
 * it hides nothing); any row still under it shows only its offer count.
 */
export function acceptanceBy(
  offers: readonly App[],
  key: (a: App) => string | null,
  minGroup: number = minGroupDefault(),
): GroupAcceptance[] {
  const m = new Map<string, App[]>()
  for (const a of offers) {
    const k = key(a) || 'Not set'
    const arr = m.get(k)
    if (arr) arr.push(a)
    else m.set(k, [a])
  }
  const resolved = (list: readonly App[]) =>
    list.filter((a) => a.outcome === 'Hired' || a.outcome === 'Declined')
  const groups = [...m].map(([group, list]) => ({ group, list: resolved(list) })).filter((g) => g.list.length)
  const small = groups.filter((g) => g.list.length < minGroup)
  const fold = small.length > 1
  const kept = fold ? groups.filter((g) => g.list.length >= minGroup) : groups
  const rows = kept.sort((a, b) => b.list.length - a.list.length || a.group.localeCompare(b.group))
  if (fold) rows.push({ group: `Other (${small.length})`, list: small.flatMap((g) => g.list) })
  return rows.map(({ group, list }) => {
    const acc = acceptance(list)
    const n = acc.hired + acc.declined
    const show = n >= minGroup
    return {
      group,
      rate: show ? acc.rate : null,
      hired: show ? acc.hired : null,
      declined: show ? acc.declined : null,
      offers: n,
      apps: show ? list : [],
    }
  })
}

export interface ReasonRow {
  reason: string
  candidates: number
  share: number
  /** The declined offers counted (for the drill panel; not exported). */
  apps: App[]
}

export function declineReasons(offers: readonly App[]): ReasonRow[] {
  const declined = offers.filter((a) => a.outcome === 'Declined')
  const m = new Map<string, App[]>()
  for (const a of declined) {
    const k = a.reason || 'No reason given'
    const arr = m.get(k)
    if (arr) arr.push(a)
    else m.set(k, [a])
  }
  return [...m]
    .map(([reason, apps]) => ({
      reason,
      candidates: apps.length,
      share: apps.length / declined.length,
      apps,
    }))
    .sort((a, b) => b.candidates - a.candidates)
}

/* ───────── sources ───────── */

/** Days from application to offer accepted. */
export const daysToHire = (a: App): number =>
  Math.max(0, daysBetween(a.appliedDate, a.exitDate ?? a.appliedDate))

export interface SourceRow {
  source: string
  applications: number
  share: number
  hires: number
  /** Hired ÷ applications in the cohort. */
  hireRate: number | null
  offerAcceptance: number | null
  offers: number
  /** Null under the anonymity minimum of hires (each is a person's outcome). */
  medianTimeToHire: number | null
  priorApplications: number
  /** Applications vs the prior window (−0.48 = 48% fewer). */
  change: number | null
  /** The applications behind the counts, this window and the prior one (for the drill panel). */
  apps: App[]
  priorApps: App[]
}

/** Source effectiveness; rates and medians under the anonymity minimum (5 by default) are null. */
export function sourceRows(
  current: readonly App[],
  prior: readonly App[],
  minGroup: number = minGroupDefault(),
): SourceRow[] {
  const by = new Map<string, App[]>()
  for (const a of current) {
    const arr = by.get(a.source)
    if (arr) arr.push(a)
    else by.set(a.source, [a])
  }
  const priorBy = new Map<string, App[]>()
  for (const a of prior) {
    const arr = priorBy.get(a.source)
    if (arr) arr.push(a)
    else priorBy.set(a.source, [a])
  }
  for (const s of priorBy.keys()) if (!by.has(s)) by.set(s, [])
  const total = current.length
  return [...by]
    .map(([source, list]) => {
      const hired = list.filter((a) => a.furthest === HIRED)
      const acc = acceptance(list.filter((a) => a.outcome === 'Hired' || a.outcome === 'Declined'))
      const offers = acc.hired + acc.declined
      const priorApps = priorBy.get(source) ?? []
      const p = priorApps.length
      return {
        source,
        applications: list.length,
        share: total ? list.length / total : 0,
        hires: hired.length,
        hireRate: list.length >= minGroup ? hired.length / list.length : null,
        offerAcceptance: offers >= minGroup ? acc.rate : null,
        offers,
        medianTimeToHire: hired.length >= minGroup ? median(hired.map(daysToHire)) : null,
        priorApplications: p,
        change: p > 0 ? list.length / p - 1 : null,
        apps: list,
        priorApps,
      }
    })
    .sort((a, b) => b.applications - a.applications)
}

export interface SourceMonthRow {
  month: string
  source: string
  applications: number
  /** The applications counted (for the drill panel; not exported). */
  apps: App[]
}

/** Applications per source per month, 24 months ending with the month of `end`. */
export function sourcesByMonth(
  apps: readonly App[],
  end: string,
  sources: readonly string[],
): SourceMonthRow[] {
  const months = monthsBetween(addMonths(monthStart(end), -23), end)
  const keep = new Set(months)
  const m = new Map<string, App[]>()
  for (const a of apps) {
    const mk = monthKey(a.appliedDate)
    if (!keep.has(mk) || a.appliedDate > end) continue
    const k = `${mk}|${a.source}`
    const arr = m.get(k)
    if (arr) arr.push(a)
    else m.set(k, [a])
  }
  return months.flatMap((month) =>
    sources.map((source) => {
      const list = m.get(`${month}|${source}`) ?? []
      return { month, source, applications: list.length, apps: list }
    }),
  )
}

/* ───────── exits ───────── */

export interface ExitReasonRow {
  outcome: 'Rejected' | 'Withdrawn'
  reason: string
  stage: string
  candidates: number
  /** The applications counted (for the drill panel; not exported). */
  apps: App[]
}

/** Rejections and withdrawals dated in the window, by reason and the stage they left from. */
export function exitReasons(
  apps: readonly App[],
  w: Pick<Window, 'start' | 'end'>,
  top = 8,
): ExitReasonRow[] {
  const out: ExitReasonRow[] = []
  for (const outcome of ['Rejected', 'Withdrawn'] as const) {
    const list = apps.filter((a) => a.outcome === outcome && inWin(a.exitDate, w))
    const totals = new Map<string, number>()
    for (const a of list)
      totals.set(a.reason || 'No reason given', (totals.get(a.reason || 'No reason given') ?? 0) + 1)
    const keep = new Set(
      [...totals]
        .sort((a, b) => b[1] - a[1])
        .slice(0, totals.size > top + 1 ? top : top + 1)
        .map(([r]) => r),
    )
    const cells = new Map<string, Map<number, App[]>>()
    for (const a of list) {
      const r = a.reason || 'No reason given'
      const reason = keep.has(r) ? r : 'Other reasons'
      const byStage = cells.get(reason) ?? new Map<number, App[]>()
      const arr = byStage.get(a.furthest)
      if (arr) arr.push(a)
      else byStage.set(a.furthest, [a])
      cells.set(reason, byStage)
    }
    for (const [reason, byStage] of cells) {
      for (const [s, apps] of byStage) {
        out.push({ outcome, reason, stage: STAGES[s] ?? 'Applied', candidates: apps.length, apps })
      }
    }
  }
  return out
}
