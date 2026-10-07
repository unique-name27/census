/**
 * The People stats charts added in the design refresh (docs/CHARTS.md, People stats):
 *
 *  - attrition over the trailing 12 months at each of the last 24 month ends (voluntary and
 *    regretted), with the company's line when an org filter is on;
 *  - headcount at each of the last 24 month ends, by the scorecard's one-level-down groups;
 *  - how long new hires stay: the share of each of the last three yearly hire cohorts still
 *    employed 3, 6, 12, 18 and 24 months after their hire date;
 *  - the share of today's employees who got a new manager in the last 12 months, by group.
 *
 * All read the People stats population and settings from `Prep`, keep the records behind every
 * number (empty when the number is hidden for anonymity), and are computed on first use per
 * context (each tab asks for its own), so the folder-tab and Scorecard reads stay as cheap as
 * before. Pure.
 */
import type { Employee, ISODate, JobChange } from '@/data/schema'
import { type Filters, focusLeader, type Window } from '@/data/scope'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { addMonths, formatDate, formatMonthShort } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { isActiveAt, monthPoints } from '@/lib/people'
import { groupOptions } from './attrition'
import { type Prep, trailing } from './base'
import { employeesOnSpec, leaversSpec, scopeLine, titled } from './drill'
import type { ScoreDim } from './lineage'
import { activeAt } from './population'
import { exitsByGroup } from './rates'
import { orgDefinitions } from './scorecard'

/** Computed once per Prep (one per analytics context). */
function cached<T>(build: (p: Prep) => T): (p: Prep) => T {
  const cache = new WeakMap<Prep, T>()
  return (p) => {
    let v = cache.get(p)
    if (v === undefined) {
      v = build(p)
      cache.set(p, v)
    }
    return v
  }
}

/* ───────── attrition, trailing 12 months ───────── */

export type TrailingKind = 'voluntary' | 'regretted'
export const SCOPE_LINE = 'This scope'
export const COMPANY_LINE = 'Company'
/** The scope's line when the scope is the whole company (no company line beside it). */
export const WHOLE_COMPANY = 'Whole company'

export interface TrailingPoint {
  /** The month end (the as-of date for the last point). */
  date: ISODate
  series: string
  kind: TrailingKind
  /** Exits of the kind in the 12 months to `date` ÷ their average headcount; null when hidden. */
  rate: number | null
  exits: number
  avgHeadcount: number
  start: ISODate
  /** The leavers behind the rate; empty when it is hidden. */
  records: Employee[]
}

export interface Trailing {
  voluntary: TrailingPoint[]
  regretted: TrailingPoint[]
  /** The company line is drawn (an org filter is on). */
  company: boolean
  /** The scope's series name: "This scope", or "Whole company" when there is no filter. */
  scopeLine: string
  /** The rates can be computed: leavers with a termination type (voluntary), and regretted marks. */
  ready: Record<TrailingKind, boolean>
}

const MONTH_ENDS = 24

export const attritionTrailing = cached((p: Prep): Trailing => {
  const ready = {
    voluntary: p.has.terminationDate && p.has.terminationType,
    regretted: p.regrettedReady,
  }
  const by = groupOptions(p)
  const ends = monthPoints(p.asOf, MONTH_ENDS)
  const company = !p.ctx.isCompany
  const series = (list: readonly Employee[], name: string) => {
    const out: Record<TrailingKind, TrailingPoint[]> = { voluntary: [], regretted: [] }
    for (const date of ends) {
      const w = trailing(date, 12)
      const g = exitsByGroup(list, w, () => 'all', undefined, by).get('all')
      const avg = g?.avgHeadcount ?? 0
      const leavers = g?.leavers ?? []
      for (const kind of ['voluntary', 'regretted'] as const) {
        const records =
          kind === 'voluntary'
            ? leavers.filter((e) => e.terminationType === 'Voluntary')
            : leavers.filter(p.isRegretted)
        const rate = ready[kind] ? p.rate(records.length, avg, w) : null
        out[kind].push({
          date,
          series: name,
          kind,
          rate,
          exits: records.length,
          avgHeadcount: avg,
          start: w.start,
          records: rate == null ? [] : records,
        })
      }
    }
    return out
  }
  const scopeLine = company ? SCOPE_LINE : WHOLE_COMPANY
  const scope = series(p.emps, scopeLine)
  const comp = company ? series(p.companyEmps, COMPANY_LINE) : null
  return {
    voluntary: [...scope.voluntary, ...(comp?.voluntary ?? [])],
    regretted: [...scope.regretted, ...(comp?.regretted ?? [])],
    company,
    scopeLine,
    ready,
  }
})

