/**
 * Actual against budget: the optional headcount and cost budget (dataset `budget`, sheet
 * "Budget", docs/ROLES-V2.md "Decisions made") set against the roster and the pay data, by
 * business unit, cost center and month. Pure; Compensation's Workforce cost tab and Finance's home
 * read it. With no budget loaded `computeBudget` returns null and they fall back to the hiring
 * plan.
 *
 * Definitions:
 *  - Headcount: employees (`isEmployee`; contractors and interns are not headcount) active at the
 *    end of each budget month, or at the as-of date in the month it falls in, against the month's
 *    budgeted headcount. Months that start after the as-of date have a budget and no actual.
 *  - Cost: a monthly run rate, measured in the month of the as-of date only, because the pay data
 *    is a snapshot: employees' annual target cash (base × (1 + target bonus) × FX to USD, full-time
 *    equivalent, as Workforce cost's target cash) ÷ 12, plus each active contractor at the range
 *    midpoint of their level and location (an estimate, see `midpointRates`) ÷ 12, against the
 *    month's budgeted cost in USD. Interns are counted, not costed.
 *  - Status: over or under when the actual is more than the band away from the budget (a share of
 *    the budget: 1% for headcount, 0.5% for cost by default), else on budget.
 *
 * Finance's totals rules (docs/ROLES-V2.md 3.2), in every mode:
 *  - every cost over fewer than the anonymity minimum of costed employees (or of budgeted heads)
 *    is null, the scope's own total included;
 *  - breakdowns fold groups under the minimum into "Other (k)", and while Other is still under it
 *    the smallest shown group joins, so no hidden group is ever the total minus the shown ones;
 *  - cost centers fold inside their business unit, and the cost centers of business units folded
 *    into Other by unit fold into one Other, so a unit's total less its shown cost centers is
 *    always a group of the minimum or more (no subtraction across the two breakdowns either);
 *  - in Finance (`wholeUnits`), whose scopes are any set of whole business units, units under the
 *    minimum are left out and units are never folded together, so no two scopes differ by a
 *    small group;
 *  - rows hold totals, counts and the records behind them, never one person's amount;
 *  - in Finance (`round`), every cost is rounded down to a whole $100,000 (`./costRounding.ts`) in
 *    each business unit, the total adding the units' rounded costs, and the variance, its
 *    percentage and the status are computed from the rounded amounts.
 *
 * The budget is set by business unit, department and cost center, so it is compared only for a
 * scope made of whole lines (`budgetFit`): a location, level or leader filter, or a department
 * filter over a business unit budgeted as a whole, gives `unavailable` with the reason.
 */
import { REFERENCE_FX_TO_USD } from '@/data/import/defaults'
import { type BudgetLine, type CompRecord, type Employee, type ISODate, MIN_GROUP } from '@/data/schema'
import { dimensionSet, type Filters, isActiveAt, isEmployee } from '@/data/scope'
import { ANONYMITY } from '@/metrics/privacy'
import type { MetricsApi } from '@/metrics/types'
import { roundCost, sumRounded } from './costRounding'
import { formatMonth, monthEnd, monthKey } from './dates'
import { median } from './stats'

/** The metric dictionary ids of the three numbers (registered in `src/metrics/budget.ts`). */
export const BUDGET_METRICS = {
  headcount: 'comp.cost.headcountVsBudget',
  cost: 'comp.cost.vsBudget',
  contractors: 'comp.cost.contractorEstimate',
} as const

/** The "on budget" band, as a share of the budget, and the metric setting that holds it. */
export const BUDGET_BAND = {
  key: 'band',
  headcount: 0.01,
  cost: 0.005,
} as const

/** The key of a breakdown's folded row (a business unit's own Other is `OTHER_KEY:<unit>`). */
export const OTHER_KEY = '__other'
/** Stands for the cost center in the key of the row for employees with none (`<unit>:NO_COST_CENTER`). */
export const NO_COST_CENTER = '__none'

export type BudgetStatus = 'over' | 'under' | 'on'

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  over: 'Over budget',
  under: 'Under budget',
  on: 'On budget',
}

type BudgetData = {
  employees: readonly Employee[]
  comp: readonly CompRecord[]
  budget: readonly BudgetLine[]
}

/** What the helper reads: `AnalyticsContext` fits as it is. */
export interface BudgetInput {
  asOf: ISODate
  /** The scope's filters, for `budgetFit`; omitted means the whole company. */
  filters?: Filters
  /** The scope: employees, comp and budget lines after the org filters. */
  data: BudgetData
  /** The whole company: plan versions, exchange rates and the contractor estimate. */
  all: BudgetData
  /** The anonymity minimum and the bands in force; the defaults without it. */
  metrics?: Pick<MetricsApi, 'num' | 'paramDef'>
}

export interface BudgetOptions {
  /** The plan version to read; the latest loaded (natural order) when omitted. */
  version?: string | null
  /**
   * Finance (pay view 'totals', docs/ROLES-V2.md 3.2): its scopes are any set of whole business
   * units, so a business unit under the minimum, of costed employees or of budgeted heads, is left
   * out of everything (`smallUnitsIn`), and every unit has its own row (no fold across units).
   * Two scopes then never differ by a small unit's cost.
   */
  wholeUnits?: boolean
  /**
   * Finance (pay view 'totals', docs/ROLES-V2.md 3.2 rule 8): every cost rounded down to a whole
   * $100,000 in each business unit (the total adds the units' rounded costs), with the variance,
   * its percentage and the status from the rounded amounts.
   */
  round?: boolean
}

