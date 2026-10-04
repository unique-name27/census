/**
 * Requisition measures: open reqs and their health, open req age, time to fill, reqs opened and
 * filled by month, and recruiter load.
 */
import type { Severity } from '@/components/types'
import type { ISODate, Requisition } from '@/data/schema'
import { MIN_GROUP } from '@/data/schema'
import type { Window } from '@/data/scope'
import { addMonths, daysBetween, monthKey, monthStart, monthsBetween } from '@/lib/dates'
import { median } from '@/lib/stats'
import { inWin, isOpenAt } from './prepare'
import type { ActiveItem, App } from './types'

/** Days an open req may go with nobody past the screen before it reads as an empty funnel. */
export const EMPTY_FUNNEL_DAYS = 30

const UNASSIGNED = 'Unassigned'

export interface OpenReqRow {
  reqId: string
  /** Missing values are null (tables render "—"; exports leave the cell empty). */
  title: string | null
  department: string | null
  location: string | null
  level: string | null
  priority: string | null
  hiringManager: string | null
  recruiter: string | null
  daysOpen: number
  applied: number
  screen: number
  hiringManagerStage: number
  onsite: number
  offer: number
  active: number
  lacking: number
  health: string
  severity: Severity | null
}

export interface ReqFacts {
  /** Reqs open on the as-of date (opened by then, not yet filled, closed or cancelled). */
  open: Requisition[]
  onHold: Requisition[]
  rows: OpenReqRow[]
  /** Open longer than 30 days with no candidate ever past the screen. */
  emptyFunnel: OpenReqRow[]
  /** False when candidates are missing or mostly don't match a req, so funnel health can't be read. */
  funnelChecked: boolean
}

/** Health text when the candidate data can't say whether a req's funnel is empty. */
export const NOT_CHECKED = 'Not checked'

/**
 * Open reqs on the as-of date with their active pipeline and health. Open means open ON that date
 * (`isOpenAt`), so an as-of date in the past counts reqs that have since been filled or cancelled.
 * Pass `checkFunnel: false` when the candidates can't be trusted to describe the reqs (none loaded,
 * or most match no req ID): every old req would otherwise read as an empty funnel.
 */
export function reqFacts(
  reqs: readonly Requisition[],
  apps: readonly App[],
  actives: readonly ActiveItem[],
  asOf: ISODate,
  checkFunnel = true,
): ReqFacts {
  const open = reqs.filter((r) => isOpenAt(r, asOf))
  const onHold = reqs.filter((r) => r.status === 'On hold' && r.openedDate <= asOf)
  const pastScreen = new Set<string>()
  for (const a of apps) if (a.furthest >= 2) pastScreen.add(a.reqId)
  const activeBy = new Map<string, ActiveItem[]>()
  for (const x of actives) {
    const arr = activeBy.get(x.app.reqId)
    if (arr) arr.push(x)
    else activeBy.set(x.app.reqId, [x])
  }
  const rows: OpenReqRow[] = open.map((r) => {
    const list = activeBy.get(r.reqId) ?? []
    const per = [0, 0, 0, 0, 0]
    let lacking = 0
    for (const x of list) {
      per[x.stage]++
      if (x.tier) lacking++
    }
    const daysOpen = Math.max(0, daysBetween(r.openedDate, asOf))
    const empty = checkFunnel && daysOpen > EMPTY_FUNNEL_DAYS && !pastScreen.has(r.reqId)
    const health = empty
      ? 'Empty funnel'
      : lacking
        ? `${lacking} lack${lacking === 1 ? 's' : ''} a next step`
        : checkFunnel
          ? 'On track'
          : NOT_CHECKED
    return {
      reqId: r.reqId,
      title: r.jobTitle || null,
      department: r.department || null,
      location: r.location || null,
      level: r.level || null,
      priority: r.priority || null,
      hiringManager: r.hiringManager || null,
      recruiter: r.recruiter || null,
      daysOpen,
      applied: per[0],
      screen: per[1],
      hiringManagerStage: per[2],
      onsite: per[3],
      offer: per[4],
      active: list.length,
      lacking,
      health,
      severity: empty ? 'critical' : lacking ? 'warning' : null,
    }
  })
  const rank = (s: Severity | null) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2)
  rows.sort((a, b) => rank(a.severity) - rank(b.severity) || b.daysOpen - a.daysOpen)
  return {
    open,
    onHold,
    rows,
    emptyFunnel: rows.filter((r) => r.health === 'Empty funnel'),
    funnelChecked: checkFunnel,
  }
}

/** Days from opened to filled for reqs filled in the window (cancelled reqs excluded). */
export function filledIn(reqs: readonly Requisition[], w: Pick<Window, 'start' | 'end'>): Requisition[] {
  return reqs.filter((r) => r.status !== 'Cancelled' && inWin(r.filledDate, w) && r.openedDate)
}

export const ttfDays = (r: Requisition): number => Math.max(0, daysBetween(r.openedDate, r.filledDate!))

export function medianTtf(reqs: readonly Requisition[]): number | null {
  return median(reqs.map(ttfDays))
}

export interface TtfRow {
  group: string
  days: number | null
  reqs: number
}

