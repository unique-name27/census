/**
 * Leave & return to work (docs/VIEWS.md, HR ops > Leave & return): who is on leave and for how
 * long, whether returns are handled well (Atlas LV-03: systems active on the return day), and
 * whether people stay after they come back. Pure.
 *
 * Pairing: each Leave start is paired with the next Return from leave of the same person on or
 * after it (starts in date order, each return used once); none yet means still on leave. A
 * return entered ahead for a date after the as-of date does not end the leave, but it does count
 * for the LV-03 check. A leave also ends when the person leaves the company before returning.
 * A leave that starts after the person's exit is not a leave and is left out.
 *
 * Privacy (on top of the view's own rules):
 *  - every count, rate and median is over a group of at least the anonymity minimum of people,
 *    or it is null ("—"); breakdowns fold smaller groups into "Other (k)";
 *  - the leave reason only ever appears in grouped numbers (`LeaveGroupRow`), never next to a
 *    named person: the leave drills list people without it;
 *  - exits soon after a return and exits during a leave are HR-only numbers: the Leave & return
 *    tab shows them, findings name no one, and the scorecard summary leaves them out.
 */
import type { Employee, HrTransaction, ISODate, LeaveReason, TerminationType } from '@/data/schema'
import { LEAVE_REASONS, MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addDays, addMonths, dateOf, daysBetween, isValidDate, quarterKey, quarterStart } from '@/lib/dates'
import { quantile } from '@/lib/stats'
import { foldGroups, isOther, type Personal, peopleIn, type Share, share } from './util'

export type LeaveEnd = 'returned' | 'left'

/** The LV-03 check on an upcoming return: is the Return from leave entered and processed? */
export type ReturnStatus = 'Ready' | 'Entered, not processed' | 'Not entered'
export const RETURN_STATUSES: readonly ReturnStatus[] = ['Not entered', 'Entered, not processed', 'Ready']

/** The reason label for a leave start without one, in a file that has reasons. */
export const NO_REASON = 'Not recorded'
/** The segment that holds the reasons too small (or too revealing) to name in a group. */
export const OTHER_REASONS = 'Other reasons'
/** The one series of the on-leave chart when the file has no leave reasons. */
export const ALL_LEAVES = 'On leave'
/** The unit of a leave whose person is not on the roster (no business unit to filter to). */
export const NO_UNIT = 'Unknown business unit'

/** One leave of absence: a leave start with its return or exit. */
export interface LeaveFact extends Personal {
  /** The leave start's transaction ID. */
  leaveId: string
  employeeId: string
  name: string | null
  businessUnit: string | null
  department: string | null
  location: string | null
  managerId: string | null
  /** The person is in the roster (so their exit date is known). */
  inRoster: boolean
  reason: LeaveReason | null
  start: ISODate
  /** The planned return date on the leave start. */
  expected: ISODate | null
  /** The paired Return from leave transaction, entered ahead or not. */
  ret: HrTransaction | null
  /** Back at work by the as-of date: the return's effective date. */
  returned: ISODate | null
  /** The paired return was processed (completed) by the as-of date. */
  retProcessed: ISODate | null
  /** The person's exit date, when on or before the as-of date. */
  exit: ISODate | null
  exitType: TerminationType | null
  /** How the leave ended by the as-of date; null while it is open. */
  end: LeaveEnd | null
  endDate: ISODate | null
  /** Days from the start to the return, for leaves that ended in a return. */
  days: number | null
  /** The leave start row, for the drill panel (which never shows the reason). */
  record: HrTransaction
}

const byDateThenId = (a: HrTransaction, b: HrTransaction) =>
  a.effectiveDate.localeCompare(b.effectiveDate) || a.transactionId.localeCompare(b.transactionId)