/** One group of a breakdown, or the scope's total, in the compared month. */
export interface BudgetRow {
  /**
   * Unique in its breakdown: the business unit; `<business unit>:<cost center code>` (or
   * `<business unit>:NO_COST_CENTER`); `OTHER_KEY`, or `OTHER_KEY:<business unit>` for a unit's
   * own Other; 'total' for the scope. Read the group from `businessUnit` and `costCenter`.
   */
  key: string
  label: string
  businessUnit: string | null
  department: string | null
  costCenter: string | null
  /** Small groups folded together under the totals rules. */
  isOther: boolean
  /** Groups folded into this row (Other only; 0 elsewhere). */
  folded: number
  /** Budgeted headcount; null when no budget line covers the group. */
  budgetHeadcount: number | null
  /** Employees active at the date. */
  headcount: number
  headcountVariance: number | null
  headcountVariancePct: number | null
  headcountStatus: BudgetStatus | null
  /** Active contractors (the people in `contingent`), counted beside headcount. */
  contractors: number
  /** Active interns: counted, never costed. */
  interns: number
  /** Employees with a comp row and an exchange rate: the people the cost guard counts. */
  costed: number
  /**
   * Cost columns, USD per month (`cost: true`). Null when hidden (fewer than the minimum), when
   * no line budgets a cost, or when a line's cost can't be converted to USD.
   */
  budgetCostUsd: number | null
  employeeCostUsd: number | null
  /** Contractors at the range midpoint of their level and location: an estimate. */
  contractorCostUsd: number | null
  costUsd: number | null
  costVarianceUsd: number | null
  costVariancePct: number | null
  costStatus: BudgetStatus | null
  /** Cost hidden to protect anonymity. */
  hidden: boolean
  /** The records behind the row, for drills (never exported: a Figure exports its columns only). */
  employees: readonly Employee[]
  contingent: readonly Employee[]
  lines: readonly BudgetLine[]
}

/** The scope's total in one budget month. */
export interface BudgetMonthRow {
  /** 'YYYY-MM'. */
  month: string
  /** First day of the month. */
  period: ISODate
  /** When actuals are measured: the month end, or the as-of date in its month; null for a month not started. */
  date: ISODate | null
  budgetHeadcount: number
  headcount: number | null
  headcountVariance: number | null
  headcountVariancePct: number | null
  headcountStatus: BudgetStatus | null
  /** USD per month; null when hidden, not budgeted or not convertible. */
  budgetCostUsd: number | null
  /** The compared month only: the run rate at the as-of date. */
  costUsd: number | null
  costVarianceUsd: number | null
  costVariancePct: number | null
  costStatus: BudgetStatus | null
  employees: readonly Employee[]
  lines: readonly BudgetLine[]
}

/** Headcount against budget for one business unit and month (counts only, no guard needed). */
export interface BudgetUnitMonth {
  businessUnit: string
  month: string
  budgetHeadcount: number | null
  headcount: number | null
  headcountVariance: number | null
  headcountStatus: BudgetStatus | null
}

export interface BudgetModel {
  version: string | null
  versions: readonly string[]
  /** Months of the version in order ('YYYY-MM'). */
  months: readonly string[]
  /** The month compared: the budget month the as-of date falls in, else the latest one before it. */
  month: string | null
  /** When the compared month's actuals are measured. */
  date: ISODate | null
  /** Why actual against budget can't be shown for this scope; null when it can. */
  unavailable: string | null
  total: BudgetRow | null
  /** Business units in the compared month, most budgeted headcount first, Other last. */
  byUnit: BudgetRow[]
  /**
   * Cost centers with a budget line or an employee, inside their business unit (in `byUnit`
   * order): those the budget names by code, then the others, no cost center and the unit's Other;
   * last, one Other for the units `byUnit` folds.
   */
  byCostCenter: BudgetRow[]
  byMonth: BudgetMonthRow[]
  unitMonths: BudgetUnitMonth[]
  /** Some line of the version has a budget cost. */
  hasCost: boolean
  /** Some line of the version names a cost center. */
  hasCostCenters: boolean
  /** Plain sentences on what was left out and why. */
  notes: string[]
  /** People and lines left out of the cost, for the notes and tests. */
  counts: {
    /** Employees at the date with no comp row or no exchange rate. */
    notCosted: number
    /** Contractors with no midpoint estimate. */
    noEstimate: number
    /** Lines in the compared month whose cost has no exchange rate. */
    noRate: number
  }
  minGroup: number
  /** Every cost here is rounded down to a whole $100,000 (Finance); read it with the 'moneyM' format. */
  rounded: boolean
}

/* ───────── versions and months ───────── */

/** Natural order for version names: "FY27 v10" after "FY27 v2". */
const byName = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })

/** The version names loaded, and the latest of them. */
export function budgetVersions(lines: readonly BudgetLine[]): { versions: string[]; latest: string | null } {
  const versions = [...new Set(lines.map((l) => l.planVersion).filter((v): v is string => !!v))].sort(byName)
  return { versions, latest: versions[versions.length - 1] ?? null }
}

