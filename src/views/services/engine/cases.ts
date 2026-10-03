/**
 * Case metrics: volume, service levels, time to resolve, satisfaction, backlog and arrivals.
 *
 * Populations:
 *  - service levels, volume, reopen and escalation: cases opened in the window;
 *  - time to resolve, satisfaction and first-contact resolution: cases resolved in the window;
 *  - backlog: cases open at the end of the as-of day.
 */

import { CASE_OPEN_STATUSES, caseCategoryByName, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { groupBy, mean, median, quantile } from '@/lib/stats'
import { type CaseFact, inWin, openStatusLabel } from './facts'
import { foldSmall, type Share, share, shareOf, WEEKDAYS } from './util'

export const openedIn = (facts: readonly CaseFact[], w: Pick<Window, 'start' | 'end'>): CaseFact[] =>
  facts.filter((f) => inWin(f.opened, w))

export const resolvedIn = (facts: readonly CaseFact[], w: Pick<Window, 'start' | 'end'>): CaseFact[] =>
  facts.filter((f) => inWin(f.resolved, w))

export const responseSla = (rows: readonly CaseFact[]): Share => shareOf(rows, (f) => f.responseMet)
export const resolutionSla = (rows: readonly CaseFact[]): Share => shareOf(rows, (f) => f.resolutionMet)

/** Median calendar hours from opened to resolved; null below MIN_GROUP. */
export function medianHours(resolved: readonly CaseFact[]): { hours: number | null; n: number } {
  const xs = resolved.flatMap((f) => (f.resolutionHours == null ? [] : [f.resolutionHours]))
  return { hours: xs.length >= MIN_GROUP ? median(xs) : null, n: xs.length }
}

/** Mean satisfaction (1-5) with its response count; null below MIN_GROUP responses. */
export function csat(resolved: readonly CaseFact[]): { mean: number | null; n: number } {
  const xs = resolved.flatMap((f) => (f.csat == null ? [] : [f.csat]))
  return { mean: xs.length >= MIN_GROUP ? mean(xs) : null, n: xs.length }
}

/** Resolved, not reopened, not escalated, handled at Tier 0 or Tier 1. */
export function isFirstContact(f: CaseFact): boolean {
  return f.resolved != null && !f.reopened && !f.escalated && (f.tier === 'Tier 0' || f.tier === 'Tier 1')
}

/* ───────────── by category ───────────── */

export interface CategoryRow {
  category: string
  processId: string | null
  team: string
  cases: number
  share: number | null
  slaRate: number | null
  slaMet: number
  slaN: number
  responseRate: number | null
  open: number
  /** Open cases waiting on a third party. */
  waitingThirdParty: number
}

export function byCategory(facts: readonly CaseFact[], w: Window): CategoryRow[] {
  const opened = openedIn(facts, w)
  const groups = groupBy(opened, (f) => f.category)
  const openNow = facts.filter((f) => f.open)
  const rows: CategoryRow[] = [...groups].map(([category, list]) => {
    const sla = resolutionSla(list)
    const mine = openNow.filter((f) => f.category === category)
    return {
      category,
      processId: list[0].processId,
      team: list[0].team,
      cases: list.length,
      share: opened.length ? list.length / opened.length : null,
      slaRate: sla.rate,
      slaMet: sla.hits,
      slaN: sla.n,
      responseRate: responseSla(list).rate,
      open: mine.length,
      waitingThirdParty: mine.filter((f) => f.status === 'Waiting on third party').length,
    }
  })
  rows.sort((a, b) => b.cases - a.cases)
  return foldSmall(
    rows,
    (r) => r.cases,
    (rest, label) => {
      const slaMet = rest.reduce((a, r) => a + r.slaMet, 0)
      const slaN = rest.reduce((a, r) => a + r.slaN, 0)
      const cases = rest.reduce((a, r) => a + r.cases, 0)
      return {
        category: label,
        processId: null,
        team: '—',
        cases,
        share: opened.length ? cases / opened.length : null,
        slaRate: share(slaMet, slaN).rate,
        slaMet,
        slaN,
        responseRate: null,
        open: rest.reduce((a, r) => a + r.open, 0),
        waitingThirdParty: rest.reduce((a, r) => a + r.waitingThirdParty, 0),
      }
    },
  )
}

/* ───────────── monthly trends ───────────── */

export interface MonthCategoryRow {
  month: string
  category: string
  cases: number
}

/** Cases opened per month, split into the `top` largest categories and Other. */
export function openedByMonth(
  facts: readonly CaseFact[],
  months: readonly string[],
  top = 5,
): { rows: MonthCategoryRow[]; series: string[] } {
  const inMonths = new Set(months)
  const totals = new Map<string, number>()
  for (const f of facts) if (inMonths.has(f.month)) totals.set(f.category, (totals.get(f.category) ?? 0) + 1)
  const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  const keep = new Set(ranked.length <= top + 1 ? ranked : ranked.slice(0, top))
  const series = [...ranked.filter((c) => keep.has(c)), ...(ranked.length > keep.size ? ['Other'] : [])]
  const counts = new Map<string, number>()
  for (const f of facts) {
    if (!inMonths.has(f.month)) continue
    const s = keep.has(f.category) ? f.category : 'Other'
    const k = `${f.month}|${s}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const rows: MonthCategoryRow[] = []
  for (const month of months)
    for (const category of series)
      rows.push({ month, category, cases: counts.get(`${month}|${category}`) ?? 0 })
  return { rows, series }
}

export interface MonthSlaRow {
  month: string
  opened: number
  slaRate: number | null
  slaMet: number
  slaN: number
  responseRate: number | null
}

export function slaByMonth(facts: readonly CaseFact[], months: readonly string[]): MonthSlaRow[] {
  const groups = new Map<string, CaseFact[]>(months.map((m) => [m, []]))
  for (const f of facts) groups.get(f.month)?.push(f)
  return months.map((month) => {
    const list = groups.get(month) ?? []
    const sla = resolutionSla(list)
    return {
      month,
      opened: list.length,
      slaRate: sla.rate,
      slaMet: sla.hits,
      slaN: sla.n,
      responseRate: responseSla(list).rate,
    }
  })
}

/** Cases opened per month for one category (all months present in the facts). */
export function monthlyCounts(facts: readonly CaseFact[], category?: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of facts)
    if (!category || f.category === category) out.set(f.month, (out.get(f.month) ?? 0) + 1)
  return out
}

/* ───────────── backlog ───────────── */

export const AGE_BUCKETS = ['0-2 d', '3-7 d', '8-14 d', '15-30 d', '30+ d'] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]

export function ageBucket(days: number): AgeBucket {
  if (days <= 2) return '0-2 d'
  if (days <= 7) return '3-7 d'
  if (days <= 14) return '8-14 d'
  if (days <= 30) return '15-30 d'
  return '30+ d'
}

export const BACKLOG_STATUSES = [...CASE_OPEN_STATUSES, 'Open'] as const

export interface BacklogRow {
  age: AgeBucket
  status: string
  cases: number
}

export function backlogByAge(facts: readonly CaseFact[]): BacklogRow[] {
  const counts = new Map<string, number>()
  const statuses = new Set<string>()
  for (const f of facts) {
    if (!f.open || f.ageDays == null) continue
    const s = openStatusLabel(f)
    statuses.add(s)
    const k = `${ageBucket(f.ageDays)}|${s}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const order = BACKLOG_STATUSES.filter((s) => statuses.has(s))
  return AGE_BUCKETS.flatMap((age) =>
    order.map((status) => ({ age, status, cases: counts.get(`${age}|${status}`) ?? 0 })),
  )
}

export interface AgedCaseRow {
  caseId: string
  category: string
  processId: string | null
  status: string
  team: string
  assignee: string | null
  opened: string
  ageDays: number
  targetDays: number | null
  daysPastTarget: number | null
}

/** Open cases older than `minAge` days, oldest first. */
export function agedCases(facts: readonly CaseFact[], minAge = 14): AgedCaseRow[] {
  return facts
    .filter((f) => f.open && f.ageDays != null && f.ageDays > minAge)
    .map((f) => {
      const targetDays = f.resolutionTarget == null ? null : f.resolutionTarget / 24
      const age = f.ageDays as number
      return {
        caseId: f.caseId,
        category: f.category,
        processId: f.processId,
        status: openStatusLabel(f),
        team: f.team,
        assignee: f.assignee,
        opened: f.opened,
        ageDays: age,
        targetDays: targetDays == null ? null : Math.round(targetDays * 10) / 10,
        daysPastTarget: targetDays == null ? null : Math.max(0, Math.round(age - targetDays)),
      }
    })
    .sort((a, b) => b.ageDays - a.ageDays)
}

/* ───────────── time to resolve ───────────── */

export interface ResolveRow {
  category: string
  n: number
  p10: number | null
  q1: number | null
  median: number | null
  q3: number | null
  p90: number | null
  targetDays: number | null
}

/** Days to resolve by category (cases resolved in the window), quartiles with 10th/90th whiskers. */
export function timeToResolve(facts: readonly CaseFact[], w: Window): ResolveRow[] {
  const groups = new Map<string, number[]>()
  for (const f of resolvedIn(facts, w)) {
    if (f.resolutionHours == null) continue
    const xs = groups.get(f.category)
    if (xs) xs.push(f.resolutionHours / 24)
    else groups.set(f.category, [f.resolutionHours / 24])
  }
  return [...groups]
    .filter(([, xs]) => xs.length >= MIN_GROUP)
    .map(([category, xs]) => {
      const meta = caseCategoryByName.get(category)
      return {
        category,
        n: xs.length,
        p10: quantile(xs, 0.1),
        q1: quantile(xs, 0.25),
        median: quantile(xs, 0.5),
        q3: quantile(xs, 0.75),
        p90: quantile(xs, 0.9),
        targetDays: meta ? meta.resolutionHours / 24 : null,
      }
    })
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0))
}

