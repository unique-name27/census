/**
 * Finance's cost amounts cannot be differenced down to one person's pay (docs/ROLES-V2.md 3.2,
 * rule 8, and "Decisions made"). Folding by whole business units (`costUnions.test.ts`) stops one
 * breakdown from being subtracted across business unit filters; it cannot stop two breakdowns of
 * the same scope (level against site against cost center), merit spend against cost, or the same
 * scope at two dates from being combined. So in Finance every amount is rounded down to a whole
 * $100,000 in the engine, and this test plays the attacker on the sample:
 *
 *  - it gathers every amount Finance can see, as the exports write them (CSV, checked cell by cell
 *    against the clipboard, Excel and the slide text), with the people behind each (the drills
 *    list them): every set of business units, every period preset, and the company, each business
 *    unit and each "all but one unit" at twelve dates (as a monthly data refresh shows them);
 *  - for each kind of amount (base, bonus at target, target cash, equity, merit spend) it takes
 *    every difference of two amounts whose people differ by 1 to 4 (A minus B), every difference
 *    of three (A minus B minus C, with B and C inside A), and every swap (two amounts whose people
 *    differ by one each way), across breakdowns, scopes and dates; reads what each rounded amount
 *    says (`costRange`); lays every interval for the same people over each other; chains and halves
 *    the swaps against them; and uses target cash = base + bonus and "no amount is under 0";
 *  - it checks that no person's pay, nor any group of 2 to 4 people's, is ever pinned to an
 *    interval narrower than $100,000, so the best guess can always be $50,000 from the truth.
 *
 * The control runs the same attacks on exact amounts: they pin groups of 3 or 4 from the
 * breakdowns of one scope, and more than 100 people to the dollar across dates, so the test can
 * fail. The last case runs them on amounts rounded to the nearest $100,000 instead, which they pin
 * to $50,000: why the rounding is down (`src/lib/costRounding.ts`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type Datasets, type ISODate } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters, type PeriodPreset } from '@/data/scope'
import { annualTargetCashUsd } from '@/lib/budget'
import {
  addedSteps,
  COST_STEP,
  costRange,
  isRoundedCost,
  perHeadOfRounded,
  roundCost,
  UNDER_COST_STEP,
} from '@/lib/costRounding'
import { plainText } from '@/lib/export/columns'
import { toCsv } from '@/lib/export/csv'
import { excelValue } from '@/lib/export/xlsx'
import { type Format, fmt } from '@/lib/format'
import {
  BUDGET_CENTER_COLUMNS,
  BUDGET_COST_COLUMNS,
  COST_BY_CENTER_COLUMNS,
  COST_BY_LEVEL_COLUMNS,
  COST_BY_SITE_COLUMNS,
  COST_BY_UNIT_COLUMNS,
  SPEND_COLUMNS,
} from '../columns'
import { type CostModel, type CostRow, costColumnsFor, isCosted, topCostCenters } from './cost'
import { computeComp } from './model'
import type { CompPerson } from './population'

const FIELDS = ['base', 'bonus', 'cash', 'equity', 'merit'] as const
type Field = (typeof FIELDS)[number]
/** The widest group an attack tries to single out. */
const SMALL = 4

/* ───────── what the exports say ───────── */

