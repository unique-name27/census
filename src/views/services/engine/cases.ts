/**
 * Case metrics: volume, service levels, time to resolve, satisfaction, backlog and arrivals.
 *
 * Populations:
 *  - service levels, volume, reopen and escalation: cases opened in the window;
 *  - time to resolve, satisfaction and first-contact resolution: cases resolved in the window;
 *  - backlog: cases open at the end of the as-of day.
 *
 * Privacy: every rate, median and mean needs at least MIN_GROUP cases from MIN_GROUP distinct
 * requesters, and every breakdown folds groups behind fewer than MIN_GROUP people into "Other (k)".
 * Employee relations cases never appear row by row (counts and timeliness only).
 */

import { CASE_OPEN_STATUSES, caseCategoryByName, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { groupBy, mean, median, quantile } from '@/lib/stats'
import { type CaseFact, inWin, openStatusLabel } from './facts'
import {
  foldGroups,
  type Group,
  hitsOf,
  isOther,
  isShowable,
  peopleIn,
  type Share,
  shareOf,
  WEEKDAYS,
} from './util'

export const openedIn = (facts: readonly CaseFact[], w: Pick<Window, 'start' | 'end'>): CaseFact[] =>
  facts.filter((f) => inWin(f.opened, w))

export const resolvedIn = (facts: readonly CaseFact[], w: Pick<Window, 'start' | 'end'>): CaseFact[] =>
  facts.filter((f) => inWin(f.resolved, w))

export const responseSla = (rows: readonly CaseFact[]): Share => shareOf(rows, (f) => f.responseMet)
export const resolutionSla = (rows: readonly CaseFact[]): Share => shareOf(rows, (f) => f.resolutionMet)

/** Median calendar hours from opened to resolved; null below MIN_GROUP cases or requesters. */
export function medianHours(resolved: readonly CaseFact[]): { hours: number | null; n: number } {
  const timed = resolved.filter((f) => f.resolutionHours != null)
  const xs = timed.map((f) => f.resolutionHours as number)
  return { hours: isShowable(xs.length, peopleIn(timed)) ? median(xs) : null, n: xs.length }
}

/** Mean satisfaction (1-5) with its response count; null below MIN_GROUP responses or respondents. */
export function csat(resolved: readonly CaseFact[]): { mean: number | null; n: number } {
  const scored = resolved.filter((f) => f.csat != null)
  const xs = scored.map((f) => f.csat as number)
  return { mean: isShowable(xs.length, peopleIn(scored)) ? mean(xs) : null, n: xs.length }
}

/**
 * Employee relations cases are reported as counts and timeliness only: never row by row (case
 * lists, detail exports), so an investigation can't be tied to a case ID, an assignee or a date.
 */
export const ROW_PRIVATE_CATEGORIES: ReadonlySet<string> = new Set(['Employee relations'])
export const isRowPrivate = (f: Pick<CaseFact, 'category'>): boolean => ROW_PRIVATE_CATEGORIES.has(f.category)

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
  /** Distinct requesters behind the cases. */
  people: number
  share: number | null
  slaRate: number | null
  /** Cases that met the target; hidden (null) with the rate. */
  slaMet: number | null
  slaN: number
  responseRate: number | null
  open: number
  /** Open cases waiting on a third party. */
  waitingThirdParty: number
  /** The cases opened in the period behind the row (the drill's rows). */
  records: CaseFact[]
  /** The category's cases open at the as-of date. */
  openRecords: CaseFact[]
}

/** Groups sorted largest first, then folded by people ("Other (k)" last). */
const foldedBy = (rows: readonly CaseFact[], key: (f: CaseFact) => string): Group<CaseFact>[] =>
  foldGroups([...groupBy(rows, key)].sort((a, b) => b[1].length - a[1].length))

export function byCategory(facts: readonly CaseFact[], w: Window): CategoryRow[] {
  const opened = openedIn(facts, w)
  const openNow = facts.filter((f) => f.open)
  return foldedBy(opened, (f) => f.category).map(({ key, rows, folded }) => {
    const cats = new Set(rows.map((f) => f.category))
    const sla = resolutionSla(rows)
    const mine = openNow.filter((f) => cats.has(f.category))
    return {
      category: key,
      processId: folded ? null : rows[0].processId,
      team: folded ? '—' : rows[0].team,
      cases: rows.length,
      people: peopleIn(rows),
      share: opened.length ? rows.length / opened.length : null,
      slaRate: sla.rate,
      slaMet: hitsOf(sla.rate, sla.hits),
      slaN: sla.n,
      responseRate: responseSla(rows).rate,
      open: mine.length,
      waitingThirdParty: mine.filter((f) => f.status === 'Waiting on third party').length,
      records: rows,
      openRecords: mine,
    }
  })
}

