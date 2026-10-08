/**
 * Finance's rounded cost against an attacker who solves every amount at once as a linear program
 * (docs/ROLES-V2.md 3.2, rule 8, and "Decisions made"). `costRounding.test.ts` takes differences
 * of two or three amounts and swaps; this one lays every amount over each other in one linear
 * program, which can combine halves, thirds and so on of many amounts.
 *
 *  - Every set of business units: Finance's business unit filter takes any of the 63 sets of the
 *    sample's 6 units. When a set's total was rounded in one step, the 63 totals at one date, solved
 *    together, pinned each unit's total to $17,000 to $67,000, and the difference of two month ends
 *    pinned every hire in between closer than $100,000 (the control below). So in Finance a row over
 *    several units adds each unit's part, rounded on its own (`roundedAmounts`): a set of units
 *    then says nothing its units, each on its own, do not, and the same program pins nobody.
 *  - Every breakdown of one unit (level, site, cost center, the top 8, merit spend and the budget's
 *    run rate) at two month ends, solved together over the people they share: no hire is pinned
 *    closer than $50,000 either side either.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type Datasets, type ISODate } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { annualTargetCashUsd } from '@/lib/budget'
import { addedSteps, COST_STEP, roundCost, sumRounded } from '@/lib/costRounding'
import { type CostModel, costHeadline, isCosted, topCostCenters } from './cost'
import { boundsFromSums } from './lp.testkit'
import { computeComp } from './model'
import type { CompPerson } from './population'

const S = COST_STEP
const FIELDS = ['cash', 'base', 'bonus', 'equity'] as const
type Field = (typeof FIELDS)[number]
type Amounts = Record<Field, number>

/** Month ends of the twelve months before the sample's as-of date, and the as-of date. */
const DATES: ISODate[] = [
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
  SAMPLE_AS_OF,
]

const exactOf = (p: CompPerson): Amounts => {
  const base = p.baseUsd ?? 0
  const bonus = base * (p.targetBonusPct ?? 0)
  return { base, bonus, cash: base + bonus, equity: p.equityUsd ?? 0 }
}

/** One amount Finance shows, with the people behind it: the exact sum is in [lo, hi), a year. */
interface Obs {
  ids: readonly string[]
  field: Field
  lo: number
  hi: number
}

/** Every amount one unit's Workforce cost shows (its breakdowns, merit spend and the budget). */
function observe(m: CostModel, data: Datasets): Obs[] {
  const out: Obs[] = []
  // One unit: each amount is one part rounded down, or Other's parts (its own Other and the cost
  // centers left out of the named rows), each rounded down and added.
  const add = (
    ids: readonly string[],
    field: Field,
    v: number | null | undefined,
    scale = 1,
    parts = 1,
    added = 0,
  ) => {
    if (v != null && ids.length)
      out.push({ ids, field, lo: (v - added) * scale, hi: (v - added + parts * S) * scale })
  }
  for (const list of [[m.total], m.byUnit, m.byCostCenter, topCostCenters(m, 8), m.byLevel, m.bySite])
    for (const r of list) {
      if (r.targetCashUsd == null) continue
      const parts = r.parts ?? 0
      if (!r.isOther) expect(parts, r.group).toBe(1)
      const ids = r.members.map((p) => p.id)
      const up = r.added ?? { base: 0, bonus: 0, cash: 0, equity: 0 }
      add(ids, 'cash', r.targetCashUsd, 1, parts, up.cash)
      add(ids, 'base', r.baseUsd, 1, parts, up.base)
      add(ids, 'bonus', r.bonusUsd, 1, parts, up.bonus)
      add(ids, 'equity', r.equityUsd, 1, parts, up.equity)
    }
  for (const r of [m.merit.total, ...m.merit.rows])
    add(
      r.members.filter(isCosted).map((p) => p.id),
      'base',
      r.eligibleBaseUsd,
    )
  const b = m.budget
  if (b?.total && !b.unavailable) {
    const comp = new Map(data.comp.map((c) => [c.employeeId, c]))
    for (const r of [b.total, ...b.byUnit, ...b.byCostCenter]) {
      const ids = r.employees
        .filter((e) => {
          const c = comp.get(e.employeeId)
          return !!c && annualTargetCashUsd(c) != null
        })
        .map((e) => e.employeeId)
      add(ids, 'cash', r.employeeCostUsd, 12)
    }
  }
  return out
}

