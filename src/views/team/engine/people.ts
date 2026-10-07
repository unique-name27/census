/**
 * My team, People (docs/ROLES.md 2.2): the org's attrition beside the company's, and how many
 * direct reports each manager in the org has against the company's median span. Every number is
 * People stats' own, read from its model with its definitions and settings. Pure.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import { median } from '@/lib/stats'
import type { HrbpModel } from '@/views/hrbp/engine'
import { activeWorkers } from '@/views/hrbp/engine/base'
import { firstYearSummary, rateOptions } from '@/views/hrbp/engine/kpis'
import { activeChildren, type ManagerFlag, type ManagerRow } from '@/views/hrbp/engine/org'
import { attrition } from '@/views/hrbp/engine/population'
import { ID } from '@/views/hrbp/metrics'

export const ORG_SERIES = 'This org'
export const COMPANY_SERIES = 'Company'

export type CompareMeasure = 'Voluntary attrition' | 'Regretted attrition' | 'First-year attrition'

export interface CompareRow {
  measure: CompareMeasure
  series: typeof ORG_SERIES | typeof COMPANY_SERIES
  /** Annualized rate (first-year: share of the cohort); null when hidden or missing. */
  rate: number | null
  metricId: string
  /** The org's leavers behind its rate (the tile's own records); company rates open nothing. */
  drill: DrillSource
  /** Why an org rate reads "—" (the tile's note or the anonymity rule). */
  note: string | null
}

const MEASURES: readonly { id: string; measure: CompareMeasure; metricId: string }[] = [
  { id: 'voluntary', measure: 'Voluntary attrition', metricId: ID.voluntary },
  { id: 'regretted', measure: 'Regretted attrition', metricId: ID.regretted },
  { id: 'first-year', measure: 'First-year attrition', metricId: ID.firstYear },
]

/**
 * The company's rate for one measure, over the same window and with the same settings as the
 * People stats tile's "vs company" comparison (null where the tile would have none).
 */
export function companyRate(m: HrbpModel, id: string): number | null {
  const p = m.prep
  const opts = rateOptions(p)
  if (id === 'voluntary')
    return p.has.terminationDate && p.has.terminationType
      ? attrition(p.companyEmps, p.window, 'voluntary', opts).rate
      : null
  if (id === 'regretted')
    return p.regrettedReady ? attrition(p.companyEmps, p.window, 'regretted', opts).rate : null
  return firstYearSummary(p, p.companyEmps, p.asOf).rate
}

/**
 * Voluntary, regretted and first-year attrition: the org's value is People stats' tile (so it
 * opens the same leavers), the company's is the comparison the tile's change is measured against.
 */
export function attritionCompare(m: HrbpModel): CompareRow[] {
  return MEASURES.flatMap(({ id, measure, metricId }) => {
    const k: Kpi | undefined = m.kpi.kpis.find((x) => x.id === id)
    if (!k) return []
    const own: CompareRow = {
      measure,
      series: ORG_SERIES,
      rate: k.suppressed ? null : k.value,
      metricId,
      drill: k.value == null || k.suppressed ? null : (k.drill ?? null),
      note: k.value == null || k.suppressed ? (k.suppressedNote ?? k.note ?? null) : null,
    }
    const company: CompareRow = {
      measure,
      series: COMPANY_SERIES,
      rate: companyRate(m, id),
      metricId,
      drill: null,
      note: null,
    }
    return [own, company]
  })
}

/* ───────── spans ───────── */

export interface SpanRow {
  managerId: string
  name: string
  jobTitle: string
  directs: number
  totalOrg: number
  flag: ManagerFlag
  manager: ManagerRow
}

/** Every manager in the org, the most direct reports first (People stats' manager table). */
export function spanRows(m: HrbpModel): SpanRow[] {
  return m.org.managers.map((r) => ({
    managerId: r.managerId,
    name: r.name,
    jobTitle: r.jobTitle,
    directs: r.directs,
    totalOrg: r.totalOrg,
    flag: r.flag,
    manager: r,
  }))
}

/**
 * The span flags a bar carries a status glyph for, beside the flag's word (Healthy and New carry
 * none): Overloaded critical, Heavy and Light watch, at People stats' thresholds.
 */
export const FLAG_TONE: Partial<Record<ManagerFlag, 'critical' | 'warning'>> = {
  Overloaded: 'critical',
  Heavy: 'warning',
  Light: 'warning',
}

const medianCache = new WeakMap<readonly Employee[], Map<ISODate, number | null>>()

/**
 * The company's median span: active direct reports of every worker type per active manager, as
 * People stats counts a manager's directs, over everyone on the roster. Cached per roster and date.
 */
export function companyMedianSpan(ctx: Pick<AnalyticsContext, 'all' | 'asOf'>): number | null {
  const roster = ctx.all.employees
  let byDate = medianCache.get(roster)
  if (!byDate) {
    byDate = new Map()
    medianCache.set(roster, byDate)
  }
  if (byDate.has(ctx.asOf)) return byDate.get(ctx.asOf) ?? null
  const active = activeWorkers(roster, ctx.asOf)
  const spans = [...activeChildren(active, ctx.asOf).values()].map((kids) => kids.length)
  const out = spans.length ? median(spans) : null
  byDate.set(ctx.asOf, out)
  return out
}
