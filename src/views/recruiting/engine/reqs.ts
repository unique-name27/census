/**
 * Requisition measures: open reqs and their health, open req age, time to fill, reqs opened and
 * filled by month, and recruiter load.
 */
import type { Severity } from '@/components/types'
import type { ISODate, Requisition } from '@/data/schema'
import type { Window } from '@/data/scope'
import {
  addDays,
  addMonths,
  daysBetween,
  monthKey,
  monthStart,
  monthsBetween,
  quarterStart,
} from '@/lib/dates'
import { monthPoints } from '@/lib/people'
import { median } from '@/lib/stats'
import { inWin, isOpenAt } from './prepare'
import { defaultSettings } from './settings'
import type { ActiveItem, App } from './types'

/**
 * The registered default empty-funnel age (30 days): an open req with nobody past the screen for
 * longer reads as an empty funnel. The engine reads the value in force from the dictionary
 * (`b.settings.emptyFunnelDays`); this constant is the default only.
 */
export const EMPTY_FUNNEL_DAYS: number = defaultSettings().emptyFunnelDays

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
  /** The requisition and its active candidates (for the drill panel; not exported). */
  req: Requisition
  items: ActiveItem[]
}

export interface ReqFacts {
  /** Reqs open on the as-of date (opened by then, not yet filled, closed or cancelled). */
  open: Requisition[]
  onHold: Requisition[]
  rows: OpenReqRow[]
  /** Open longer than the empty-funnel age with no candidate ever past the screen. */
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
 * or most match no req ID): every old req would otherwise read as an empty funnel. `emptyDays` is
 * the empty-funnel age in force.
 */