/** Bounds on the sum of `target` over the observations: one linear program over the people's groups. */
function attack(obs: readonly Obs[], target: ReadonlySet<string>, field: Field): [number, number] {
  const mine = obs.filter((o) => o.field === field)
  // People held by exactly the same amounts (and on the same side of the target) are one unknown.
  const held = new Map<string, number[]>()
  mine.forEach((o, i) => {
    for (const id of o.ids) held.set(id, [...(held.get(id) ?? []), i])
  })
  const groups = new Map<string, number>()
  const groupOf = new Map<string, number>()
  for (const [id, by] of held) {
    const key = `${target.has(id)}|${by.join(',')}`
    if (!groups.has(key)) groups.set(key, groups.size)
    groupOf.set(id, groups.get(key)!)
  }
  for (const id of target) expect(groupOf.has(id), id).toBe(true)
  const sums = mine.map((o) => ({
    set: [...new Set(o.ids.map((id) => groupOf.get(id)!))],
    lo: o.lo / S,
    hi: o.hi / S,
  }))
  const [lo, hi] = boundsFromSums(groups.size, sums, [...new Set([...target].map((id) => groupOf.get(id)!))])
  return [lo * S, hi * S]
}

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => mask & (1 << i)))
  return out
}

/** The rows of a breakdown by key, as amounts. */
const rowsOf = (
  list: readonly {
    key: string
    targetCashUsd: number | null
    baseUsd: number | null
    bonusUsd: number | null
    equityUsd: number | null
  }[],
) =>
  new Map(
    list
      .filter((r) => r.targetCashUsd != null)
      .map((r) => [
        r.key,
        { cash: r.targetCashUsd!, base: r.baseUsd!, bonus: r.bonusUsd!, equity: r.equityUsd! },
      ]),
  )

interface Seen {
  total: Amounts
  level: Map<string, Amounts>
  site: Map<string, Amounts>
  merit: { base: number; spend: number }
  budget: number | null
  headline: string
}