/* ───────────── arrivals ───────────── */

export interface ArrivalRow {
  weekday: string
  hour: string
  cases: number
  share: number | null
}

/** Weekday × hour of opening for cases opened in the window, trimmed to the hours in use. */
export function arrivals(facts: readonly CaseFact[], w: Window): ArrivalRow[] {
  const opened = openedIn(facts, w).filter((f) => f.hour != null)
  if (!opened.length) return []
  const grid = new Map<string, number>()
  let lo = 23
  let hi = 0
  for (const f of opened) {
    const h = f.hour as number
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
    const k = `${f.weekday}|${h}`
    grid.set(k, (grid.get(k) ?? 0) + 1)
  }
  const weekend = opened.some((f) => f.weekday >= 5)
  const days = weekend ? 7 : 5
  const rows: ArrivalRow[] = []
  for (let d = 0; d < days; d++) {
    for (let h = lo; h <= hi; h++) {
      const cases = grid.get(`${d}|${h}`) ?? 0
      rows.push({
        weekday: WEEKDAYS[d],
        hour: String(h).padStart(2, '0'),
        cases,
        share: cases / opened.length,
      })
    }
  }
  return rows
}

/* ───────────── channels ───────────── */

export interface ChannelRow {
  channel: string
  cases: number
  responses: number
  csat: number | null
  slaRate: number | null
}