/** The leavers behind one point of the trailing line. */
export function trailingDrill(p: Prep, pt: TrailingPoint): DrillSpec<'employees'> | null {
  if (!pt.records.length) return null
  const word = pt.kind === 'voluntary' ? 'Voluntary leavers' : 'Regretted leavers'
  const when = `${formatDate(pt.start)} to ${formatDate(pt.date)}`
  const where = pt.series === COMPANY_LINE ? WHOLE_COMPANY : p.ctx.scopeLabel
  return leaversSpec(
    p,
    titled(word, `12 months to ${formatDate(pt.date)}`, pt.series === COMPANY_LINE ? 'company' : null),
    pt.records,
    {
      subtitle: `${when} · ${where}`,
      note: `Rate = ${fmt(pt.exits, 'int')} exits ÷ ${fmt(pt.avgHeadcount, 'num1')} average employees over the 12 months.`,
    },
  )
}

/**
 * The leader a leader scope focuses on, when they are in the population: one level down from them
 * are their direct reports' orgs, so they belong to none and are counted in Other.
 */
function scopeLeader(p: Prep, dim: ScoreDim): Employee | null {
  if (dim !== 'leader') return null
  const id = focusLeader(p.ctx.filters)
  return (id && p.emps.find((e) => e.employeeId === id)) || null
}

/* ───────── headcount by organization over time ───────── */

/** Groups drawn by name; the rest fold into "Other (k)". */
export const HEADCOUNT_GROUPS_SHOWN = 7

export interface OrgMonthRow {
  /** "YYYY-MM". */
  month: string
  date: ISODate
  group: string
  /** The filter that reproduces the group, or null for Other. */
  filter: Partial<Filters> | null
  headcount: number
  records: Employee[]
}

export interface HeadcountByOrg {
  dim: ScoreDim
  /** "business unit", "organization", "department", "location". */
  noun: string
  rows: OrgMonthRow[]
  /** Series in legend order, Other last. */
  groups: string[]
  /** Everyone in headcount at each month end (the column total). */
  totals: { month: string; date: ISODate; headcount: number }[]
  /** Groups folded into Other. */
  folded: number
  /** The scope's leader, counted in Other (in no direct report's org); null outside a leader scope. */
  leader: string | null
}

const NOUN: Record<ScoreDim, string> = {
  leader: 'organization',
  businessUnit: 'business unit',
  department: 'department',
  location: 'location',
}

export const headcountByOrg = cached((p: Prep): HeadcountByOrg => {
  const { dim, defs } = orgDefinitions(p)
  const ends = monthPoints(p.asOf, MONTH_ENDS)
  const groupOf = new Map<string, number>()
  defs.forEach((d, i) => {
    for (const e of d.people) if (!groupOf.has(e.employeeId)) groupOf.set(e.employeeId, i)
  })
  // Rank by today's headcount; groups under the anonymity minimum today always fold.
  const ranked = defs
    .map((d, i) => ({ d, i, n: activeAt(d.people, p.asOf, p.counts).length }))
    .filter((x) => x.n >= p.set.minGroup && x.d.filter)
    .sort((a, b) => b.n - a.n || a.d.label.localeCompare(b.d.label))
  const shown = ranked.length <= HEADCOUNT_GROUPS_SHOWN + 1 ? ranked : ranked.slice(0, HEADCOUNT_GROUPS_SHOWN)
  const slotOf = new Map(shown.map((x, k) => [x.i, k]))
  const folded = defs.length - shown.length
  // Everyone else: folded groups, and people in no group (the leader of a focused org).
  const other = folded ? `Other (${folded})` : 'Other'
  const cells = ends.map(() => [...shown.map(() => [] as Employee[]), [] as Employee[]])
  const totals: HeadcountByOrg['totals'] = []
  ends.forEach((date, t) => {
    let total = 0
    for (const e of p.emps) {
      if (!isActiveAt(e, date)) continue
      total++
      const g = groupOf.get(e.employeeId)
      const k = g == null ? undefined : slotOf.get(g)
      cells[t][k ?? shown.length].push(e)
    }
    totals.push({ month: date.slice(0, 7), date, headcount: total })
  })
  const withOther = cells.some((c) => c[shown.length].length > 0)
  const groups = [...shown.map((x) => x.d.label), ...(withOther ? [other] : [])]
  const rows: OrgMonthRow[] = []
  ends.forEach((date, t) => {
    groups.forEach((group, k) => {
      const records = cells[t][k]
      rows.push({
        month: date.slice(0, 7),
        date,
        group,
        filter: k < shown.length ? shown[k].d.filter : null,
        headcount: records.length,
        records,
      })
    })
  })
  const leader = scopeLeader(p, dim)
  return { dim, noun: NOUN[dim], rows, groups, totals, folded, leader: leader?.name ?? null }
})