/** One CSV line into cells (quotes doubled, fields quoted when needed). */
function csvCells(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** A money cell as the reader takes it: "under $0.1M" is 0 (0 to under $100,000), empty is none. */
function moneyOf(cell: string): number | null {
  if (cell === '' || cell === '—') return null
  if (cell === UNDER_COST_STEP) return 0
  const m = /^(−?)\$([\d,]+(?:\.\d)?)M$/.exec(cell)
  if (m) return (m[1] ? -1 : 1) * Math.round(Number(m[2].replace(/,/g, '')) * 1_000_000)
  const n = Number(cell)
  if (!Number.isFinite(n)) throw new Error(`Not an amount: ${cell}`)
  return n
}

/**
 * The money columns of rows as Finance exports them: CSV (the number), checked cell by cell
 * against the clipboard's text, the Excel cell and the slide's text, which must all say the same.
 */
function exported<T extends object>(
  rows: readonly T[],
  columns: readonly Column<T>[],
): Record<string, number | null>[] {
  const money = columns.filter((c) => c.cost && (c.format === 'moneyM' || c.format === 'money'))
  const table = { columns: columns as readonly Column[], rows: rows as unknown as Record<string, unknown>[] }
  const csv = toCsv(table, { showPay: false, showCost: true, bom: false }).split('\r\n').filter(Boolean)
  const head = csvCells(csv[0])
  return rows.map((row, i) => {
    const cells = csvCells(csv[i + 1])
    const out: Record<string, number | null> = {}
    for (const c of money) {
      const format = c.format as Format
      const v = (row as Record<string, unknown>)[c.key] as number | null
      const fromCsv = moneyOf(cells[head.indexOf(c.label)])
      out[c.key] = fromCsv
      if (c.key === 'perHeadUsd') continue
      // Every export says the same rounded amount, and nothing finer.
      expect(format, c.key).toBe('moneyM')
      expect(fromCsv, `${c.key} csv`).toBe(v == null ? null : v)
      expect(moneyOf(plainText(v, format)), `${c.key} clipboard`).toBe(fromCsv)
      const xl = excelValue(v, format)
      expect(xl == null ? null : typeof xl === 'string' ? moneyOf(xl) : xl, `${c.key} excel`).toBe(fromCsv)
      expect(moneyOf(fmt(v, format)), `${c.key} slide`).toBe(fromCsv)
      if (fromCsv != null) expect(isRoundedCost(fromCsv), `${c.key} ${fromCsv}`).toBe(true)
    }
    return out
  })
}

/* ───────── the observations ───────── */

type Family = 'scopes' | 'periods' | 'dates'

interface Observation {
  field: Field
  ids: readonly string[]
  /** Every set of business units at the as-of date, the period presets, or the twelve dates. */
  family: Family
  /** The scope and date the amount was read in. */
  scope: string
  /** The amount read from the export. */
  value: number
  /** 12 for a monthly amount (the budget's run rate), so the interval is in annual terms. */
  scale: number
  /**
   * How many parts were rounded down on their own and added (a business unit's share, or a group
   * folded into Other in a unit): the exact amount is under the shown one plus this many steps.
   */
  parts: number
  /** What adding the parts put on top (`sumRounded`: a step for every two parts). */
  added: number
  where: string
}

/** The exact amounts of each person (what the attacker is after), and the observations. */
interface Gathered {
  exact: Map<string, Record<Field, number>>
  obs: Observation[]
}

function exactOf(p: CompPerson): Record<Field, number> {
  const base = p.baseUsd ?? 0
  const bonus = base * (p.targetBonusPct ?? 0)
  return { base, bonus, cash: base + bonus, equity: p.equityUsd ?? 0, merit: base * (p.merit ?? 0) }
}

function gather(m: CostModel, where: string, family: Family, data: Datasets, into: Gathered): void {
  expect(m.rounded && m.shown, where).toBe(true)
  const remember = (people: readonly CompPerson[]) => {
    for (const p of people) {
      const x = exactOf(p)
      const had = into.exact.get(p.id)
      if (had) for (const f of FIELDS) expect(had[f], `${p.id} ${f}`).toBeCloseTo(x[f], 6)
      else into.exact.set(p.id, x)
    }
  }
  const add = (
    field: Field,
    ids: readonly string[],
    value: number | null,
    at: string,
    scale = 1,
    parts = 1,
    added = 0,
  ) => {
    if (value == null || !ids.length) return
    into.obs.push({ field, ids, value, scale, parts, added, family, scope: where, where: `${where}, ${at}` })
  }
  /** What `sumRounded` added over rounded parts, from the parts. */
  const addedOver = (parts: readonly (number | null | undefined)[]) =>
    addedSteps(parts.filter((v) => (v ?? 0) >= COST_STEP).length)
  const unitsIn = (units: readonly (string | null | undefined)[]) => new Set(units.map((u) => u || '')).size
  const costRows = <T extends CostRow>(name: string, rows: readonly T[], cols: readonly Column<T>[]) => {
    const out = exported(rows, costColumnsFor(cols, m))
    rows.forEach((r, i) => {
      if (r.targetCashUsd == null) return
      remember(r.members)
      const ids = r.members.map((p) => p.id)
      const e = out[i]
      // Each business unit's part of the row is rounded on its own, then added.
      expect(r.parts, `${where} ${name} ${r.group}`).toBeGreaterThanOrEqual(
        unitsIn(r.members.map((p) => p.businessUnit)),
      )
      const parts = r.parts ?? 1
      const up = r.added ?? { base: 0, bonus: 0, cash: 0, equity: 0 }
      add('base', ids, e.baseUsd, `${name} ${r.group}`, 1, parts, up.base)
      add('bonus', ids, e.bonusUsd, `${name} ${r.group}`, 1, parts, up.bonus)
      add('cash', ids, e.targetCashUsd, `${name} ${r.group}`, 1, parts, up.cash)
      add('equity', ids, e.equityUsd, `${name} ${r.group}`, 1, parts, up.equity)
      // Ratios built from cost say nothing the rounded amounts do not.
      expect(r.perHeadUsd, `${where} ${name} ${r.group}`).toBe(perHeadOfRounded(r.targetCashUsd, r.people))
      if (m.total.targetCashUsd)
        expect(r.share, `${where} ${name} ${r.group}`).toBe(r.targetCashUsd / m.total.targetCashUsd)
    })
  }
  costRows('total', [m.total], COST_BY_UNIT_COLUMNS)
  costRows('unit', m.byUnit, COST_BY_UNIT_COLUMNS)
  costRows(
    'cost center',
    m.byCostCenter.map((r) => ({ ...r, name: null })),
    COST_BY_CENTER_COLUMNS,
  )
  costRows(
    'cost center top 8',
    topCostCenters(m, 8).map((r) => ({ ...r, name: null })),
    COST_BY_CENTER_COLUMNS,
  )
  costRows('level', m.byLevel, COST_BY_LEVEL_COLUMNS)
  costRows('site', m.bySite, COST_BY_SITE_COLUMNS)
  // The key figures say the total's amounts.
  for (const [id, key] of [
    ['cost-target-cash', 'targetCashUsd'],
    ['cost-base', 'baseUsd'],
    ['cost-equity', 'equityUsd'],
  ] as const)
    expect(m.kpis.find((k) => k.id === id)?.value ?? null, `${where} ${id}`).toBe(m.total[key])

  // Merit spend by unit: eligible base and spend over the priced proposals.
  const merit = [{ ...m.merit.total, group: 'Total', n: m.merit.total.eligible }, ...m.merit.rows]
  const meritOut = exported(merit as typeof m.merit.rows, costColumnsFor(SPEND_COLUMNS, m))
  merit.forEach((r, i) => {
    if (r.spendUsd == null || r.eligibleBaseUsd == null) return
    const priced = r.members.filter(isCosted)
    remember(priced)
    const ids = priced.map((p) => p.id)
    const parts = unitsIn(priced.map((p) => p.businessUnit))
    // The total adds the units' rows (`sumRounded`).
    const total = i === 0 && parts > 1
    add(
      'base',
      ids,
      meritOut[i].eligibleBaseUsd,
      `merit ${r.group}`,
      1,
      parts,
      total ? addedOver(m.merit.rows.map((x) => x.eligibleBaseUsd)) : 0,
    )
    add(
      'merit',
      ids,
      meritOut[i].spendUsd,
      `merit ${r.group}`,
      1,
      parts,
      total ? addedOver(m.merit.rows.map((x) => x.spendUsd)) : 0,
    )
    // The percentage, the budget and the gap come from the rounded amounts.
    expect(r.spendPct, `${where} merit ${r.group}`).toBe(
      r.eligibleBaseUsd ? r.spendUsd / r.eligibleBaseUsd : null,
    )
    expect(r.overUsd, `${where} merit ${r.group}`).toBe(
      r.spendUsd - roundCost(r.eligibleBaseUsd * r.budgetPct),
    )
  })

  // Actual against budget: the employees' monthly run rate over the costed employees of each row.
  const b = m.budget
  if (b?.total && !b.unavailable) {
    expect(b.rounded, where).toBe(true)
    const comp = new Map(data.comp.map((c) => [c.employeeId, c]))
    const costedIds = (es: readonly { employeeId: string }[]) =>
      es
        .filter((e) => {
          const c = comp.get(e.employeeId)
          return !!c && annualTargetCashUsd(c) != null
        })
        .map((e) => e.employeeId)
    const rows = [b.total, ...b.byUnit, ...b.byCostCenter]
    const words = { headcountWord: null, costWord: null }
    exported(
      b.byUnit.map((r) => ({ ...r, ...words })),
      costColumnsFor(BUDGET_COST_COLUMNS, m),
    )
    exported(
      b.byCostCenter.map((r) => ({ ...r, ...words, name: null })),
      costColumnsFor(BUDGET_CENTER_COLUMNS, m),
    )
    for (const r of rows) {
      if (r.employeeCostUsd == null) continue
      expect(isRoundedCost(r.employeeCostUsd), `${where} budget ${r.label}`).toBe(true)
      const ids = costedIds(r.employees)
      const parts = unitsIn(r.employees.filter((e) => ids.includes(e.employeeId)).map((e) => e.businessUnit))
      const added = r === b.total ? addedOver(b.byUnit.map((u) => u.employeeCostUsd)) : 0
      add('cash', ids, r.employeeCostUsd, `budget ${r.label}`, 12, parts, added)
      // The variance and its percentage come from the rounded amounts.
      if (r.costUsd != null && r.budgetCostUsd != null) {
        expect(r.costVarianceUsd, `${where} budget ${r.label}`).toBe(r.costUsd - r.budgetCostUsd)
        if (r.budgetCostUsd) expect(r.costVariancePct).toBe(r.costVarianceUsd! / r.budgetCostUsd)
      }
    }
  }
}

/* ───────── the attack ───────── */

interface SetRec {
  idx: Int32Array
  bits: Uint32Array
  /** What each kind of amount says about the set's sum: [lo, hi). */
  bound: Partial<Record<Field, [number, number]>>
}

type Bounds = Map<string, Partial<Record<Field, [number, number]>>>

/**
 * Every 1 to 4 people a difference of two or three amounts singles out (A minus B, A minus B minus
 * C), and what it says; then swaps (two amounts whose people differ by one each way) chained and
 * halved against those, and target cash = base + bonus, laid over each other three times.
 */
function attack(
  sets: readonly SetRec[],
  people: number,
): { bounds: Bounds; pairs: number; triples: number; swaps: number } {
  const words = Math.ceil(people / 32)
  const has = (bits: Uint32Array, i: number) => (bits[i >>> 5] & (1 << (i & 31))) !== 0
  const inside = (b: SetRec, a: SetRec) => {
    for (const i of b.idx) if (!has(a.bits, i)) return false
    return true
  }
  const bounds: Bounds = new Map()
  let pairs = 0
  let triples = 0
  const note = (rest: number[], lo: number, hi: number, field: Field) => {
    const key = rest.join(',')
    let b = bounds.get(key)
    if (!b) {
      b = {}
      bounds.set(key, b)
    }
    const had = b[field]
    b[field] = had ? [Math.max(had[0], lo), Math.min(had[1], hi)] : [lo, hi]
  }
  const left = (a: SetRec, out: readonly SetRec[]) => {
    const rest: number[] = []
    for (const i of a.idx) if (!out.some((o) => has(o.bits, i))) rest.push(i)
    return rest
  }
  // Every set inside each set, by size.
  const bySize = [...sets].sort((x, y) => x.idx.length - y.idx.length)
  const within = new Map<SetRec, SetRec[]>()
  for (let j = 0; j < bySize.length; j++) {
    const a = bySize[j]
    const list: SetRec[] = []
    for (let k = 0; k < j; k++) {
      const b = bySize[k]
      if (b.idx.length < a.idx.length && inside(b, a)) list.push(b)
    }
    within.set(a, list)
  }
  for (const a of sets) {
    const list = within.get(a) ?? []
    const sized = new Map<number, SetRec[]>()
    for (const b of list) {
      const l = sized.get(b.idx.length)
      if (l) l.push(b)
      else sized.set(b.idx.length, [b])
    }
    for (const b of list) {
      // A minus B.
      const gap = a.idx.length - b.idx.length
      if (gap >= 1 && gap <= SMALL) {
        pairs++
        const rest = left(a, [b])
        for (const f of FIELDS) {
          const A = a.bound[f]
          const B = b.bound[f]
          if (A && B) note(rest, A[0] - B[1], A[1] - B[0], f)
        }
      }
      // A minus B minus C, with B and C inside A and apart.
      for (let k = 1; k <= SMALL; k++) {
        for (const c of sized.get(a.idx.length - b.idx.length - k) ?? []) {
          if (c === b || c.idx[0] < b.idx[0]) continue
          let apart = true
          for (let w = 0; w < words && apart; w++) if (b.bits[w] & c.bits[w]) apart = false
          if (!apart) continue
          triples++
          const rest = left(a, [b, c])
          for (const f of FIELDS) {
            const A = a.bound[f]
            const B = b.bound[f]
            const C = c.bound[f]
            if (A && B && C) note(rest, A[0] - B[1] - C[1], A[1] - B[0] - C[0], f)
          }
        }
      }
    }
  }
  // Swaps: two amounts over the same people but one each (A holds p, B holds q) give x_p − x_q.
  const swapped = new Map<string, Partial<Record<Field, Interval>>>()
  let swaps = 0
  const sameSize = new Map<number, SetRec[]>()
  for (const a of sets) {
    const l = sameSize.get(a.idx.length)
    if (l) l.push(a)
    else sameSize.set(a.idx.length, [a])
  }
  for (const list of sameSize.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const one = oneApart(list[i].idx, list[j].idx)
        if (!one) continue
        swaps++
        const [p, q] = one
        const key = `${p},${q}`
        const d = swapped.get(key) ?? {}
        for (const f of FIELDS) {
          const A = list[i].bound[f]
          const B = list[j].bound[f]
          if (A && B) d[f] = meet(d[f], [A[0] - B[1], A[1] - B[0]])
        }
        swapped.set(key, d)
      }
  const at = (key: string) => {
    let b = bounds.get(key)
    if (!b) {
      b = {}
      bounds.set(key, b)
    }
    return b
  }
  for (let round = 0; round < 3; round++) {
    // Chain and halve: x_p from x_q and x_p − x_q; x_p from (x_p + x_q) and (x_p − x_q) halved.
    for (const [key, d] of swapped) {
      const [p, q] = key.split(',').map(Number)
      const both = [p, q].sort((x, y) => x - y).join(',')
      for (const f of FIELDS) {
        const D = d[f]
        if (!D) continue
        const P = at(String(p))
        const Q = at(String(q))
        const S = bounds.get(both)?.[f]
        if (Q[f]) P[f] = meet(P[f], [Q[f]![0] + D[0], Q[f]![1] + D[1]])
        if (P[f]) Q[f] = meet(Q[f], [P[f]![0] - D[1], P[f]![1] - D[0]])
        if (S) {
          P[f] = meet(P[f], [(S[0] + D[0]) / 2, (S[1] + D[1]) / 2])
          Q[f] = meet(Q[f], [(S[0] - D[1]) / 2, (S[1] - D[0]) / 2])
        }
      }
    }
    // Target cash is base plus bonus: each narrows the others. No amount is under 0.
    for (const b of bounds.values()) {
      for (const f of FIELDS) if (b[f]) b[f] = meet(b[f], [0, Number.POSITIVE_INFINITY])
      if (b.base && b.bonus) b.cash = meet(b.cash, [b.base[0] + b.bonus[0], b.base[1] + b.bonus[1]])
      if (b.cash && b.bonus) b.base = meet(b.base, [b.cash[0] - b.bonus[1], b.cash[1] - b.bonus[0]])
      if (b.cash && b.base) b.bonus = meet(b.bonus, [b.cash[0] - b.base[1], b.cash[1] - b.base[0]])
    }
  }
  for (const [key, b] of bounds) if (!Object.keys(b).length) bounds.delete(key)
  return { bounds, pairs, triples, swaps }
}

type Interval = [number, number]

/** Two intervals laid over each other. */
const meet = (a: Interval | undefined, b: Interval): Interval =>
  a ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : b

/** The one person each of two sets of the same size holds that the other does not, else null. */
function oneApart(a: Int32Array, b: Int32Array): [number, number] | null {
  let i = 0
  let j = 0
  let p = -1
  let q = -1
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) {
      if (p >= 0) return null
      p = a[i++]
    } else if (i >= a.length || b[j] < a[i]) {
      if (q >= 0) return null
      q = b[j++]
    } else {
      i++
      j++
    }
  }
  return p >= 0 && q >= 0 ? [p, q] : null
}

