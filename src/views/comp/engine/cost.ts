/**
 * Workforce cost (Compensation > Workforce cost, docs/ROLES-V2.md 3.2): what the workforce costs
 * a year, as totals over groups, never one person's pay. Pure (no React).
 *
 * Definitions (metrics `comp.cost.*` in `../metrics.ts`):
 *  - People costed: active employees on the as-of date with a comp row and an exchange rate.
 *  - Annual base cost: Σ base salary × FX to USD (the full-time rate, a snapshot).
 *  - Target cash cost: Σ base × (1 + target bonus %) × FX; a missing target bonus counts as none.
 *  - Annualized equity: Σ annual equity (already USD).
 *  - Target cash per employee: target cash ÷ people costed.
 *  - Open reqs at range midpoint (an estimate): each opening of an open req at the median range
 *    midpoint in USD of active employees at its level and location (5 or more), else its level
 *    company-wide (5 or more), else no estimate (`midpointRates` in `src/lib/budget.ts`, the rule
 *    the budget's contractor estimate uses).
 *  - Merit spend against budget in USD, by business unit: the Merit cycle tab's spend (`meritSpend`).
 *  - Contractors and interns are counted beside the target cash totals, not in them. The budget
 *    comparison adds contractors at the range-midpoint estimate (`src/lib/budget.ts`); interns are
 *    never costed.
 *
 * The cost guard, in every mode:
 *  1. Minimum: a total, per-employee figure or share over fewer than the anonymity minimum (5) of
 *     costed people is null, the scope's own total included.
 *  2. No subtraction: in each breakdown, groups under the minimum fold into "Other (k)", and while
 *     Other is still under it and the total is shown, the smallest shown group joins, so no hidden
 *     group is ever the total minus the shown groups. Open reqs fold the same way by estimated
 *     openings, so no estimate gives away one range midpoint.
 *     In Finance (pay view 'totals') the scope is any set of whole business units, so this is
 *     done inside each unit instead (`foldByUnit`), and business units under the minimum are left
 *     out of every total (`wholeUnits`): two Finance scopes then never differ by fewer than the
 *     minimum in any row, Other and the total included.
 *  3. Drills: in Finance (pay view 'totals') a total opens the people it counts as employees (ID,
 *     name, cost center, department, level, location, worker type, hire date), never comp rows;
 *     elsewhere it opens their comp rows, whose amounts follow "Show pay amounts". "Filter to" is
 *     set for business units in every mode, and for levels and sites outside Finance only.
 *  4. Tiles: a cost tile holds no amount unless cost totals may show (`ctx.showCost`).
 *  5. Rounding: in Finance (pay view 'totals') every amount is rounded down to a whole $100,000
 *     here, before any screen, export or tool reads it (`src/lib/costRounding.ts`), and shares,
 *     merit spend against budget and target cash per employee are computed from the rounded
 *     amounts. Rows are ranked by the rounded amounts too. The rounding is done in each business
 *     unit (`roundedAmounts`): a row over several units adds each unit's part, rounded on its own,
 *     so a set of units says nothing its units do not. A breakdown of the same scope by another
 *     dimension, another set of units, or the same scope at another date, then never pins one
 *     person's pay closer than $50,000 either side (`costRounding.test.ts`, `costLp.test.ts`).
 *     Shown with `costFormat` ('moneyM').
 *
 * Actual against budget comes from `computeBudget` (`src/lib/budget.ts`), null when no budget is
 * loaded; the Workforce cost tab then compares hiring with the hiring plan instead.
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { type Employee, type ISODate, LEVELS, type Requisition } from '@/data/schema'
import type { ListDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { type BudgetModel, computeBudget, foldGroups, midpointRates } from '@/lib/budget'
import { addedSteps, COST_STEP, costIn, perHeadOfRounded, roundCost, sumRounded } from '@/lib/costRounding'
import { formatDate } from '@/lib/dates'
import { DASH, type Format, fmt } from '@/lib/format'
import { isActiveAt } from '@/lib/people'
import { minGroupOf } from '@/metrics/privacy'
import type { Headline } from '../../types'
import type { CompMetricId } from '../metrics'
import { M } from '../metrics'
import { meritSpend, type SpendRow, type SpendSummary } from './cycle'
import { metricText } from './definitions'
import { HIDE_REWARDS, lazyDrill, peopleDrill, scopeLine, X_BONUS_TARGET } from './drill'
import { tagKpis } from './drillUses'
import type { GroupDim } from './groupFilter'
import { FX, POPULATION, refs } from './lineage'
import { buildPopulation, type CompPerson, type Population } from './population'
import type { CompRules } from './rules'
import type { CycleSettings } from './settings'
import { shownGap } from './text'

/** One group's cost, or the scope's total. USD a year; null when hidden or not computable. */
export interface CostRow extends GroupDim {
  /** Unique in its breakdown: the group's value, `__none` for no value, `__other` for Other. */
  key: string
  /** What the reader sees: "Silicon Engineering", "CC-4100", "Other (12)". */
  group: string
  isOther: boolean
  /** Groups folded into this row (Other only). */
  folded: number
  /** People costed in the group. */
  people: number
  baseUsd: number | null
  /** Target bonus at target: base × target bonus %. */
  bonusUsd: number | null
  targetCashUsd: number | null
  equityUsd: number | null
  perHeadUsd: number | null
  /** Share of the scope's target cash cost; null when either is hidden. */
  share: number | null
  /** Under the anonymity minimum: every amount, the per-employee figure and the share are null. */
  hidden: boolean
  /** People in the group with no target bonus (counted at none). */
  noBonus: number
  /** Cost center rows: the department most of its people are in. */
  department?: string | null
  /** Cost center and site rows: the business unit most of the people are in. */
  businessUnit?: string | null
  /** The costed people behind the row (empty when hidden): what a drill lists. */
  members: CompPerson[]
  /**
   * Finance: how many parts were each rounded down and then added (a business unit's share of the
   * row, or one group folded into Other in a unit), and what the adding put on top of each amount
   * (`sumRounded`: a step for every two parts). The exact amount is at or above the shown one less
   * `added`, and under that plus `parts` steps. Absent where amounts are exact.
   */
  parts?: number
  added?: { base: number; bonus: number; cash: number; equity: number }
}