/** Median time to fill per group; groups with fewer than 5 filled reqs show no median. */
export function ttfBy(
  filled: readonly Requisition[],
  key: (r: Requisition) => string | null | undefined,
  order?: readonly string[],
): TtfRow[] {
  const m = new Map<string, number[]>()
  for (const r of filled) {
    const k = key(r) || 'Not set'
    const arr = m.get(k)
    if (arr) arr.push(ttfDays(r))
    else m.set(k, [ttfDays(r)])
  }
  const rows = [...m].map(([group, xs]) => ({
    group,
    days: xs.length >= MIN_GROUP ? median(xs) : null,
    reqs: xs.length,
  }))
  if (order) {
    const idx = (g: string) => {
      const i = order.indexOf(g)
      return i < 0 ? order.length : i
    }
    return rows.sort((a, b) => idx(a.group) - idx(b.group) || a.group.localeCompare(b.group))
  }
  return rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || b.reqs - a.reqs)
}

export interface OpenByDeptRow {
  department: string
  open: number
  oldest: number
  medianAge: number
}

export function openByDepartment(open: readonly Requisition[], asOf: ISODate): OpenByDeptRow[] {
  const m = new Map<string, number[]>()
  for (const r of open) {
    const k = r.department || 'Not set'
    const age = Math.max(0, daysBetween(r.openedDate, asOf))
    const arr = m.get(k)
    if (arr) arr.push(age)
    else m.set(k, [age])
  }
  return [...m]
    .map(([department, ages]) => ({
      department,
      open: ages.length,
      oldest: Math.max(...ages),
      medianAge: median(ages) ?? 0,
    }))
    .sort((a, b) => b.open - a.open || b.oldest - a.oldest)
}

export interface MonthReqRow {
  month: string
  series: 'Opened' | 'Filled'
  reqs: number
}

/** Reqs opened and filled per month over the last 12 months of the window. */
export function openedFilledByMonth(reqs: readonly Requisition[], end: string): MonthReqRow[] {
  const months = monthsBetween(addMonths(monthStart(end), -11), end)
  const opened = new Map(months.map((m) => [m, 0]))
  const filled = new Map(months.map((m) => [m, 0]))
  for (const r of reqs) {
    if (r.openedDate && r.openedDate <= end && opened.has(monthKey(r.openedDate)))
      opened.set(monthKey(r.openedDate), (opened.get(monthKey(r.openedDate)) ?? 0) + 1)
    if (r.filledDate && r.filledDate <= end && r.status !== 'Cancelled' && filled.has(monthKey(r.filledDate)))
      filled.set(monthKey(r.filledDate), (filled.get(monthKey(r.filledDate)) ?? 0) + 1)
  }
  return months.flatMap((m) => [
    { month: m, series: 'Opened' as const, reqs: opened.get(m) ?? 0 },
    { month: m, series: 'Filled' as const, reqs: filled.get(m) ?? 0 },
  ])
}

export interface RecruiterRow {
  recruiter: string
  openReqs: number
  active: number
  hires: number
  medianWait: number | null
  lacking: number
  /** "Heavy load", "Long waits" or both; null when neither. */
  flag: string | null
  flagged: boolean
}

export interface RecruiterLoad {
  rows: RecruiterRow[]
  teamMedianWait: number | null
  teamMedianOpen: number | null
  teamMedianActive: number | null
}

/** A recruiter's load or wait above this multiple of the team median is flagged. */
export const LOAD_FLAG_RATIO = 1.5

/**
 * Open reqs, active candidates, hires and waiting per recruiter. Flags a heavy load (open reqs or
 * active candidates above 1.5× the team median) and long waits (median days waiting above 1.5×
 * the team median). Team medians are over named recruiters.
 */
export function recruiterLoad(
  open: readonly Requisition[],
  actives: readonly ActiveItem[],
  apps: readonly App[],
  w: Pick<Window, 'start' | 'end'>,
): RecruiterLoad {
  const rows = new Map<
    string,
    { open: number; active: number; hires: number; waits: number[]; lacking: number }
  >()
  const get = (k: string) => {
    let e = rows.get(k)
    if (!e) {
      e = { open: 0, active: 0, hires: 0, waits: [], lacking: 0 }
      rows.set(k, e)
    }
    return e
  }
  for (const r of open) get(r.recruiter || UNASSIGNED).open++
  for (const x of actives) {
    const e = get(x.app.recruiter || UNASSIGNED)
    e.active++
    e.waits.push(x.daysInStage)
    if (x.tier) e.lacking++
  }
  for (const a of apps)
    if (a.outcome === 'Hired' && inWin(a.exitDate, w)) get(a.recruiter || UNASSIGNED).hires++
  const named = [...rows].filter(([k]) => k !== UNASSIGNED).map(([, e]) => e)
  const medians = named.map((e) => median(e.waits)).filter((v): v is number => v != null)
  const team = median(medians)
  const teamOpen = median(named.map((e) => e.open))
  const teamActive = median(named.map((e) => e.active))
  const above = (v: number, m: number | null) => m != null && m > 0 && v > LOAD_FLAG_RATIO * m
  const out = [...rows].map(([recruiter, e]) => {
    const m = median(e.waits)
    const heavy = recruiter !== UNASSIGNED && (above(e.open, teamOpen) || above(e.active, teamActive))
    const slow = recruiter !== UNASSIGNED && m != null && above(m, team)
    const flag = heavy && slow ? 'Heavy load, long waits' : heavy ? 'Heavy load' : slow ? 'Long waits' : null
    return {
      recruiter,
      openReqs: e.open,
      active: e.active,
      hires: e.hires,
      medianWait: m,
      lacking: e.lacking,
      flag,
      flagged: flag != null,
    }
  })
  out.sort((a, b) => b.openReqs - a.openReqs || b.active - a.active || a.recruiter.localeCompare(b.recruiter))
  return { rows: out, teamMedianWait: team, teamMedianOpen: teamOpen, teamMedianActive: teamActive }
}