/** Each leave start with the next return of the same person on or after it. */
export function pairLeaves(
  rows: readonly HrTransaction[],
): { start: HrTransaction; ret: HrTransaction | null }[] {
  const ok = (t: HrTransaction) => isValidDate(t.effectiveDate)
  const starts = rows.filter((t) => t.type === 'Leave start' && ok(t)).sort(byDateThenId)
  const returns = new Map<string, HrTransaction[]>()
  for (const t of rows) {
    if (t.type !== 'Return from leave' || !ok(t)) continue
    const list = returns.get(t.employeeId)
    if (list) list.push(t)
    else returns.set(t.employeeId, [t])
  }
  for (const list of returns.values()) list.sort(byDateThenId)
  return starts.map((start) => {
    const list = returns.get(start.employeeId) ?? []
    const day = dateOf(start.effectiveDate)
    const i = list.findIndex((r) => dateOf(r.effectiveDate) >= day)
    return { start, ret: i >= 0 ? (list.splice(i, 1)[0] ?? null) : null }
  })
}

/** One fact per leave that started on or before the as-of date. */
export function leaveFacts(
  rows: readonly HrTransaction[],
  asOf: ISODate,
  people: ReadonlyMap<string, Employee>,
): LeaveFact[] {
  const out: LeaveFact[] = []
  for (const { start, ret } of pairLeaves(rows)) {
    const begin = dateOf(start.effectiveDate)
    if (begin > asOf) continue
    const e = people.get(start.employeeId)
    const left = e?.terminationDate ? dateOf(e.terminationDate) : null
    // Starting a leave after leaving the company is a data error, not a leave.
    if (left && left < begin) continue
    const exit = left && left <= asOf ? left : null
    const retDate = ret ? dateOf(ret.effectiveDate) : null
    const returned = retDate && retDate <= asOf ? retDate : null
    const done = ret?.completedDate ? dateOf(ret.completedDate) : null
    let end: LeaveEnd | null = null
    let endDate: ISODate | null = null
    if (exit && (!returned || exit < returned)) {
      end = 'left'
      endDate = exit
    } else if (returned) {
      end = 'returned'
      endDate = returned
    }
    const reason = start.leaveReason && (LEAVE_REASONS as readonly string[]).includes(start.leaveReason)
    out.push({
      leaveId: start.transactionId,
      employeeId: start.employeeId,
      person: `p:${start.employeeId}`,
      name: e?.name ?? null,
      businessUnit: e?.businessUnit ?? null,
      department: e?.department ?? null,
      location: e?.location ?? null,
      managerId: e?.managerId ?? null,
      inRoster: !!e,
      reason: reason ? (start.leaveReason as LeaveReason) : null,
      start: begin,
      expected:
        start.expectedReturnDate && isValidDate(start.expectedReturnDate)
          ? dateOf(start.expectedReturnDate)
          : null,
      ret,
      returned: end === 'returned' ? returned : null,
      retProcessed: done && done <= asOf ? done : null,
      exit,
      exitType: e?.terminationType ?? null,
      end,
      endDate,
      days: end === 'returned' && returned ? daysBetween(begin, returned) : null,
      record: start,
    })
  }
  return out
}

/** On leave at the end of day d (d on or before the as-of date): started, not back, not gone. */
export const isOnLeave = (f: LeaveFact, d: ISODate): boolean =>
  f.start <= d && !(f.returned && f.returned <= d) && !(f.exit && f.exit <= d)

export const onLeaveAt = (facts: readonly LeaveFact[], d: ISODate): LeaveFact[] =>
  facts.filter((f) => isOnLeave(f, d))

const inWin = (d: ISODate | null, w: Pick<Window, 'start' | 'end'>): boolean =>
  d != null && d >= w.start && d <= w.end

/** Leaves that ended in a return in the window. */
export const returnsIn = (facts: readonly LeaveFact[], w: Pick<Window, 'start' | 'end'>): LeaveFact[] =>
  facts.filter((f) => f.end === 'returned' && inWin(f.returned, w))