/** Open reqs at range midpoint for one business unit, or the scope. */
export interface OpenReqRow extends GroupDim {
  key: string
  group: string
  isOther: boolean
  folded: number
  /** Open reqs. */
  reqs: number
  /** Openings on them (a req with no openings counts as one). */
  openings: number
  /** Openings with a midpoint estimate. */
  estimated: number
  /** Openings with no estimate: no level, or too few employees at it. */
  noEstimate: number
  /** The estimate, USD a year; null when fewer than the minimum openings are estimated. */
  estimateUsd: number | null
  hidden: boolean
  /** The open reqs behind the row (every one, estimated or not). */
  reqRows: Requisition[]
}

export interface CostModel {
  /** Finance mode: drills list employees, never comp rows, and Filter to is for business units only. */
  totals: boolean
  /**
   * Finance (pay view 'totals'): every amount in the model is rounded down to a whole $100,000
   * (`src/lib/costRounding.ts`) and reads in millions (`costFormat`).
   */
  rounded: boolean
  /** Cost totals may show here (`ctx.showCost`). */
  shown: boolean
  asOf: ISODate
  scopeLabel: string
  minGroup: number
  total: CostRow
  byUnit: CostRow[]
  /** Every cost center under the guard (top 12 by target cash, then Other). */
  byCostCenter: CostRow[]
  /** In `LEVELS` order; employees with no level last. */
  byLevel: CostRow[]
  bySite: CostRow[]
  merit: { total: SpendSummary; rows: SpendRow[] }
  openReqs: { total: OpenReqRow; rows: OpenReqRow[] }
  /** Active contractors and interns: counted beside the target cash totals, not in them. */
  contingent: { contractors: Employee[]; interns: Employee[] }
  /** Actual against the headcount and cost budget; null when no budget is loaded. */
  budget: BudgetModel | null
  counts: {
    /** Active employees with a comp row and no exchange rate: left out of every total. */
    noFx: number
    /** Costed people with no target bonus: counted at none. */
    noBonus: number
    /** Active employees with no comp row. */
    missingComp: number
    /** Finance: costed people in business units under the minimum, left out of every total. */
    smallUnits: number
  }
  kpis: Kpi[]
  /** The roster row of a costed person, for employee drills. */
  employeeOf: (id: string) => Employee | undefined
}

/** The input the model reads: the analytics context and the comp model's core. */
export interface CostInput {
  ctx: Pick<AnalyticsContext, 'asOf' | 'filters' | 'data' | 'all' | 'metrics' | 'showCost' | 'access'>
  pop: Population
  rules: CompRules
  settings: CycleSettings
  scopeLabel: string
  asOf: ISODate
}

export const OTHER = '__other'
export const NONE = '__none'
/** How many cost centers the Workforce cost chart and table name before Other. */
export const TOP_CENTERS = 12

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Costed: an exchange rate, so every amount converts to USD. */
export const isCosted = (p: CompPerson): boolean => p.baseUsd != null

interface Amounts {
  base: number
  bonus: number
  cash: number
  equity: number
}

function amountsOf(members: readonly CompPerson[]): Amounts {
  const base = sum(members.map((p) => p.baseUsd ?? 0))
  const bonus = sum(members.map((p) => (p.baseUsd ?? 0) * (p.targetBonusPct ?? 0)))
  return { base, bonus, cash: base + bonus, equity: sum(members.map((p) => p.equityUsd ?? 0)) }
}

/**
 * Finance's amounts for a row: its people split into parts (`partOf`: by default each business
 * unit's share), each part's amounts rounded down on their own, then added (`sumRounded`, which
 * adds a step for every two parts so the total does not read low). A part is what the same row
 * shows for that unit alone (or one group folded into Other there), so a scope of several business
 * units shows nothing that its units, each on its own, do not. Rounding a sum over several units in
 * one step would give each set of units its own rounding, and laid over each other (63 sets of the
 * sample's 6 units) those pin each unit's total, and so one hire's pay, to well under $100,000
 * (`costLp.test.ts`). `added` is what `sumRounded` added to each amount.
 */
