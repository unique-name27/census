/**
 * HR transaction metrics. The population is every transaction whose deadline (dueDate) falls in
 * the window. On time = completed on or before the due date; open past the due date counts as
 * late; open and not yet due is left out.
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
import { foldSmall, share } from './util'

export interface TypeRow {
  type: string
  processId: string | null
  deadline: string
  due: number
  onTime: number
  late: number
  open: number
  rate: number | null
}

export function onTimeByType(facts: readonly TxFact[], w: Window): TypeRow[] {
  const groups = groupBy(dueIn(facts, w), (f) => f.type)
  const order = (t: string) => {
    const i = TRANSACTION_TYPES.indexOf(t as TransactionType)
    return i < 0 ? 99 : i
  }
  return [...groups]
    .map(([type, list]) => {
      const r = onTimeRate(list)
      return {
        type,
        processId: TRANSACTION_PROCESS[type as TransactionType] ?? list[0].processId,
        deadline: TRANSACTION_DEADLINES[type as TransactionType] ?? 'Due date in the file',
        due: r.n,
        onTime: r.n - r.late,
        late: list.filter((f) => f.outcome === 'late').length,
        open: list.filter((f) => f.outcome === 'overdue').length,
        rate: share(r.n - r.late, r.n).rate,
      }
    })
    .filter((r) => r.due > 0)
    .sort((a, b) => order(a.type) - order(b.type))
}

/* ───────────── final pay ───────────── */

export interface FinalPayRow {
  jurisdiction: string
  name: string
  sites: string
  rule: string
  exits: number
  onTime: number
  late: number
  rate: number | null
  involuntaryRate: number | null
  involuntaryN: number
  voluntaryRate: number | null
  voluntaryN: number
  /** Median days past the deadline, late payments only. */
  medianDaysLate: number | null
}

const sitesOf = (jur: string) =>
  SITES.filter((s) => s.jurisdiction === jur)
    .map((s) => s.location)
    .join(', ')

export function finalPayByJurisdiction(facts: readonly TxFact[], w: Window): FinalPayRow[] {
  const exits = dueIn(facts, w).filter((f) => f.type === 'Termination' && f.outcome !== 'pending')
  const groups = groupBy(exits, (f) => f.jurisdiction ?? 'unknown')
  const rows = [...groups].map(([jur, list]) => finalPayRow(jur, list))
  rows.sort((a, b) => b.exits - a.exits)
  return rows
}

export function finalPayRow(jur: string, list: readonly TxFact[]): FinalPayRow {
  const rule = FINAL_PAY_RULES.get(jur)
  const r = onTimeRate(list)
  const inv = onTimeRate(list.filter((f) => f.exitType === 'Involuntary'))
  const vol = onTimeRate(list.filter((f) => f.exitType === 'Voluntary'))
  const lateDays = list.flatMap((f) => (f.outcome === 'late' && f.daysVsDue != null ? [f.daysVsDue] : []))
  return {
    jurisdiction: jur,
    name: rule?.name ?? (jur === 'unknown' ? 'Unknown site' : jur),
    sites: jur === 'unknown' ? '—' : sitesOf(jur),
    rule: rule?.rule ?? 'Due date in the file',
    exits: r.n,
    onTime: r.n - r.late,
    late: r.late,
    rate: share(r.n - r.late, r.n).rate,
    involuntaryRate: share(inv.n - inv.late, inv.n).rate,
    involuntaryN: inv.n,
    voluntaryRate: share(vol.n - vol.late, vol.n).rate,
    voluntaryN: vol.n,
    medianDaysLate: lateDays.length ? median(lateDays) : null,
  }
}

/* ───────────── new hire readiness ───────────── */

export interface SiteRow {
  location: string
  region: Region | '—'
  starts: number
  ready: number
  late: number
  rate: number | null
}

const siteRow = (location: string, region: Region | '—', list: readonly TxFact[]): SiteRow => {
  const r = onTimeRate(list)
  return {
    location,
    region,
    starts: r.n,
    ready: r.n - r.late,
    late: r.late,
    rate: share(r.n - r.late, r.n).rate,
  }
}

const newHires = (facts: readonly TxFact[], w: Window) =>
  dueIn(facts, w).filter((f) => f.type === 'New hire' && f.outcome !== 'pending')

/** New hire Day −3 readiness by site; sites with fewer than 5 starts fold into Other. */
export function newHireBySite(facts: readonly TxFact[], w: Window): SiteRow[] {
  const groups = groupBy(newHires(facts, w), (f) => f.location ?? 'Unknown site')
  const rows = [...groups].map(([loc, list]) => siteRow(loc, list[0].region ?? '—', list))
  rows.sort((a, b) => b.starts - a.starts)
  return foldSmall(
    rows,
    (r) => r.starts,
    (rest, label) => {
      const starts = rest.reduce((a, r) => a + r.starts, 0)
      const ready = rest.reduce((a, r) => a + r.ready, 0)
      return {
        location: label,
        region: '—',
        starts,
        ready,
        late: starts - ready,
        rate: share(ready, starts).rate,
      }
    },
  )
}

export function newHireByRegion(facts: readonly TxFact[], w: Window): SiteRow[] {
  const groups = groupBy(newHires(facts, w), (f) => f.region ?? '—')
  return [...groups].map(([region, list]) => siteRow(region, region as Region | '—', list))
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
}

/** completed − due in calendar days, for completed transactions due in the window. */
export function timingBins(facts: readonly TxFact[], w: Window): TimingRow[] {
  const counts = TIMING_BINS.map(() => 0)
  let n = 0
  for (const f of dueIn(facts, w)) {
    const d = f.daysVsDue
    if (d == null) continue
    const i = TIMING_BINS.findIndex((b) => d >= b.lo && d <= b.hi)
    if (i < 0) continue
    counts[i]++
    n++
  }
  if (!n) return []
  return TIMING_BINS.map((b, i) => ({
    timing: b.label,
    transactions: counts[i],
    share: counts[i] / n,
    late: b.lo > 0,
  }))
}

/* ───────────── retro adjustments ───────────── */

const RETRO_TYPES = new Set(['Job change', 'Compensation change'])

/** Job and pay changes that carry the retro flag. */
export const retroCandidates = (facts: readonly TxFact[]): TxFact[] =>
  facts.filter((f) => RETRO_TYPES.has(f.type) && f.retro != null)

export interface RetroMonthRow {
  month: string
  changes: number
  retro: number
  share: number | null
}

/** Retro adjustments by the month of the payroll cut-off they missed (due month). */
export function retroByMonth(facts: readonly TxFact[], months: readonly string[]): RetroMonthRow[] {
  const groups = groupBy(
    retroCandidates(facts).filter((f) => f.due != null),
    (f) => (f.due as string).slice(0, 7),
  )
  return months.map((month) => {
    const list = groups.get(month) ?? []
    const retro = list.filter((f) => f.retro).length
    return { month, changes: list.length, retro, share: share(retro, list.length).rate }
  })
}

export function retroShare(
  facts: readonly TxFact[],
  w: Window,
): { rate: number | null; retro: number; n: number } {
  const list = retroCandidates(dueIn(facts, w))
  const retro = list.filter((f) => f.retro).length
  return { rate: share(retro, list.length).rate, retro, n: list.length }
}