export function reqFacts(
  reqs: readonly Requisition[],
  apps: readonly App[],
  actives: readonly ActiveItem[],
  asOf: ISODate,
  checkFunnel = true,
  emptyDays: number = defaultSettings().emptyFunnelDays,
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
    const daysOpen = reqAge(r, asOf)
    const empty = checkFunnel && daysOpen > emptyDays && !pastScreen.has(r.reqId)
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
      req: r,
      items: list,
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

/** Days from opened to the offer accepted (filled date): time to fill with the default clock. */
export const ttfDays = (r: Requisition): number => Math.max(0, daysBetween(r.openedDate, r.filledDate!))

/** Days a req has been open on `asOf`. */
export const reqAge = (r: Requisition, asOf: ISODate): number => Math.max(0, daysBetween(r.openedDate, asOf))

/** Median time to fill; `days` is the clock in force (`b.ttf`), offer accepted by default. */
export function medianTtf(
  reqs: readonly Requisition[],
  days: (r: Requisition) => number = ttfDays,
): number | null {
  return median(reqs.map(days))
}

export interface TtfRow {
  group: string
  days: number | null
  reqs: number
  /** The filled reqs measured; empty when the median is hidden (under the anonymity minimum), so it never drills. */
  filled: Requisition[]
}

/**
 * Median time to fill per group; groups under the anonymity minimum (5 by default) show no
 * median. `o.days` is the clock in force.
 */
export function ttfBy(
  filled: readonly Requisition[],
  key: (r: Requisition) => string | null | undefined,
  order?: readonly string[],
  o: { days?: (r: Requisition) => number; minGroup?: number } = {},
): TtfRow[] {
  const days = o.days ?? ttfDays
  const minGroup = o.minGroup ?? defaultSettings().minGroup
  const m = new Map<string, Requisition[]>()
  for (const r of filled) {
    const k = key(r) || 'Not set'
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  const rows: TtfRow[] = [...m].map(([group, list]) => {
    const shown = list.length >= minGroup
    return {
      group,
      days: shown ? median(list.map(days)) : null,
      reqs: list.length,
      filled: shown ? list : [],
    }
  })
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
  /** The open reqs counted (for the drill panel; not exported). */
  reqs: Requisition[]
}

export function openByDepartment(open: readonly Requisition[], asOf: ISODate): OpenByDeptRow[] {
  const m = new Map<string, Requisition[]>()
  for (const r of open) {
    const k = r.department || 'Not set'
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return [...m]
    .map(([department, reqs]) => {
      const ages = reqs.map((r) => reqAge(r, asOf))
      return {
        department,
        open: reqs.length,
        oldest: Math.max(...ages),
        medianAge: median(ages) ?? 0,
        reqs,
      }
    })
    .sort((a, b) => b.open - a.open || b.oldest - a.oldest)
}

export interface MonthReqRow {
  month: string
  series: 'Opened' | 'Filled'
  reqs: number
  /** The reqs counted (for the drill panel; not exported). */
  list: Requisition[]
}

/** Reqs opened and filled per month over the last 12 months of the window. */
export function openedFilledByMonth(reqs: readonly Requisition[], end: string): MonthReqRow[] {
  const months = monthsBetween(addMonths(monthStart(end), -11), end)
  const opened = new Map(months.map((m) => [m, [] as Requisition[]]))
  const filled = new Map(months.map((m) => [m, [] as Requisition[]]))
  for (const r of reqs) {
    if (r.openedDate && r.openedDate <= end) opened.get(monthKey(r.openedDate))?.push(r)
    if (r.filledDate && r.filledDate <= end && r.status !== 'Cancelled')
      filled.get(monthKey(r.filledDate))?.push(r)
  }
  return months.flatMap((m) => {
    const o = opened.get(m) ?? []
    const f = filled.get(m) ?? []
    return [
      { month: m, series: 'Opened' as const, reqs: o.length, list: o },
      { month: m, series: 'Filled' as const, reqs: f.length, list: f },
    ]
  })
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
  /** The records behind each count (for the drill panel; not exported). */
  openList: Requisition[]
  activeList: ActiveItem[]
  hireList: App[]
}

export interface RecruiterLoad {
  rows: RecruiterRow[]
  teamMedianWait: number | null
  teamMedianOpen: number | null
  teamMedianActive: number | null
}

/**
 * Open reqs, active candidates, hires and waiting per recruiter. Flags a heavy load (open reqs or
 * active candidates above the flag factor times the team median, 1.5× by default) and long waits
 * (median days waiting above the flag factor times the team median). Team medians are over named
 * recruiters.
 */
export function recruiterLoad(
  open: readonly Requisition[],
  actives: readonly ActiveItem[],
  apps: readonly App[],
  w: Pick<Window, 'start' | 'end'>,
  flagFactor: number = defaultSettings().recruiterFlagFactor,
): RecruiterLoad {
  const rows = new Map<
    string,
    {
      open: number
      active: number
      hires: number
      waits: number[]
      lacking: number
      openList: Requisition[]
      activeList: ActiveItem[]
      hireList: App[]
    }
  >()
  const get = (k: string) => {
    let e = rows.get(k)
    if (!e) {
      e = { open: 0, active: 0, hires: 0, waits: [], lacking: 0, openList: [], activeList: [], hireList: [] }
      rows.set(k, e)
    }
    return e
  }
  for (const r of open) {
    const e = get(r.recruiter || UNASSIGNED)
    e.open++
    e.openList.push(r)
  }
  for (const x of actives) {
    const e = get(x.app.recruiter || UNASSIGNED)
    e.active++
    e.activeList.push(x)
    e.waits.push(x.daysInStage)
    if (x.tier) e.lacking++
  }
  for (const a of apps)
    if (a.outcome === 'Hired' && inWin(a.exitDate, w)) {
      const e = get(a.recruiter || UNASSIGNED)
      e.hires++
      e.hireList.push(a)
    }
  const named = [...rows].filter(([k]) => k !== UNASSIGNED).map(([, e]) => e)
  const medians = named.map((e) => median(e.waits)).filter((v): v is number => v != null)
  const team = median(medians)
  const teamOpen = median(named.map((e) => e.open))
  const teamActive = median(named.map((e) => e.active))
  const above = (v: number, m: number | null) => m != null && m > 0 && v > flagFactor * m
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
      openList: e.openList,
      activeList: e.activeList,
      hireList: e.hireList,
    }
  })
  out.sort((a, b) => b.openReqs - a.openReqs || b.active - a.active || a.recruiter.localeCompare(b.recruiter))
  return { rows: out, teamMedianWait: team, teamMedianOpen: teamOpen, teamMedianActive: teamActive }
}

/* ───────── open reqs at each month end ───────── */

/** The org dimension the month-end chart stacks by: business unit, or department inside one unit. */
export type MonthEndDim = 'businessUnit' | 'department'

/** Series past the eighth fold into this one (no filter can name it). */
export const OTHER_SERIES = 'Other'