/** One segment: the group's employees at that month end, with the group's filter. */
export function orgMonthDrill(p: Prep, row: OrgMonthRow): DrillSpec<'employees'> | null {
  if (!row.records.length) return null
  const spec = employeesOnSpec(p, row.date, {
    title: titled(`Employees on ${formatDate(row.date)}`, row.group),
    rows: row.records,
    note: `${fmt(row.headcount, 'int')} in headcount on that month end, shown with their current record.`,
  })
  return row.filter ? { ...spec, filter: row.filter } : spec
}

/* ───────── how long new hires stay ───────── */

export const CHECKPOINTS = [3, 6, 12, 18, 24] as const
export const checkpointLabel = (m: number): string => `${m} months`

export interface CohortPoint {
  cohort: string
  /** "3 months" … "24 months" after the hire date. */
  checkpoint: string
  months: number
  /** Hires whose checkpoint has passed by the as-of date. */
  observed: number
  stayed: number
  /** Share of `observed` still employed at the checkpoint; null under the anonymity minimum. */
  share: number | null
  /** The cohort's leavers by the checkpoint (empty when the share is hidden). */
  leavers: Employee[]
  /** The hires counted at the checkpoint, leavers among them (empty when the share is hidden). */
  hires: Employee[]
}

export interface Cohort {
  label: string
  from: ISODate
  to: ISODate
  hires: Employee[]
}

export interface CohortRetention {
  cohorts: Cohort[]
  points: CohortPoint[]
  /** Cohorts under the anonymity minimum (not drawn). */
  hidden: string[]
}

const COHORT_LABELS = [
  'Hired in the last 12 months',
  'Hired 12 to 24 months ago',
  'Hired 24 to 36 months ago',
]

export const cohortRetention = cached((p: Prep): CohortRetention => {
  const min = p.set.minGroup
  const cohorts: Cohort[] = COHORT_LABELS.map((label, i) => {
    const to = addMonths(p.asOf, -12 * i)
    const from = addMonths(p.asOf, -12 * (i + 1))
    return { label, from, to, hires: p.emps.filter((e) => e.hireDate > from && e.hireDate <= to) }
  }).reverse()
  const points: CohortPoint[] = []
  const hidden: string[] = []
  for (const c of cohorts) {
    if (c.hires.length < min) {
      if (c.hires.length) hidden.push(c.label)
      continue
    }
    for (const months of CHECKPOINTS) {
      const observed: Employee[] = []
      const leavers: Employee[] = []
      for (const e of c.hires) {
        const at = addMonths(e.hireDate, months)
        if (at > p.asOf) continue
        observed.push(e)
        if (e.terminationDate && e.terminationDate <= at) leavers.push(e)
      }
      const shown = observed.length >= min
      points.push({
        cohort: c.label,
        checkpoint: checkpointLabel(months),
        months,
        observed: observed.length,
        stayed: observed.length - leavers.length,
        share: shown ? (observed.length - leavers.length) / observed.length : null,
        leavers: shown ? leavers : [],
        hires: shown ? observed : [],
      })
    }
  }
  return { cohorts, points, hidden }
})

