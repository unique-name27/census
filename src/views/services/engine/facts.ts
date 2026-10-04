/**
 * One normalized fact per case and per transaction, computed once per analytics context. Every
 * metric in the view reads these, so "SLA met" or "on time" means the same thing on every tab.
 *
 * Clock: everything is judged at the end of the as-of day. A timestamp after the as-of date is
 * treated as not having happened yet, so an as-of override replays the past honestly.
 */

import {
  CASE_OPEN_STATUSES,
  type CaseStatus,
  caseCategoryByName,
  type Employee,
  type HrCase,
  type HrTransaction,
  type ISODate,
  MIN_GROUP,
  type Region,
  siteByLocation,
  type TerminationType,
} from '@/data/schema'
import type { Window } from '@/data/scope'
import { dateOf, daysBetween, hoursBetween, ms } from '@/lib/dates'
import { type CaseTargets, defaultSettings } from './settings'
import { share } from './util'

/* ───────────── cases ───────────── */

export interface CaseFact {
  caseId: string
  category: string
  team: string
  processId: string | null
  channel: string | null
  tier: string | null
  assignee: string | null
  requesterId: string | null
  /** Who the case is about: the requester, or the case itself when the requester is unknown. */
  person: string
  status: string
  openedAt: string
  opened: ISODate
  month: string
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  /** Hour of day opened, or null when the timestamp has no time. */
  hour: number | null
  responseTarget: number | null
  resolutionTarget: number | null
  /** Hours to first response, when it happened by the as-of date. */
  responseHours: number | null
  /** Date of the first response (or of resolution when no response was logged). */
  responded: ISODate | null
  resolutionHours: number | null
  resolved: ISODate | null
  /** Open at the end of the as-of day. */
  open: boolean
  /** Days from opened to as-of, for open cases. */
  ageDays: number | null
  /** Response SLA outcome: null while still inside the target or when it can't be judged. */
  responseMet: boolean | null
  resolutionMet: boolean | null
  csat: number | null
  reopened: boolean | null
  escalated: boolean | null
  /** The uploaded row, for the drill panel (which reads raw schema records). */
  record: HrCase
}

/** Which optional case columns carry any value. A missing column makes its metric null, never 0. */
export interface CaseColumns {
  firstResponseAt: boolean
  resolvedAt: boolean
  csat: boolean
  reopened: boolean
  escalated: boolean
  tier: boolean
  channel: boolean
  hour: boolean
}

const OPEN_STATUS = new Set<string>(CASE_OPEN_STATUSES)

/** End of the as-of day, in ms. */
export const asOfEnd = (asOf: ISODate): number => ms(asOf) + 86_400_000 - 60_000

const validTarget = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/**
 * The target a case is judged against: its category's target in force (a dictionary setting),
 * unless the file gives the case a different target of its own than the standard one for its
 * category. With the settings at their defaults this is the case's own target, falling back to
 * the category default, as before targets became settings.
 */
function targetOf(own: number | null | undefined, standard: number | undefined, inForce: number | undefined) {
  const v = validTarget(own)
  if (v != null && v !== standard) return v
  return inForce ?? v ?? standard ?? null
}

function weekdayOf(d: ISODate): number {
  const wd = new Date(ms(d)).getUTCDay()
  return (wd + 6) % 7
}

function hourOf(ts: string): number | null {
  const m = /[T ](\d{2}):\d{2}/.exec(ts)
  if (!m) return null
  const h = +m[1]
  return h >= 0 && h < 24 ? h : null
}

export function caseColumns(cases: readonly HrCase[]): CaseColumns {
  const has = (f: (c: HrCase) => unknown) => cases.some((c) => f(c) != null && f(c) !== '')
  return {
    firstResponseAt: has((c) => c.firstResponseAt),
    resolvedAt: has((c) => c.resolvedAt),
    csat: has((c) => c.csat),
    reopened: has((c) => c.reopened),
    escalated: has((c) => c.escalated),
    tier: has((c) => c.tier),
    channel: has((c) => c.channel),
    hour: cases.some((c) => hourOf(c.openedAt) != null),
  }
}