/* ───────────── monthly trends ───────────── */

export interface MonthCategoryRow {
  month: string
  category: string
  cases: number
  /** The cases behind the count. */
  records: CaseFact[]
}

/** The series label when no category is large enough to show on its own. */
export const ALL_CATEGORIES = 'All categories'

/**
 * Cases opened per month, split into the `top` largest categories and Other. Only categories
 * behind at least MIN_GROUP requesters over the months get their own series.
 */
export function openedByMonth(
  facts: readonly CaseFact[],
  months: readonly string[],
  top = 5,
): { rows: MonthCategoryRow[]; series: string[] } {
  const inMonths = new Set(months)
  const ranked = [
    ...groupBy(
      facts.filter((f) => inMonths.has(f.month)),
      (f) => f.category,
    ),
  ].sort((a, b) => b[1].length - a[1].length)
  const eligible = ranked.filter(([, rows]) => peopleIn(rows) >= MIN_GROUP).map(([c]) => c)
  const all = eligible.length === ranked.length && ranked.length <= top + 1
  const keep = new Set(all ? eligible : eligible.slice(0, top))
  const rest = keep.size ? 'Other' : ALL_CATEGORIES
  const series = [...keep, ...(ranked.length > keep.size ? [rest] : [])]
  const cells = new Map<string, CaseFact[]>()
  for (const f of facts) {
    if (!inMonths.has(f.month)) continue
    const s = keep.has(f.category) ? f.category : rest
    const k = `${f.month}|${s}`
    const list = cells.get(k)
    if (list) list.push(f)
    else cells.set(k, [f])
  }
  const rows: MonthCategoryRow[] = []
  for (const month of months)
    for (const category of series) {
      const records = cells.get(`${month}|${category}`) ?? []
      rows.push({ month, category, cases: records.length, records })
    }
  return { rows, series }
}

export interface MonthSlaRow {
  month: string
  opened: number
  slaRate: number | null
  /** Hidden (null) with the rate. */
  slaMet: number | null
  slaN: number
  responseRate: number | null
  /** Every case opened in the month. */
  records: CaseFact[]
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
      slaMet: hitsOf(sla.rate, sla.hits),
      slaN: sla.n,
      responseRate: responseSla(list).rate,
      records: list,
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
  /** The open cases behind the count. */
  records: CaseFact[]
}

export function backlogByAge(facts: readonly CaseFact[]): BacklogRow[] {
  const cells = new Map<string, CaseFact[]>()
  const statuses = new Set<string>()
  for (const f of facts) {
    if (!f.open || f.ageDays == null) continue
    const s = openStatusLabel(f)
    statuses.add(s)
    const k = `${ageBucket(f.ageDays)}|${s}`
    const list = cells.get(k)
    if (list) list.push(f)
    else cells.set(k, [f])
  }
  const order = BACKLOG_STATUSES.filter((s) => statuses.has(s))
  return AGE_BUCKETS.flatMap((age) =>
    order.map((status) => {
      const records = cells.get(`${age}|${status}`) ?? []
      return { age, status, cases: records.length, records }
    }),
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
  /** The case itself, for its drill. */
  fact: CaseFact
}

/** Open cases older than `minAge` days, oldest first. Employee relations cases are never listed. */
export function agedCases(facts: readonly CaseFact[], minAge = 14): AgedCaseRow[] {
  return facts
    .filter((f) => f.open && f.ageDays != null && f.ageDays > minAge && !isRowPrivate(f))
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
        fact: f,
      }
    })
    .sort((a, b) => b.ageDays - a.ageDays)
}

export interface AgedPrivateRow {
  category: string
  cases: number
  /** Oldest age in days; only given for a group of at least MIN_GROUP cases. */
  oldestDays: number | null
}