export function roundedAmounts(
  members: readonly CompPerson[],
  partOf: (p: CompPerson) => string = unitOf,
): Amounts & { parts: number; added: Amounts } {
  const parts = new Map<string, CompPerson[]>()
  for (const p of members) {
    const k = partOf(p)
    const list = parts.get(k)
    if (list) list.push(p)
    else parts.set(k, [p])
  }
  const each: Record<keyof Amounts, number[]> = { base: [], bonus: [], cash: [], equity: [] }
  for (const list of parts.values()) {
    const a = amountsOf(list)
    for (const f of AMOUNT_KEYS) each[f].push(roundCost(a[f]))
  }
  const out = { base: 0, bonus: 0, cash: 0, equity: 0, parts: parts.size }
  const added = { base: 0, bonus: 0, cash: 0, equity: 0 }
  for (const f of AMOUNT_KEYS) {
    out[f] = sumRounded(each[f])
    added[f] = addedSteps(each[f].filter((v) => v >= COST_STEP).length)
  }
  return { ...out, added }
}

const AMOUNT_KEYS = ['base', 'bonus', 'cash', 'equity'] as const

function costRow(
  key: string,
  group: string,
  members: readonly CompPerson[],
  min: number,
  patch: Partial<CostRow> = {},
  round = false,
  partOf?: (p: CompPerson) => string,
): CostRow {
  const people = members.length
  const hidden = people < min
  const exact = amountsOf(members)
  // Finance: each business unit's part rounded on its own, then added; per employee from the
  // rounded target cash.
  const r = round ? roundedAmounts(members, partOf) : null
  const shown = r ?? exact
  return {
    key,
    group,
    isOther: false,
    folded: 0,
    people,
    baseUsd: hidden ? null : shown.base,
    bonusUsd: hidden ? null : shown.bonus,
    targetCashUsd: hidden ? null : shown.cash,
    equityUsd: hidden ? null : shown.equity,
    perHeadUsd: hidden || !people ? null : r ? perHeadOfRounded(r.cash, people) : exact.cash / people,
    share: null,
    hidden,
    noBonus: members.filter((p) => p.targetBonusPct == null).length,
    members: hidden ? [] : members.slice(),
    ...(r && !hidden ? { parts: r.parts, added: r.added } : {}),
    ...patch,
  }
}

/** "Other (12)". */
export const otherLabel = (k: number): string => `Other (${k})`

interface Group<T> {
  key: string
  label: string
  rows: T[]
}

/**
 * The guarded breakdown: groups under the minimum fold into Other; with `top`, only that many of
 * the rest are named (largest by `rank` first); while Other is under the minimum and the total is
 * shown, the smallest named group joins it (`foldGroups`).
 */
export function guardGroups<T>(
  groups: readonly Group<T>[],
  min: number,
  totalShown: boolean,
  opts: { top?: number; rank?: (g: Group<T>) => number } = {},
): { shown: Group<T>[]; folded: Group<T>[] } {
  const size = (g: Group<T>) => g.rows.length
  const { shown, folded } = foldGroups(groups, size, min, totalShown)
  if (opts.top != null && shown.length > opts.top) {
    const rank = opts.rank ?? size
    const order = shown.slice().sort((a, b) => rank(b) - rank(a) || a.label.localeCompare(b.label))
    const keep = new Set(order.slice(0, opts.top))
    const named = shown.filter((g) => keep.has(g))
    const rest = shown.filter((g) => !keep.has(g))
    return { shown: named, folded: [...folded, ...rest] }
  }
  return { shown, folded }
}

function groupBy<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  noneLabel: string,
): Group<T>[] {
  const map = new Map<string, Group<T>>()
  for (const r of rows) {
    const k = key(r)
    const id = k == null || k === '' ? NONE : k
    let g = map.get(id)
    if (!g) {
      g = { key: id, label: id === NONE ? noneLabel : id, rows: [] }
      map.set(id, g)
    }
    g.rows.push(r)
  }
  return [...map.values()]
}