/**
 * One fact per case opened by the as-of date. `targets` are the category targets in force
 * (calendar hours, from the metric dictionary); they default to the registered defaults.
 */
export function caseFacts(
  cases: readonly HrCase[],
  asOf: ISODate,
  cols: CaseColumns,
  targets: CaseTargets = defaultSettings().caseTargets,
): CaseFact[] {
  const end = asOfEnd(asOf)
  const out: CaseFact[] = []
  for (const c of cases) {
    const openedMs = ms(c.openedAt)
    if (!Number.isFinite(openedMs) || openedMs > end) continue
    const meta = caseCategoryByName.get(c.category)
    const responseTarget = targetOf(
      c.responseTargetHours,
      meta?.responseHours,
      targets.response.get(c.category),
    )
    const resolutionTarget = targetOf(
      c.resolutionTargetHours,
      meta?.resolutionHours,
      targets.resolution.get(c.category),
    )
    const happened = (ts: string | null | undefined) => {
      const t = ms(ts)
      return Number.isFinite(t) && t <= end && t >= openedMs ? (ts as string) : null
    }
    const resolvedAt = happened(c.resolvedAt)
    const firstAt = happened(c.firstResponseAt) ?? (cols.firstResponseAt ? resolvedAt : null)
    // Without resolution timestamps the status is the only signal of being open.
    const open = cols.resolvedAt ? !resolvedAt && !isClosedWithoutDate(c) : OPEN_STATUS.has(c.status)
    const elapsed = (end - openedMs) / 3_600_000
    const opened = dateOf(c.openedAt)
    const responseHours = firstAt ? hoursBetween(c.openedAt, firstAt) : null
    const resolutionHours = resolvedAt ? hoursBetween(c.openedAt, resolvedAt) : null
    const judge = (hours: number | null, target: number | null, colOk: boolean): boolean | null => {
      if (!colOk || target == null) return null
      if (hours != null) return hours <= target
      return open && elapsed > target ? false : null
    }
    out.push({
      caseId: c.caseId,
      category: c.category || 'Uncategorized',
      team: c.team || meta?.team || 'Unassigned',
      processId: c.processId || meta?.processId || null,
      channel: c.channel || null,
      tier: c.tier ?? null,
      assignee: c.assignee ?? null,
      requesterId: c.requesterId ?? null,
      person: c.requesterId ? `p:${c.requesterId}` : `c:${c.caseId}`,
      status: c.status,
      openedAt: c.openedAt,
      opened,
      month: opened.slice(0, 7),
      weekday: weekdayOf(opened),
      hour: hourOf(c.openedAt),
      responseTarget,
      resolutionTarget,
      responseHours,
      responded: firstAt ? dateOf(firstAt) : null,
      resolutionHours,
      resolved: resolvedAt ? dateOf(resolvedAt) : null,
      open,
      ageDays: open ? daysBetween(opened, asOf) : null,
      responseMet: judge(responseHours, responseTarget, cols.firstResponseAt),
      resolutionMet: judge(resolutionHours, resolutionTarget, cols.resolvedAt),
      csat: typeof c.csat === 'number' && c.csat >= 1 && c.csat <= 5 ? c.csat : null,
      reopened: c.reopened ?? null,
      escalated: c.escalated ?? null,
      record: c,
    })
  }
  return out
}

/** Closed or resolved in the help desk but with no resolution timestamp (an import gap). */
function isClosedWithoutDate(c: HrCase): boolean {
  return !c.resolvedAt && !OPEN_STATUS.has(c.status)
}

/** The status an open case is reported under. */
export function openStatusLabel(f: CaseFact): CaseStatus | 'Open' {
  return OPEN_STATUS.has(f.status) ? (f.status as CaseStatus) : 'Open'
}

