/**
 * Right to work: authorizations expiring, reverification started on time, and the mix of broad
 * authorization categories.
 *
 * Definitions (docs/VIEWS.md, Compliance):
 *  - expiring: active people whose authorization ends after the as-of date and within the window
 *    (90 days for the headline, 180 for planning; both settings);
 *  - reverification on time: started at least the lead time (90 days) before the expiry date, over
 *    authorizations that ended in the period or end within the planning window, judged once the
 *    lead-time mark has passed or the reverification has started;
 *  - overdue: ending within the lead time with no reverification started.
 *
 * Privacy: the authorization type is read only for the mix, in aggregate; categories under the
 * anonymity minimum fold into Other. Pure.
 */
import { AUTHORIZATION_TYPES, type ISODate } from '@/data/schema'
import type { Window } from '@/data/scope'
import { isActiveAt, isEmployee } from '@/data/scope'
import { addDays, daysBetween, monthKey, monthsBetween, quarterKey } from '@/lib/dates'
import { type ComplianceBase, type Person, rateOf } from './base'

export type ReverificationStatus = 'Expired' | 'Not started' | 'Started late' | 'On time' | 'Not due yet'

/** Status order for tables: what needs action first. */
export const STATUS_ORDER: readonly ReverificationStatus[] = [
  'Expired',
  'Not started',
  'Started late',
  'Not due yet',
  'On time',
]

export interface ExpiryRow extends Person {
  expiryDate: ISODate
  daysToExpiry: number
  /** The date reverification should have started by: expiry − lead time. */
  dueBy: ISODate
  startedDate: ISODate | null
  /** Days before the expiry date that reverification started (null when it hasn't). */
  startedAhead: number | null
  status: ReverificationStatus
}

export interface MonthUnitRow {
  /** YYYY-MM */
  month: string
  businessUnit: string
  people: number
  rows: ExpiryRow[]
}

export interface QuarterRow {
  /** "2026 Q4" */
  quarter: string
  judged: number
  onTime: number
  late: number
  rate: number | null
  rows: ExpiryRow[]
}

export interface MixRow {
  type: string
  people: number | null
  share: number | null
  /** Folded categories ("Other (2)"): how many. */
  folded: number
  rows: Person[]
}

export interface WorkModel {
  /** Active employees with a right to work row (the authorization mix is over them). */
  activeCount: number
  /** Expiring within the headline window, soonest first. */
  expiringHeadline: ExpiryRow[]
  /** Expiring within the planning window (includes the headline ones), soonest first. */
  expiringHorizon: ExpiryRow[]
  /** Active people whose authorization ended before the as-of date. */
  expired: ExpiryRow[]
  /** Within the lead time, not started. */
  overdue: ExpiryRow[]
  /** Started, but less than the lead time ahead (in the judged set). */
  startedLate: ExpiryRow[]
  reverification: { judged: ExpiryRow[]; onTime: ExpiryRow[]; rate: number | null }
  /** Expiring in the planning window by month and business unit (months in order, every month listed). */
  byMonth: MonthUnitRow[]
  months: string[]
  units: string[]
  byQuarter: QuarterRow[]
  mix: MixRow[]
  /** Active people with a time-limited authorization (an expiry date). */
  timeLimited: number
}

function statusOf(
  expiry: ISODate,
  dueBy: ISODate,
  started: ISODate | null,
  asOf: ISODate,
): ReverificationStatus {
  if (started) return started <= dueBy ? 'On time' : 'Started late'
  if (expiry < asOf) return 'Expired'
  return dueBy <= asOf ? 'Not started' : 'Not due yet'
}

export function expiryRow(p: Person, asOf: ISODate, leadDays: number): ExpiryRow | null {
  const expiryDate = p.r.expiryDate
  if (!expiryDate) return null
  const dueBy = addDays(expiryDate, -leadDays)
  const startedDate = p.r.reverificationStartedDate ?? null
  return {
    ...p,
    expiryDate,
    daysToExpiry: daysBetween(asOf, expiryDate),
    dueBy,
    startedDate,
    startedAhead: startedDate ? daysBetween(startedDate, expiryDate) : null,
    status: statusOf(expiryDate, dueBy, startedDate, asOf),
  }
}

const byExpiry = (a: ExpiryRow, b: ExpiryRow) =>
  a.expiryDate.localeCompare(b.expiryDate) || a.e.name.localeCompare(b.e.name)

/** Whether a reverification is judged yet: its lead-time mark has passed, or it has started. */
export const isJudged = (x: ExpiryRow, asOf: ISODate): boolean => !!x.startedDate || x.dueBy <= asOf

