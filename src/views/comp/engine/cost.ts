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
 *  - Contractors and interns are counted beside the totals, never costed.
 *
 * The cost guard, in every mode:
 *  1. Minimum: a total, per-employee figure or share over fewer than the anonymity minimum (5) of
 *     costed people is null, the scope's own total included.
 *  2. No subtraction: in each breakdown, groups under the minimum fold into "Other (k)", and while
 *     Other is still under it and the total is shown, the smallest shown group joins, so no hidden
 *     group is ever the total minus the shown groups. Open reqs fold the same way by estimated
 *     openings, so no estimate gives away one range midpoint.
 *  3. Drills: in Finance (pay view 'totals') a total opens the people it counts as employees (ID,
 *     name, cost center, department, level, location, worker type, hire date), never comp rows;
 *     elsewhere it opens their comp rows, whose amounts follow "Show pay amounts". "Filter to" is
 *     set for business units in every mode, and for levels and sites outside Finance only.
 *  4. Tiles: a cost tile holds no amount unless cost totals may show (`ctx.showCost`).
 *
 * Actual against budget comes from `computeBudget` (`src/lib/budget.ts`), null when no budget is
 * loaded; the Workforce cost tab then compares hiring with the hiring plan instead.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { type Employee, type ISODate, LEVELS, type Requisition } from '@/data/schema'
import type { ListDimension } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { type BudgetModel, computeBudget, foldGroups, midpointRates } from '@/lib/budget'
import { formatDate } from '@/lib/dates'
import { DASH, fmt } from '@/lib/format'
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
  /** Active contractors and interns: counted beside the totals, never costed. */
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

function costRow(
  key: string,
  group: string,
  members: readonly CompPerson[],
  min: number,
  patch: Partial<CostRow> = {},
): CostRow {
  const people = members.length
  const hidden = people < min
  const base = sum(members.map((p) => p.baseUsd ?? 0))
  const bonus = sum(members.map((p) => (p.baseUsd ?? 0) * (p.targetBonusPct ?? 0)))
  const equity = sum(members.map((p) => p.equityUsd ?? 0))
  const cash = base + bonus
  return {
    key,
    group,
    isOther: false,
    folded: 0,
    people,
    baseUsd: hidden ? null : base,
    bonusUsd: hidden ? null : bonus,
    targetCashUsd: hidden ? null : cash,
    equityUsd: hidden ? null : equity,
    perHeadUsd: hidden || !people ? null : cash / people,
    share: null,
    hidden,
    noBonus: members.filter((p) => p.targetBonusPct == null).length,
    members: hidden ? [] : members.slice(),
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
    patch?: (members: readonly CompPerson[]) => Partial<CostRow>
  },
): CostRow[] {
  const groups = groupBy(costed, key, opts.noneLabel)
  const cash = new Map(groups.map((g) => [g, cashOf(g.rows)]))
  const rank = opts.order ? new Map(opts.order.map((k, i) => [k, i])) : null
  groups.sort((a, b) =>
    rank
      ? (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) ||
        (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999) ||
        a.label.localeCompare(b.label)
      : cash.get(b)! - cash.get(a)! || a.label.localeCompare(b.label),
  )
  const { shown, folded } = guardGroups(groups, opts.min, opts.totalShown, {
    top: opts.top,
    rank: (g) => cash.get(g) ?? 0,
  })
  const share = (r: CostRow): CostRow => ({
    ...r,
    share: r.targetCashUsd != null && opts.total ? r.targetCashUsd / opts.total : null,
  })
  const rows = shown.map((g) =>
    share(
      costRow(g.key, g.label, g.rows, opts.min, {
        ...(opts.dim && g.key !== NONE ? { dim: opts.dim } : {}),
        ...opts.patch?.(g.rows),
      }),
    ),
  )
  if (folded.length) {
    const members = folded.flatMap((g) => g.rows)
    rows.push(
      share(
        costRow(OTHER, otherLabel(folded.length), members, opts.min, {
          isOther: true,
          folded: folded.length,
          ...opts.patch?.(members),
        }),
      ),
    )
  }
  return rows
}