/** The lines of one version (every line when none carries a version). */
export const budgetLinesOf = (lines: readonly BudgetLine[], version: string | null): BudgetLine[] =>
  version ? lines.filter((l) => l.planVersion === version) : [...lines]

/** "Sep 2026" for '2026-09'. */
const monthText = (month: string): string => formatMonth(`${month}-01`)

/** True when a budget is loaded: Finance's home and Workforce cost compare against it. */
export const hasBudget = (all: Pick<BudgetData, 'budget'>): boolean => all.budget.length > 0

/** The month a budget compares: the one the as-of date falls in, else the latest one before it. */
export function comparedMonth(months: readonly string[], asOf: ISODate): string | null {
  const at = monthKey(asOf)
  let best: string | null = null
  for (const m of months) if (m <= at && (!best || m > best)) best = m
  return best
}

/** When a month's actuals are measured: its end, or the as-of date when that comes first. */
export function measuredAt(month: string, asOf: ISODate): ISODate | null {
  if (`${month}-01` > asOf) return null
  const end = monthEnd(`${month}-01`)
  return end < asOf ? end : asOf
}

/* ───────── what the scope can be compared on ───────── */

/**
 * Why the budget can't be compared for these filters, or null when it can. The lines carry a
 * business unit, a department and a cost center, never a location, a level or a reporting line,
 * so only a scope of whole business units, or of departments where every line names one, matches
 * the lines it keeps.
 */
export function budgetFit(
  filters: Filters | undefined,
  lines: readonly BudgetLine[],
  scopedUnits: ReadonlySet<string>,
): string | null {
  if (!filters) return null
  if (dimensionSet(filters, 'location') || dimensionSet(filters, 'level'))
    return 'The budget is set by business unit and cost center, not by location or level, so it is not compared for this scope. Clear the location and level filters to compare it.'
  if (dimensionSet(filters, 'leaderId'))
    return 'The budget is set by business unit and cost center, not by reporting line, so it is not compared for a leader’s org. Filter by business unit to compare it.'
  if (dimensionSet(filters, 'department')) {
    const whole = [
      ...new Set(
        lines.filter((l) => !l.department && scopedUnits.has(l.businessUnit)).map((l) => l.businessUnit),
      ),
    ].sort()
    if (whole.length)
      return `The budget for ${whole.join(' and ')} is set for the whole business unit, so it is not compared for a department. Filter by business unit to compare it.`
  }
  return null
}

/* ───────── pay ───────── */

/** Annual target cash in USD (base × (1 + target bonus) × FX), or null without an exchange rate. */
export function annualTargetCashUsd(c: CompRecord): number | null {
  if (c.fxToUsd == null || !Number.isFinite(c.fxToUsd) || !Number.isFinite(c.baseSalary)) return null
  return c.baseSalary * (1 + (c.targetBonusPct ?? 0)) * c.fxToUsd
}

/**
 * The contractor estimate: for a level and location, the median range midpoint in USD of active
 * employees there (the minimum or more), else of the level company-wide (the minimum or more),
 * else none. The same rule as Workforce cost's open reqs at range midpoint.
 */
export function midpointRates(
  all: Pick<BudgetData, 'employees' | 'comp'>,
  asOf: ISODate,
  minGroup: number = MIN_GROUP,
): (level: string | null | undefined, location: string | null | undefined) => number | null {
  const compById = new Map(all.comp.map((c) => [c.employeeId, c]))
  const at = new Map<string, number[]>()
  const level = new Map<string, number[]>()
  const push = (m: Map<string, number[]>, k: string, v: number) => {
    const xs = m.get(k)
    if (xs) xs.push(v)
    else m.set(k, [v])
  }
  for (const e of all.employees) {
    if (!isEmployee(e) || !isActiveAt(e, asOf) || !e.level) continue
    const c = compById.get(e.employeeId)
    if (!c || c.fxToUsd == null || !Number.isFinite(c.rangeMid)) continue
    const mid = c.rangeMid * c.fxToUsd
    push(at, `${e.level}\u0001${e.location}`, mid)
    push(level, e.level, mid)
  }
  const cache = new Map<string, number | null>()
  return (lvl, loc) => {
    if (!lvl) return null
    const k = `${lvl}\u0001${loc ?? ''}`
    if (cache.has(k)) return cache.get(k) ?? null
    const local = at.get(k)
    const wide = level.get(lvl)
    const rate =
      local && local.length >= minGroup
        ? median(local)
        : wide && wide.length >= minGroup
          ? median(wide)
          : null
    cache.set(k, rate)
    return rate
  }
}

/**
 * USD per unit of a budget line's currency: 1 for USD or a blank currency, else the median rate of
 * the comp rows in that currency, else Census's reference rate; null when there is none.
 */
export function currencyRates(
  comp: readonly CompRecord[],
): (currency: string | null | undefined) => number | null {
  const by = new Map<string, number[]>()
  for (const c of comp) {
    if (c.fxToUsd == null || !Number.isFinite(c.fxToUsd) || !c.currency) continue
    const xs = by.get(c.currency)
    if (xs) xs.push(c.fxToUsd)
    else by.set(c.currency, [c.fxToUsd])
  }
  return (currency) => {
    const ccy = (currency ?? '').trim().toUpperCase()
    if (!ccy || ccy === 'USD') return 1
    const xs = by.get(ccy)
    if (xs?.length) return median(xs)
    return REFERENCE_FX_TO_USD[ccy] ?? null
  }
}