/** Leaves that ended (a return or an exit) in the window. */
export const endedIn = (facts: readonly LeaveFact[], w: Pick<Window, 'start' | 'end'>): LeaveFact[] =>
  facts.filter((f) => f.end != null && inWin(f.endDate, w))

/** A group large enough to show: at least `min` people. */
export const showable = (rows: readonly Personal[], min = MIN_GROUP): boolean => peopleIn(rows) >= min

/** A count that is itself a group of people: null under the anonymity minimum. */
export function groupCount(rows: readonly Personal[], min = MIN_GROUP): number | null {
  return rows.length && showable(rows, min) ? rows.length : rows.length ? null : 0
}

/* ───────────── length ───────────── */

export interface LengthStat {
  median: number | null
  q1: number | null
  q3: number | null
  p10: number | null
  p90: number | null
  n: number
  people: number
}

export function lengthStat(rows: readonly LeaveFact[], min = MIN_GROUP): LengthStat {
  const days = rows.flatMap((f) => (f.days == null ? [] : [f.days]))
  const people = peopleIn(rows)
  const ok = days.length >= min && people >= min
  const q = (p: number) => (ok ? quantile(days, p) : null)
  return { median: q(0.5), q1: q(0.25), q3: q(0.75), p10: q(0.1), p90: q(0.9), n: days.length, people }
}

export interface LengthRow extends LengthStat {
  reason: string
  /** Number of small reasons folded into this row ("Other (k)"); 0 for a real reason. */
  folded: number
  records: LeaveFact[]
}

/** The leave reason as a group label: the category, or "Not recorded". */
export const reasonLabel = (f: Pick<LeaveFact, 'reason'>): string => f.reason ?? NO_REASON

const REASON_ORDER = new Map<string, number>([...LEAVE_REASONS, NO_REASON].map((r, i) => [r, i]))
const reasonRank = (r: string) => REASON_ORDER.get(r) ?? (isOther(r) ? 98 : 99)

/** Length of leaves that ended in a return in the window, by reason; small reasons fold. */
export function lengthByReason(returns: readonly LeaveFact[], min = MIN_GROUP): LengthRow[] {
  const groups = new Map<string, LeaveFact[]>()
  for (const f of returns) {
    const k = reasonLabel(f)
    const list = groups.get(k)
    if (list) list.push(f)
    else groups.set(k, [f])
  }
  return foldGroups(
    [...groups].sort((a, b) => reasonRank(a[0]) - reasonRank(b[0])),
    min,
  ).map((g) => ({
    reason: g.key,
    folded: g.folded,
    records: g.rows,
    ...lengthStat(g.rows, min),
  }))
}

/* ───────────── on leave now, by unit and reason ───────────── */

export interface OnLeaveRow {
  unit: string
  /** The leave reason segment: a category, "Other reasons", or "On leave" without reasons. */
  reason: string
  people: number
  records: LeaveFact[]
  /** Every person on leave in the unit (the bar), for the unit's drill. */
  unitRecords: LeaveFact[]
}

/**
 * People on leave now by business unit, split by reason. Units behind fewer than `min` people
 * fold into "Other (k)". Within a unit a reason is named only when at least `min` people share
 * it and at least one person in the unit has another reason (so a bar never says that everyone
 * in it is on, say, medical leave); the rest is "Other reasons".
 */