/** The observations as sets, each with what every kind of amount says about its sum. */
function setsOf(
  obs: readonly Observation[],
  index: ReadonlyMap<string, number>,
  people: number,
  range: (o: Observation) => [number, number],
): SetRec[] {
  const words = Math.ceil(people / 32)
  const byKey = new Map<string, SetRec>()
  for (const o of obs) {
    const idx = Int32Array.from(o.ids.map((id) => index.get(id)!)).sort()
    const key = idx.join(',')
    let s = byKey.get(key)
    if (!s) {
      const bits = new Uint32Array(words)
      for (const i of idx) bits[i >>> 5] |= 1 << (i & 31)
      s = { idx, bits, bound: {} }
      byKey.set(key, s)
    }
    const [lo, hi] = range(o)
    const had = s.bound[o.field]
    s.bound[o.field] = had ? [Math.max(had[0], lo), Math.min(had[1], hi)] : [lo, hi]
  }
  return [...byKey.values()]
}

/* ───────── the sample ───────── */

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => mask & (1 << i)))
  return out
}

/** Month ends of the twelve months before the sample's as-of date. */
const MONTH_ENDS: ISODate[] = [
  '2025-10-31',
  '2025-11-30',
  '2025-12-31',
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
  '2026-09-15',
]
const PERIODS: PeriodPreset[] = ['t12m', 'ytd', 'lastQuarter', 't6m', 't3m']