/* ───────── status ───────── */

/** Over, under or on budget: more than `band` (a share of the budget) away counts. */
export function budgetStatus(
  actual: number | null | undefined,
  budget: number | null | undefined,
  band: number,
): BudgetStatus | null {
  if (actual == null || budget == null || !Number.isFinite(actual) || !Number.isFinite(budget)) return null
  if (budget <= 0) return actual > 0 ? 'over' : 'on'
  const v = (actual - budget) / budget
  return v > band + 1e-12 ? 'over' : v < -band - 1e-12 ? 'under' : 'on'
}

const pct = (actual: number | null, budget: number | null): number | null =>
  actual == null || budget == null || budget === 0 ? null : (actual - budget) / budget

/* ───────── accumulating a group ───────── */

interface Acc {
  key: string
  label: string
  businessUnit: string | null
  department: string | null
  costCenter: string | null
  isOther: boolean
  folded: number
  lines: BudgetLine[]
  budgetHeadcount: number
  /** Sum of the converted line costs; NaN once a line has no cost or no rate. */
  budgetCost: number
  costLines: number
  employees: Employee[]
  contingent: Employee[]
  interns: number
  costed: number
  employeeCost: number
  contractorCost: number
}

const newAcc = (key: string, label: string, patch: Partial<Acc> = {}): Acc => ({
  key,
  label,
  businessUnit: null,
  department: null,
  costCenter: null,
  isOther: false,
  folded: 0,
  lines: [],
  budgetHeadcount: 0,
  budgetCost: 0,
  costLines: 0,
  employees: [],
  contingent: [],
  interns: 0,
  costed: 0,
  employeeCost: 0,
  contractorCost: 0,
  ...patch,
})

function merge(key: string, label: string, parts: readonly Acc[]): Acc {
  const out = newAcc(key, label, { isOther: true })
  for (const p of parts) {
    out.folded += Math.max(1, p.folded)
    out.lines.push(...p.lines)
    out.budgetHeadcount += p.budgetHeadcount
    out.budgetCost += p.budgetCost
    out.costLines += p.costLines
    out.employees.push(...p.employees)
    out.contingent.push(...p.contingent)
    out.interns += p.interns
    out.costed += p.costed
    out.employeeCost += p.employeeCost
    out.contractorCost += p.contractorCost
  }
  return out
}

/**
 * The people a group's cost is over: its costed employees, and its budgeted heads when it has a
 * budget (a line's cost is a plan for that many people's pay).
 */
const guardSize = (a: Acc): number => (a.lines.length ? Math.min(a.costed, a.budgetHeadcount) : a.costed)

/**
 * Fold a breakdown under the totals rules: groups under the minimum go to Other; while Other is
 * still under it and the total is shown, the smallest shown group joins.
 */
export function foldGroups<T>(
  groups: readonly T[],
  size: (g: T) => number,
  minGroup: number,
  totalShown: boolean,
): { shown: T[]; folded: T[] } {
  const shown = groups.filter((g) => size(g) >= minGroup)
  const folded = groups.filter((g) => size(g) < minGroup)
  if (!folded.length) return { shown, folded }
  let otherSize = folded.reduce((s, g) => s + size(g), 0)
  while (totalShown && otherSize < minGroup && shown.length) {
    let i = 0
    for (let j = 1; j < shown.length; j++) if (size(shown[j]) < size(shown[i])) i = j
    const [g] = shown.splice(i, 1)
    folded.push(g)
    otherSize += size(g)
  }
  return { shown, folded }
}

interface Bands {
  headcount: number
  cost: number
}

function rowOf(
  a: Acc,
  minGroup: number,
  bands: Bands,
  costMeasured: boolean,
  round = false,
  parts?: readonly Acc[],
): BudgetRow {
  const hasLine = a.lines.length > 0
  const budgetHeadcount = hasLine ? a.budgetHeadcount : null
  const hidden = guardSize(a) < minGroup
  const budgetKnown = hasLine && a.costLines === a.lines.length && Number.isFinite(a.budgetCost)
  // Finance: each cost rounded on its own; the rest from these. A row over several business units
  // (`parts`, the total) adds each unit's rounded cost (`sumRounded`), so it says nothing the
  // units do not.
  const r = (v: number) => (round ? roundCost(v) : v)
  const over = (f: (x: Acc) => number) =>
    round && parts?.length ? sumRounded(parts.map((x) => roundCost(f(x)))) : r(f(a))
  const budgetCostUsd = !hidden && budgetKnown ? r(a.budgetCost) : null
  const employeeCostUsd = !hidden && costMeasured ? over((x) => x.employeeCost) : null
  const contractorCostUsd = !hidden && costMeasured ? over((x) => x.contractorCost) : null
  const costUsd =
    employeeCostUsd == null
      ? null
      : round
        ? over((x) => x.employeeCost + x.contractorCost)
        : employeeCostUsd + (contractorCostUsd ?? 0)
  const costVarianceUsd = costUsd != null && budgetCostUsd != null ? costUsd - budgetCostUsd : null
  return {
    key: a.key,
    label: a.label,
    businessUnit: a.businessUnit,
    department: a.department,
    costCenter: a.costCenter,
    isOther: a.isOther,
    folded: a.isOther ? a.folded : 0,
    budgetHeadcount,
    headcount: a.employees.length,
    headcountVariance: budgetHeadcount == null ? null : a.employees.length - budgetHeadcount,
    headcountVariancePct: pct(a.employees.length, budgetHeadcount),
    headcountStatus: budgetStatus(a.employees.length, budgetHeadcount, bands.headcount),
    contractors: a.contingent.length,
    interns: a.interns,
    costed: a.costed,
    budgetCostUsd,
    employeeCostUsd,
    contractorCostUsd,
    costUsd,
    costVarianceUsd,
    costVariancePct: pct(costUsd, budgetCostUsd),
    costStatus: budgetStatus(costUsd, budgetCostUsd, bands.cost),
    hidden,
    employees: a.employees,
    contingent: a.contingent,
    lines: a.lines,
  }
}