export function byChannel(facts: readonly CaseFact[], w: Window): ChannelRow[] {
  const resolved = resolvedIn(facts, w)
  const opened = openedIn(facts, w)
  const names = [...new Set(opened.map((f) => f.channel ?? 'Unknown'))]
  return names
    .map((channel) => {
      const mine = (f: CaseFact) => (f.channel ?? 'Unknown') === channel
      const c = csat(resolved.filter(mine))
      return {
        channel,
        cases: opened.filter(mine).length,
        responses: c.n,
        csat: c.mean,
        slaRate: resolutionSla(opened.filter(mine)).rate,
      }
    })
    .sort((a, b) => b.cases - a.cases)
}

/* ───────────── reopen and escalation ───────────── */

export interface ReopenRow {
  category: string
  opened: number
  resolved: number
  reopened: number
  reopenRate: number | null
  escalated: number
  escalateRate: number | null
}

/** Reopen rate over resolved cases and escalation rate over all cases, both opened in the window. */
export function reopenEscalate(facts: readonly CaseFact[], w: Window): ReopenRow[] {
  const groups = groupBy(openedIn(facts, w), (f) => f.category)
  const rows = [...groups].map(([category, list]) => reopenRow(category, list))
  rows.sort((a, b) => (b.reopenRate ?? -1) - (a.reopenRate ?? -1))
  return foldSmall(
    rows,
    (r) => r.opened,
    (rest, label) => {
      const sum = (k: 'opened' | 'resolved' | 'reopened' | 'escalated') => rest.reduce((a, r) => a + r[k], 0)
      return {
        category: label,
        opened: sum('opened'),
        resolved: sum('resolved'),
        reopened: sum('reopened'),
        reopenRate: share(sum('reopened'), sum('resolved')).rate,
        escalated: sum('escalated'),
        escalateRate: share(sum('escalated'), sum('opened')).rate,
      }
    },
  )
}

