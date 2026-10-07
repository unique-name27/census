/**
 * Trends over fixed calendar points (docs/CHARTS.md, HR ops): the case backlog at each month end,
 * transactions on time by type and quarter, and people on leave at each month end. Each point is
 * recounted from the case, transaction and leave facts, so it means what the matching KPI means
 * on its own date. Pure.
 *
 * Privacy: backlog points are counts of cases (their drills follow the view's gate, and employee
 * relations cases are counted, never listed). An on-time cell needs at least `min` transactions
 * for `min` people, or its rate and on-time count are null. A month end with fewer than `min`
 * people on leave is null.
 */
import { type ISODate, MIN_GROUP, TRANSACTION_TYPES, type TransactionType } from '@/data/schema'
import { addDays, addMonths, daysBetween, monthEnd, quarterKey, quarterStart } from '@/lib/dates'
import { quantile } from '@/lib/stats'
import type { CaseFact, TxFact } from './facts'
import { onTimeRate } from './facts'
import { openAt } from './kpis'
import { groupCount, type LeaveFact, onePerPerson, onLeaveAt } from './leave'

/* ───────────── open cases at each month end ───────────── */

export interface BacklogPoint {
  /** The month end (the as-of date for the last point). */
  date: string
  /** Cases open at the end of that day. */
  open: number
  /** Of those, cases open longer than the age limit on that day. */
  aged: number
  records: CaseFact[]
  agedRecords: CaseFact[]
}

/**
 * Open cases at the end of each date, and how many of them had been open longer than `agedDays`
 * days then (the age limit setting, as in "Cases open longer than 14 days").
 */
export function backlogByMonth(
  facts: readonly CaseFact[],
  dates: readonly string[],
  agedDays: number,
): BacklogPoint[] {
  return dates.map((date) => {
    const records = openAt(facts, date)
    const agedRecords = records.filter((f) => daysBetween(f.opened, date) > agedDays)
    return { date, open: records.length, aged: agedRecords.length, records, agedRecords }
  })
}

/* ───────────── on time by type and quarter ───────────── */

export interface Quarter {
  /** "2026 Q3" */
  key: string
  start: string
  /** The quarter's last day, or the as-of date for the quarter in progress. */
  end: string
}

/** The `n` calendar quarters ending with the as-of quarter (which ends at the as-of date). */
export function lastQuarters(asOf: string, n: number): Quarter[] {
  const first = quarterStart(asOf)
  const out: Quarter[] = []
  for (let i = n - 1; i >= 0; i--) {
    const start = addMonths(first, -3 * i)
    const end = i === 0 ? asOf : monthEnd(addMonths(start, 2))
    out.push({ key: quarterKey(start), start, end })
  }
  return out
}

export interface TypeQuarterCell {
  type: string
  quarter: string
  start: string
  end: string
  /** Judged transactions due in the quarter: on time, completed late or open past due. */
  due: number
  /** Hidden (null) with the rate. */
  onTime: number | null
  rate: number | null
  /** The rate less the on-time target (a fraction: −0.12 is 12 pts under); null when hidden. */
  gap: number | null
  /** The judged transactions behind the cell. */
  records: TxFact[]
}

const typeOrder = (t: string) => {
  const i = TRANSACTION_TYPES.indexOf(t as TransactionType)
  return i < 0 ? 99 : i
}

/**
 * The share on time for each transaction type in each quarter, by due date, and its distance from
 * the on-time target. Types run in the catalog order and only those with a judged transaction in
 * the quarters appear; every type has a cell for every quarter (0 due when none was).
 */
export function onTimeByTypeQuarter(
  facts: readonly TxFact[],
  quarters: readonly Quarter[],
  min = MIN_GROUP,
  target: number | null = null,
): TypeQuarterCell[] {
  const first = quarters[0]?.start
  const last = quarters.at(-1)?.end
  if (!first || !last) return []
  const judged = facts.filter(
    (f) =>
      f.due != null &&
      f.due >= first &&
      f.due <= last &&
      (f.outcome === 'on-time' || f.outcome === 'late' || f.outcome === 'overdue'),
  )
  const types = [...new Set(judged.map((f) => f.type))].sort(
    (a, b) => typeOrder(a) - typeOrder(b) || a.localeCompare(b),
  )
  return types.flatMap((type) =>
    quarters.map((q) => {
      const records = judged.filter(
        (f) => f.type === type && (f.due as string) >= q.start && (f.due as string) <= q.end,
      )
      const r = onTimeRate(records, min)
      return {
        type,
        quarter: q.key,
        start: q.start,
        end: q.end,
        due: r.n,
        onTime: r.rate == null ? null : r.onTime,
        rate: r.rate,
        gap: r.rate == null || target == null ? null : r.rate - target,
        records,
      }
    }),
  )
}

/* ───────────── people on leave at each month end ───────────── */

export interface OnLeavePoint {
  date: string
  /** People on leave at the end of that day; null under the anonymity minimum. */
  people: number | null
  /** One leave per person on leave (their latest start). */
  records: LeaveFact[]
  /**
   * The leave history reaches back far enough for this date: leaves under way on it started
   * after the history begins. Earlier dates would undercount, so the chart starts after them.
   */
  covered: boolean
}

export interface LeaveCoverage {
  /** The first leave start in the file (any scope); null without leave history. */
  since: ISODate | null
  /** The first date whose leaves in progress began inside the history; null without history. */
  from: ISODate | null
}

/**
 * Where the leave history is long enough to count who was on leave: from its first leave start
 * plus the length nine in ten finished leaves stay within (90 days when none has finished), since
 * a leave already under way when the history begins is not in the file.
 */
export function leaveCoverage(starts: readonly ISODate[], facts: readonly LeaveFact[]): LeaveCoverage {
  const since = starts.reduce<ISODate | null>((a, d) => (!a || d < a ? d : a), null)
  if (!since) return { since: null, from: null }
  const lengths = facts
    .flatMap((f) => (f.endDate ? [daysBetween(f.start, f.endDate)] : []))
    .sort((a, b) => a - b)
  const lead = lengths.length ? Math.ceil(quantile(lengths, 0.9) ?? 90) : 90
  return { since, from: addDays(since, lead) }
}

/** People on leave at the end of each date (the "On leave now" count, on each date). */
export function onLeaveByMonth(
  facts: readonly LeaveFact[],
  dates: readonly string[],
  min = MIN_GROUP,
  coveredFrom: ISODate | null = null,
): OnLeavePoint[] {
  return dates.map((date) => {
    const records = onePerPerson(onLeaveAt(facts, date))
    return {
      date,
      people: groupCount(records, min),
      records,
      covered: !coveredFrom || date >= coveredFrom,
    }
  })
}
