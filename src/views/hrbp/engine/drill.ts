/**
 * The records behind every HR business partner number, as drill specs (`@/drill`). The engine
 * modules return the record arrays per bucket (leavers per quarter, employees per department,
 * promotions per level …); these pure helpers only title and annotate them. Callers wrap them in
 * thunks so the panel's table is built on click, not on render.
 *
 * Privacy: a suppressed value (a rate or average over fewer than 5 people) has no records behind
 * it, so every builder here returns null for it and nothing opens.
 */
import type { Column } from '@/charts/types'
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { type DrillExtra, type DrillSpec, drillSpec } from '@/drill/types'
import { daysBetween, formatDate } from '@/lib/dates'
import type { Prep } from './base'
import { activeAt } from './population'
import type { GrowthRow } from './workforce'

/** Standard employee columns that say nothing on a list of active employees. */
export const ACTIVE_HIDE = [
  'status',
  'terminationDate',
  'terminationType',
  'terminationReason',
  'regrettable',
  'employmentType',
]
/** On a list of leavers every status is "Left" and every worker an employee. */
export const LEAVER_HIDE = ['status', 'employmentType']
/** Active workers of every type (spans, layers, contractors): the worker type matters. */
export const WORKER_HIDE = [
  'status',
  'terminationDate',
  'terminationType',
  'terminationReason',
  'regrettable',
]

type Noun = readonly [string, string]
const n = (v: number): string => v.toLocaleString('en-US')
const counted = (v: number, noun: Noun): string => `${n(v)} ${v === 1 ? noun[0] : noun[1]}`

/** "last 12 months", "year to date", or the window's dates for a custom range. */
export function periodName(p: Prep): string {
  switch (p.ctx.filters.period) {
    case 't12m':
      return 'last 12 months'
    case 't6m':
      return 'last 6 months'
    case 't3m':
      return 'last 3 months'
    case 'ytd':
      return 'year to date'
    case 'lastQuarter':
      return 'last full quarter'
    default:
      return p.window.label
  }
}

/** Subtitle of a drill: the window, then the scope ("1 Oct 2025 – 30 Sep 2026 · Whole company"). */
export const scopeLine = (p: Prep, when: string = p.window.label): string => `${when} · ${p.ctx.scopeLabel}`

/** "Voluntary leavers, Bengaluru, last 12 months": the parts that are set, joined. */
export const titled = (...parts: (string | null | undefined | false)[]): string =>
  parts.filter((x): x is string => !!x).join(', ')

/** The scope as a title part: nothing for the whole company. */
export const scopePart = (p: Prep): string | null => (p.ctx.isCompany ? null : p.ctx.scopeLabel)