describe('Finance cost amounts against one linear program over everything Finance sees', () => {
  let data: Datasets
  let units: string[]
  /** What each set of units shows at each date ("date|unit + unit"). */
  const seen = new Map<string, Seen>()
  /** Each unit's own amounts, its people and their exact amounts, by date. */
  const unit = new Map<string, { obs: Obs[]; ids: Set<string> }>()
  const exact = new Map<string, Amounts>()
  const key = (d: ISODate, set: readonly string[]) => `${d}|${set.join(' + ')}`

  beforeAll(() => {
    data = generateSample()
    units = [...new Set(data.employees.map((e) => e.businessUnit))].sort()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as never
    let quality: AnalyticsContext['quality'] | undefined
    const context = (filters: Partial<Filters>, asOf: ISODate) => {
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
      return ctx
    }
    for (const d of DATES)
      for (const set of subsets(units)) {
        const ctx = context({ businessUnit: set }, d)
        const m = computeComp(ctx).cost
        expect(m.rounded && m.shown).toBe(true)
        const t = m.total
        seen.set(key(d, set), {
          total: { cash: t.targetCashUsd!, base: t.baseUsd!, bonus: t.bonusUsd!, equity: t.equityUsd! },
          level: rowsOf(m.byLevel),
          site: rowsOf(m.bySite),
          merit: { base: m.merit.total.eligibleBaseUsd, spend: m.merit.total.spendUsd },
          budget: m.budget?.total?.employeeCostUsd ?? null,
          headline: costHeadline(ctx).value,
        })
        if (set.length === 1) {
          for (const p of t.members) exact.set(p.id, exactOf(p))
          unit.set(key(d, set), { obs: observe(m, data), ids: new Set(t.members.map((p) => p.id)) })
        }
      }
  }, 300_000)

  it('a set of business units shows the sum of what each of its units shows', () => {
    expect(units).toHaveLength(6)
    let multi = 0
    for (const d of DATES)
      for (const set of subsets(units)) {
        const s = seen.get(key(d, set))!
        const parts = set.map((u) => seen.get(key(d, [u]))!)
        // Each unit's amount, added with a step for every two (`sumRounded`).
        const add = (f: (x: Seen) => number) => sumRounded(parts.map(f))
        for (const f of FIELDS) expect(s.total[f], `${d} ${set} ${f}`).toBe(add((x) => x.total[f]))
        for (const [by, rows] of [
          ['level', s.level],
          ['site', s.site],
        ] as const)
          for (const [k, r] of rows)
            for (const f of FIELDS)
              expect(r[f], `${d} ${set} ${by} ${k} ${f}`).toBe(add((x) => x[by].get(k)?.[f] ?? 0))
        expect(s.merit.base).toBe(add((x) => x.merit.base))
        expect(s.merit.spend).toBe(add((x) => x.merit.spend))
        if (s.budget != null) expect(s.budget, `${d} ${set} budget`).toBe(add((x) => x.budget ?? 0))
        // The folder headline is the tab's total.
        expect(s.headline).toBe(`$${(s.total.cash / 1_000_000).toFixed(1)}M`)
        if (set.length > 1) multi++
      }
    expect(multi).toBe(57 * DATES.length)
  })

  /** Bounds on each unit's total at each date, from the 63 sets' totals solved together. */
  function unitBounds(reading: (d: ISODate, set: readonly string[], f: Field) => [number, number]) {
    const out = new Map<string, Record<Field, [number, number]>>()
    for (const d of DATES) {
      const sets = subsets(units)
      for (const f of FIELDS) {
        const sums = sets.map((set) => {
          const [lo, hi] = reading(d, set, f)
          return { set: set.map((u) => units.indexOf(u)), lo: lo / S, hi: hi / S }
        })
        units.forEach((u, i) => {
          const [lo, hi] = boundsFromSums(units.length, sums, [i])
          const b = out.get(key(d, [u])) ?? ({} as Record<Field, [number, number]>)
          b[f] = [lo * S, hi * S]
          out.set(key(d, [u]), b)
        })
      }
    }
    return out
  }

  /** Every hire of 1 to 4 people into one unit between two month ends, pinned by the unit bounds. */
  function hires(bounds: Map<string, Record<Field, [number, number]>>) {
    const out: { who: string; field: Field; width: number }[] = []
    for (const u of units)
      for (let k = 1; k < DATES.length; k++) {
        const a = unit.get(key(DATES[k - 1], [u]))!
        const z = unit.get(key(DATES[k], [u]))!
        const added = [...z.ids].filter((id) => !a.ids.has(id))
        if (!added.length || added.length > 4 || [...a.ids].some((id) => !z.ids.has(id))) continue
        for (const f of FIELDS) {
          const [alo, ahi] = bounds.get(key(DATES[k - 1], [u]))![f]
          const [zlo, zhi] = bounds.get(key(DATES[k], [u]))![f]
          const truth = added.reduce((s, id) => s + exact.get(id)![f], 0)
          // The attack is sound: the truth is inside what it derives.
          expect(truth >= zlo - ahi - 1e-3 && truth <= zhi - alo + 1e-3, `${added} ${f}`).toBe(true)
          out.push({
            who: `${added.join(' + ')} (${u}, ${DATES[k]})`,
            field: f,
            width: zhi - alo - (zlo - ahi),
          })
        }
      }
    return out.sort((x, y) => x.width - y.width)
  }

  it('every set of business units at every month end, solved together, pins no hire closer than $50,000 either side', () => {
    const exactSum = (d: ISODate, set: readonly string[], f: Field) =>
      [...set].reduce(
        (a, u) => a + [...unit.get(key(d, [u]))!.ids].reduce((s, id) => s + exact.get(id)![f], 0),
        0,
      )
    // What a set's total says: each of its units rounded down, added, so under it plus a step each.
    const shown = unitBounds((d, set, f) => {
      const v = seen.get(key(d, set))!.total[f]
      const truth = exactSum(d, set, f)
      // The steps the adding put on top, from what each unit shows on its own.
      const added = addedSteps(set.filter((u) => seen.get(key(d, [u]))!.total[f] >= S).length)
      expect(truth >= v - added - 1e-6 && truth < v - added + set.length * S, `${d} ${set} ${f}`).toBe(true)
      return [v - added, v - added + set.length * S]
    })
    const found = hires(shown)
    expect(found.length, 'hires the dates single out').toBeGreaterThan(50)
    expect(found[0].width, found[0].who).toBeGreaterThanOrEqual(S - 1e-6)

    // The control: rounding each set's total in one step, as the build first did, the same
    // program pins hires to under $50,000 either side.
    const oneStep = unitBounds((d, set, f) => {
      const v = roundCost(exactSum(d, set, f))
      return [v, v + S]
    })
    const pinned = hires(oneStep)
    expect(pinned[0].width, pinned[0].who).toBeLessThan(S / 2)
    expect(pinned.filter((p) => p.width < S).length).toBeGreaterThan(found.length / 2)
  })

  it('every breakdown of one unit at two month ends, solved together, pins no hire closer than $50,000 either side', () => {
    let groups = 0
    let narrowest = { width: Number.POSITIVE_INFINITY, who: '' }
    for (const u of units)
      for (let k = 1; k < DATES.length; k++) {
        const a = unit.get(key(DATES[k - 1], [u]))!
        const z = unit.get(key(DATES[k], [u]))!
        const added = [...z.ids].filter((id) => !a.ids.has(id))
        if (!added.length || added.length > 4 || [...a.ids].some((id) => !z.ids.has(id))) continue
        groups++
        // Every amount reads right: its exact sum is inside what it says.
        for (const o of [...a.obs, ...z.obs]) {
          const t = o.ids.reduce((x, id) => x + exact.get(id)![o.field], 0)
          expect(t >= o.lo - 1e-3 && t < o.hi + 1e-3, `${u} ${DATES[k]} ${o.field}`).toBe(true)
        }
        const target = new Set(added)
        for (const f of FIELDS) {
          const [lo, hi] = attack([...a.obs, ...z.obs], target, f)
          const truth = added.reduce((s, id) => s + exact.get(id)![f], 0)
          expect(truth >= lo - 1e-3 && truth <= hi + 1e-3, `${added} ${f}`).toBe(true)
          if (hi - lo < narrowest.width)
            narrowest = { width: hi - lo, who: `${added} (${u}, ${DATES[k]}) ${f}` }
        }
      }
    expect(groups).toBeGreaterThan(20)
    expect(narrowest.width, narrowest.who).toBeGreaterThanOrEqual(S - 1e-6)

    // The control: on exact amounts the same program finds a hire's target cash to the dollar.
    const u = units.find((x) => x === 'Corporate')!
    const a = unit.get(key(DATES[2], [u]))!
    const z = unit.get(key(DATES[3], [u]))!
    const added = new Set([...z.ids].filter((id) => !a.ids.has(id)))
    expect(added.size).toBeGreaterThan(0)
    const exactly = [...a.obs, ...z.obs].map((o) => {
      const t = o.ids.reduce((x, id) => x + exact.get(id)![o.field], 0)
      return { ...o, lo: t - 0.005, hi: t + 0.005 }
    })
    const [lo, hi] = attack(exactly, added, 'cash')
    expect(hi - lo).toBeLessThan(1)
  })
})
