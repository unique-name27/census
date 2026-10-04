/**
 * HR transaction metrics. The population is every transaction whose deadline (dueDate) falls in
 * the window. On time = completed on or before the due date; open past the due date counts as
 * late; open and not yet due is left out.
 *
 * Privacy: a rate needs at least MIN_GROUP transactions for MIN_GROUP distinct employees, and
 * every breakdown folds groups behind fewer than MIN_GROUP employees into "Other (k)".
 */

import {
  type Region,
  SITES,
  TRANSACTION_PROCESS,
  TRANSACTION_TYPES,
  type TransactionType,
} from '@/data/schema'
import type { Window } from '@/data/scope'
import { groupBy, median } from '@/lib/stats'
import { FINAL_PAY_RULES, TRANSACTION_DEADLINES } from './catalog'
import { dueIn, onTimeRate, type TxFact } from './facts'
import { foldGroups, hitsOf, isShowable, peopleIn, shareOf } from './util'

export interface TypeRow {
  type: string
  processId: string | null
  deadline: string
  due: number
  /** On time, completed late and open past due: hidden (null) with the rate. */
  onTime: number | null
  late: number | null
  open: number | null
  rate: number | null
  /** The judged transactions behind the row (on time, late or open past due). */
  records: TxFact[]
}

const typeOrder = (t: string) => {
  const i = TRANSACTION_TYPES.indexOf(t as TransactionType)
  return i < 0 ? 99 : i
}

/** On time by transaction type, in the catalog order; types behind fewer than 5 employees fold into Other. */
export function onTimeByType(facts: readonly TxFact[], w: Window): TypeRow[] {
  const judged = dueIn(facts, w).filter((f) => f.outcome !== 'pending' && f.outcome != null)
  const groups = [...groupBy(judged, (f) => f.type)].sort((a, b) => typeOrder(a[0]) - typeOrder(b[0]))
  return foldGroups(groups).map(({ key, rows, folded }) => {
    const r = onTimeRate(rows)
    return {
      type: key,
      processId: folded ? null : (TRANSACTION_PROCESS[key as TransactionType] ?? rows[0].processId),
      deadline: folded
        ? 'Varies by type'
        : (TRANSACTION_DEADLINES[key as TransactionType] ?? 'Due date in the file'),
      due: r.n,
      onTime: hitsOf(r.rate, r.onTime),
      late: hitsOf(r.rate, rows.filter((f) => f.outcome === 'late').length),
      open: hitsOf(r.rate, rows.filter((f) => f.outcome === 'overdue').length),
      rate: r.rate,
      records: rows,
    }
  })
}

/* ───────────── final pay ───────────── */

export interface FinalPayRow {
  jurisdiction: string
  name: string
  sites: string
  rule: string
  exits: number
  /** Hidden (null) with the rate. */
  onTime: number | null
  late: number | null
  rate: number | null
  involuntaryRate: number | null
  involuntaryN: number
  voluntaryRate: number | null
  voluntaryN: number
  /** Median days past the deadline, late payments only (null below 5 late payments or people). */
  medianDaysLate: number | null
  /** The judged exits behind the row. */
  records: TxFact[]
}

const sitesOf = (jur: string) =>
  SITES.filter((s) => s.jurisdiction === jur)
    .map((s) => s.location)
    .join(', ')

/**
 * Final pay on time by jurisdiction, most exits first. Jurisdictions behind fewer than 5 leavers
 * fold into "Other (k)", so a single exit's timing never shows on its own.
 */
export function finalPayByJurisdiction(facts: readonly TxFact[], w: Window): FinalPayRow[] {
  const exits = dueIn(facts, w).filter(
    (f) => f.type === 'Termination' && f.outcome !== 'pending' && f.outcome != null,
  )
  const groups = [...groupBy(exits, (f) => f.jurisdiction ?? 'unknown')].sort(
    (a, b) => b[1].length - a[1].length,
  )
  return foldGroups(groups).map(({ key, rows, folded }) =>
    folded ? { ...finalPayRow('other', rows), jurisdiction: 'other', name: key } : finalPayRow(key, rows),
  )
}

export function finalPayRow(jur: string, list: readonly TxFact[]): FinalPayRow {
  const rule = FINAL_PAY_RULES.get(jur)
  const r = onTimeRate(list)
  const inv = onTimeRate(list.filter((f) => f.exitType === 'Involuntary'))
  const vol = onTimeRate(list.filter((f) => f.exitType === 'Voluntary'))
  const late = list.filter((f) => f.outcome === 'late' && f.daysVsDue != null)
  const lateDays = late.map((f) => f.daysVsDue as number)
  const other = jur === 'other'
  return {
    jurisdiction: jur,
    name: rule?.name ?? (jur === 'unknown' ? 'Unknown site' : jur),
    sites: jur === 'unknown' || other ? '—' : sitesOf(jur),
    rule: rule?.rule ?? (other ? 'Varies by jurisdiction' : 'Due date in the file'),
    exits: r.n,
    onTime: hitsOf(r.rate, r.onTime),
    late: hitsOf(r.rate, r.late),
    rate: r.rate,
    involuntaryRate: inv.rate,
    involuntaryN: inv.n,
    voluntaryRate: vol.rate,
    voluntaryN: vol.n,
    medianDaysLate: isShowable(lateDays.length, peopleIn(late)) ? median(lateDays) : null,
    records: list.slice(),
  }
}

/* ───────────── new hire readiness ───────────── */

export interface SiteRow {
  location: string
  region: Region | '—'
  starts: number
  /** Hidden (null) with the rate. */
  ready: number | null
  late: number | null
  rate: number | null
  /** The judged new hires behind the row. */
  records: TxFact[]
}