export interface MonthEndReqRow {
  /** "YYYY-MM" of the month end (the last point is the as-of date itself). */
  month: string
  /** The snapshot date: the month's last day, or the as-of date for the last point. */
  date: ISODate
  /** The business unit or department; "Other" for the folded ones, "Not set" when blank. */
  group: string
  reqs: number
  /** The reqs open on that date (for the drill panel; not exported). */
  list: Requisition[]
  /** The groups folded into "Other" (empty otherwise). */
  folded: string[]
}

export interface MonthEndReqs {
  dim: MonthEndDim
  /** Series in stacking order: the largest first, "Other" last. */
  groups: string[]
  /**
   * One row per month end and group with any open req (zeros left out), except a month end with
   * no open req at all, which keeps a zero row per group so its column keeps its place on the
   * time axis.
   */
  rows: MonthEndReqRow[]
  /** Every month end with its total, oldest first (the column totals; for notes and tests). */
  totals: { month: string; date: ISODate; reqs: number; list: Requisition[] }[]
}

/**
 * Reqs open at each of the last `n` month ends (`isOpenAt`, the Open reqs KPI's rule, so reqs on
 * hold are not counted), by business unit, or by department when every req in scope sits in one
 * business unit. The `maxGroups` largest groups over the whole span keep their own series; the
 * rest fold into "Other".
 */
export function openReqsByMonthEnd(
  reqs: readonly Requisition[],
  asOf: ISODate,
  n = 24,
  maxGroups = 8,
): MonthEndReqs {
  const units = new Set(reqs.map((r) => r.businessUnit || NOT_SET_GROUP))
  const dim: MonthEndDim = units.size <= 1 ? 'department' : 'businessUnit'
  const groupOf = (r: Requisition) => (dim === 'department' ? r.department : r.businessUnit) || NOT_SET_GROUP
  const dates = monthPoints(asOf, n)
  const totals = dates.map((date) => {
    const list = reqs.filter((r) => isOpenAt(r, date))
    return { month: monthKey(date), date, reqs: list.length, list }
  })
  // Rank groups by open-req months over the span, so the series order is stable across months.
  const weight = new Map<string, number>()
  for (const t of totals) for (const r of t.list) weight.set(groupOf(r), (weight.get(groupOf(r)) ?? 0) + 1)
  const ranked = [...weight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g)
  const fold = ranked.length > maxGroups
  const kept = new Set(fold ? ranked.slice(0, maxGroups - 1) : ranked)
  const folded = fold ? ranked.filter((g) => !kept.has(g)) : []
  const seriesOf = (r: Requisition) => (kept.has(groupOf(r)) ? groupOf(r) : OTHER_SERIES)
  const groups = [...ranked.filter((g) => kept.has(g)), ...(fold ? [OTHER_SERIES] : [])]
  const rows: MonthEndReqRow[] = []
  for (const t of totals) {
    const by = new Map<string, Requisition[]>()
    for (const r of t.list) {
      const g = seriesOf(r)
      const arr = by.get(g)
      if (arr) arr.push(r)
      else by.set(g, [r])
    }
    for (const g of groups) {
      const list = by.get(g)
      if (list?.length || !t.list.length)
        rows.push({
          month: t.month,
          date: t.date,
          group: g,
          reqs: list?.length ?? 0,
          list: list ?? [],
          folded: g === OTHER_SERIES ? folded : [],
        })
    }
  }
  return { dim, groups, rows, totals }
}

/** The bucket for a blank business unit or department (no filter can name it). */
const NOT_SET_GROUP = 'Not set'

/* ───────── median time to fill by quarter ───────── */

/** Level bands for the quarterly trend: L1 to L4, and L5 and above (M and E levels included). */
export const TTF_BANDS = [
  { name: 'L1 to L4', levels: ['L1', 'L2', 'L3', 'L4'] },
  { name: 'L5 and above', levels: ['L5', 'L6', 'M1', 'M2', 'E1', 'E2', 'E3'] },
] as const satisfies readonly { name: string; levels: readonly string[] }[]

export const ALL_REQS = 'All reqs'

export interface TtfQuarterRow {
  /** Last day of the quarter (or the window end for the quarter in progress): the x position. */
  quarterEnd: ISODate
  quarterStart: ISODate
  /** "Q3 2026". */
  quarter: string
  /** "All reqs" or a level band. */
  series: string
  /** The band's levels; empty for all reqs. */
  levels: readonly string[]
  /** Median days to fill; null when fewer reqs than the anonymity minimum were filled. */
  days: number | null
  reqs: number
  /** The filled reqs measured; empty when the median is hidden, so it never drills. */
  filled: Requisition[]
}

