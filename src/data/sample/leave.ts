/**
 * Leave and return to work (docs/VIEWS.md, HR ops > Leave & return), on top of the HR
 * transactions: every Leave start gets its Atlas leave category and planned return date, and the
 * leave history is made coherent with the roster.
 *
 * The transactions module picks a person for each leave on the day it is requested, so a few
 * leaves started after the person had already left, and leave timing knew nothing of later exits.
 * This module, drawing from its own stream:
 *  - moves the leaves of people who left before the leave started, were dismissed during it, or
 *    left within six months of returning to colleagues at the same site who stayed, except for
 *    the two planted resignations soon after a parental leave;
 *  - records returns for the longest-running open leaves, so about 20 people are on leave now;
 *  - enters the return from leave ahead of time for most of the returns due in the next 30 days;
 *  - sets the leave category by leave length, with parental leave planted so that 85% of the
 *    people who came back from it 12 to 24 months ago were still here 12 months later.
 * Leave categories are the Atlas's nine, at category level only; no medical detail exists.
 */
import type { Employee, HrTransaction, LeaveReason } from '../schema'
import { TRANSACTION_PROCESS } from '../schema'
import { AS_OF, type Day, day, iso, onOrAfterWeekday, onOrBeforeWeekday } from './calendar'
import type { Rng } from './prng'

/** Returns 12 to 24 months before the as-of date: the 12-month retention cohort. */
export const RETENTION_COHORT = { from: '2024-10-01', to: '2025-09-30' } as const
/** Planted: people who resigned within six months of coming back from parental leave. */
export const LEFT_SOON_AFTER_RETURN = 2
/** Planted: parental leavers in the retention cohort, and how many of them left within 12 months. */
export const PARENTAL_COHORT = { returners: 20, left: 3 } as const
/** Open leaves kept open; the rest get a return before the as-of date. */
export const ON_LEAVE_NOW = 20
/** Days after the as-of date that count as "returns in the next 30 days". */
const SOON = 30

interface Pair {
  start: HrTransaction
  ret: HrTransaction | null
}

const len = (p: Pair): number | null => (p.ret ? day(p.ret.effectiveDate) - day(p.start.effectiveDate) : null)

/** Each leave start with the next return of the same person on or after it. */
function pairLeaves(rows: readonly HrTransaction[]): Pair[] {
  const starts = rows
    .filter((t) => t.type === 'Leave start')
    .sort(
      (a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate) || a.transactionId.localeCompare(b.transactionId),
    )
  const returns = new Map<string, HrTransaction[]>()
  for (const t of rows) {
    if (t.type !== 'Return from leave') continue
    const list = returns.get(t.employeeId)
    if (list) list.push(t)
    else returns.set(t.employeeId, [t])
  }
  for (const list of returns.values()) list.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  return starts.map((start) => {
    const list = returns.get(start.employeeId) ?? []
    const i = list.findIndex((r) => r.effectiveDate >= start.effectiveDate)
    const ret = i >= 0 ? list.splice(i, 1)[0] : null
    return { start, ret }
  })
}

/** A return from leave, entered and processed the way the transactions module does it. */
function returnRow(rng: Rng, employeeId: string, back: Day, completed: 'done' | 'open'): HrTransaction {
  const submitted = Math.min(AS_OF, onOrBeforeWeekday(back - rng.int(3, 14)))
  const done = Math.min(AS_OF, back, submitted + rng.int(0, 4))
  return {
    transactionId: '',
    type: 'Return from leave',
    employeeId,
    submittedDate: iso(submitted),
    effectiveDate: iso(back),
    dueDate: iso(back),
    completedDate: completed === 'done' ? iso(Math.max(submitted, done)) : null,
    processId: TRANSACTION_PROCESS['Return from leave'],
    retro: null,
  }
}