export const inWin = (d: ISODate | null, w: Pick<Window, 'start' | 'end'>): boolean =>
  d != null && d >= w.start && d <= w.end

/* ───────────── transactions ───────────── */

export type TxOutcome = 'on-time' | 'late' | 'overdue' | 'pending'

export interface TxFact {
  transactionId: string
  type: string
  processId: string | null
  employeeId: string
  /** Who the transaction is about (the employee), for small-group suppression. */
  person: string
  name: string | null
  location: string | null
  jurisdiction: string | null
  region: Region | null
  /** Exit type of the leaver, for terminations. */
  exitType: TerminationType | null
  submitted: ISODate
  effective: ISODate
  due: ISODate | null
  /** Completion date, when it happened by the as-of date. */
  completed: ISODate | null
  /** Null when there is no due date to judge against. */
  outcome: TxOutcome | null
  /** completed − due in calendar days (negative = early), completed only. */
  daysVsDue: number | null
  retro: boolean | null
  /** The uploaded row, for the drill panel (which reads raw schema records). */
  record: HrTransaction
}

export interface TxColumns {
  dueDate: boolean
  completedDate: boolean
  retro: boolean
}

export function txColumns(rows: readonly HrTransaction[]): TxColumns {
  return {
    dueDate: rows.some((t) => !!t.dueDate),
    completedDate: rows.some((t) => !!t.completedDate),
    retro: rows.some((t) => t.retro != null),
  }
}

export function txFacts(
  rows: readonly HrTransaction[],
  asOf: ISODate,
  people: ReadonlyMap<string, Employee>,
): TxFact[] {
  const out: TxFact[] = []
  for (const t of rows) {
    const e = people.get(t.employeeId)
    const site = e ? siteByLocation.get(e.location) : undefined
    const due = t.dueDate ? dateOf(t.dueDate) : null
    const completed = t.completedDate && dateOf(t.completedDate) <= asOf ? dateOf(t.completedDate) : null
    let outcome: TxOutcome | null = null
    if (due) {
      if (completed) outcome = completed <= due ? 'on-time' : 'late'
      else outcome = due < asOf ? 'overdue' : 'pending'
    }
    out.push({
      transactionId: t.transactionId,
      type: t.type,
      processId: t.processId ?? null,
      employeeId: t.employeeId,
      person: `p:${t.employeeId}`,
      name: e?.name ?? null,
      location: e?.location ?? null,
      jurisdiction: site?.jurisdiction ?? null,
      region: site?.region ?? null,
      exitType: t.type === 'Termination' ? (e?.terminationType ?? null) : null,
      submitted: dateOf(t.submittedDate),
      effective: dateOf(t.effectiveDate),
      due,
      completed,
      outcome,
      daysVsDue: completed && due ? daysBetween(due, completed) : null,
      retro: t.retro ?? null,
      record: t,
    })
  }
  return out
}

/** Transactions whose deadline falls in the window: the population every on-time rate uses. */
export const dueIn = (facts: readonly TxFact[], w: Pick<Window, 'start' | 'end'>): TxFact[] =>
  facts.filter((f) => inWin(f.due, w))

/** On time, late (completed late or open past due) and the share on time, over the judged items. */
export interface OnTime {
  /** On time ÷ (on time + late); null below the anonymity minimum of items or people. */
  rate: number | null
  n: number
  onTime: number
  late: number
  people: number
}

/**
 * On time ÷ (on time + late + overdue). Pending items (not yet due) are left out. The rate is
 * null below `min` items or people (the anonymity minimum in force).
 */
export function onTimeRate(facts: readonly TxFact[], min = MIN_GROUP): OnTime {
  let ok = 0
  let late = 0
  const people = new Set<string>()
  for (const f of facts) {
    if (f.outcome === 'on-time') ok++
    else if (f.outcome === 'late' || f.outcome === 'overdue') late++
    else continue
    people.add(f.person)
  }
  const n = ok + late
  return { rate: share(ok, n, people.size, min).rate, n, onTime: ok, late, people: people.size }
}