/** The aged cases left out of row-level lists (employee relations), as counts by category. */
export function agedPrivate(facts: readonly CaseFact[], minAge = 14): AgedPrivateRow[] {
  const aged = facts.filter((f) => f.open && f.ageDays != null && f.ageDays > minAge && isRowPrivate(f))
  return [...groupBy(aged, (f) => f.category)].map(([category, list]) => ({
    category,
    cases: list.length,
    oldestDays: list.length >= MIN_GROUP ? Math.max(...list.map((f) => f.ageDays as number)) : null,
  }))
}

/* ───────────── time to resolve ───────────── */

export interface ResolveRow {
  category: string
  n: number
  /** Days to resolve: 10th, 25th, 50th, 75th and 90th percentiles. */
  p10: number | null
  q1: number | null
  median: number | null
  q3: number | null
  p90: number | null
  targetDays: number | null
  /** The same percentiles as a share of each case's resolution target (1 = on target). */
  p10Share: number | null
  q1Share: number | null
  medianShare: number | null
  q3Share: number | null
  p90Share: number | null
  /** Always 1 when the shares exist: the target, as a marker on the share-of-target axis. */
  targetShare: number | null
  /** The resolved cases measured. */
  records: CaseFact[]
}

/**
 * Time to resolve by category (cases resolved in the window), in days and as a share of each
 * case's resolution target, so a 30-day category and a 2-day category read on one axis.
 * Categories behind fewer than MIN_GROUP requesters are left out. Longest against target first.
 */
export function timeToResolve(facts: readonly CaseFact[], w: Window): ResolveRow[] {
  const timed = resolvedIn(facts, w).filter((f) => f.resolutionHours != null)
  return [...groupBy(timed, (f) => f.category)]
    .filter(([, list]) => isShowable(list.length, peopleIn(list)))
    .map(([category, list]) => {
      const days = list.map((f) => (f.resolutionHours as number) / 24)
      const ratios = list.flatMap((f) =>
        f.resolutionTarget ? [(f.resolutionHours as number) / f.resolutionTarget] : [],
      )
      const targets = list.flatMap((f) => (f.resolutionTarget ? [f.resolutionTarget / 24] : []))
      const meta = caseCategoryByName.get(category)
      const shares = ratios.length >= MIN_GROUP
      const q = (xs: number[], p: number, ok = true) => (ok ? quantile(xs, p) : null)
      return {
        category,
        n: list.length,
        p10: q(days, 0.1),
        q1: q(days, 0.25),
        median: q(days, 0.5),
        q3: q(days, 0.75),
        p90: q(days, 0.9),
        targetDays: meta ? meta.resolutionHours / 24 : median(targets),
        p10Share: q(ratios, 0.1, shares),
        q1Share: q(ratios, 0.25, shares),
        medianShare: q(ratios, 0.5, shares),
        q3Share: q(ratios, 0.75, shares),
        p90Share: q(ratios, 0.9, shares),
        targetShare: shares ? 1 : null,
        records: list,
      }
    })
    .sort((a, b) => (b.medianShare ?? -1) - (a.medianShare ?? -1) || (b.median ?? 0) - (a.median ?? 0))
}

/* ───────────── arrivals ───────────── */

export interface ArrivalRow {
  weekday: string
  hour: string
  cases: number
  share: number | null
  /** The cases opened in the cell. */
  records: CaseFact[]
}