/**
 * The hires a bar counts at one checkpoint, those who left by it first, with a "Left within"
 * column: the bar's share is the rows still employed.
 */
export function cohortDrill(p: Prep, r: CohortRetention, pt: CohortPoint): DrillSpec<'employees'> | null {
  if (!pt.hires.length) return null
  const c = r.cohorts.find((x) => x.label === pt.cohort)
  const when = c
    ? `Hired ${formatMonthShort(addMonths(c.from, 1), true)} to ${formatMonthShort(c.to, true)}`
    : pt.cohort
  const gone = new Set(pt.leavers.map((e) => e.employeeId))
  const rows = [...pt.hires].sort(
    (a, b) =>
      Number(gone.has(b.employeeId)) - Number(gone.has(a.employeeId)) ||
      a.hireDate.localeCompare(b.hireDate) ||
      a.name.localeCompare(b.name),
  )
  return drillSpec({
    kind: 'employees',
    title: `${pt.cohort}: still employed ${pt.checkpoint} after hire`,
    subtitle: `${when} · ${p.ctx.scopeLabel}`,
    rows,
    hide: ['employmentType'],
    noun: ['hire', 'hires'],
    extra: {
      columns: [{ key: 'leftByCheckpoint', label: `Left within ${pt.checkpoint}`, format: 'text' }],
      values: (e) => ({ leftByCheckpoint: gone.has(e.employeeId) ? 'Yes' : 'No' }),
    },
    note: `${fmt(pt.stayed, 'int')} of ${fmt(pt.observed, 'int')} hires still employed ${pt.checkpoint} after their hire date (${fmt(pt.share, 'pct')})${pt.leavers.length ? `; the ${fmt(pt.leavers.length, 'int')} who left are listed first` : ''}. Hires whose ${pt.checkpoint} have not passed yet are not counted.`,
  })
}

/** A whole cohort (its hires), for the table and the legend. */
export function cohortHiresDrill(p: Prep, c: Cohort): DrillSpec<'employees'> | null {
  if (!c.hires.length) return null
  return drillSpec({
    kind: 'employees',
    title: c.label,
    subtitle: scopeLine(p, `${formatDate(addMonths(c.from, 0))} to ${formatDate(c.to)}`),
    rows: c.hires,
    hide: ['employmentType'],
    note: 'Everyone hired in the 12 months, including those who have left since.',
  })
}

/* ───────── new manager in the last 12 months ───────── */

export interface ManagerChangeRow {
  group: string
  /** The filter that reproduces the group, or null for Other. */
  filter: Partial<Filters> | null
  /** Employees today. */
  employees: number
  /** Of them, with at least one manager change in the last 12 months. */
  changed: number
  share: number | null
  people: Employee[]
  changes: JobChange[]
  other?: boolean
}

export interface ManagerChanges {
  dim: ScoreDim
  noun: string
  rows: ManagerChangeRow[]
  company: number | null
  window: Window
  /** The scope's leader, counted in Other (in no direct report's org); null outside a leader scope. */
  leader: string | null
}

/**
 * A manager change: a "Manager change" row, or a transfer to a different manager. The change
 * recorded when a new manager joined after their report (on the manager's hire date) is left out:
 * nobody chose it, so it says nothing about churn.
 */
function changeFilter(p: Prep): (c: JobChange) => boolean {
  const w = p.t12
  return (c) => {
    if (c.effectiveDate < w.start || c.effectiveDate > w.end) return false
    const managerMove =
      c.changeType === 'Manager change' ||
      (c.changeType === 'Transfer' &&
        !!c.toManagerId &&
        !!c.fromManagerId &&
        c.toManagerId !== c.fromManagerId)
    if (!managerMove) return false
    const mgr = c.toManagerId ? p.ctx.org.byId.get(c.toManagerId) : undefined
    return !(mgr && mgr.hireDate === c.effectiveDate)
  }
}