export function reopenRow(category: string, list: readonly CaseFact[]): ReopenRow {
  const resolved = list.filter((f) => f.resolved != null && f.reopened != null)
  const reopened = resolved.filter((f) => f.reopened).length
  const withEsc = list.filter((f) => f.escalated != null)
  const escalated = withEsc.filter((f) => f.escalated).length
  return {
    category,
    opened: list.length,
    resolved: resolved.length,
    reopened,
    reopenRate: share(reopened, resolved.length).rate,
    escalated,
    escalateRate: share(escalated, withEsc.length).rate,
  }
}

/* ───────────── teams ───────────── */

export interface TeamRow {
  team: string
  opened: number
  resolved: number
  open: number
  slaRate: number | null
  medianHours: number | null
  csat: number | null
  csatN: number
  firstContact: number | null
}

export function teamWorkload(facts: readonly CaseFact[], w: Window, tierKnown: boolean): TeamRow[] {
  const opened = openedIn(facts, w)
  const resolved = resolvedIn(facts, w)
  const teams = [...new Set([...opened, ...facts.filter((f) => f.open)].map((f) => f.team))]
  const rows = teams.map((team) => {
    const o = opened.filter((f) => f.team === team)
    const r = resolved.filter((f) => f.team === team)
    const c = csat(r)
    return {
      team,
      opened: o.length,
      resolved: r.length,
      open: facts.filter((f) => f.open && f.team === team).length,
      slaRate: resolutionSla(o).rate,
      medianHours: medianHours(r).hours,
      csat: c.mean,
      csatN: c.n,
      firstContact: tierKnown ? shareOf(r, (f) => isFirstContact(f)).rate : null,
    }
  })
  rows.sort((a, b) => b.opened - a.opened)
  return foldSmall(
    rows,
    (r) => Math.max(r.opened, r.open),
    (rest, label) => ({
      team: label,
      opened: rest.reduce((a, r) => a + r.opened, 0),
      resolved: rest.reduce((a, r) => a + r.resolved, 0),
      open: rest.reduce((a, r) => a + r.open, 0),
      slaRate: null,
      medianHours: null,
      csat: null,
      csatN: rest.reduce((a, r) => a + r.csatN, 0),
      firstContact: null,
    }),
  )
}
