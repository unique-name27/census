/**
 * The records behind every Leave & return number, as specs for the shared drill panel.
 *
 * People are listed through their leave start (kind `transactions`) or their roster row (kind
 * `employees`), never with the leave reason: the transactions drill has no reason column and
 * these specs add none. Numbers cut by reason drill to grouped counts (kind `leaveGroups`)
 * instead, so a reason never sits beside a name. A list opens only in a scope that is not small
 * and for a group behind at least the anonymity minimum of people (`canDrill`).
 */
import type { Column } from '@/charts/types'
import type { Employee, HrTransaction } from '@/data/schema'
import { type DrillSpec, drillSpec, type LeaveGroupRow } from '@/drill/types'
import { daysBetween, formatDate } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { plural } from '@/lib/format'
import { canDrill, type DrillScope } from './drills'
import { type LeaveFact, type ReturnStatus, stayed, type UpcomingReturn } from './leave'
import type { Personal } from './util'

/** Extra columns a leave list can carry. */
export type LeaveColumn = 'expected' | 'returned' | 'days' | 'ended' | 'status' | 'retained' | 'exit'

export interface LeaveDrillOptions {
  title: string
  subtitle?: string
  note?: string
  /** The group the number describes, when larger than the rows listed (default: the rows). */
  gate?: readonly Personal[]
  order?: (a: LeaveFact, b: LeaveFact) => number
  columns: readonly LeaveColumn[]
  /** For 'status': the LV-03 check by leave. */
  status?: ReadonlyMap<string, ReturnStatus>
  /** For 'retained': the horizon in months. */
  months?: number
}

const ENDED: Record<string, string> = { returned: 'Returned', left: 'Left the company' }

/** Leaves behind a number, listed by their leave start (no reason column). */
export function leaveDrill(
  s: DrillScope,
  rows: readonly LeaveFact[] | null | undefined,
  o: LeaveDrillOptions,
): DrillSpec<'transactions'> | null {
  if (!rows?.length || !canDrill(s, o.gate ?? rows)) return null
  const listed = o.order ? rows.slice().sort(o.order) : rows.slice()
  const extras: { column: Column; value: (f: LeaveFact) => unknown }[] = [
    { column: { key: 'lvStart', label: 'Leave started', format: 'date' }, value: (f) => f.start },
  ]
  const add = (key: string, label: string, value: (f: LeaveFact) => unknown, format?: Format) =>
    extras.push({ column: format ? { key, label, format } : { key, label }, value })
  for (const c of o.columns) {
    if (c === 'returned') add('lvReturned', 'Returned', (f) => f.returned, 'date')
    if (c === 'days')
      add('lvDays', 'Days on leave', (f) => f.days ?? (f.end ? null : daysBetween(f.start, s.asOf)), 'days')
    if (c === 'ended') add('lvEnded', 'Ended by', (f) => (f.end ? ENDED[f.end] : 'Still on leave'))
    if (c === 'status') add('lvStatus', 'LV-03 check', (f) => o.status?.get(f.leaveId) ?? null)
    if (c === 'retained' && o.months != null) {
      const months = o.months
      add('lvRetained', `Still employed ${plural(months, 'month')} later`, (f) =>
        stayed(f, months) ? 'Yes' : 'No',
      )
    }
    if (c === 'exit') add('lvExit', 'Left on', (f) => f.exit, 'date')
  }
  const byRecord = new Map<HrTransaction, LeaveFact>(listed.map((f) => [f.record, f]))
  const hide = ['submittedDate', 'effectiveDate', 'dueDate', 'completedDate', 'daysLate', 'processId']
  if (!o.columns.includes('expected')) hide.push('expectedReturnDate')
  return drillSpec({
    kind: 'transactions',
    title: o.title,
    subtitle: o.subtitle,
    rows: listed.map((f) => f.record),
    extra: {
      columns: extras.map((x) => x.column),
      values: (r: HrTransaction) => {
        const f = byRecord.get(r)
        return f ? Object.fromEntries(extras.map((x) => [x.column.key, x.value(f)])) : {}
      },
    },
    hide,
    note: o.note,
  })
}

/** Upcoming returns with their LV-03 check, not ready first. */
export function upcomingDrill(
  s: DrillScope,
  rows: readonly UpcomingReturn[],
  title: string,
  o: { gate?: readonly Personal[]; note?: string } = {},
): DrillSpec<'transactions'> | null {
  const status = new Map(rows.map((r) => [r.fact.leaveId, r.status]))
  const order = new Map(rows.map((r, i) => [r.fact.leaveId, i]))
  return leaveDrill(
    s,
    rows.map((r) => r.fact),
    {
      title,
      subtitle: `Planned returns after ${formatDate(s.asOf)} · ${s.scope}`,
      gate: o.gate,
      note: o.note,
      columns: ['expected', 'days', 'status'],
      status,
      order: (a, b) => (order.get(a.leaveId) ?? 0) - (order.get(b.leaveId) ?? 0),
    },
  )
}

/** People behind exits around leave (HR only), from the roster. */
export function leaversDrill(
  s: DrillScope,
  people: readonly { fact: LeaveFact; exit: string; daysAfter?: number }[],
  byId: ReadonlyMap<string, Employee>,
  title: string,
  o: { gate: readonly Personal[]; note?: string },
): DrillSpec<'employees'> | null {
  if (!people.length || !canDrill(s, o.gate)) return null
  const rows: Employee[] = []
  const of = new Map<Employee, (typeof people)[number]>()
  for (const p of people) {
    const e = byId.get(p.fact.employeeId)
    if (!e || of.has(e)) continue
    rows.push(e)
    of.set(e, p)
  }
  if (!rows.length) return null
  const after = people.some((p) => p.daysAfter != null)
  const columns: Column[] = [
    { key: 'lvStart', label: 'Leave started', format: 'date' },
    { key: 'lvReturned', label: 'Returned', format: 'date' },
  ]
  if (after) columns.push({ key: 'lvDaysAfter', label: 'Days after return', format: 'days' })
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: `${s.window.label} · ${s.scope}`,
    rows,
    extra: {
      columns,
      values: (e: Employee) => {
        const p = of.get(e)
        return p
          ? { lvStart: p.fact.start, lvReturned: p.fact.returned, lvDaysAfter: p.daysAfter ?? null }
          : {}
      },
    },
    hide: ['directReports', 'orgSize', 'regrettable'],
    note: o.note,
  })
}

/** A leave number cut by reason: grouped counts, never a named person. */
export function leaveGroupsDrill(
  s: DrillScope,
  rows: readonly LeaveGroupRow[],
  title: string,
  o: { subtitle?: string; note?: string } = {},
): DrillSpec<'leaveGroups'> | null {
  if (!s.on || !rows.length) return null
  return drillSpec({
    kind: 'leaveGroups',
    title,
    subtitle: o.subtitle ?? `${s.window.label} · ${s.scope}`,
    rows,
    note: o.note,
  })
}

/** One grouped row: counts and a measure, suppressed under the minimum. */
export function groupRow(
  x: Omit<LeaveGroupRow, 'suppressed' | 'people' | 'leaves' | 'format'> & {
    rows: readonly Personal[]
    format?: Format
    min: number
  },
): LeaveGroupRow {
  const people = new Set(x.rows.map((r) => r.person)).size
  const suppressed = people < x.min
  return {
    groupBy: x.groupBy,
    group: x.group,
    reason: x.reason,
    people: suppressed ? null : people,
    leaves: suppressed ? null : x.rows.length,
    measure: x.measure,
    value: suppressed ? null : x.value,
    format: x.format ?? 'int',
    suppressed,
  }
}