const siteRow = (location: string, region: Region | '—', list: readonly TxFact[]): SiteRow => {
  const r = onTimeRate(list)
  return {
    location,
    region,
    starts: r.n,
    ready: hitsOf(r.rate, r.onTime),
    late: hitsOf(r.rate, r.late),
    rate: r.rate,
    records: list.slice(),
  }
}

const newHires = (facts: readonly TxFact[], w: Window) =>
  dueIn(facts, w).filter((f) => f.type === 'New hire' && f.outcome !== 'pending' && f.outcome != null)

/** New hire Day −3 readiness by site; sites with fewer than 5 new hires fold into Other. */
export function newHireBySite(facts: readonly TxFact[], w: Window): SiteRow[] {
  const groups = [...groupBy(newHires(facts, w), (f) => f.location ?? 'Unknown site')].sort(
    (a, b) => b[1].length - a[1].length,
  )
  return foldGroups(groups).map(({ key, rows, folded }) =>
    siteRow(key, folded ? '—' : (rows[0].region ?? '—'), rows),
  )
}

/** New hire Day −3 readiness by region; regions with fewer than 5 new hires fold into Other. */
export function newHireByRegion(facts: readonly TxFact[], w: Window): SiteRow[] {
  const groups = [...groupBy(newHires(facts, w), (f) => f.region ?? '—')]
  return foldGroups(groups).map(({ key, rows, folded }) =>
    siteRow(key, folded ? '—' : (key as Region | '—'), rows),
  )
}

/* ───────────── timing ───────────── */

/** Completion timing bins, early to late. */
export const TIMING_BINS = [
  { label: '15+ d early', lo: Number.NEGATIVE_INFINITY, hi: -15 },
  { label: '8-14 d early', lo: -14, hi: -8 },
  { label: '4-7 d early', lo: -7, hi: -4 },
  { label: '1-3 d early', lo: -3, hi: -1 },
  { label: 'On the due date', lo: 0, hi: 0 },
  { label: '1-2 d late', lo: 1, hi: 2 },
  { label: '3-5 d late', lo: 3, hi: 5 },
  { label: '6-10 d late', lo: 6, hi: 10 },
  { label: '11+ d late', lo: 11, hi: Number.POSITIVE_INFINITY },
] as const

export interface TimingRow {
  timing: string
  transactions: number
  share: number | null
  late: boolean
  /** The completed transactions in the bin. */
  records: TxFact[]
}

/** completed − due in calendar days; shares are hidden behind fewer than 5 people. */
export function timingBins(facts: readonly TxFact[], w: Window): TimingRow[] {
  const bins: TxFact[][] = TIMING_BINS.map(() => [])
  const done: TxFact[] = []
  for (const f of dueIn(facts, w)) {
    const d = f.daysVsDue
    if (d == null) continue
    const i = TIMING_BINS.findIndex((b) => d >= b.lo && d <= b.hi)
    if (i < 0) continue
    bins[i].push(f)
    done.push(f)
  }
  const n = done.length
  if (!n) return []
  const shown = isShowable(n, peopleIn(done))
  return TIMING_BINS.map((b, i) => ({
    timing: b.label,
    transactions: bins[i].length,
    share: shown ? bins[i].length / n : null,
    late: b.lo > 0,
    records: bins[i],
  }))
}

/* ───────────── on time by month ───────────── */

export interface TxMonthRow {
  month: string
  due: number
  /** Hidden (null) with the rate. */
  onTime: number | null
  late: number | null
  rate: number | null
  /** Every transaction due in the month (including those not yet due at the as-of date). */
  records: TxFact[]
}

/** Transactions on time by the month of their due date (pending ones left out). */
export function onTimeByMonth(facts: readonly TxFact[], months: readonly string[]): TxMonthRow[] {
  const groups = groupBy(
    facts.filter((f) => f.due != null),
    (f) => (f.due as string).slice(0, 7),
  )
  return months.map((month) => {
    const records = groups.get(month) ?? []
    const r = onTimeRate(records)
    return {
      month,
      due: r.n,
      onTime: hitsOf(r.rate, r.onTime),
      late: hitsOf(r.rate, r.late),
      rate: r.rate,
      records,
    }
  })
}

/* ───────────── retro adjustments ───────────── */

const RETRO_TYPES = new Set(['Job change', 'Compensation change'])

/** Job and pay changes that carry the retro flag. */
export const retroCandidates = (facts: readonly TxFact[]): TxFact[] =>
  facts.filter((f) => RETRO_TYPES.has(f.type) && f.retro != null)

export interface RetroMonthRow {
  month: string
  changes: number
  /** Hidden (null) with the share. */
  retro: number | null
  /** Retro ÷ changes; null below 5 changes or 5 employees. */
  share: number | null
  /** The job and pay changes due in the month that carry the retro flag. */
  records: TxFact[]
}

/** Retro adjustments by the month of the payroll cut-off they missed (due month). */
export function retroByMonth(facts: readonly TxFact[], months: readonly string[]): RetroMonthRow[] {
  const groups = groupBy(
    retroCandidates(facts).filter((f) => f.due != null),
    (f) => (f.due as string).slice(0, 7),
  )
  return months.map((month) => {
    const records = groups.get(month) ?? []
    const s = shareOf(records, (f) => f.retro)
    return { month, changes: s.n, retro: hitsOf(s.rate, s.hits), share: s.rate, records }
  })
}

export function retroShare(
  facts: readonly TxFact[],
  w: Window,
): { rate: number | null; retro: number; n: number; people: number } {
  const s = shareOf(retroCandidates(dueIn(facts, w)), (f) => f.retro)
  return { rate: s.rate, retro: s.hits, n: s.n, people: s.people }
}