/** "Other (3)". */
export const otherLabel = (k: number): string => `Other (${k})`

/** One Other row over folded groups. */
function otherOf(key: string, folded: readonly Acc[], businessUnit: string | null): Acc {
  const other = merge(key, '', folded)
  other.label = otherLabel(other.folded)
  other.businessUnit = businessUnit
  return other
}

/* ───────── the model ───────── */

function param(metrics: BudgetInput['metrics'], id: string, key: string, fallback: number): number {
  if (!metrics?.paramDef(id, key)) return fallback
  const v = metrics.num(id, key)
  return Number.isFinite(v) ? v : fallback
}

/** The anonymity minimum in force (5 unless someone raised it). */
function minGroupIn(metrics: BudgetInput['metrics']): number {
  return param(metrics, ANONYMITY.metricId, ANONYMITY.key, MIN_GROUP)
}

/**
 * Actual against budget for the scope, or null when no budget is loaded (the caller falls back
 * to the hiring plan). See the module comment for every definition.
 */
export function computeBudget(input: BudgetInput, opts: BudgetOptions = {}): BudgetModel | null {
  if (!hasBudget(input.all)) return null
  const minGroup = minGroupIn(input.metrics)
  const bands: Bands = {
    headcount: param(input.metrics, BUDGET_METRICS.headcount, BUDGET_BAND.key, BUDGET_BAND.headcount),
    cost: param(input.metrics, BUDGET_METRICS.cost, BUDGET_BAND.key, BUDGET_BAND.cost),
  }
  const { versions, latest } = budgetVersions(input.all.budget)
  const version = opts.version !== undefined && opts.version !== null ? opts.version : latest
  const allLines = budgetLinesOf(input.all.budget, version)
  let lines = budgetLinesOf(input.data.budget, version)
  const months = [...new Set(allLines.map((l) => monthKey(l.period)))].sort()
  const month = comparedMonth(months, input.asOf)
  const date = month ? measuredAt(month, input.asOf) : null
  const hasCost = allLines.some((l) => l.budgetCost != null)
  const hasCostCenters = allLines.some((l) => !!l.costCenter)
  const counts = { notCosted: 0, noEstimate: 0, noRate: 0 }
  const base: BudgetModel = {
    version,
    versions,
    months,
    month,
    date,
    unavailable: null,
    total: null,
    byUnit: [],
    byCostCenter: [],
    byMonth: [],
    unitMonths: [],
    hasCost,
    hasCostCenters,
    notes: [],
    counts,
    minGroup,
    rounded: !!opts.round,
  }

  const scopedUnits = new Set(input.data.employees.map((e) => e.businessUnit))
  for (const l of lines) scopedUnits.add(l.businessUnit)
  const misfit = budgetFit(input.filters, allLines, scopedUnits)
  if (misfit) return { ...base, unavailable: misfit }
  if (!lines.length)
    return { ...base, unavailable: 'No budget line covers this scope, so there is nothing to compare.' }
  if (!month || !date)
    return {
      ...base,
      unavailable: `The budget starts in ${months[0] ? monthText(months[0]) : 'a later month'}, after the as-of date, so nothing has happened against it yet.`,
    }

  const rateOf = currencyRates(input.all.comp)
  const midpoint = midpointRates(input.all, input.asOf, minGroup)
  const compById = new Map(input.data.comp.map((c) => [c.employeeId, c]))
  // Pay is a snapshot: the run rate is measured in the month of the as-of date only.
  const costMeasured = month === monthKey(input.asOf)
  let roster = input.data.employees
  const small = opts.wholeUnits
    ? smallUnitsIn(lines, roster, compById, month, date, minGroup)
    : new Set<string>()
  if (small.size) {
    lines = lines.filter((l) => !small.has(l.businessUnit))
    roster = roster.filter((e) => !small.has(e.businessUnit))
  }

  /* The compared month: groups by business unit and cost center, and the total. */
  const total = newAcc('total', 'Total')
  const units = new Map<string, Acc>()
  const centers = new Map<string, Acc>()
  const unitAcc = (bu: string) => {
    let a = units.get(bu)
    if (!a) {
      a = newAcc(bu, bu, { businessUnit: bu })
      units.set(bu, a)
    }
    return a
  }
  // Keyed by unit and code, so the cost centers nest exactly inside the business units.
  const centerAcc = (cc: string | null, bu: string) => {
    const key = `${bu}:${cc ?? NO_COST_CENTER}`
    let a = centers.get(key)
    if (!a) {
      a = newAcc(key, cc ?? 'No cost center', { costCenter: cc, businessUnit: bu })
      centers.set(key, a)
    }
    return a
  }
  const addLine = (a: Acc, l: BudgetLine, usd: number | null) => {
    a.lines.push(l)
    a.budgetHeadcount += Number.isFinite(l.budgetHeadcount) ? l.budgetHeadcount : 0
    if (usd != null) {
      a.budgetCost += usd
      a.costLines++
    }
  }
  for (const l of lines) {
    if (monthKey(l.period) !== month) continue
    const rate = l.budgetCost == null ? null : rateOf(l.currency)
    if (l.budgetCost != null && rate == null) counts.noRate++
    const usd = l.budgetCost == null || rate == null ? null : l.budgetCost * rate
    addLine(total, l, usd)
    addLine(unitAcc(l.businessUnit), l, usd)
    if (l.costCenter) {
      const c = centerAcc(l.costCenter, l.businessUnit)
      if (!c.department && l.department) c.department = l.department
      addLine(c, l, usd)
    }
  }
  const budgetedCenters = new Set(lines.filter((l) => !!l.costCenter).map((l) => l.costCenter as string))
  const deptVotes = new Map<string, Map<string, number>>()
  for (const e of roster) {
    if (!isActiveAt(e, date)) continue
    const accs = [total, unitAcc(e.businessUnit)]
    if (hasCostCenters) accs.push(centerAcc(e.costCenter || null, e.businessUnit))
    if (e.costCenter) {
      const v = deptVotes.get(e.costCenter) ?? new Map<string, number>()
      v.set(e.department, (v.get(e.department) ?? 0) + 1)
      deptVotes.set(e.costCenter, v)
    }
    if (isEmployee(e)) {
      const c = compById.get(e.employeeId)
      const cash = c ? annualTargetCashUsd(c) : null
      for (const a of accs) {
        a.employees.push(e)
        if (cash != null) {
          a.costed++
          a.employeeCost += cash / 12
        }
      }
      if (cash == null) counts.notCosted++
    } else if (e.employmentType === 'Contractor') {
      const rate = midpoint(e.level, e.location)
      for (const a of accs) {
        a.contingent.push(e)
        if (rate != null) a.contractorCost += rate / 12
      }
      if (rate == null) counts.noEstimate++
    } else if (e.employmentType === 'Intern') for (const a of accs) a.interns++
  }
  for (const a of centers.values()) {
    if (a.department || !a.costCenter) continue
    const votes = deptVotes.get(a.costCenter)
    if (votes) a.department = [...votes].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]
  }

  const round = !!opts.round
  // Finance: the total adds each business unit's rounded cost (`rowOf`).
  const totalRow = rowOf(total, minGroup, bands, costMeasured, round, [...units.values()])
  const totalShown = !totalRow.hidden
  const unitGroups = [...units.values()].sort(
    (a, b) =>
      b.budgetHeadcount - a.budgetHeadcount ||
      b.employees.length - a.employees.length ||
      a.label.localeCompare(b.label),
  )
  // By whole units (Finance) every unit keeps its own row: a fold across units would change with the scope.
  const unitFold = opts.wholeUnits
    ? { shown: unitGroups, folded: [] as Acc[] }
    : foldGroups(unitGroups, guardSize, minGroup, totalShown)
  const row = (a: Acc) => rowOf(a, minGroup, bands, costMeasured, round)
  const byUnit = unitFold.shown.map(row)
  if (unitFold.folded.length) byUnit.push(row(otherOf(OTHER_KEY, unitFold.folded, null)))

  // Cost centers inside each shown unit, folded there (the unit's total is shown); the cost
  // centers of the units folded above make one Other, the same people as the units' Other.
  const byCostCenter: BudgetRow[] = []
  if (hasCostCenters) {
    // In the budget by code; then those it does not name; then no cost center.
    const rank = (x: Acc) => (!x.costCenter ? 2 : budgetedCenters.has(x.costCenter) ? 0 : 1)
    const centersOf = (bu: string) =>
      [...centers.values()]
        .filter((c) => c.businessUnit === bu)
        .sort(
          (a, b) =>
            rank(a) - rank(b) ||
            (a.costCenter ?? '').localeCompare(b.costCenter ?? '', 'en', { numeric: true }),
        )
    for (const u of unitFold.shown) {
      const fold = foldGroups(centersOf(u.key), guardSize, minGroup, true)
      byCostCenter.push(...fold.shown.map(row))
      if (fold.folded.length) byCostCenter.push(row(otherOf(`${OTHER_KEY}:${u.key}`, fold.folded, u.key)))
    }
    const rest = unitFold.folded.flatMap((u) => centersOf(u.key))
    if (rest.length) byCostCenter.push(row(otherOf(OTHER_KEY, rest, null)))
  }

  /* Every month: the scope's headcount against budget; cost in the compared month only. */
  const byMonth: BudgetMonthRow[] = []
  const unitMonths: BudgetUnitMonth[] = []
  const unitNames = [...units.keys()]
  for (const m of months) {
    const at = measuredAt(m, input.asOf)
    const monthLines = lines.filter((l) => monthKey(l.period) === m)
    const budgetHeadcount = monthLines.reduce(
      (s, l) => s + (Number.isFinite(l.budgetHeadcount) ? l.budgetHeadcount : 0),
      0,
    )
    const staff = at ? roster.filter((e) => isEmployee(e) && isActiveAt(e, at)) : []
    let costKnown = monthLines.length > 0
    let budgetCost = 0
    for (const l of monthLines) {
      const rate = l.budgetCost == null ? null : rateOf(l.currency)
      if (l.budgetCost == null || rate == null) costKnown = false
      else budgetCost += l.budgetCost * rate
    }
    const isCompared = m === month
    // The month's cost is over the scope's costed people (and its budgeted heads).
    const size = Math.min(isCompared ? total.costed : costedAt(staff, compById), budgetHeadcount)
    const budgetCostUsd = costKnown && size >= minGroup ? (round ? roundCost(budgetCost) : budgetCost) : null
    const costUsd = isCompared && costMeasured ? totalRow.costUsd : null
    const headcount = at ? staff.length : null
    byMonth.push({
      month: m,
      period: `${m}-01`,
      date: at,
      budgetHeadcount,
      headcount,
      headcountVariance: headcount == null ? null : headcount - budgetHeadcount,
      headcountVariancePct: pct(headcount, budgetHeadcount),
      headcountStatus: budgetStatus(headcount, budgetHeadcount, bands.headcount),
      budgetCostUsd,
      costUsd,
      costVarianceUsd: costUsd != null && budgetCostUsd != null ? costUsd - budgetCostUsd : null,
      costVariancePct: pct(costUsd, budgetCostUsd),
      costStatus: budgetStatus(costUsd, budgetCostUsd, bands.cost),
      employees: staff,
      lines: monthLines,
    })
    const unitBudget = new Map<string, number>()
    for (const l of monthLines)
      unitBudget.set(l.businessUnit, (unitBudget.get(l.businessUnit) ?? 0) + l.budgetHeadcount)
    const unitActual = new Map<string, number>()
    for (const e of staff) unitActual.set(e.businessUnit, (unitActual.get(e.businessUnit) ?? 0) + 1)
    for (const bu of unitNames) {
      const b = unitBudget.get(bu) ?? null
      const a = at ? (unitActual.get(bu) ?? 0) : null
      unitMonths.push({
        businessUnit: bu,
        month: m,
        budgetHeadcount: b,
        headcount: a,
        headcountVariance: a == null || b == null ? null : a - b,
        headcountStatus: budgetStatus(a, b, bands.headcount),
      })
    }
  }

  const notes: string[] = []
  if (small.size)
    notes.push(
      `${[...small].sort(byName).join(', ')} ${small.size === 1 ? 'has' : 'have'} fewer than ${minGroup.toLocaleString('en-US')} costed employees or budgeted heads, so ${small.size === 1 ? 'it is' : 'they are'} left out of the comparison in Finance mode.`,
    )
  if (!costMeasured) {
    const asOfMonth = monthKey(input.asOf)
    notes.push(
      months.some((m) => m > asOfMonth)
        ? `Cost is measured in the month of the as-of date only, and the budget has no line for ${monthText(asOfMonth)}.`
        : `Cost is measured in the month of the as-of date only; the budget ends in ${monthText(month)}, before it.`,
    )
  }
  if (counts.notCosted)
    notes.push(
      `${counts.notCosted.toLocaleString('en-US')} ${counts.notCosted === 1 ? 'employee has' : 'employees have'} no comp row or exchange rate and ${counts.notCosted === 1 ? 'is' : 'are'} left out of cost.`,
    )
  if (counts.noEstimate)
    notes.push(
      `${counts.noEstimate.toLocaleString('en-US')} ${counts.noEstimate === 1 ? 'contractor has' : 'contractors have'} no midpoint estimate (no level, or too few employees at it) and ${counts.noEstimate === 1 ? 'is' : 'are'} left out of cost.`,
    )
  if (counts.noRate)
    notes.push(
      `${counts.noRate.toLocaleString('en-US')} budget ${counts.noRate === 1 ? 'line is' : 'lines are'} in a currency with no exchange rate, so ${counts.noRate === 1 ? 'its' : 'their'} cost is not compared.`,
    )
  const unplaced = lines.filter((l) => monthKey(l.period) === month && !l.costCenter).length
  if (hasCostCenters && unplaced)
    notes.push(
      `${unplaced.toLocaleString('en-US')} budget ${unplaced === 1 ? 'line names' : 'lines name'} no cost center, so ${unplaced === 1 ? 'it counts' : 'they count'} in business unit totals only.`,
    )

  return {
    ...base,
    total: totalRow,
    byUnit,
    byCostCenter,
    byMonth,
    unitMonths,
    notes,
  }
}