/**
 * Median time to fill for reqs filled in each of the last `n` quarters to `end`, for every req
 * and for each level band. `days` is the clock in force (`b.ttf`). A quarter with fewer filled
 * reqs than the anonymity minimum in a series shows no median (a gap in the line).
 */
export function ttfByQuarter(
  reqs: readonly Requisition[],
  end: ISODate,
  o: { n?: number; days?: (r: Requisition) => number; minGroup?: number } = {},
): TtfQuarterRow[] {
  const days = o.days ?? ttfDays
  const minGroup = o.minGroup ?? defaultSettings().minGroup
  const out: TtfQuarterRow[] = []
  for (const q of quarterSpans(end, o.n ?? 8)) {
    const filled = filledIn(reqs, q)
    const series: { name: string; levels: readonly string[]; list: Requisition[] }[] = [
      { name: ALL_REQS, levels: [], list: filled },
      ...TTF_BANDS.map((band) => ({
        name: band.name,
        levels: band.levels,
        list: filled.filter((r) => !!r.level && (band.levels as readonly string[]).includes(r.level)),
      })),
    ]
    for (const s of series) {
      const shown = s.list.length >= minGroup
      out.push({
        quarterEnd: q.end,
        quarterStart: q.start,
        quarter: q.label,
        series: s.name,
        levels: s.levels,
        days: shown ? median(s.list.map(days)) : null,
        reqs: s.list.length,
        filled: shown ? s.list : [],
      })
    }
  }
  return out
}

/** The last `n` calendar quarters to `end`, oldest first; the last one stops at `end`. */
function quarterSpans(end: ISODate, n: number): { start: ISODate; end: ISODate; label: string }[] {
  const out: { start: ISODate; end: ISODate; label: string }[] = []
  let qs = quarterStart(end)
  for (let i = 0; i < n; i++) {
    const qe = addDays(addMonths(qs, 3), -1)
    out.unshift({
      start: qs,
      end: qe < end ? qe : end,
      label: `Q${Math.floor(Number(qs.slice(5, 7)) / 3) + 1} ${qs.slice(0, 4)}`,
    })
    qs = addMonths(qs, -3)
  }
  return out
}

/* ───────── open reqs by age and candidates past the screen ───────── */

export interface ReqAgeDot {
  reqId: string
  title: string | null
  /** "REQ-4414 Principal SerDes Design Engineer", for the dot's label and tooltip. */
  label: string
  department: string | null
  location: string | null
  level: string | null
  priority: string | null
  daysOpen: number
  /** Active candidates past the screen: hiring manager, onsite and offer stages. */
  pastScreen: number
  active: number
  health: string
  /**
   * In the corner the chart is about: open longer than the empty-funnel age with nobody past the
   * screen now (every empty funnel is here, and so are reqs whose later candidates have left).
   */
  corner: boolean
  /** The color follows what is plotted: the corner is critical, lacking a next step a warning. */
  tone: 'default' | 'warning' | 'critical'
  /** The open req row behind the dot (for the drill panel; not exported). */
  row: OpenReqRow
}

/**
 * One dot per open req: days open against active candidates past the screen now, colored by the
 * same two numbers (critical past `emptyDays` with nobody past the screen), else amber when
 * candidates lack a next step.
 */
export function reqAgeDots(
  rows: readonly OpenReqRow[],
  emptyDays: number = defaultSettings().emptyFunnelDays,
): ReqAgeDot[] {
  return rows.map((r) => {
    const pastScreen = r.hiringManagerStage + r.onsite + r.offer
    const corner = r.daysOpen > emptyDays && pastScreen === 0
    return {
      reqId: r.reqId,
      title: r.title,
      label: r.title ? `${r.reqId} ${r.title}` : r.reqId,
      department: r.department,
      location: r.location,
      level: r.level,
      priority: r.priority,
      daysOpen: r.daysOpen,
      pastScreen,
      active: r.active,
      health: r.health,
      corner,
      tone: corner ? 'critical' : r.lacking > 0 ? 'warning' : 'default',
      row: r,
    }
  })
}
