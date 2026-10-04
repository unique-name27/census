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
import { attrition, headcountAt, isActiveAt } from '@/lib/people'
import { mean } from '@/lib/stats'
import { cohortSummary } from './attrition'
import type { Prep } from './base'
import { promotionRate } from './movement'
import { activeChildren } from './org'

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
}

export interface Scorecard {
  rowsLabel: string
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
  const spans = [...activeChildren(active, p.asOf).values()].map((k) => k.length)
  const vol = attrition(emps, p.window, 'voluntary')
  const reg = attrition(emps, p.window, 'regretted')
  const hc = headcountAt(emps, p.asOf)
  return {
    headcount: hc,
    netChange: left ? hc - headcountAt(emps, addDays(p.t12.start, -1)) : null,
    voluntary: typed && vol.avgHeadcount >= 5 ? vol.rate : null,
    regretted: typed && p.has.regrettable && reg.avgHeadcount >= 5 ? reg.rate : null,
    firstYear: left ? cohortSummary(emps, p.asOf).rate : null,
    promotionRate: promotionRate(emps, changes, p.window, p.has.jobChanges).rate,
    avgSpan: spans.length ? mean(spans) : null,
  }
}

function orgDefinitions(p: Prep): { label: string; defs: OrgDef[] } {
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
    return { label: `${p.name(leaderId)}'s direct reports`, defs }
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
  const { label, defs } = orgDefinitions(p)
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
  return { rowsLabel: label, rows }
}
