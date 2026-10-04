/**
 * The hiring plan (docs/VIEWS.md, Onboarding > Hiring plan): plan, actual, committed and
 * forecast starts by month; coverage by business unit and department; planned roles with no open
 * requisition; open reqs that are not in the plan; and the coming quarter's roles that have
 * neither an accepted offer nor an open req.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, HiringPlanLine, ISODate, Requisition } from '@/data/schema'
import { addDays, addMonths, monthEnd, monthKey, monthsBetween, quarterStart } from '@/lib/dates'
import { isEmployee } from '@/lib/people'
import type { OnboardingBase } from './base'
import { type ForecastModel, type ForecastReq, forecastWithin } from './forecast'
import { isAccepted, type Start } from './starts'

/** What stands behind a plan line. */
export type Coverage = 'accepted' | 'open' | 'on-hold' | 'cancelled' | 'no-req'

export const COVERAGE_LABEL: Record<Coverage, string> = {
  accepted: 'Accepted offer',
  open: 'Open req',
  'on-hold': 'Req on hold',
  cancelled: 'Req cancelled',
  'no-req': 'No req',
}

/** Not covered: no accepted offer and no open req behind the line. */
export const isUncovered = (c: Coverage): boolean => c === 'no-req' || c === 'on-hold' || c === 'cancelled'

export interface PlanLineView {
  line: HiringPlanLine
  month: string
  coverage: Coverage
  req: Requisition | null
}

export type PlanStatus = 'On plan' | 'Behind' | 'Ahead'

export interface CoverageRow {
  businessUnit: string
  /** Null on a business unit row. */
  department: string | null
  planYtd: number
  planFull: number
  actualYtd: number
  committed: number
  openReqs: number
  forecast: number
  gap: number
  vsPlan: number | null
  status: PlanStatus | null
  lines: HiringPlanLine[]
  actual: Employee[]
  committedStarts: Start[]
  reqs: Requisition[]
  forecastReqs: ForecastReq[]
}

export interface MonthRow {
  month: string
  plan: number
  actual: number
  committed: number
  forecast: number
  lines: HiringPlanLine[]
  actualPeople: Employee[]
  committedStarts: Start[]
}

export interface QuarterUnit {
  businessUnit: string
  planned: number
  accepted: number
  open: number
  onHold: number
  cancelled: number
  noReq: number
  uncovered: number
  lines: PlanLineView[]
}

export interface PlanModel {
  /** The plan version read (the latest when several are loaded); null when lines carry none. */
  version: string | null
  versions: string[]
  lines: HiringPlanLine[]
  views: PlanLineView[]
  /** First and last day of the plan year. */
  start: ISODate
  end: ISODate
  /** Last day counted as "to date": the as-of date, or the plan's end if earlier. */
  toDate: ISODate
  months: MonthRow[]
  planYtd: number
  planFull: number
  actual: Employee[]
  committed: Start[]
  vsPlan: number | null
  status: PlanStatus | null
  byUnit: CoverageRow[]
  byDepartment: CoverageRow[]
  quarter: { label: string; start: ISODate; end: ISODate; units: QuarterUnit[] }
  /** Future plan lines with no open req or accepted offer. */
  noReq: PlanLineView[]
  /** Open reqs on no plan line: new roles and backfills. */
  notInPlan: { added: Requisition[]; backfills: Requisition[] }
}

/** Natural order for version names: "FY27 v10" after "FY27 v2". */
const byName = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })

/** The version names loaded, and the latest of them. */
export function planVersions(lines: readonly HiringPlanLine[]): {
  versions: string[]
  latest: string | null
} {
  const versions = [...new Set(lines.map((l) => l.planVersion).filter((v): v is string => !!v))].sort(byName)
  return { versions, latest: versions[versions.length - 1] ?? null }
}

/** The lines of one version (all lines when none carries a version). */
export const linesOf = (lines: readonly HiringPlanLine[], version: string | null): HiringPlanLine[] =>
  version ? lines.filter((l) => l.planVersion === version) : [...lines]

export function statusOf(actual: number, plan: number, band: number): PlanStatus | null {
  if (plan <= 0) return null
  const r = actual / plan
  return r < 1 - band ? 'Behind' : r > 1 + band ? 'Ahead' : 'On plan'
}

/** The quarter after the as-of date, from its first open month: "Q4 2026". */
export function comingQuarter(asOf: ISODate): { label: string; start: ISODate; end: ISODate } {
  const next = addDays(asOf, 1)
  const qs = quarterStart(next)
  const end = monthEnd(addMonths(qs, 2))
  return { label: `Q${Math.ceil(+qs.slice(5, 7) / 3)} ${qs.slice(0, 4)}`, start: `${monthKey(next)}-01`, end }
}

/**
 * Coverage of each plan line. A req's accepted offers cover its earliest lines first (one line per
 * accepted offer); its other lines follow the req's status.
 */