/** Merit spend by business unit in USD, under the guard (the Merit cycle tab's rows, folded). */
function meritRows(
  people: readonly CompPerson[],
  s: CycleSettings,
  min: number,
  totalShown: boolean,
): SpendRow[] {
  const eligible = people.filter((p) => p.merit != null)
  const groups = groupBy(eligible, (p) => p.businessUnit, 'No business unit')
  const priced = (g: Group<CompPerson>) => g.rows.filter(isCosted).length
  groups.sort((a, b) => priced(b) - priced(a) || a.label.localeCompare(b.label))
  // Folded by the proposals the USD totals are over.
  const { shown, folded } = foldGroups(groups, priced, min, totalShown)
  const row = (label: string, rows: readonly CompPerson[], dim: boolean): SpendRow => {
    const m = meritSpend(rows, s, min)
    const ok = m.priced >= min
    return {
      group: label,
      n: rows.length,
      spendPct: ok ? m.spendPct : null,
      budgetPct: s.meritBudget,
      delta: ok ? m.delta : null,
      eligibleBaseUsd: ok ? m.eligibleBaseUsd : null,
      spendUsd: ok ? m.spendUsd : null,
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
    estimateUsd: hidden ? null : usd,
    hidden,
    reqRows: reqs.slice(),
    ...patch,
  }
}

function openReqRows(
  ctx: CostInput['ctx'],
  asOf: ISODate,
  min: number,
): { total: OpenReqRow; rows: OpenReqRow[] } {
  const open = ctx.data.requisitions.filter((r) => r.status === 'Open')
  const midpoint = midpointRates(ctx.all, asOf, min)
  const rate = (r: Requisition) => midpoint(r.level, r.location)
  const total = reqRow('total', 'Total', open, rate, min)
  const groups = groupBy(open, (r) => r.businessUnit, 'No business unit')
  const estimatedOf = (g: Group<Requisition>) =>
    sum(g.rows.map((r) => (rate(r) == null ? 0 : Math.max(1, r.openings || 1))))
  groups.sort((a, b) => estimatedOf(b) - estimatedOf(a) || a.label.localeCompare(b.label))
  const { shown, folded } = foldGroups(groups, estimatedOf, min, !total.hidden)
  const rows = shown.map((g) =>
    reqRow(g.key, g.label, g.rows, rate, min, g.key === NONE ? {} : { dim: 'businessUnit' }),
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
    note: 'Counted beside the cost totals, never costed: Census has no contractor or intern pay.',
    uses: refs('employees.employmentType', 'employees.hireDate', 'employees.terminationDate'),
  })
}

/* ───────── tiles ───────── */

const money = (v: number | null) => fmt(v, 'money')
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
  const amount = (over: Partial<Kpi> & Pick<Kpi, 'id' | 'metricId' | 'label' | 'value'>): Kpi => ({
    format: 'money',
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
          : `USD a year, ${asOf}`),
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
      note: off ?? 'USD, full-time rate',
      definition: text(M.costBase),
      drill: drill('Annual base cost'),
    }),
    amount({
      id: 'cost-equity',
      metricId: M.costEquity,
      uses: refs(POPULATION, FX, 'comp.annualEquityUsd'),
      label: 'Annualized equity',
      value: gated(t.equityUsd),
      note: off ?? 'Annual grant value, USD',
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
      note: m.counts.noFx
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
      note: off ?? 'Target cash ÷ people costed',
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
      note: `${fmt(m.contingent.contractors.length, 'int')} contractors, ${fmt(m.contingent.interns.length, 'int')} interns · not costed`,
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
  const employees = new Map(ctx.data.employees.map((e) => [e.employeeId, e]))
  const costed = pop.people.filter(isCosted)
  const total = costRow('total', 'Total', costed, min)
  const totalShown = !total.hidden
  const centerOf = (p: CompPerson) => employees.get(p.id)?.costCenter ?? null
  const totalCash = total.targetCashUsd
  const byUnit = breakdown(costed, (p) => p.businessUnit, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No business unit',
    dim: 'businessUnit',
  })
  const byCostCenter = breakdown(costed, centerOf, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No cost center',
    top: TOP_CENTERS,
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
  })
  const bySite = breakdown(costed, (p) => p.location, {
    min,
    totalShown,
    total: totalCash,
    noneLabel: 'No location',
    dim: 'location',
    patch: (rows) => ({ businessUnit: null, department: majority(rows, (p) => p.department) }),
  })
  const meritTotal = meritSpend(pop.people, s, min)
  const merit = {
    total: meritTotal,
    rows: meritRows(pop.people, s, min, meritTotal.priced >= min),
  }
  const active = ctx.data.employees.filter((e) => isActiveAt(e, input.asOf))
  const contingent = {
    contractors: active.filter((e) => e.employmentType === 'Contractor'),
    interns: active.filter((e) => e.employmentType === 'Intern'),
  }
  const core: Omit<CostModel, 'kpis'> = {
    totals,
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
    openReqs: openReqRows(ctx, input.asOf, min),
    contingent,
    // Reads the on-budget bands (settings of the two budget metrics).
    budget: computeBudget(ctx),
    counts: {
      noFx: pop.noFx,
      noBonus: total.noBonus,
      missingComp: pop.missingComp,
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
    patch: (rows) => ({
      department: majority(rows, (p) => p.department),
      businessUnit: majority(rows, (p) => p.businessUnit),
    }),
  })
}

/** Rows a breakdown chart can draw: shown, with an amount. */
export const drawable = (rows: readonly CostRow[]): CostRow[] => rows.filter((r) => r.targetCashUsd != null)

/** "$19.8M": a cost in words for notes. */
export const costText = money

/**
 * Folder-tab headline in Finance: the scope's target cash cost (one pass over the comp rows),
 * "—" under the anonymity minimum or where cost totals may not show.
 */
export function costHeadline(ctx: AnalyticsContext): Headline {
  const pop = buildPopulation(
    { employees: ctx.data.employees, comp: ctx.data.comp, reviews: [], jobChanges: [] },
    ctx.asOf,
  )
  const costed = pop.people.filter(isCosted)
  const t = costRow('total', 'Total', costed, minGroupOf(ctx.metrics))
  return {
    value: ctx.showCost && t.targetCashUsd != null ? fmt(t.targetCashUsd, 'money') : DASH,
    label: 'target cash cost',
    metricId: M.costTargetCash,
    uses: refs(POPULATION, FX, 'comp.targetBonusPct'),
  }
}