export function onLeaveByUnit(now: readonly LeaveFact[], hasReasons: boolean, min = MIN_GROUP): OnLeaveRow[] {
  const units = new Map<string, LeaveFact[]>()
  for (const f of now) {
    const k = f.businessUnit ?? NO_UNIT
    const list = units.get(k)
    if (list) list.push(f)
    else units.set(k, [f])
  }
  const sorted = [...units].sort((a, b) => peopleIn(b[1]) - peopleIn(a[1]) || a[0].localeCompare(b[0]))
  const out: OnLeaveRow[] = []
  for (const g of foldGroups(sorted, min)) {
    if (!hasReasons) {
      out.push({
        unit: g.key,
        reason: ALL_LEAVES,
        people: peopleIn(g.rows),
        records: g.rows,
        unitRecords: g.rows,
      })
      continue
    }
    const total = peopleIn(g.rows)
    const byReason = new Map<string, LeaveFact[]>()
    for (const f of g.rows) {
      const k = reasonLabel(f)
      const list = byReason.get(k)
      if (list) list.push(f)
      else byReason.set(k, [f])
    }
    const rest: LeaveFact[] = []
    for (const [reason, rows] of [...byReason].sort((a, b) => reasonRank(a[0]) - reasonRank(b[0]))) {
      const n = peopleIn(rows)
      if (n >= min && n < total && reason !== NO_REASON)
        out.push({ unit: g.key, reason, people: n, records: rows, unitRecords: g.rows })
      else rest.push(...rows)
    }
    if (rest.length)
      out.push({
        unit: g.key,
        reason: OTHER_REASONS,
        people: peopleIn(rest),
        records: rest,
        unitRecords: g.rows,
      })
  }
  return out
}

export interface ReasonRow {
  reason: string
  people: number
  records: LeaveFact[]
}

/**
 * People on leave now by reason across the scope. A reason is named only when at least `min`
 * people share it and not everyone on leave does; the rest is "Other reasons".
 */
export function onLeaveByReason(now: readonly LeaveFact[], min = MIN_GROUP): ReasonRow[] {
  const total = peopleIn(now)
  const groups = new Map<string, LeaveFact[]>()
  for (const f of now) {
    const k = reasonLabel(f)
    const list = groups.get(k)
    if (list) list.push(f)
    else groups.set(k, [f])
  }
  const out: ReasonRow[] = []
  const rest: LeaveFact[] = []
  for (const [reason, rows] of [...groups].sort((a, b) => reasonRank(a[0]) - reasonRank(b[0]))) {
    const n = peopleIn(rows)
    if (n >= min && n < total && reason !== NO_REASON) out.push({ reason, people: n, records: rows })
    else rest.push(...rows)
  }
  out.sort((a, b) => b.people - a.people || reasonRank(a.reason) - reasonRank(b.reason))
  if (rest.length) out.push({ reason: OTHER_REASONS, people: peopleIn(rest), records: rest })
  return out
}

/** The series order of the on-leave chart. */
export function reasonSeries(rows: readonly OnLeaveRow[]): string[] {
  const seen = [...new Set(rows.map((r) => r.reason))]
  return seen.sort((a, b) => {
    const rank = (r: string) => (r === OTHER_REASONS ? 100 : r === ALL_LEAVES ? -1 : reasonRank(r))
    return rank(a) - rank(b)
  })
}

/* ───────────── upcoming returns (LV-03) ───────────── */

export interface UpcomingReturn {
  fact: LeaveFact
  expected: ISODate
  /** Calendar days from the as-of date to the planned return. */
  daysAway: number
  status: ReturnStatus
  ready: boolean
  /** Within the urgent window and not ready. */
  urgent: boolean
}

/** Open leaves whose planned return falls between the as-of date and the end of the look-ahead. */
export function upcomingReturns(
  facts: readonly LeaveFact[],
  asOf: ISODate,
  aheadDays: number,
  urgentDays: number,
): UpcomingReturn[] {
  const until = addDays(asOf, aheadDays)
  const out: UpcomingReturn[] = []
  for (const f of facts) {
    if (!isOnLeave(f, asOf) || !f.expected || f.expected < asOf || f.expected > until) continue
    const status: ReturnStatus = f.ret ? (f.retProcessed ? 'Ready' : 'Entered, not processed') : 'Not entered'
    const daysAway = daysBetween(asOf, f.expected)
    const ready = status === 'Ready'
    out.push({
      fact: f,
      expected: f.expected,
      daysAway,
      status,
      ready,
      urgent: !ready && daysAway <= urgentDays,
    })
  }
  return out.sort(
    (a, b) =>
      Number(a.ready) - Number(b.ready) ||
      a.expected.localeCompare(b.expected) ||
      (a.fact.name ?? '').localeCompare(b.fact.name ?? ''),
  )
}