/**
 * Business units under the minimum in the compared month: 1 to min - 1 costed employees, or 1 to
 * min - 1 budgeted heads (`BudgetOptions.wholeUnits`).
 */
export function smallUnitsIn(
  lines: readonly BudgetLine[],
  employees: readonly Employee[],
  compById: ReadonlyMap<string, CompRecord>,
  month: string,
  date: ISODate,
  minGroup: number,
): Set<string> {
  const costed = new Map<string, number>()
  for (const e of employees) {
    if (!isEmployee(e) || !isActiveAt(e, date)) continue
    const c = compById.get(e.employeeId)
    if (c && annualTargetCashUsd(c) != null) costed.set(e.businessUnit, (costed.get(e.businessUnit) ?? 0) + 1)
  }
  const heads = new Map<string, number>()
  for (const l of lines)
    if (monthKey(l.period) === month && Number.isFinite(l.budgetHeadcount))
      heads.set(l.businessUnit, (heads.get(l.businessUnit) ?? 0) + l.budgetHeadcount)
  const under = (n: number | undefined) => n != null && n > 0 && n < minGroup
  return new Set(
    [...costed.keys(), ...heads.keys()].filter((u) => under(costed.get(u)) || under(heads.get(u))),
  )
}

function costedAt(staff: readonly Employee[], compById: ReadonlyMap<string, CompRecord>): number {
  let n = 0
  for (const e of staff) {
    const c = compById.get(e.employeeId)
    if (c && annualTargetCashUsd(c) != null) n++
  }
  return n
}