/** The majority value of a field among a group's people (ties alphabetical). */
function majority<T>(rows: readonly T[], f: (r: T) => string | null | undefined): string | null {
  const n = new Map<string, number>()
  for (const r of rows) {
    const v = f(r)
    if (v) n.set(v, (n.get(v) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

const cashOf = (rows: readonly CompPerson[]) =>
  sum(rows.map((p) => (p.baseUsd ?? 0) * (1 + (p.targetBonusPct ?? 0))))

/** The business unit a costed person counts in, for Finance's folding by unit. */
export const unitOf = (p: Pick<CompPerson, 'businessUnit'>): string => p.businessUnit || NONE

/**
 * Finance: the people of business units with the minimum or more (`kept`) and of the smaller ones
 * (`left`, out of every total). A scope with a small unit and one without it would otherwise
 * differ by that unit's few people.
 */
export function wholeUnits<T>(
  people: readonly T[],
  unit: (p: T) => string,
  min: number,
): { kept: T[]; left: T[] } {
  const n = new Map<string, number>()
  for (const p of people) n.set(unit(p), (n.get(unit(p)) ?? 0) + 1)
  const kept: T[] = []
  const left: T[] = []
  for (const p of people) ((n.get(unit(p)) ?? 0) >= min ? kept : left).push(p)
  return { kept, left }
}

/**
 * Finance's breakdowns (docs/ROLES-V2.md 3.2, rules 2 and 3 together). Finance's scopes differ by
 * whole business units, so a breakdown folds inside each unit, never across the scope: in each
 * unit, groups under the minimum go to that unit's Other, and while that Other is under it the
 * unit's smallest shown group joins it (`foldGroups`). A row holds its group's shown parts in every
 * unit of the scope, and Other every unit's Other. Each part is the same in every scope that holds
 * its unit, so two scopes never differ by fewer than the minimum in any row, Other included.
 */
export function foldByUnit<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  unit: (r: T) => string,
  noneLabel: string,
  min: number,
): { groups: Group<T>[]; other: T[]; otherKeys: Set<string> } {
  const byUnit = new Map<string, T[]>()
  for (const r of rows) {
    const u = unit(r)
    const list = byUnit.get(u)
    if (list) list.push(r)
    else byUnit.set(u, [r])
  }
  const merged = new Map<string, Group<T>>()
  const other: T[] = []
  const otherKeys = new Set<string>()
  for (const members of byUnit.values()) {
    const { shown, folded } = foldGroups(groupBy(members, key, noneLabel), (g) => g.rows.length, min, true)
    for (const g of shown) {
      const m = merged.get(g.key)
      if (m) m.rows.push(...g.rows)
      else merged.set(g.key, { key: g.key, label: g.label, rows: g.rows.slice() })
    }
    for (const g of folded) {
      other.push(...g.rows)
      otherKeys.add(g.key)
    }
  }
  return { groups: [...merged.values()], other, otherKeys }
}

/** One breakdown of the costed people under the guard, Other last. */
function breakdown(
  costed: readonly CompPerson[],
  key: (p: CompPerson) => string | null | undefined,
  opts: {
    min: number
    totalShown: boolean
    total: number | null
    noneLabel: string
    dim?: ListDimension
    order?: readonly string[]
    top?: number
    /** Finance (pay view 'totals'): fold inside each business unit (`foldByUnit`). */
    byUnit?: boolean
    /** Finance: round every amount (`costRow`), and rank by the rounded target cash. */
    round?: boolean
    patch?: (members: readonly CompPerson[]) => Partial<CostRow>
  },
): CostRow[] {
  const cells = opts.byUnit ? foldByUnit(costed, key, unitOf, opts.noneLabel, opts.min) : null
  const groups = cells ? cells.groups : groupBy(costed, key, opts.noneLabel)
  // Ranked by what the reader sees: an order by exact amounts would compare two rounded ones.
  const cash = new Map(groups.map((g) => [g, opts.round ? roundedAmounts(g.rows).cash : cashOf(g.rows)]))
  const rank = opts.order ? new Map(opts.order.map((k, i) => [k, i])) : null
  groups.sort((a, b) =>
    rank
      ? (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) ||
        (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999) ||
        a.label.localeCompare(b.label)
      : cash.get(b)! - cash.get(a)! || a.label.localeCompare(b.label),
  )
  // By unit, every group is already made of parts of the minimum or more: only `top` names fewer.
  const { shown, folded } = cells
    ? guardGroups(groups, 0, false, { top: opts.top, rank: (g) => cash.get(g) ?? 0 })
    : guardGroups(groups, opts.min, opts.totalShown, { top: opts.top, rank: (g) => cash.get(g) ?? 0 })
  const share = (r: CostRow): CostRow => ({
    ...r,
    share: r.targetCashUsd != null && opts.total ? r.targetCashUsd / opts.total : null,
  })
  const rows = shown.map((g) =>
    share(
      costRow(
        g.key,
        g.label,
        g.rows,
        opts.min,
        {
          ...(opts.dim && g.key !== NONE ? { dim: opts.dim } : {}),
          ...opts.patch?.(g.rows),
        },
        opts.round,
      ),
    ),
  )
  const members = [...(cells?.other ?? []), ...folded.flatMap((g) => g.rows)]
  if (members.length) {
    const k = new Set([...(cells?.otherKeys ?? []), ...folded.map((g) => g.key)]).size
    // Finance: Other's parts are each unit's own Other and each group left out of the named rows
    // in each unit, every one rounded on its own, so Other says nothing those parts do not.
    const partKey = new Map<CompPerson, string>()
    for (const p of cells?.other ?? []) partKey.set(p, `${unitOf(p)}|${OTHER}`)
    for (const g of folded) for (const p of g.rows) partKey.set(p, `${unitOf(p)}|${g.key}`)
    rows.push(
      share(
        costRow(
          OTHER,
          otherLabel(k),
          members,
          opts.min,
          {
            isOther: true,
            folded: k,
            ...opts.patch?.(members),
          },
          opts.round,
          (p) => partKey.get(p) ?? unitOf(p),
        ),
      ),
    )
  }
  return rows
}

/**
 * Finance: merit spend with its USD amounts rounded, and the spend percentage, the budget and the
 * gap computed from the rounded amounts (the guideline percentage, weighted by pay, is left out).
 */
export function roundSpend(m: SpendSummary): SpendSummary {
  const base = roundCost(m.eligibleBaseUsd)
  const spend = roundCost(m.spendUsd)
  const budgetUsd = roundCost(base * m.budgetPct)
  const spendPct = base > 0 ? spend / base : null
  return {
    ...m,
    eligibleBaseUsd: base,
    spendUsd: spend,
    budgetUsd,
    spendPct,
    delta: spendPct == null ? null : shownGap(spendPct, m.budgetPct),
    overUsd: base > 0 ? spend - budgetUsd : null,
    guidelinePct: null,
  }
}

/**
 * Finance: merit spend over several business units from each unit's rounded amounts, added
 * (`sumRounded`, as `roundedAmounts` does for cost), with the percentage, the budget and the gap
 * from those.
 */
export function roundSpendByUnit(
  total: SpendSummary,
  people: readonly CompPerson[],
  s: CycleSettings,
  min: number,
): SpendSummary {
  const units = groupBy(people, unitOf, 'No business unit').map((g) => roundSpend(meritSpend(g.rows, s, min)))
  const base = sumRounded(units.map((r) => r.eligibleBaseUsd))
  const spend = sumRounded(units.map((r) => r.spendUsd))
  const budgetUsd = roundCost(base * total.budgetPct)
  const spendPct = base > 0 ? spend / base : null
  return {
    ...total,
    eligibleBaseUsd: base,
    spendUsd: spend,
    budgetUsd,
    spendPct,
    delta: spendPct == null ? null : shownGap(spendPct, total.budgetPct),
    overUsd: base > 0 ? spend - budgetUsd : null,
    guidelinePct: null,
  }
}

/** Merit spend by business unit in USD, under the guard (the Merit cycle tab's rows, folded). */
function meritRows(
  people: readonly CompPerson[],
  s: CycleSettings,
  min: number,
  totalShown: boolean,
  round: boolean,
): SpendRow[] {
  const eligible = people.filter((p) => p.merit != null)
  const groups = groupBy(eligible, (p) => p.businessUnit, 'No business unit')
  const priced = (g: Group<CompPerson>) => g.rows.filter(isCosted).length
  groups.sort((a, b) => priced(b) - priced(a) || a.label.localeCompare(b.label))
  // Folded by the proposals the USD totals are over.
  const { shown, folded } = foldGroups(groups, priced, min, totalShown)
  const row = (label: string, rows: readonly CompPerson[], dim: boolean): SpendRow => {
    const exact = meritSpend(rows, s, min)
    const m = round ? roundSpend(exact) : exact
    const ok = m.priced >= min
    return {
      group: label,
      n: rows.length,
      spendPct: ok ? m.spendPct : null,
      budgetPct: s.meritBudget,
      delta: ok ? m.delta : null,
      eligibleBaseUsd: ok ? m.eligibleBaseUsd : null,
      spendUsd: ok ? m.spendUsd : null,
      budgetUsd: ok ? m.budgetUsd : null,
      overUsd: ok ? m.overUsd : null,
      members: ok ? rows.slice() : [],
      ...(dim ? { dim: 'businessUnit' as const } : {}),
    }
  }
  const out = shown.map((g) => row(g.label, g.rows, g.key !== NONE))
  if (folded.length)
    out.push(
      row(
        otherLabel(folded.length),
        folded.flatMap((g) => g.rows),
        false,
      ),
    )
  return out
}

function reqRow(
  key: string,
  group: string,
  reqs: readonly Requisition[],
  rate: (r: Requisition) => number | null,
  min: number,
  patch: Partial<OpenReqRow> = {},
  round = false,
): OpenReqRow {
  let openings = 0
  let estimated = 0
  let usd = 0
  for (const r of reqs) {
    const n = Math.max(1, r.openings || 1)
    openings += n
    const v = rate(r)
    if (v == null) continue
    estimated += n
    usd += v * n
  }
  const hidden = estimated < min
  return {
    key,
    group,
    isOther: false,
    folded: 0,
    reqs: reqs.length,
    openings,
    estimated,
    noEstimate: openings - estimated,
    estimateUsd: hidden ? null : costIn(usd, round),
    hidden,
    reqRows: reqs.slice(),
    ...patch,
  }
}

function openReqRows(
  ctx: CostInput['ctx'],
  asOf: ISODate,
  min: number,
  round: boolean,
): { total: OpenReqRow; rows: OpenReqRow[] } {
  const open = ctx.data.requisitions.filter((r) => r.status === 'Open')
  const midpoint = midpointRates(ctx.all, asOf, min)
  const rate = (r: Requisition) => midpoint(r.level, r.location)
  const total = reqRow('total', 'Total', open, rate, min, {}, round)
  const groups = groupBy(open, (r) => r.businessUnit, 'No business unit')
  const estimatedOf = (g: Group<Requisition>) =>
    sum(g.rows.map((r) => (rate(r) == null ? 0 : Math.max(1, r.openings || 1))))
  groups.sort((a, b) => estimatedOf(b) - estimatedOf(a) || a.label.localeCompare(b.label))
  const { shown, folded } = foldGroups(groups, estimatedOf, min, !total.hidden)
  const rows = shown.map((g) =>
    reqRow(g.key, g.label, g.rows, rate, min, g.key === NONE ? {} : { dim: 'businessUnit' }, round),
  )
  if (folded.length)
    rows.push(
      reqRow(
        OTHER,
        otherLabel(folded.length),
        folded.flatMap((g) => g.rows),
        rate,
        min,
        { isOther: true, folded: folded.length },
        round,
      ),
    )
  return { total, rows }
}

/* ───────── drills ───────── */

/** The roster columns an employee drill of cost leaves out: they say nothing about active people's cost. */
const COST_EMPLOYEE_HIDE = [
  'directReports',
  'orgSize',
  'tenure',
  'terminationDate',
  'terminationType',
  'terminationReason',
  'regrettable',
  'status',
  'manager',
]

export interface CostDrillScope {
  totals: boolean
  scopeLabel: string
  asOf: ISODate
  employeeOf: (id: string) => Employee | undefined
}

/**
 * The people a cost total counts: their comp rows (amounts follow the switch), or in Finance their
 * roster rows with the cost center and no amount. Null when nobody is behind the number.
 */
export function costPeopleDrill(
  m: CostDrillScope,
  title: string,
  people: readonly CompPerson[],
  opts: { note?: string; filter?: DrillSpec['filter'] } = {},
): DrillSpec | null {
  if (!people.length) return null
  const byName = (a: CompPerson, b: CompPerson) =>
    a.department.localeCompare(b.department) || a.name.localeCompare(b.name)
  if (m.totals) {
    const rows = people
      .slice()
      .sort(byName)
      .map((p) => m.employeeOf(p.id))
      .filter((e): e is Employee => !!e)
    const spec = drillSpec({
      kind: 'employees',
      title,
      subtitle: scopeLine(m),
      rows,
      hide: COST_EMPLOYEE_HIDE,
      // The employee kind lists the cost center itself; nothing here holds an amount.
      note: opts.note ?? 'Cost totals cover groups of 5 or more people. Individual pay is left out.',
      uses: refs(POPULATION, FX, 'employees.costCenter'),
    })
    return opts.filter ? { ...spec, filter: opts.filter } : spec
  }
  const spec = peopleDrill({
    title,
    subtitle: scopeLine(m),
    people,
    extras: [X_BONUS_TARGET],
    hide: HIDE_REWARDS,
    sort: byName,
    note: opts.note,
  })
  return spec && opts.filter ? { ...spec, filter: opts.filter } : spec
}

/** "Filter to" for a breakdown row: business units in every mode, levels and sites outside Finance. */
export function costRowFilter(m: Pick<CostModel, 'totals'>, row: Pick<CostRow, 'dim' | 'key' | 'isOther'>) {
  if (!row.dim || row.isOther || row.key === NONE) return undefined
  if (m.totals && row.dim !== 'businessUnit') return undefined
  return groupFilter(row.dim, row.key)
}

/** The people behind a breakdown row. */
export function costRowDrill(m: CostModel, row: CostRow, what = 'Workforce cost'): DrillSpec | null {
  return costPeopleDrill(m, `${what}, ${row.group}`, row.members, { filter: costRowFilter(m, row) })
}

/** The open reqs behind a row of open reqs at range midpoint. */
export function openReqDrill(
  m: Pick<CostModel, 'scopeLabel' | 'asOf'>,
  row: OpenReqRow,
): DrillSpec<'requisitions'> | null {
  if (!row.reqRows.length) return null
  const spec = drillSpec({
    kind: 'requisitions',
    title: row.key === 'total' ? 'Open reqs' : `Open reqs, ${row.group}`,
    subtitle: scopeLine(m),
    rows: row.reqRows.slice().sort((a, b) => a.openedDate.localeCompare(b.openedDate)),
    note:
      row.noEstimate > 0
        ? `${fmt(row.noEstimate, 'int')} ${row.noEstimate === 1 ? 'opening has' : 'openings have'} no midpoint estimate (no level, or fewer than 5 employees at it).`
        : 'Each opening is estimated at the median range midpoint of employees at its level and location.',
    uses: refs('requisitions.status', 'requisitions.level', 'requisitions.location', 'requisitions.openings'),
  })
  return row.dim && !row.isOther && row.key !== NONE
    ? { ...spec, filter: groupFilter(row.dim, row.key) }
    : spec
}

/** The contractors and interns counted beside the totals. */
export function contingentDrill(
  m: Pick<CostModel, 'scopeLabel' | 'asOf' | 'contingent'>,
): DrillSpec<'employees'> | null {
  const rows = [...m.contingent.contractors, ...m.contingent.interns]
  if (!rows.length) return null
  return drillSpec({
    kind: 'employees',
    title: 'Contractors and interns',
    subtitle: scopeLine(m),
    rows: rows
      .slice()
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
    hide: COST_EMPLOYEE_HIDE,
    note: 'Counted beside the target cash totals, not in them: Census has no pay records for contractors or interns. Against the budget, contractors are estimated at the range midpoint of their level and location; interns are never costed.',
    uses: refs('employees.employmentType', 'employees.hireDate', 'employees.terminationDate'),
  })
}

/* ───────── tiles ───────── */

/** The format of a cost amount: millions to one decimal where it is rounded (Finance), else compact. */
export const costFormat = (m: Partial<Pick<CostModel, 'rounded'>>): Format => (m.rounded ? 'moneyM' : 'money')

/** A cost amount in words: "$19.8M"; "$12.3M" or "under $0.1M" where it is rounded. */
export const costMoney = (m: Partial<Pick<CostModel, 'rounded'>>, v: number | null): string =>
  fmt(v, costFormat(m))

/**
 * Cost columns as the model reads: where amounts are rounded (Finance), every money column marked
 * `cost: true` reads in millions ('moneyM'), and target cash per employee in thousands ('money').
 */
export function costColumnsFor<T>(
  cols: readonly Column<T>[],
  m: Partial<Pick<CostModel, 'rounded'>>,
): Column<T>[] {
  if (!m.rounded) return cols.slice()
  return cols.map((c) =>
    c.cost && (c.format === 'money' || c.format === 'moneyFull')
      ? { ...c, format: c.key === 'perHeadUsd' ? ('money' as const) : ('moneyM' as const) }
      : c,
  )
}

/**
 * "Other (80 cost centers): $141.2M": the folded cost centers the chart leaves to the table. A cost
 * total, so null while cost totals may not show (`m.shown`), like every tile and chart.
 */
export function otherCentersNote(
  m: Pick<CostModel, 'shown'> & Partial<Pick<CostModel, 'rounded'>>,
  rows: readonly CostRow[],
): string | null {
  if (!m.shown) return null
  const other = rows.find((r) => r.isOther && r.targetCashUsd != null)
  return other
    ? `Other (${fmt(other.folded, 'int')} cost centers): ${costMoney(m, other.targetCashUsd)}`
    : null
}
const count = (n: number, one: string, many: string) => `${fmt(n, 'int')} ${n === 1 ? one : many}`

function costKpis(m: Omit<CostModel, 'kpis'>, text: (id: CompMetricId) => string): Kpi[] {
  const t = m.total
  const shown = m.shown
  const hidden = t.hidden && t.people > 0
  const gated = (v: number | null) => (shown ? v : null)
  const off = shown ? undefined : 'Turn on Show pay amounts to see cost totals.'
  const people = t.members
  const asOf = `as of ${formatDate(m.asOf)}`
  const drill = (title: string, note?: string) =>
    shown && !t.hidden ? lazyDrill(people.length, () => costPeopleDrill(m, title, people, { note })) : null
  const noBonus = m.counts.noBonus
  const contingent = m.contingent.contractors.length + m.contingent.interns.length
  const costUses = refs(POPULATION, FX)
  // Finance: amounts in millions, rounded to $0.1M in each business unit, and the notes say so.
  const rounded = m.rounded ? ', rounded to $0.1M in each business unit' : ''
  const amount = (over: Partial<Kpi> & Pick<Kpi, 'id' | 'metricId' | 'label' | 'value'>): Kpi => ({
    format: costFormat(m),
    goodDirection: null,
    suppressed: hidden,
    ...over,
  })
  return tagKpis([
    amount({
      id: 'cost-target-cash',
      metricId: M.costTargetCash,
      uses: refs(costUses, 'comp.targetBonusPct'),
      label: 'Target cash cost',
      value: gated(t.targetCashUsd),
      note:
        off ??
        (noBonus
          ? `${count(noBonus, 'person', 'people')} without a target bonus at none`
          : `USD a year${rounded}, ${asOf}`),
      definition: text(M.costTargetCash),
      drill: drill(
        'Target cash cost',
        noBonus
          ? `${count(noBonus, 'person has', 'people have')} no target bonus, counted at none.`
          : undefined,
      ),
    }),
    amount({
      id: 'cost-base',
      metricId: M.costBase,
      uses: costUses,
      label: 'Annual base cost',
      value: gated(t.baseUsd),
      note: off ?? `USD, full-time rate${rounded}`,
      definition: text(M.costBase),
      drill: drill('Annual base cost'),
    }),
    amount({
      id: 'cost-equity',
      metricId: M.costEquity,
      uses: refs(POPULATION, FX, 'comp.annualEquityUsd'),
      label: 'Annualized equity',
      value: gated(t.equityUsd),
      note: off ?? `Annual grant value, USD${rounded}`,
      definition: text(M.costEquity),
      drill: drill('Annualized equity'),
    }),
    {
      id: 'cost-people',
      metricId: M.costPeople,
      uses: costUses,
      label: 'People costed',
      value: t.people,
      format: 'int',
      goodDirection: null,
      note: m.counts.smallUnits
        ? `${count(m.counts.smallUnits, 'person', 'people')} in business units under ${fmt(m.minGroup, 'int')} left out`
        : m.counts.noFx
          ? `${count(m.counts.noFx, 'person', 'people')} without an exchange rate left out`
          : asOf,
      definition: text(M.costPeople),
      // Who is counted is not an amount: the list opens wherever the tab shows.
      drill: t.hidden ? null : lazyDrill(people.length, () => costPeopleDrill(m, 'People costed', people)),
    },
    amount({
      id: 'cost-per-head',
      metricId: M.costPerHead,
      uses: refs(costUses, 'comp.targetBonusPct'),
      label: 'Target cash per employee',
      value: gated(t.perHeadUsd),
      // From the rounded target cash in Finance, to the nearest $1,000.
      format: 'money',
      note: off ?? (m.rounded ? 'Rounded target cash ÷ people costed' : 'Target cash ÷ people costed'),
      definition: text(M.costPerHead),
      drill: drill('Target cash per employee'),
    }),
    {
      id: 'cost-contingent',
      metricId: 'hrbp.workforce.contingent',
      uses: refs('employees.employmentType', 'employees.hireDate', 'employees.terminationDate'),
      label: 'Contractors and interns',
      value: contingent,
      format: 'int',
      goodDirection: null,
      note: `${fmt(m.contingent.contractors.length, 'int')} contractors, ${fmt(m.contingent.interns.length, 'int')} interns · not in target cash cost`,
      drill: lazyDrill(contingent, () => contingentDrill(m)),
    },
  ])
}

/* ───────── the model ───────── */

/**
 * Workforce cost for the scope. Cost totals are computed in every mode under the guard; the tab,
 * the tiles and every export show them only while `ctx.showCost`.
 */
export function computeCost(input: CostInput): CostModel {
  const { ctx, pop, rules, settings: s } = input
  const min = rules.minGroup
  const totals = ctx.access.pay === 'totals'
  // Finance rounds every amount (`src/lib/costRounding.ts`); the switch modes keep them exact.
  const round = totals
  const employees = new Map(ctx.data.employees.map((e) => [e.employeeId, e]))
  // Finance: only business units of the minimum or more count (`wholeUnits`).
  const split = totals
    ? wholeUnits(pop.people.filter(isCosted), unitOf, min)
    : { kept: pop.people.filter(isCosted), left: [] }
  const costed = split.kept
  const total = costRow('total', 'Total', costed, min, {}, round)
  const totalShown = !total.hidden
  const centerOf = (p: CompPerson) => employees.get(p.id)?.costCenter ?? null
  const totalCash = total.targetCashUsd
  const byUnit = breakdown(costed, (p) => p.businessUnit, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No business unit',
    dim: 'businessUnit',
    byUnit: totals,
    round,
  })
  const byCostCenter = breakdown(costed, centerOf, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No cost center',
    top: TOP_CENTERS,
    byUnit: totals,
    round,
    patch: (rows) => ({
      department: majority(rows, (p) => p.department),
      businessUnit: majority(rows, (p) => p.businessUnit),
    }),
  })
  const byLevel = breakdown(costed, (p) => p.level, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No level',
    dim: 'level',
    order: LEVELS,
    byUnit: totals,
    round,
  })
  const bySite = breakdown(costed, (p) => p.location, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No location',
    dim: 'location',
    byUnit: totals,
    round,
    patch: (rows) => ({ businessUnit: null, department: majority(rows, (p) => p.department) }),
  })
  // Finance: merit spend over the business units with the minimum of priced proposals or more.
  const meritPeople = totals
    ? wholeUnits(
        pop.people.filter((p) => p.merit != null && isCosted(p)),
        unitOf,
        min,
      ).kept
    : pop.people
  const meritExact = meritSpend(meritPeople, s, min)
  const meritTotal = round ? roundSpendByUnit(meritExact, meritPeople, s, min) : meritExact
  const merit = {
    total: meritTotal,
    rows: meritRows(meritPeople, s, min, meritTotal.priced >= min, round),
  }
  const active = ctx.data.employees.filter((e) => isActiveAt(e, input.asOf))
  const contingent = {
    contractors: active.filter((e) => e.employmentType === 'Contractor'),
    interns: active.filter((e) => e.employmentType === 'Intern'),
  }
  const core: Omit<CostModel, 'kpis'> = {
    totals,
    rounded: round,
    shown: ctx.showCost,
    asOf: input.asOf,
    scopeLabel: input.scopeLabel,
    minGroup: min,
    total: { ...total, share: totalShown ? 1 : null },
    byUnit,
    byCostCenter,
    byLevel,
    bySite,
    merit,
    openReqs: openReqRows(ctx, input.asOf, min, round),
    contingent,
    // Reads the on-budget bands (settings of the two budget metrics); Finance by whole units, rounded.
    budget: computeBudget(ctx, { wholeUnits: totals, round }),
    counts: {
      noFx: pop.noFx,
      noBonus: total.noBonus,
      missingComp: pop.missingComp,
      smallUnits: split.left.length,
    },
    employeeOf: (id) => employees.get(id),
  }
  return { ...core, kpis: costKpis(core, (id) => metricText(ctx.metrics, rules, id)) }
}