/* ───────────── return rate ───────────── */

export interface RateGroup extends Share {
  /** The leaves judged (ended in the window). */
  records: LeaveFact[]
}

/** Returned ÷ ended (returned or left during leave), over leaves that ended in the window. */
export function returnRate(
  facts: readonly LeaveFact[],
  w: Pick<Window, 'start' | 'end'>,
  min = MIN_GROUP,
): RateGroup {
  const ended = endedIn(facts, w)
  const hits = ended.filter((f) => f.end === 'returned').length
  return { ...share(hits, ended.length, peopleIn(ended), min), records: ended }
}

export interface QuarterRow extends RateGroup {
  quarter: string
  start: ISODate
  end: ISODate
  returned: number
  left: number
}

/** Return rate by quarter for the `n` quarters ending with the as-of date's quarter. */
export function returnRateByQuarter(
  facts: readonly LeaveFact[],
  asOf: ISODate,
  n = 8,
  min = MIN_GROUP,
): QuarterRow[] {
  const out: QuarterRow[] = []
  const first = addMonths(quarterStart(asOf), -3 * (n - 1))
  for (let i = 0; i < n; i++) {
    const start = addMonths(first, 3 * i)
    const next = addDays(addMonths(start, 3), -1)
    const end = next > asOf ? asOf : next
    const r = returnRate(facts, { start, end }, min)
    out.push({
      ...r,
      quarter: quarterKey(start),
      start,
      end,
      returned: r.hits,
      left: r.n - r.hits,
    })
  }
  return out
}

/* ───────────── retention after return ───────────── */

export interface RetentionRow extends Share {
  group: string
  /** Number of small reasons folded into this row; 0 for a real group. */
  folded: number
  returners: number
  retained: number
  left: number
  /** The cohort returns behind the row. */
  records: LeaveFact[]
}

export interface Retention {
  /** The cohort: returns from `from` to `to` (inclusive). */
  from: ISODate
  to: ISODate
  months: number
  overall: RetentionRow
  /** The same cohort a horizon earlier, for the change. */
  prior: RetentionRow
  byReason: RetentionRow[]
  /** Parental leave against every other leave, when the file has reasons. */
  parental: RetentionRow | null
  others: RetentionRow | null
}

/** Still employed `months` after returning (a person who left after that counts as retained). */
export const stayed = (f: LeaveFact, months: number): boolean =>
  !f.exit || !f.returned || f.exit > addMonths(f.returned, months)

function retentionRow(
  group: string,
  rows: readonly LeaveFact[],
  months: number,
  min: number,
  folded = 0,
): RetentionRow {
  const retained = rows.filter((f) => stayed(f, months)).length
  return {
    ...share(retained, rows.length, peopleIn(rows), min),
    group,
    folded,
    returners: rows.length,
    retained,
    left: rows.length - retained,
    records: rows.slice(),
  }
}

/** The retention cohort ending a horizon before `asOf`, `shift` horizons further back. */
export function cohortWindow(asOf: ISODate, months: number, shift = 0): { from: ISODate; to: ISODate } {
  const to = addMonths(asOf, -months * (1 + shift))
  return { from: addDays(addMonths(asOf, -months * (2 + shift)), 1), to }
}