function changedAmong(people: readonly Employee[], byId: Map<string, JobChange[]>) {
  const changed: Employee[] = []
  const changes: JobChange[] = []
  for (const e of people) {
    const list = byId.get(e.employeeId)
    if (!list?.length) continue
    changed.push(e)
    changes.push(...list)
  }
  return { changed, changes }
}

export const managerChanges = cached((p: Prep): ManagerChanges => {
  const min = p.set.minGroup
  const keep = changeFilter(p)
  const index = (changes: readonly JobChange[]) => {
    const m = new Map<string, JobChange[]>()
    for (const c of changes) {
      if (!keep(c)) continue
      const arr = m.get(c.employeeId)
      if (arr) arr.push(c)
      else m.set(c.employeeId, [c])
    }
    return m
  }
  const scoped = index(p.changes)
  const company = index(p.companyChanges)
  const companyNow = activeAt(p.companyEmps, p.asOf, p.counts)
  const companyChanged = changedAmong(companyNow, company).changed.length
  const { dim, defs } = orgDefinitions(p)
  const rows: ManagerChangeRow[] = []
  const small: Employee[] = []
  let smallGroups = 0
  // The leader of a leader scope is in none of the orgs one level down: counted in Other, as in
  // headcount by organization, so the rows add up to the scope's headcount.
  const leader = scopeLeader(p, dim)
  if (leader) small.push(...activeAt([leader], p.asOf, p.counts))
  for (const d of defs) {
    const now = activeAt(d.people, p.asOf, p.counts)
    if (!now.length) continue
    if (now.length < min || !d.filter) {
      small.push(...now)
      smallGroups++
      continue
    }
    const { changed, changes } = changedAmong(now, scoped)
    rows.push({
      group: d.label,
      filter: d.filter,
      employees: now.length,
      changed: changed.length,
      share: changed.length / now.length,
      people: changed,
      changes,
    })
  }
  rows.sort(
    (a, b) => (b.share ?? 0) - (a.share ?? 0) || b.employees - a.employees || a.group.localeCompare(b.group),
  )
  if (small.length) {
    const { changed, changes } = changedAmong(small, scoped)
    const shown = small.length >= min
    rows.push({
      group: smallGroups ? `Other (${smallGroups})` : 'Other',
      filter: null,
      employees: small.length,
      changed: changed.length,
      share: shown ? changed.length / small.length : null,
      people: shown ? changed : [],
      changes: shown ? changes : [],
      other: true,
    })
  }
  return {
    dim,
    noun: NOUN[dim],
    rows,
    company: companyNow.length >= min ? companyChanged / companyNow.length : null,
    window: p.t12,
    leader: leader?.name ?? null,
  }
})

/** The people in a group with a manager change in the last 12 months, with the group's filter. */
export function managerChangeDrill(
  p: Prep,
  mc: ManagerChanges,
  row: ManagerChangeRow,
): DrillSpec<'employees'> | null {
  if (!row.people.length) return null
  const count = new Map<string, number>()
  const last = new Map<string, ISODate>()
  for (const c of row.changes) {
    count.set(c.employeeId, (count.get(c.employeeId) ?? 0) + 1)
    if ((last.get(c.employeeId) ?? '') < c.effectiveDate) last.set(c.employeeId, c.effectiveDate)
  }
  const spec = drillSpec({
    kind: 'employees',
    title: titled('New manager in the last 12 months', row.group),
    subtitle: scopeLine(p, mc.window.label),
    rows: row.people,
    hide: [
      'status',
      'terminationDate',
      'terminationType',
      'terminationReason',
      'regrettable',
      'employmentType',
    ],
    extra: {
      columns: [
        { key: 'managerChanges', label: 'Manager changes', format: 'int' },
        { key: 'lastManagerChange', label: 'Latest change', format: 'date' },
      ],
      values: (e) => ({
        managerChanges: count.get(e.employeeId) ?? null,
        lastManagerChange: last.get(e.employeeId) ?? null,
      }),
    },
    note: `Share = ${fmt(row.changed, 'int')} ÷ ${fmt(row.employees, 'int')} employees today. A manager change is a change of manager in Job changes, or a transfer to a different manager; the change recorded when a new manager joined is left out.`,
  })
  return row.filter ? { ...spec, filter: row.filter } : spec
}