/** The named cost centers (top `n` by target cash) and one Other, for a shorter list (Finance's home: 8). */
export function topCostCenters(m: CostModel, n: number): CostRow[] {
  const centerOf = (p: CompPerson) => m.employeeOf(p.id)?.costCenter ?? null
  // The total's members are every costed person (none when the total is hidden).
  return breakdown(m.total.members, centerOf, {
    min: m.minGroup,
    totalShown: !m.total.hidden,
    total: m.total.targetCashUsd,
    noneLabel: 'No cost center',
    top: n,
    byUnit: m.totals,
    round: m.rounded,
    patch: (rows) => ({
      department: majority(rows, (p) => p.department),
      businessUnit: majority(rows, (p) => p.businessUnit),
    }),
  })
}

/** Rows a breakdown chart can draw: shown, with an amount. */
export const drawable = (rows: readonly CostRow[]): CostRow[] => rows.filter((r) => r.targetCashUsd != null)

/** "$19.8M": an exact cost in words for notes (`costMoney` follows the model's rounding). */
export const costText = (v: number | null): string => fmt(v, 'money')

/**
 * Folder-tab headline in Finance: the scope's target cash cost (one pass over the comp rows),
 * "—" under the anonymity minimum or where cost totals may not show.
 */
export function costHeadline(ctx: AnalyticsContext): Headline {
  const pop = buildPopulation(
    { employees: ctx.data.employees, comp: ctx.data.comp, reviews: [], jobChanges: [] },
    ctx.asOf,
  )
  const min = minGroupOf(ctx.metrics)
  const all = pop.people.filter(isCosted)
  // Finance: business units of the minimum or more only, rounded, as on the Workforce cost tab.
  const totals = ctx.access.pay === 'totals'
  const costed = totals ? wholeUnits(all, unitOf, min).kept : all
  const t = costRow('total', 'Total', costed, min, {}, totals)
  return {
    value: ctx.showCost && t.targetCashUsd != null ? fmt(t.targetCashUsd, totals ? 'moneyM' : 'money') : DASH,
    label: 'target cash cost',
    metricId: M.costTargetCash,
    uses: refs(POPULATION, FX, 'comp.targetBonusPct'),
  }
}