export function retention(
  facts: readonly LeaveFact[],
  asOf: ISODate,
  months: number,
  hasReasons: boolean,
  min = MIN_GROUP,
): Retention {
  const pick = (shift: number) => {
    const w = cohortWindow(asOf, months, shift)
    return facts.filter(
      (f) => f.inRoster && f.end === 'returned' && inWin(f.returned, { start: w.from, end: w.to }),
    )
  }
  const cohort = pick(0)
  const { from, to } = cohortWindow(asOf, months)
  const overall = retentionRow('All leaves', cohort, months, min)
  const prior = retentionRow('All leaves', pick(1), months, min)
  if (!hasReasons) return { from, to, months, overall, prior, byReason: [], parental: null, others: null }
  const groups = new Map<string, LeaveFact[]>()
  for (const f of cohort) {
    const k = reasonLabel(f)
    const list = groups.get(k)
    if (list) list.push(f)
    else groups.set(k, [f])
  }
  const byReason = foldGroups(
    [...groups].sort((a, b) => reasonRank(a[0]) - reasonRank(b[0])),
    min,
  ).map((g) => retentionRow(g.key, g.rows, months, min, g.folded))
  const parentalRows = cohort.filter((f) => f.reason === 'Parental')
  return {
    from,
    to,
    months,
    overall,
    prior,
    byReason,
    parental: retentionRow('Parental', parentalRows, months, min),
    others: retentionRow(
      'Other leaves',
      cohort.filter((f) => f.reason !== 'Parental'),
      months,
      min,
    ),
  }
}

/* ───────────── exits around leave (HR only) ───────────── */

export interface SoonLeaver {
  /** The return the exit followed (the latest one before it). */
  fact: LeaveFact
  exit: ISODate
  exitType: TerminationType | null
  /** Calendar days from the return to the exit. */
  daysAfter: number
}

export interface ExitsAround {
  /** People who left in the window within `months` of a return from leave. */
  soon: SoonLeaver[]
  /** The returns that could lead to such an exit: returns from `months` before the window to its end. */
  soonBase: LeaveFact[]
  /** Leaves that ended in the window because the person left before returning. */
  during: LeaveFact[]
  /** Leaves that ended in the window (the base for exits during leave). */
  duringBase: LeaveFact[]
  months: number
}

export function exitsAround(
  facts: readonly LeaveFact[],
  w: Pick<Window, 'start' | 'end'>,
  months: number,
): ExitsAround {
  const soonBase = facts.filter(
    (f) => f.end === 'returned' && inWin(f.returned, { start: addMonths(w.start, -months), end: w.end }),
  )
  const byPerson = new Map<string, SoonLeaver>()
  for (const f of soonBase) {
    if (!f.exit || !f.returned || !inWin(f.exit, w)) continue
    if (f.exit < f.returned || f.exit > addMonths(f.returned, months)) continue
    const prev = byPerson.get(f.employeeId)
    if (prev && prev.fact.returned! >= f.returned) continue
    byPerson.set(f.employeeId, {
      fact: f,
      exit: f.exit,
      exitType: f.exitType,
      daysAfter: daysBetween(f.returned, f.exit),
    })
  }
  const duringBase = endedIn(facts, w)
  return {
    soon: [...byPerson.values()].sort((a, b) => a.exit.localeCompare(b.exit)),
    soonBase,
    during: duringBase.filter((f) => f.end === 'left'),
    duringBase,
    months,
  }
}

/** The department holding most of the soon leavers, when one clearly does (count only). */
export function exitCluster(
  soon: readonly SoonLeaver[],
  cfg: { minShare: number; minLeavers: number },
  min = MIN_GROUP,
): { department: string; count: number; total: number } | null {
  if (!soon.length) return null
  const counts = new Map<string, number>()
  for (const s of soon) {
    const d = s.fact.department ?? 'Unknown department'
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const [top] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!top) return null
  const [department, count] = top
  if (count < Math.max(cfg.minLeavers, min) || count / soon.length < cfg.minShare) return null
  return { department, count, total: soon.length }
}

/* ───────────── monthly snapshots ───────────── */

/** People on leave at each date (null under the anonymity minimum). */
export function onLeaveSeries(
  facts: readonly LeaveFact[],
  dates: readonly ISODate[],
  min = MIN_GROUP,
): (number | null)[] {
  return dates.map((d) => groupCount(onLeaveAt(facts, d), min))
}