/** Leave category by length: long leaves are parental or medical, short ones personal or family. */
function reasonFor(days: number, rng: Rng, parentalOk: boolean): LeaveReason {
  if (days >= 84)
    return rng.pickPair<LeaveReason>([
      ['Parental', parentalOk ? 58 : 0],
      ['Medical', 32],
      ['Sabbatical', 6],
      ['Family care', 4],
    ])
  if (days > 30)
    return rng.pickPair<LeaveReason>([
      ['Medical', 42],
      ['Family care', 24],
      ['Personal', 14],
      ['Parental', parentalOk ? 6 : 0],
      ["Workers' compensation", 7],
      ['Military', 7],
    ])
  return rng.pickPair<LeaveReason>([
    ['Personal', 30],
    ['Family care', 28],
    ['Bereavement', 16],
    ['Civic duty', 12],
    ['Military', 8],
    ['Medical', 6],
  ])
}

export function withLeaveHistory(
  transactions: readonly HrTransaction[],
  employees: readonly Employee[],
  rng: Rng,
): HrTransaction[] {
  const byId = new Map(employees.map((e) => [e.employeeId, e]))
  const rows = transactions.map((t) => ({ ...t }))
  const pairs = pairLeaves(rows)
  const asOf = iso(AS_OF)
  const exitOf = (id: string) => byId.get(id)?.terminationDate ?? null

  // Leave spans per person, to keep a moved leave from overlapping one the colleague already has.
  const spans = new Map<string, [Day, Day][]>()
  const spanOf = (p: Pair): [Day, Day] => [
    day(p.start.effectiveDate),
    p.ret ? day(p.ret.effectiveDate) : AS_OF + 120,
  ]
  for (const p of pairs) {
    const list = spans.get(p.start.employeeId) ?? []
    list.push(spanOf(p))
    spans.set(p.start.employeeId, list)
  }
  const free = (id: string, [a, b]: [Day, Day]) =>
    !(spans.get(id) ?? []).some(([x, y]) => x <= b + 60 && y >= a - 60)

  /** A colleague at the same site who was there long before the leave and is still here. */
  const stayers = employees.filter((e) => e.employmentType === 'Employee' && !e.terminationDate)
  const moved = new Set<string>()
  const moveTo = (p: Pair, span: [Day, Day]): string => {
    const site = byId.get(p.start.employeeId)?.location
    const ok = (e: Employee) =>
      day(e.hireDate) <= span[0] - 90 && !moved.has(e.employeeId) && free(e.employeeId, span)
    const local = stayers.filter((e) => e.location === site && ok(e))
    const pick = rng.pick(local.length ? local : stayers.filter(ok))
    moved.add(pick.employeeId)
    spans.set(pick.employeeId, [...(spans.get(pick.employeeId) ?? []), span])
    return pick.employeeId
  }
  const reassign = (p: Pair, span: [Day, Day]) => {
    const to = moveTo(p, span)
    p.start.employeeId = to
    if (p.ret) p.ret.employeeId = to
  }

  // 1. Leaves that started after the person left, or ended in a dismissal: a colleague's leave,
  //    which has ended by now.
  const added: HrTransaction[] = []
  for (const p of pairs) {
    if (p.ret) continue
    const exit = exitOf(p.start.employeeId)
    if (!exit || exit > asOf) continue
    const person = byId.get(p.start.employeeId)
    const before = exit < p.start.effectiveDate
    if (!before && person?.terminationType === 'Voluntary') continue // resigned while on leave
    const start = day(p.start.effectiveDate)
    const back = onOrAfterWeekday(start + rng.int(28, 70))
    reassign(p, [start, back])
    p.ret = returnRow(rng, p.start.employeeId, Math.min(back, AS_OF - 3), 'done')
    added.push(p.ret)
  }

  // 2. Exits within six months of a return: keep the two planted resignations after a long
  //    (parental) leave in the retention cohort, move the rest to colleagues who stayed.
  const soonAfter = (p: Pair) => {
    const exit = p.ret ? exitOf(p.start.employeeId) : null
    return !!exit && !!p.ret && exit >= p.ret.effectiveDate && day(exit) - day(p.ret.effectiveDate) <= 183
  }
  const plantable = (p: Pair) => {
    const e = byId.get(p.start.employeeId)
    return (
      soonAfter(p) &&
      e?.terminationType === 'Voluntary' &&
      (len(p) ?? 0) >= 84 &&
      e.terminationDate! >= '2025-10-01' &&
      p.ret!.effectiveDate >= RETENTION_COHORT.from &&
      p.ret!.effectiveDate <= RETENTION_COHORT.to
    )
  }
  const kept = new Set(pairs.filter(plantable).slice(0, LEFT_SOON_AFTER_RETURN))
  for (const p of pairs) if (soonAfter(p) && !kept.has(p)) reassign(p, spanOf(p))

  // 3. About 20 people on leave now: the longest-running open leaves have ended.
  const open = pairs.filter((p) => !p.ret && !exitOf(p.start.employeeId))
  for (const p of open.slice(0, Math.max(0, open.length - ON_LEAVE_NOW))) {
    const start = day(p.start.effectiveDate)
    const back = onOrAfterWeekday(Math.min(AS_OF - 3, start + rng.int(56, 110)))
    p.ret = returnRow(rng, p.start.employeeId, back, 'done')
    added.push(p.ret)
  }

  // 4. Leave categories. The parental cohort is planted first; everything else follows length.
  const reason = new Map<Pair, LeaveReason>()
  const cohort = pairs.filter(
    (p) =>
      p.ret && p.ret.effectiveDate >= RETENTION_COHORT.from && p.ret.effectiveDate <= RETENTION_COHORT.to,
  )
  const retained = (p: Pair) => {
    const exit = exitOf(p.start.employeeId)
    return !exit || day(exit) > day(p.ret!.effectiveDate) + 365
  }
  const long = cohort.filter((p) => (len(p) ?? 0) >= 84)
  const leftLong = [...kept, ...long.filter((p) => !kept.has(p) && !retained(p))]
  const parentLeft = leftLong.slice(0, PARENTAL_COHORT.left)
  const parentStayed = rng.sample(
    long.filter((p) => retained(p)),
    PARENTAL_COHORT.returners - parentLeft.length,
  )
  for (const p of [...parentLeft, ...parentStayed]) reason.set(p, 'Parental')
  for (const p of pairs) {
    if (reason.has(p)) continue
    const inCohort = cohort.includes(p)
    const planned = len(p) ?? rng.int(20, 120)
    reason.set(p, reasonFor(planned, rng, !inCohort))
  }

  // 5. Planned return dates: the actual return for most, an extension or an early return for some;
  //    open leaves are planned by category, and most returns in the next 30 days are entered ahead.
  for (const p of pairs) {
    const r = reason.get(p)!
    const start = day(p.start.effectiveDate)
    let planned: Day
    if (p.ret) {
      const back = day(p.ret.effectiveDate)
      const roll = rng.next()
      planned = roll < 0.72 ? back : roll < 0.9 ? back - rng.int(7, 21) : back + rng.int(5, 12)
    } else {
      const weeks =
        r === 'Parental'
          ? rng.int(12, 18)
          : r === 'Medical' || r === "Workers' compensation"
            ? rng.int(4, 12)
            : r === 'Sabbatical'
              ? rng.int(8, 12)
              : rng.int(2, 6)
      planned = start + weeks * 7
    }
    planned = Math.max(start + 7, onOrAfterWeekday(planned))
    if (!p.ret && planned <= AS_OF) planned = onOrAfterWeekday(AS_OF + rng.int(3, 20))
    p.start.leaveReason = r
    p.start.expectedReturnDate = iso(planned)
  }
  const dueSoon = pairs
    .filter((p) => !p.ret && !exitOf(p.start.employeeId))
    .filter((p) => day(p.start.expectedReturnDate!) <= AS_OF + SOON)
  dueSoon.forEach((p, i) => {
    // Every fourth one has nothing entered yet; one more is entered but not processed.
    if (i % 4 === 3) return
    const back = day(p.start.expectedReturnDate!)
    const row = returnRow(rng, p.start.employeeId, back, i === 1 ? 'open' : 'done')
    added.push(row)
  })

  // Same order and numbering as the transactions module: by submitted date, effective date, person.
  const all = [...rows, ...added].sort(
    (a, b) =>
      a.submittedDate.localeCompare(b.submittedDate) ||
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.employeeId.localeCompare(b.employeeId),
  )
  return all.map((t, i) => ({ ...t, transactionId: `TX-${300001 + i}` }))
}