export function coverageOf(
  lines: readonly HiringPlanLine[],
  reqs: ReadonlyMap<string, Requisition>,
  acceptedOn: ReadonlyMap<string, number>,
): PlanLineView[] {
  const used = new Map<string, number>()
  const order = lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => a.line.period.localeCompare(b.line.period) || a.i - b.i)
  const out = new Array<PlanLineView>(lines.length)
  for (const { line, i } of order) {
    const req = line.reqId ? (reqs.get(line.reqId) ?? null) : null
    let coverage: Coverage = 'no-req'
    if (req) {
      const n = used.get(req.reqId) ?? 0
      if (
        n < (acceptedOn.get(req.reqId) ?? 0) ||
        (req.status === 'Filled' && n < Math.max(1, req.openings))
      ) {
        coverage = 'accepted'
        used.set(req.reqId, n + 1)
      } else
        coverage =
          req.status === 'Open'
            ? 'open'
            : req.status === 'On hold'
              ? 'on-hold'
              : req.status === 'Cancelled'
                ? 'cancelled'
                : 'accepted'
    }
    out[i] = { line, month: monthKey(line.period), coverage, req }
  }
  return out
}

const key = (bu: string, dept: string | null) => `${bu}\u0001${dept ?? ''}`

export function computePlan(
  b: OnboardingBase,
  ctx: AnalyticsContext,
  forecast: ForecastModel | null,
): PlanModel | null {
  const { versions, latest } = planVersions(ctx.all.hiringPlan)
  const lines = linesOf(ctx.data.hiringPlan, latest)
  const allLines = linesOf(ctx.all.hiringPlan, latest)
  if (!allLines.length) return null
  const periods = allLines.map((l) => l.period).sort()
  const start = `${monthKey(periods[0])}-01`
  const end = monthEnd(periods[periods.length - 1])
  const toDate = b.asOf < end ? b.asOf : end
  const band = b.settings.onPlanBand
  const inYear = (d: ISODate) => d >= start && d <= end

  const acceptedOn = new Map<string, number>()
  for (const c of ctx.all.candidates)
    if (isAccepted(c)) acceptedOn.set(c.reqId, (acceptedOn.get(c.reqId) ?? 0) + 1)
  const views = coverageOf(lines, b.reqs, acceptedOn)

  const actual = ctx.data.employees.filter(
    (e) => isEmployee(e) && e.hireDate >= start && e.hireDate <= toDate,
  )
  const committed = b.upcoming.starts.filter((p) => inYear(p.startDate))
  const openReqs = ctx.data.requisitions.filter((r) => r.status === 'Open')
  const fcReqs = forecast?.reqs ?? []
  const fcFrom = addDays(b.asOf, 1)

  // By month.
  const monthKeys = monthsBetween(start, end)
  const months: MonthRow[] = monthKeys.map((month) => ({
    month,
    plan: 0,
    actual: 0,
    committed: 0,
    forecast: 0,
    lines: [],
    actualPeople: [],
    committedStarts: [],
  }))
  const at = new Map(months.map((m) => [m.month, m]))
  for (const l of lines) {
    const m = at.get(monthKey(l.period))
    if (!m) continue
    m.plan += l.plannedHires
    m.lines.push(l)
  }
  for (const e of actual) {
    const m = at.get(monthKey(e.hireDate))
    if (!m) continue
    m.actual++
    m.actualPeople.push(e)
  }
  for (const p of committed) {
    const m = at.get(monthKey(p.startDate))
    if (!m) continue
    m.committed++
    m.committedStarts.push(p)
  }
  for (const r of fcReqs)
    for (const part of r.parts) {
      if (part.start < fcFrom || part.start > end) continue
      const m = at.get(monthKey(part.start))
      if (m) m.forecast += part.weight
    }

  // Coverage by business unit and by department.
  const rows = new Map<string, CoverageRow>()
  const row = (bu: string, dept: string | null): CoverageRow => {
    const k = key(bu, dept)
    let r = rows.get(k)
    if (!r) {
      r = {
        businessUnit: bu,
        department: dept,
        planYtd: 0,
        planFull: 0,
        actualYtd: 0,
        committed: 0,
        openReqs: 0,
        forecast: 0,
        gap: 0,
        vsPlan: null,
        status: null,
        lines: [],
        actual: [],
        committedStarts: [],
        reqs: [],
        forecastReqs: [],
      }
      rows.set(k, r)
    }
    return r
  }
  const both = (
    bu: string | null | undefined,
    dept: string | null | undefined,
    f: (r: CoverageRow) => void,
  ) => {
    const u = bu || 'Unknown'
    f(row(u, null))
    f(row(u, dept || 'Unknown'))
  }
  for (const l of lines)
    both(l.businessUnit, l.department, (r) => {
      r.planFull += l.plannedHires
      if (l.period <= toDate) r.planYtd += l.plannedHires
      r.lines.push(l)
    })
  for (const e of actual)
    both(e.businessUnit, e.department, (r) => {
      r.actualYtd++
      r.actual.push(e)
    })
  for (const p of committed)
    both(p.businessUnit, p.department, (r) => {
      r.committed++
      r.committedStarts.push(p)
    })
  for (const q of openReqs)
    both(q.businessUnit, q.department, (r) => {
      r.openReqs++
      r.reqs.push(q)
    })
  for (const f of fcReqs) {
    const w = forecastWithin(f, fcFrom, end)
    if (!w) continue
    both(f.req.businessUnit, f.req.department, (r) => {
      r.forecast += w
      r.forecastReqs.push(f)
    })
  }
  const finish = (r: CoverageRow): CoverageRow => ({
    ...r,
    gap: r.planFull - (r.actualYtd + r.committed + r.forecast),
    vsPlan: r.planYtd > 0 ? r.actualYtd / r.planYtd : null,
    status: statusOf(r.actualYtd, r.planYtd, band),
  })
  const all = [...rows.values()].map(finish)
  const byUnit = all
    .filter((r) => r.department == null)
    .sort((a, c) => c.planFull - a.planFull || a.businessUnit.localeCompare(c.businessUnit))
  const byDepartment = all
    .filter((r) => r.department != null)
    .sort(
      (a, c) =>
        a.businessUnit.localeCompare(c.businessUnit) ||
        c.planFull - a.planFull ||
        (a.department ?? '').localeCompare(c.department ?? ''),
    )

  // The coming quarter.
  const q = comingQuarter(b.asOf)
  const units = new Map<string, QuarterUnit>()
  for (const v of views) {
    if (v.line.period < q.start || v.line.period > q.end) continue
    const bu = v.line.businessUnit || 'Unknown'
    const u = units.get(bu) ?? {
      businessUnit: bu,
      planned: 0,
      accepted: 0,
      open: 0,
      onHold: 0,
      cancelled: 0,
      noReq: 0,
      uncovered: 0,
      lines: [],
    }
    const n = v.line.plannedHires
    u.planned += n
    if (v.coverage === 'accepted') u.accepted += n
    else if (v.coverage === 'open') u.open += n
    else if (v.coverage === 'on-hold') u.onHold += n
    else if (v.coverage === 'cancelled') u.cancelled += n
    else u.noReq += n
    if (isUncovered(v.coverage)) u.uncovered += n
    u.lines.push(v)
    units.set(bu, u)
  }

  // Future lines with nothing behind them; open reqs on no plan line.
  const firstOpen = `${monthKey(addDays(b.asOf, 1))}-01`
  const noReq = views.filter((v) => v.line.period >= firstOpen && isUncovered(v.coverage))
  const planned = new Set(allLines.map((l) => l.reqId).filter(Boolean))
  const outside = openReqs.filter((r) => !planned.has(r.reqId))

  const planYtd = lines.reduce((s, l) => s + (l.period <= toDate ? l.plannedHires : 0), 0)
  const planFull = lines.reduce((s, l) => s + l.plannedHires, 0)
  return {
    version: latest,
    versions,
    lines,
    views,
    start,
    end,
    toDate,
    months,
    planYtd,
    planFull,
    actual,
    committed,
    vsPlan: planYtd > 0 ? actual.length / planYtd : null,
    status: statusOf(actual.length, planYtd, band),
    byUnit,
    byDepartment,
    quarter: {
      ...q,
      units: [...units.values()].sort((a, c) => c.uncovered - a.uncovered || c.planned - a.planned),
    },
    noReq,
    notInPlan: {
      added: outside.filter((r) => r.reqType !== 'Backfill'),
      backfills: outside.filter((r) => r.reqType === 'Backfill'),
    },
  }
}

/** Cumulative plan, actual, committed and forecast by month (the lead chart's rows). */
export interface CumulativeRow {
  month: string
  series: 'Plan' | 'Actual' | 'Committed' | 'Forecast'
  starts: number
}

export function cumulative(p: PlanModel, asOf: ISODate): CumulativeRow[] {
  const out: CumulativeRow[] = []
  const now = monthKey(asOf)
  let plan = 0
  let actual = 0
  let committed = 0
  let forecast = 0
  for (const m of p.months) {
    plan += m.plan
    out.push({ month: m.month, series: 'Plan', starts: plan })
    if (m.month <= now) {
      actual += m.actual
      out.push({ month: m.month, series: 'Actual', starts: actual })
    }
    if (m.month >= now) {
      committed += m.committed
      forecast += m.forecast
      out.push({ month: m.month, series: 'Committed', starts: actual + committed })
      out.push({
        month: m.month,
        series: 'Forecast',
        starts: Math.round((actual + committed + forecast) * 10) / 10,
      })
    }
  }
  return out
}