/** Weekday × hour of opening for cases opened in the window, trimmed to the hours in use. */
export function arrivals(facts: readonly CaseFact[], w: Window): ArrivalRow[] {
  const opened = openedIn(facts, w).filter((f) => f.hour != null)
  if (!opened.length) return []
  const grid = new Map<string, CaseFact[]>()
  let lo = 23
  let hi = 0
  for (const f of opened) {
    const h = f.hour as number
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
    const k = `${f.weekday}|${h}`
    const list = grid.get(k)
    if (list) list.push(f)
    else grid.set(k, [f])
  }
  const weekend = opened.some((f) => f.weekday >= 5)
  const days = weekend ? 7 : 5
  // Shares are rates over the requesters: hidden behind fewer than 5 people.
  const shown = isShowable(opened.length, peopleIn(opened))
  const rows: ArrivalRow[] = []
  for (let d = 0; d < days; d++) {
    for (let h = lo; h <= hi; h++) {
      const records = grid.get(`${d}|${h}`) ?? []
      rows.push({
        weekday: WEEKDAYS[d],
        hour: String(h).padStart(2, '0'),
        cases: records.length,
        share: shown ? records.length / opened.length : null,
        records,
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
  /** Cases opened in the period through the channel. */
  records: CaseFact[]
  /** Cases resolved in the period through the channel (satisfaction is scored on these). */
  resolvedRecords: CaseFact[]
}

/** Satisfaction and resolution SLA by channel; channels behind fewer than 5 requesters fold into Other. */
export function byChannel(facts: readonly CaseFact[], w: Window): ChannelRow[] {
  const channelOf = (f: CaseFact) => f.channel ?? 'Unknown'
  const resolved = resolvedIn(facts, w)
  return foldedBy(openedIn(facts, w), channelOf).map(({ key, rows }) => {
    const names = new Set(rows.map(channelOf))
    const mine = resolved.filter((f) => names.has(channelOf(f)))
    const c = csat(mine)
    return {
      channel: key,
      cases: rows.length,
      responses: c.n,
      csat: c.mean,
      slaRate: resolutionSla(rows).rate,
      records: rows,
      resolvedRecords: mine,
    }
  })
}

/* ───────────── reopen and escalation ───────────── */

export interface ReopenRow {
  category: string
  opened: number
  resolved: number
  /** Hidden (null) with the reopen rate. */
  reopened: number | null
  reopenRate: number | null
  /** Hidden (null) with the escalation rate. */
  escalated: number | null
  escalateRate: number | null
  /** The cases opened in the period behind the row. */
  records: CaseFact[]
}

/**
 * Reopen rate over resolved cases and escalation rate over all cases, both opened in the window.
 * Highest reopen rate first; categories behind fewer than 5 requesters fold into "Other (k)", last.
 */
export function reopenEscalate(facts: readonly CaseFact[], w: Window): ReopenRow[] {
  const rows = foldedBy(openedIn(facts, w), (f) => f.category).map((g) => reopenRow(g.key, g.rows))
  const real = rows.filter((r) => !isOther(r.category))
  real.sort((a, b) => (b.reopenRate ?? -1) - (a.reopenRate ?? -1))
  return [...real, ...rows.filter((r) => isOther(r.category))]
}

export function reopenRow(category: string, list: readonly CaseFact[]): ReopenRow {
  const reopen = shareOf(
    list.filter((f) => f.resolved != null),
    (f) => f.reopened,
  )
  const escalate = shareOf(list, (f) => f.escalated)
  return {
    category,
    opened: list.length,
    resolved: reopen.n,
    reopened: hitsOf(reopen.rate, reopen.hits),
    reopenRate: reopen.rate,
    escalated: hitsOf(escalate.rate, escalate.hits),
    escalateRate: escalate.rate,
    records: list.slice(),
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
  /** The cases behind the opened, resolved and open counts. */
  openedRecords: CaseFact[]
  resolvedRecords: CaseFact[]
  openRecords: CaseFact[]
}

/** Workload by owning team, most cases opened first; teams behind fewer than 5 requesters fold into Other. */
export function teamWorkload(facts: readonly CaseFact[], w: Window, tierKnown: boolean): TeamRow[] {
  const opened = openedIn(facts, w)
  const resolved = resolvedIn(facts, w)
  const openNow = facts.filter((f) => f.open)
  // Every case a team took in, closed or holds now, once each.
  const touched = [...new Map([...opened, ...resolved, ...openNow].map((f) => [f.caseId, f])).values()]
  const openedBy = groupBy(opened, (f) => f.team)
  const size = (team: string) => openedBy.get(team)?.length ?? 0
  const groups = foldGroups([...groupBy(touched, (f) => f.team)].sort((a, b) => size(b[0]) - size(a[0])))
  return groups.map(({ key, rows }) => {
    const teams = new Set(rows.map((f) => f.team))
    const mine = (f: CaseFact) => teams.has(f.team)
    const o = opened.filter(mine)
    const r = resolved.filter(mine)
    const now = openNow.filter(mine)
    const c = csat(r)
    return {
      team: key,
      opened: o.length,
      resolved: r.length,
      open: now.length,
      slaRate: resolutionSla(o).rate,
      medianHours: medianHours(r).hours,
      csat: c.mean,
      csatN: c.n,
      firstContact: tierKnown ? shareOf(r, (f) => isFirstContact(f)).rate : null,
      openedRecords: o,
      resolvedRecords: r,
      openRecords: now,
    }
  })
}