/**
 * What a shown amount says about its exact sum, a year: at or above it, and under it plus one step
 * for each part rounded on its own (`costRange` for an amount of one part).
 */
function shownRange(o: Observation): Interval {
  const [lo, hi] = costRange(o.value)
  return [(lo - o.added) * o.scale, (hi - o.added + (o.parts - 1) * COST_STEP) * o.scale]
}

/** The rounding this test rejects, as the decision first put it: to the nearest $100,000. */
function nearestRange(exact: number, scale: number): Interval {
  const v = exact / scale
  const r = v < COST_STEP ? 0 : Math.round(v / COST_STEP) * COST_STEP
  const [lo, hi] =
    r === 0
      ? [0, COST_STEP]
      : r === COST_STEP
        ? [COST_STEP, COST_STEP * 1.5]
        : [r - COST_STEP / 2, r + COST_STEP / 2]
  return [lo * scale, hi * scale]
}

describe('Finance cost amounts, rounded down to $100,000, against differencing', () => {
  let data: Datasets
  let units: string[]
  const g: Gathered = { exact: new Map(), obs: [] }
  const families = { scopes: 0, periods: 0, dates: 0 }
  let ids: string[] = []
  let index = new Map<string, number>()

  /** The attack over some observations, each amount read through `range`. */
  const run = (obs: readonly Observation[], range: (o: Observation) => Interval) =>
    attack(setsOf(obs, index, ids.length, range), ids.length)
  /** The exact sum of an observation's people (what the amount was rounded from), a year. */
  const exactSum = (o: Observation) => o.ids.reduce((a, id) => a + g.exact.get(id)![o.field], 0)
  /** People an attack pins to under a dollar (target cash or base). */
  const recovered = (bounds: Bounds): string[] =>
    [...bounds]
      .filter(([key, b]) => !key.includes(',') && [b.cash, b.base].some((r) => r && r[1] - r[0] < 1))
      .map(([key]) => ids[Number(key)])
  /** The narrowest interval an attack leaves for anyone, checking that the truth is always inside. */
  function narrowest(bounds: Bounds) {
    let best = { width: Number.POSITIVE_INFINITY, who: '' }
    let singles = 0
    for (const [key, b] of bounds) {
      const who = key.split(',').map((i) => ids[Number(i)])
      if (who.length === 1) singles++
      for (const f of FIELDS) {
        const r = b[f]
        if (!r) continue
        const truth = who.reduce((a, id) => a + g.exact.get(id)![f], 0)
        // The attack is sound: the truth is always inside what it derives.
        expect(truth >= r[0] - 1e-6 && truth <= r[1] + 1e-6, `${who.join(' + ')} ${f}`).toBe(true)
        if (r[1] - r[0] < best.width) best = { width: r[1] - r[0], who: `${who.join(' + ')} (${f})` }
      }
    }
    return { ...best, singles }
  }

  beforeAll(() => {
    data = generateSample()
    units = [...new Set(data.employees.map((e) => e.businessUnit))].sort()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as never
    let quality: AnalyticsContext['quality'] | undefined
    const fin = (filters: Partial<Filters>, asOf: ISODate | null = null) => {
      const ctx = buildContext({
        data,
        sources,
        filters: { ...DEFAULT_FILTERS, ...filters },
        asOfOverride: asOf,
        showPay: false,
        access: { mode: 'finance' },
        ...(quality ? { quality } : {}),
      })
      quality ??= ctx.quality
      return computeComp(ctx).cost
    }
    // Every set of business units (Finance's filter), at the sample's as-of date.
    for (const bu of [[], ...subsets(units)]) {
      gather(fin({ businessUnit: bu }), bu.join(' + ') || 'company', 'scopes', data, g)
      families.scopes++
    }
    // Every period preset: cost is a snapshot at the as-of date, so they must say the same.
    for (const period of PERIODS) {
      gather(fin({ period }), `company, ${period}`, 'periods', data, g)
      families.periods++
    }
    // A monthly refresh: the company, each unit and each "all but one unit" at twelve dates.
    const scopes = [[], ...units.map((u) => [u]), ...units.map((u) => units.filter((x) => x !== u))]
    for (const asOf of MONTH_ENDS)
      for (const bu of scopes) {
        gather(fin({ businessUnit: bu }, asOf), `${bu.join(' + ') || 'company'} at ${asOf}`, 'dates', data, g)
        families.dates++
      }
    ids = [...g.exact.keys()].sort()
    index = new Map(ids.map((id, i) => [id, i]))
  }, 120_000)

  it('reads every scope, period and date, and only amounts on the $100,000 grid', () => {
    expect(units).toHaveLength(6)
    expect(families).toEqual({ scopes: 64, periods: 5, dates: 13 * MONTH_ENDS.length })
    expect(g.obs.length).toBeGreaterThan(10_000)
    expect(new Set(g.obs.map((o) => o.field))).toEqual(new Set(FIELDS))
    expect(SAMPLE_AS_OF).toBe('2026-09-30')
    // Each amount is its parts, each rounded down, added: the attacker reads each one right.
    for (const o of g.obs) {
      expect(isRoundedCost(o.value), o.where).toBe(true)
      const [lo, hi] = shownRange(o)
      const v = exactSum(o)
      expect(v >= lo - 1e-6 && v < hi + 1e-6, o.where).toBe(true)
    }
    // A scope of several business units says nothing more than its units do.
    expect(g.obs.some((o) => o.parts > 1)).toBe(true)
  })

  it('the period presets add nothing: cost is a snapshot at the as-of date', () => {
    const of = (p: PeriodPreset) =>
      g.obs
        .filter((o) => o.scope === `company, ${p}`)
        .map((o) => `${o.field}|${o.ids.length}|${o.value}`)
        .sort()
    const base = of('t12m')
    expect(base.length).toBeGreaterThan(50)
    for (const p of PERIODS) expect(of(p), p).toEqual(base)
  })

  it('no difference of two or three amounts pins anyone’s pay closer than $50,000 either side', () => {
    const res = run(g.obs, shownRange)
    // The attack finds real differences across breakdowns, scopes and dates.
    expect(res.pairs).toBeGreaterThan(1_000)
    expect(res.triples).toBeGreaterThan(1_000)
    const n = narrowest(res.bounds)
    expect(n.singles, 'differences that single out one person').toBeGreaterThan(100)
    // Never narrower than $100,000: the best guess can always be $50,000 from the truth.
    expect(n.width, n.who).toBeGreaterThanOrEqual(COST_STEP - 1e-6)
  })

  it('the control: the same attacks on exact amounts recover groups under 5 and people to the dollar', () => {
    const exact = (o: Observation): Interval => {
      const v = exactSum(o)
      return [v - 0.01, v + 0.01]
    }
    /** The groups of 1 to 4 people an attack pins to under a dollar, by their people. */
    const pinned = (bounds: Bounds) =>
      [...bounds].filter(([, b]) => FIELDS.some((f) => b[f] && b[f]![1] - b[f]![0] < 1)).map(([k]) => k)
    // Breakdowns of one scope against each other (level, site, cost center, unit, merit).
    const inScope = new Set<string>()
    for (const scope of new Set(g.obs.filter((o) => o.family === 'scopes').map((o) => o.scope)))
      for (const k of pinned(
        run(
          g.obs.filter((o) => o.scope === scope),
          exact,
        ).bounds,
      ))
        inScope.add(k)
    expect(inScope.size, 'groups under 5 from breakdowns of one scope').toBeGreaterThan(0)
    // The company alone, across dates: people who joined between two dates, to the dollar.
    const dates = recovered(
      run(
        g.obs.filter((o) => o.scope.startsWith('company at ')),
        exact,
      ).bounds,
    )
    expect(dates.length, 'people from the company across dates').toBeGreaterThan(50)
    // Everything together.
    expect(recovered(run(g.obs, exact).bounds).length, 'people from everything').toBeGreaterThan(100)
  })

  it('why down and not to the nearest: to the nearest $100,000, the same attacks pin some pay to $50,000', () => {
    const n = narrowest(run(g.obs, (o) => nearestRange(exactSum(o), o.scale)).bounds)
    expect(n.width, n.who).toBeLessThan(COST_STEP)
  })
})