/* ───────── data checks ───────── */

export interface BudgetIssue {
  kind: 'two-levels' | 'as-of-month' | 'no-rate'
  severity: 'warning' | 'info'
  text: string
  /** Indexes of the lines it is about. */
  rows: number[]
  /** What the lines are, for the records panel's title. */
  title: string
}

const levelOf = (l: BudgetLine): 'unit' | 'department' | 'center' =>
  l.costCenter ? 'center' : l.department ? 'department' : 'unit'

/**
 * Checks on loaded budget lines, for the Data room: lines at two levels for the same business
 * unit, department and month (a total and its parts, counted twice), no line for the month of the
 * as-of date, and costs in a currency with no exchange rate.
 */
export function budgetIssues(
  lines: readonly BudgetLine[],
  asOf: ISODate,
  comp: readonly CompRecord[] = [],
): BudgetIssue[] {
  const out: BudgetIssue[] = []
  if (!lines.length) return out
  const { latest } = budgetVersions(lines)
  const inVersion = (l: BudgetLine) => !latest || l.planVersion === latest

  // A unit line beside department or cost center lines, or a department line beside its cost centers.
  const groups = new Map<string, { levels: Set<string>; rows: number[]; depts: Map<string, Set<string>> }>()
  lines.forEach((l, i) => {
    if (!inVersion(l)) return
    const k = `${l.planVersion ?? ''}\u0001${monthKey(l.period)}\u0001${l.businessUnit}`
    let g = groups.get(k)
    if (!g) {
      g = { levels: new Set(), rows: [], depts: new Map() }
      groups.set(k, g)
    }
    g.levels.add(levelOf(l))
    g.rows.push(i)
    if (l.department) {
      const d = g.depts.get(l.department) ?? new Set<string>()
      d.add(levelOf(l))
      g.depts.set(l.department, d)
    }
  })
  const doubled: number[] = []
  let doubledGroups = 0
  for (const g of groups.values()) {
    const unitAndParts = g.levels.has('unit') && g.levels.size > 1
    const deptAndCenters = [...g.depts.values()].some((d) => d.has('department') && d.has('center'))
    if (unitAndParts || deptAndCenters) {
      doubledGroups++
      doubled.push(...g.rows)
    }
  }
  if (doubledGroups)
    out.push({
      kind: 'two-levels',
      severity: 'warning',
      text: `${doubledGroups.toLocaleString('en-US')} business unit ${doubledGroups === 1 ? 'month has' : 'months have'} lines at two levels, such as a business unit total beside its cost centers, so ${doubledGroups === 1 ? 'its' : 'their'} totals count the budget twice.`,
      rows: doubled.sort((a, b) => a - b),
      title: 'Budget lines at two levels for one business unit and month',
    })

  const months = [...new Set(lines.filter(inVersion).map((l) => monthKey(l.period)))].sort()
  const at = monthKey(asOf)
  if (months.length && at >= months[0] && at <= months[months.length - 1] && !months.includes(at)) {
    // The as-of month is inside the budget's span, so an earlier month always exists.
    const instead = comparedMonth(months, asOf) as string
    out.push({
      kind: 'as-of-month',
      severity: 'warning',
      text: `No budget line is for ${monthText(at)}, the month of the as-of date, so actual against budget compares ${monthText(instead)} instead.`,
      rows: [],
      title: 'Budget lines for the month of the as-of date',
    })
  }

  const rateOf = currencyRates(comp)
  const noRate: number[] = []
  const codes = new Set<string>()
  lines.forEach((l, i) => {
    if (l.budgetCost == null || rateOf(l.currency) != null) return
    noRate.push(i)
    codes.add(String(l.currency))
  })
  if (noRate.length)
    out.push({
      kind: 'no-rate',
      severity: 'warning',
      text: `${noRate.length.toLocaleString('en-US')} ${noRate.length === 1 ? 'line has' : 'lines have'} a cost in ${[...codes].sort().join(', ')}, which has no exchange rate, so ${noRate.length === 1 ? 'its' : 'their'} cost is not compared.`,
      rows: noRate,
      title: 'Budget lines in a currency with no exchange rate',
    })
  return out
}
