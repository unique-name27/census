/**
 * Sub-org scorecard: one row per organization one level down from the scope (the selected
 * leader's direct reports, else business units, else departments, else locations), the
 * company as a benchmark row, and orgs under 5 employees folded into "Other (k)".
 * A cell is marked when it is materially off the company: |Δ| > max(1 pt, 10% of the company
 * value) for rates, |Δ| > max(0.5, 10%) for span, in orgs of 10 or more employees.
 */
import type { Employee, JobChange } from '@/data/schema'
import { type Filters, subtreeIds } from '@/data/scope'
import { addDays } from '@/lib/dates'
import { activeAt, attrition, exitsIn, inWindow, isActiveAt } from '@/lib/people'
import { mean } from '@/lib/stats'
import { cohortSummary, firstYearCohort } from './attrition'
import type { Prep } from './base'
import type { ScoreDim } from './lineage'
import { promotionRate } from './movement'
import { activeChildren, subtreeSizer } from './org'
import { leftInFirstYear } from './rates'

export const SCORE_METRICS = ['voluntary', 'regretted', 'firstYear', 'promotionRate', 'avgSpan'] as const
export type ScoreMetric = (typeof SCORE_METRICS)[number]
export type Shade = 'above' | 'below'
/** Whether higher is worse (attrition), or the metric has no good direction (promotion rate, span). */
export const METRIC_POLARITY: Record<ScoreMetric, 'higher-worse' | 'neutral'> = {
  voluntary: 'higher-worse',
  regretted: 'higher-worse',
  firstYear: 'higher-worse',
  promotionRate: 'neutral',
  avgSpan: 'neutral',
}

/** Orgs smaller than this are compared but never marked: one exit swings their rates too far. */
export const SHADE_MIN_HEADCOUNT = 10

export interface ScoreRow {
  key: string
  label: string
  sublabel: string
  kind: 'leader' | 'businessUnit' | 'department' | 'location' | 'other' | 'company'
  /** Patch that rescopes the app to this row; null for Other and Company. */
  filter: Partial<Filters> | null
  headcount: number
  /** Null when no row has a termination date (past headcount would count survivors only). */
  netChange: number | null
  voluntary: number | null
  regretted: number | null
  firstYear: number | null
  promotionRate: number | null
  avgSpan: number | null
  shade: Partial<Record<ScoreMetric, Shade>>
  /** The records behind each cell; a hidden (null) value has none. */
  records: ScoreRecords
}

/** The records behind a scorecard row's cells. */
export interface ScoreRecords {
  /** Employees today (`headcount`). */
  active: Employee[]
  /** Employees today who were not 12 months ago, and the reverse (`netChange` = joined − left). */
  joined: Employee[]
  left: Employee[]
  /** Voluntary and regretted leavers in the window (numerators of the two rates). */
  voluntary: Employee[]
  regretted: Employee[]
  /** First-year leavers and the size of their hire cohort. */
  firstYear: Employee[]
  cohort: number
  /** Promotion events in the window. */
  promotions: JobChange[]
  /** Average headcount over the window (the denominator of every rate in the row). */
  avgHeadcount: number
  /** Managers in the org with their span (`avgSpan` is the mean of `directs`). */
  managers: { employee: Employee; directs: number; totalOrg: number }[]
}

export interface Scorecard {
  rowsLabel: string
  /** What the rows are: a leader's direct reports' orgs, business units, departments or locations. */
  dim: ScoreDim
  rows: ScoreRow[]
}

interface OrgDef {
  key: string
  label: string
  sublabel: string
  kind: ScoreRow['kind']
  filter: Partial<Filters> | null
  people: Employee[]
}

export function isMaterialOff(
  metric: ScoreMetric,
  value: number | null,
  company: number | null,
): Shade | null {
  if (value == null || company == null) return null
  const floor = metric === 'avgSpan' ? 0.5 : 0.01
  const diff = value - company
  if (Math.abs(diff) <= Math.max(floor, 0.1 * Math.abs(company))) return null
  return diff > 0 ? 'above' : 'below'
}