export function computeWork(base: ComplianceBase, window: Window): WorkModel {
  const { asOf, settings: s } = base
  const headlineEnd = addDays(asOf, s.headlineDays)
  const horizonEnd = addDays(asOf, s.horizonDays)

  const activeRows = base.active.flatMap((p) => expiryRow(p, asOf, s.leadDays) ?? [])
  const expiringHorizon = activeRows
    .filter((x) => x.expiryDate > asOf && x.expiryDate <= horizonEnd)
    .sort(byExpiry)
  const expiringHeadline = expiringHorizon.filter((x) => x.expiryDate <= headlineEnd)
  const expired = activeRows.filter((x) => x.expiryDate < asOf && x.status === 'Expired').sort(byExpiry)
  const overdue = expiringHorizon.filter((x) => x.status === 'Not started')

  // Judged: ended in the period (people employed on the expiry date) or ending in the planning
  // window (people active today).
  const past = base.people.flatMap((p) => {
    const x = expiryRow(p, asOf, s.leadDays)
    return x && x.expiryDate >= window.start && x.expiryDate <= asOf && isActiveAt(p.e, x.expiryDate)
      ? [x]
      : []
  })
  const judged = [...past, ...expiringHorizon].filter((x) => isJudged(x, asOf)).sort(byExpiry)
  const onTime = judged.filter((x) => x.status === 'On time')
  const startedLate = judged.filter((x) => x.status === 'Started late')

  // Expiries by month and business unit, every month of the planning window.
  const months = monthsBetween(addDays(asOf, 1), horizonEnd)
  const unitCount = new Map<string, number>()
  for (const x of expiringHorizon) unitCount.set(x.e.businessUnit, (unitCount.get(x.e.businessUnit) ?? 0) + 1)
  const ranked = [...unitCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([u]) => u)
  // Eight series at most (house rule); the rest fold into Other.
  const keep = new Set(ranked.length > 8 ? ranked.slice(0, 7) : ranked)
  const unitOf = (x: ExpiryRow) => (keep.has(x.e.businessUnit) ? x.e.businessUnit : 'Other')
  const units = [...ranked.filter((u) => keep.has(u)), ...(ranked.length > 8 ? ['Other'] : [])]
  const cells = new Map<string, MonthUnitRow>()
  for (const x of expiringHorizon) {
    const month = monthKey(x.expiryDate)
    const unit = unitOf(x)
    const k = `${month}|${unit}`
    const c = cells.get(k) ?? { month, businessUnit: unit, people: 0, rows: [] }
    c.people++
    c.rows.push(x)
    cells.set(k, c)
  }
  const byMonth: MonthUnitRow[] = []
  for (const month of months)
    for (const unit of units) {
      const c = cells.get(`${month}|${unit}`)
      if (c) byMonth.push(c)
    }

  // Reverification on time by the quarter the authorization ends in.
  const quarters = new Map<string, ExpiryRow[]>()
  for (const x of judged) {
    const q = quarterKey(x.expiryDate)
    quarters.set(q, [...(quarters.get(q) ?? []), x])
  }
  const byQuarter: QuarterRow[] = [...quarters.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, rows]) => {
      const ok = rows.filter((x) => x.status === 'On time').length
      return {
        quarter,
        judged: rows.length,
        onTime: ok,
        late: rows.length - ok,
        rate: rateOf(ok, rows.length, s.minGroup),
        rows,
      }
    })

  return {
    activeCount: base.active.filter((p) => isEmployee(p.e)).length,
    expiringHeadline,
    expiringHorizon,
    expired,
    overdue,
    startedLate,
    reverification: { judged, onTime, rate: rateOf(onTime.length, judged.length, s.minGroup) },
    byMonth,
    months,
    units,
    byQuarter,
    mix: computeMix(base),
    timeLimited: activeRows.length,
  }
}

/**
 * Active employees by authorization category (employees only, like every headcount; contractors
 * and interns are reported separately). Categories with fewer people than the anonymity minimum
 * fold into "Other (k)"; Other itself is hidden while it is still too small.
 */
export function computeMix(base: ComplianceBase): MixRow[] {
  const min = base.settings.minGroup
  const groups = new Map<string, Person[]>()
  const employees = base.active.filter((p) => isEmployee(p.e))
  for (const p of employees) {
    const t = p.r.authorizationType ?? 'Not recorded'
    groups.set(t, [...(groups.get(t) ?? []), p])
  }
  const total = employees.length
  const order = [...AUTHORIZATION_TYPES, 'Not recorded'] as readonly string[]
  const big: MixRow[] = []
  const small: Person[][] = []
  for (const t of order) {
    const rows = groups.get(t)
    if (!rows?.length) continue
    if (rows.length >= min)
      big.push({ type: t, people: rows.length, share: rows.length / total, folded: 0, rows })
    else small.push(rows)
  }
  big.sort((a, b) => (b.people ?? 0) - (a.people ?? 0))
  if (small.length) {
    const rows = small.flat()
    const shown = rows.length >= min
    big.push({
      type: `Other (${small.length})`,
      people: shown ? rows.length : null,
      share: shown ? rows.length / total : null,
      folded: small.length,
      rows,
    })
  }
  return big
}