/** Average headcount in words: whole people from 100 up, one decimal below. */
export function avgText(avg: number): string {
  return avg >= 100 ? n(Math.round(avg)) : avg.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

/**
 * "Rate = 57 exits ÷ 1,410 average employees, annualized (× 4)." With annualizing switched off
 * (the "Annualize turnover rates" setting), a window shorter or longer than a year says so.
 */
export function rateNote(events: number, noun: Noun, avg: number, months: number, annualize = true): string {
  const factor = months > 0 ? 12 / months : 1
  const annual =
    Math.abs(factor - 1) < 0.005
      ? ''
      : annualize
        ? `, annualized (× ${factor.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
        : ', not annualized'
  return `Rate = ${counted(events, noun)} ÷ ${avgText(avg)} average employees${annual}.`
}

/** "Rate = 149 promotions ÷ 1,380 average employees, not annualized." */
export function shareNote(events: number, noun: Noun, avg: number): string {
  return `Rate = ${counted(events, noun)} ÷ ${avgText(avg)} average employees, not annualized.`
}

/* ───────── generic builders ───────── */

/** Active employees on a date: today's records, so people who left since show their exit. */
export function employeesOnSpec(
  p: Prep,
  date: ISODate,
  opts: { title?: string; rows?: readonly Employee[]; note?: string; extra?: DrillExtra<Employee> } = {},
): DrillSpec<'employees'> {
  const today = date === p.asOf
  const who = p.set.countContractors ? 'Employees and contractors' : 'Employees'
  return drillSpec({
    kind: 'employees',
    title: opts.title ?? titled(`${who} on ${formatDate(date)}`, scopePart(p)),
    subtitle: scopeLine(p, `As of ${formatDate(date)}`),
    rows: opts.rows ?? activeAt(p.emps, date, p.counts),
    extra: opts.extra,
    // With contractors in headcount the worker type tells the rows apart, so it stays.
    hide: p.set.countContractors ? (today ? WORKER_HIDE : []) : today ? ACTIVE_HIDE : ['employmentType'],
    note:
      opts.note ??
      (today
        ? p.set.countContractors
          ? 'Active employees and contractors. Interns are counted separately.'
          : 'Active employees. Contractors and interns are counted separately.'
        : `${who} active on that date, shown with their current record.`),
  })
}

/** Leavers (any exit type) behind a count or the numerator of a rate. */
export function leaversSpec(
  p: Prep,
  title: string,
  rows: readonly Employee[],
  opts: { when?: string; subtitle?: string; note?: string; extra?: DrillExtra<Employee> } = {},
): DrillSpec<'employees'> {
  const more = opts.extra
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: opts.subtitle ?? scopeLine(p, opts.when),
    rows,
    hide: LEAVER_HIDE,
    note: opts.note,
    extra: {
      columns: [{ key: 'tenureAtExit', label: 'Tenure at exit', format: 'years' }, ...(more?.columns ?? [])],
      values: (e) => ({
        tenureAtExit: e.terminationDate ? daysBetween(e.hireDate, e.terminationDate) / 365.25 : null,
        ...(more?.values(e) ?? {}),
      }),
    },
  })
}

/** Employees hired in a window. */
export function hiresSpec(
  p: Prep,
  title: string,
  rows: readonly Employee[],
  opts: { when?: string; note?: string } = {},
): DrillSpec<'employees'> {
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: scopeLine(p, opts.when),
    rows,
    hide: ['employmentType'],
    note: opts.note,
  })
}

/** Job change events (promotions, transfers, lateral moves, demotions). */
export function changesSpec(
  p: Prep,
  title: string,
  rows: readonly JobChange[],
  opts: { when?: string; note?: string } = {},
): DrillSpec<'jobChanges'> {
  return drillSpec({ kind: 'jobChanges', title, subtitle: scopeLine(p, opts.when), rows, note: opts.note })
}

/** First-year leavers: the numerator of first-year attrition, with how long each stayed. */
export function firstYearSpec(
  p: Prep,
  title: string,
  leavers: readonly Employee[],
  cohort: { size: number; from: ISODate; to: ISODate },
  where = p.ctx.scopeLabel,
): DrillSpec<'employees'> {
  const hired = `Hired ${formatDate(cohort.from)} to ${formatDate(cohort.to)}`
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: `${hired} · ${where}`,
    rows: leavers,
    hide: LEAVER_HIDE,
    note: `Rate = ${counted(leavers.length, ['leaver', 'leavers'])} ÷ ${counted(cohort.size, ['person', 'people'])} hired in that period.`,
    extra: {
      columns: [{ key: 'daysEmployed', label: 'Days employed', format: 'days' }],
      values: (e) => ({
        daysEmployed: e.terminationDate ? daysBetween(e.hireDate, e.terminationDate) : null,
      }),
    },
  })
}

/** People who joined or left a group between two dates: the change behind a growth number. */
export function joinedLeftSpec(
  p: Prep,
  title: string,
  joined: readonly Employee[],
  left: readonly Employee[],
  opts: { when?: string; note?: string } = {},
): DrillSpec<'employees'> {
  const joinedIds = new Set(joined.map((e) => e.employeeId))
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: scopeLine(p, opts.when),
    rows: [...joined, ...left],
    hide: ['employmentType'],
    note: opts.note,
    extra: {
      columns: [{ key: 'change', label: 'Change', format: 'text' }],
      values: (e) => ({ change: joinedIds.has(e.employeeId) ? 'Joined' : 'Left' }),
    },
  })
}

/**
 * The change behind a growth rate: who joined and who left the group in 12 months. Null when the
 * rate is hidden (base under 5).
 */
export function growthSpec(p: Prep, row: GrowthRow): DrillSpec<'employees'> | null {
  if (row.growth == null) return null
  const { joined, left } = row.records
  return joinedLeftSpec(p, `Joined and left ${row.group}, last 12 months`, joined, left, {
    when: p.t12.label,
    note: `Growth = (${n(row.now)} today − ${n(row.yearAgo)} a year ago) ÷ ${n(row.yearAgo)}. ${counted(joined.length, ['person', 'people'])} joined and ${n(left.length)} left.`,
  })
}

/** The minimal manager shape the span and layer drills need. */
export interface ManagerLike {
  employee: Employee
  directs: number
  totalOrg: number
}

/** Managers with their span and org size, the values a span number is measured on. */
export function managersSpec<M extends ManagerLike>(
  p: Prep,
  title: string,
  managers: readonly M[],
  opts: { note?: string; extra?: { columns: Column[]; values: (m: M) => Record<string, unknown> } } = {},
): DrillSpec<'employees'> {
  const byId = new Map(managers.map((m) => [m.employee.employeeId, m]))
  const extraCols = opts.extra?.columns ?? []
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: scopeLine(p, `As of ${formatDate(p.asOf)}`),
    rows: managers.map((m) => m.employee),
    hide: WORKER_HIDE,
    note: opts.note,
    extra: {
      columns: [
        { key: 'directs', label: 'Direct reports', format: 'int' },
        { key: 'totalOrg', label: 'Total org', format: 'int' },
        ...extraCols,
      ],
      values: (e) => {
        const m = byId.get(e.employeeId)
        return m
          ? { directs: m.directs, totalOrg: m.totalOrg, ...(opts.extra?.values(m) ?? {}) }
          : { directs: null, totalOrg: null }
      },
    },
  })
}

/** Active workers of every type with their reporting layer (1 = the top of the group). */
export function layeredSpec(
  p: Prep,
  title: string,
  rows: readonly Employee[],
  layerOf: ReadonlyMap<string, number>,
  note?: string,
): DrillSpec<'employees'> {
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: scopeLine(p, `As of ${formatDate(p.asOf)}`),
    rows,
    hide: WORKER_HIDE,
    note,
    extra: {
      columns: [{ key: 'layer', label: 'Layer', format: 'int' }],
      values: (e) => ({ layer: layerOf.get(e.employeeId) ?? null }),
    },
  })
}

/** Workers of any type (contractors and interns included). */
export function workersSpec(
  p: Prep,
  title: string,
  rows: readonly Employee[],
  note?: string,
): DrillSpec<'employees'> {
  return drillSpec({
    kind: 'employees',
    title,
    subtitle: scopeLine(p, `As of ${formatDate(p.asOf)}`),
    rows,
    hide: WORKER_HIDE,
    note,
  })
}