function metrics(
  p: Prep,
  people: readonly Employee[],
  changesById: Map<string, JobChange[]>,
): Omit<ScoreRow, 'key' | 'label' | 'sublabel' | 'kind' | 'filter' | 'shade'> {
  const emps = people.filter((e) => e.employmentType === 'Employee')
  const left = p.has.terminationDate
  const typed = left && p.has.terminationType
  const changes: JobChange[] = []
  for (const e of emps) for (const c of changesById.get(e.employeeId) ?? []) changes.push(c)
  const active = people.filter((e) => isActiveAt(e, p.asOf))
  const children = activeChildren(active, p.asOf)
  const below = subtreeSizer(children)
  const byId = new Map(active.map((e) => [e.employeeId, e]))
  const managers = [...children.entries()].flatMap(([id, kids]) => {
    const employee = byId.get(id)
    return employee ? [{ employee, directs: kids.length, totalOrg: below(id) }] : []
  })
  const spans = [...children.values()].map((k) => k.length)
  const vol = attrition(emps, p.window, 'voluntary')
  const reg = attrition(emps, p.window, 'regretted')
  const yearAgo = addDays(p.t12.start, -1)
  const now = activeAt(emps, p.asOf)
  const hc = now.length
  const joined: Employee[] = []
  const gone: Employee[] = []
  let then = 0
  for (const e of emps) {
    const was = isActiveAt(e, yearAgo)
    const is = isActiveAt(e, p.asOf)
    if (was) then++
    if (is && !was) joined.push(e)
    if (was && !is) gone.push(e)
  }
  const exits = exitsIn(emps, p.window)
  const cohort = cohortSummary(emps, p.asOf)
  const promo = promotionRate(emps, changes, p.window, p.has.jobChanges)
  const voluntary = typed && vol.avgHeadcount >= 5 ? vol.rate : null
  const regretted = typed && p.has.regrettable && reg.avgHeadcount >= 5 ? reg.rate : null
  const firstYear = left ? cohort.rate : null
  const avgSpan = spans.length ? mean(spans) : null
  return {
    headcount: hc,
    netChange: left ? hc - then : null,
    voluntary,
    regretted,
    firstYear,
    promotionRate: promo.rate,
    avgSpan,
    records: {
      active: now,
      joined: left ? joined : [],
      left: left ? gone : [],
      voluntary: voluntary == null ? [] : exits.filter((e) => e.terminationType === 'Voluntary'),
      regretted:
        regretted == null
          ? []
          : exits.filter((e) => e.terminationType === 'Voluntary' && e.regrettable === true),
      firstYear: firstYear == null ? [] : firstYearCohort(emps, p.asOf).filter(leftInFirstYear),
      cohort: cohort.cohort,
      promotions:
        promo.rate == null
          ? []
          : changes.filter((c) => c.changeType === 'Promotion' && inWindow(c.effectiveDate, p.window)),
      avgHeadcount: vol.avgHeadcount,
      managers: avgSpan == null ? [] : managers,
    },
  }
}

function orgDefinitions(p: Prep): { label: string; dim: ScoreDim; defs: OrgDef[] } {
  const { ctx, people, asOf } = p
  const leaderId = ctx.filters.leaderId
  if (leaderId && ctx.org.byId.has(leaderId)) {
    const scoped = new Set(people.map((e) => e.employeeId))
    const defs: OrgDef[] = []
    for (const d of ctx.org.children.get(leaderId) ?? []) {
      if (!isActiveAt(d, asOf) || !scoped.has(d.employeeId)) continue
      const ids = subtreeIds(ctx.org, d.employeeId)
      defs.push({
        key: d.employeeId,
        label: d.name,
        sublabel: d.jobTitle,
        kind: 'leader',
        filter: { leaderId: d.employeeId },
        people: people.filter((e) => ids.has(e.employeeId)),
      })
    }
    return { label: `${p.name(leaderId)}'s direct reports`, dim: 'leader', defs }
  }
  const active = p.emps.filter((e) => isActiveAt(e, asOf))
  const dims = [
    { key: 'businessUnit' as const, label: 'Business units', get: (e: Employee) => e.businessUnit },
    { key: 'department' as const, label: 'Departments', get: (e: Employee) => e.department },
    { key: 'location' as const, label: 'Locations', get: (e: Employee) => e.location },
  ]
  const dim = dims.find((d) => new Set(active.map(d.get)).size > 1) ?? dims[0]
  const groups = new Map<string, Employee[]>()
  for (const e of people) {
    const k = dim.get(e) || 'Not recorded'
    const arr = groups.get(k)
    if (arr) arr.push(e)
    else groups.set(k, [e])
  }
  return {
    label: dim.label,
    dim: dim.key,
    defs: [...groups.entries()].map(([k, list]) => ({
      key: k,
      label: k,
      sublabel: '',
      kind: dim.key,
      filter: k === 'Not recorded' ? null : { [dim.key]: [k] },
      people: list,
    })),
  }
}

export function computeScorecard(p: Prep): Scorecard {
  const changesById = new Map<string, JobChange[]>()
  for (const c of p.ctx.all.jobChanges) {
    const arr = changesById.get(c.employeeId)
    if (arr) arr.push(c)
    else changesById.set(c.employeeId, [c])
  }
  const { label, dim, defs } = orgDefinitions(p)
  const company = metrics(p, p.ctx.all.employees, changesById)

  const rows: ScoreRow[] = []
  const small: OrgDef[] = []
  for (const d of defs) {
    const m = metrics(p, d.people, changesById)
    if (m.headcount < 5) {
      if (d.people.length) small.push(d)
      continue
    }
    const shade: Partial<Record<ScoreMetric, Shade>> = {}
    if (m.headcount >= SHADE_MIN_HEADCOUNT) {
      for (const k of SCORE_METRICS) {
        const s = isMaterialOff(k, m[k], company[k])
        if (s) shade[k] = s
      }
    }
    rows.push({
      key: d.key,
      label: d.label,
      sublabel: d.sublabel,
      kind: d.kind,
      filter: d.filter,
      ...m,
      shade,
    })
  }
  rows.sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label))
  if (small.length) {
    rows.push({
      key: '__other',
      label: `Other (${small.length})`,
      sublabel: 'Orgs under 5 employees',
      kind: 'other',
      filter: null,
      ...metrics(
        p,
        small.flatMap((d) => d.people),
        changesById,
      ),
      shade: {},
    })
  }
  if (rows.length) {
    rows.push({
      key: '__company',
      label: 'Company',
      sublabel: 'Benchmark',
      kind: 'company',
      filter: null,
      ...company,
      shade: {},
    })
  }
  return { rowsLabel: label, dim, rows }
}
