/**
 * Finance's cost totals cannot be subtracted down to a few people (docs/ROLES-V2.md 3.2, rules 2
 * and 3). Finance filters by any set of whole business units, so the test sweeps every set of the
 * sample's business units (each one, every pair, every union, the whole company) and, for each
 * breakdown, gathers every set of people a shown amount covers. People who sit in exactly the same
 * shown sets can never be told apart by adding and subtracting shown amounts, so every such class
 * must hold 5 or more people: then no derivable difference covers 1 to 4.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { annualTargetCashUsd, computeBudget } from '@/lib/budget'
import { type CostModel, foldByUnit, topCostCenters, unitOf, wholeUnits } from './cost'
import { computeComp } from './model'
import { comp, context, dataset, emp, team } from './test-fixtures'

const MIN = 5

/** People who sit in exactly the same shown sets; each class is what the amounts can single out. */
function classes(sets: readonly (readonly string[])[]): Map<string, string[]> {
  const sig = new Map<string, number[]>()
  sets.forEach((s, i) => {
    for (const id of s) {
      const list = sig.get(id)
      if (list) list.push(i)
      else sig.set(id, [i])
    }
  })
  const out = new Map<string, string[]>()
  for (const [id, at] of sig) {
    const k = at.join(',')
    const list = out.get(k)
    if (list) list.push(id)
    else out.set(k, [id])
  }
  return out
}

/** The smallest class over the sets, with one example. */
function smallest(sets: readonly (readonly string[])[]): { size: number; ids: string[] } {
  let best = { size: Number.POSITIVE_INFINITY, ids: [] as string[] }
  for (const ids of classes(sets).values()) if (ids.length < best.size) best = { size: ids.length, ids }
  return best
}

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => mask & (1 << i)))
  return out
}

describe('Finance cost totals by whole business units', () => {
  let data: Datasets
  let units: string[]
  let scopes: { label: string; ctx: AnalyticsContext; m: CostModel }[]

  beforeAll(() => {
    data = generateSample()
    units = [...new Set(data.employees.map((e) => e.businessUnit))].sort()
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as never
    const company = buildContext({
      data,
      sources,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
      access: { mode: 'finance' },
    })
    const build = (bu: string[]) => {
      const ctx = buildContext({
        data,
        sources,
        filters: { ...DEFAULT_FILTERS, businessUnit: bu },
        asOfOverride: null,
        showPay: false,
        access: { mode: 'finance' },
        quality: company.quality,
      })
      return { label: bu.join(' + ') || 'company', ctx, m: computeComp(ctx).cost }
    }
    scopes = [{ label: 'company', ctx: company, m: computeComp(company).cost }, ...subsets(units).map(build)]
  })

  it('sweeps every unit, pair and union of the sample', () => {
    expect(units).toHaveLength(6)
    expect(scopes).toHaveLength(64)
    expect(scopes.every((s) => s.m.totals && s.m.shown)).toBe(true)
  })

  it('no breakdown, Other or total can be subtracted down to fewer than 5 people', () => {
    const ids = (people: readonly { id: string }[]) => people.map((p) => p.id)
    const families: Record<string, string[][]> = {}
    const add = (name: string, set: string[]) => {
      if (!set.length) return
      families[name] ??= []
      families[name].push(set)
    }
    for (const { m } of scopes) {
      const total = m.total.targetCashUsd == null ? [] : ids(m.total.members)
      const rows = {
        unit: m.byUnit,
        center: m.byCostCenter,
        'center top 8': topCostCenters(m, 8),
        level: m.byLevel,
        site: m.bySite,
      }
      for (const [name, list] of Object.entries(rows)) {
        add(name, total)
        for (const r of list) if (r.targetCashUsd != null) add(name, ids(r.members))
      }
      // Merit spend by unit: over the priced proposals.
      const priced = (people: readonly { id: string; baseUsd: number | null }[]) =>
        people.filter((p) => p.baseUsd != null).map((p) => p.id)
      add('merit', priced(m.merit.total.members))
      for (const r of m.merit.rows) if (r.spendUsd != null) add('merit', priced(r.members))
      // Actual against budget: over the costed employees of each row.
      const b = m.budget
      if (b?.total) {
        const comp = new Map(data.comp.map((c) => [c.employeeId, c]))
        const costed = (es: readonly { employeeId: string }[]) =>
          es
            .filter((e) => {
              const c = comp.get(e.employeeId)
              return !!c && annualTargetCashUsd(c) != null
            })
            .map((e) => e.employeeId)
        for (const [name, list] of [
          ['budget unit', b.byUnit],
          ['budget center', b.byCostCenter],
        ] as const) {
          if (b.total.employeeCostUsd != null) add(name, costed(b.total.employees))
          for (const r of list) if (r.employeeCostUsd != null) add(name, costed(r.employees))
        }
      }
    }
    expect(Object.keys(families).sort()).toEqual([
      'budget center',
      'budget unit',
      'center',
      'center top 8',
      'level',
      'merit',
      'site',
      'unit',
    ])
    for (const [name, sets] of Object.entries(families)) {
      const s = smallest(sets)
      expect(s.size, `${name}: ${s.ids.join(', ')}`).toBeGreaterThanOrEqual(MIN)
    }
  })

  it('the review’s case: Executive Office and Silicon Engineering against Silicon Engineering alone', () => {
    const level = (label: string, key: string) =>
      scopes.find((s) => s.label === label)!.m.byLevel.find((r) => r.key === key)
    const both = level('Executive Office + Silicon Engineering', 'L3')!
    const se = level('Silicon Engineering', 'L3')!
    // Executive Office's one L3 counts in its own Other, so the L3 rows match.
    expect(both.people).toBe(se.people)
    expect(both.targetCashUsd).toBeCloseTo(se.targetCashUsd!, 2)
  })

  it('without the fold by unit, the same sweep finds groups of 1 to 4 (the test can fail)', () => {
    // HR with the switch on keeps every filter and folds per view, as the contract allows there.
    const hrSets: string[][] = []
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as never
    for (const bu of [['Silicon Engineering'], ['Executive Office', 'Silicon Engineering']]) {
      const m = computeComp(
        buildContext({
          data,
          sources,
          filters: { ...DEFAULT_FILTERS, businessUnit: bu },
          asOfOverride: null,
          showPay: true,
          quality: scopes[0].ctx.quality,
        }),
      ).cost
      for (const r of m.byLevel) if (r.targetCashUsd != null) hrSets.push(r.members.map((p) => p.id))
    }
    expect(smallest(hrSets).size).toBeLessThan(MIN)
  })
})

describe('the fold by unit on hand-built rows', () => {
  it('folds a group inside each unit and keeps every row made of parts of 5 or more', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, u: 'A', g: 'L3' })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `b${i}`, u: 'B', g: 'L3' })),
      ...Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, u: 'B', g: 'L4' })),
    ]
    const f = foldByUnit(
      rows,
      (r) => r.g,
      (r) => r.u,
      'None',
      MIN,
    )
    // B's two L3s go to B's Other, and B's smallest shown group (L4) joins until it reaches 5.
    expect(f.groups.map((g) => [g.key, g.rows.length])).toEqual([['L3', 6]])
    expect(f.other).toHaveLength(9)
    expect([...f.otherKeys].sort()).toEqual(['L3', 'L4'])
  })

  it('leaves business units under 5 out of every Finance total, and says so', () => {
    const big = team(8, { businessUnit: 'Operations', level: 'L3' })
    const tiny = team(3, { businessUnit: 'Executive Office', level: 'L3' })
    const d = dataset({ employees: [...big.employees, ...tiny.employees], comp: [...big.comp, ...tiny.comp] })
    const fin = (bu: string[]) =>
      computeComp(context(d, { filters: { businessUnit: bu }, access: { mode: 'finance' } })).cost
    const both = fin(['Operations', 'Executive Office'])
    const ops = fin(['Operations'])
    expect(both.total.people).toBe(8)
    expect(both.total.targetCashUsd).toBeCloseTo(ops.total.targetCashUsd!, 2)
    expect(both.counts.smallUnits).toBe(3)
    expect(both.kpis.find((k) => k.id === 'cost-people')!.note).toBe(
      '3 people in business units under 5 left out',
    )
    expect(fin(['Executive Office']).total.targetCashUsd).toBeNull()
    // HR with the switch on keeps them: it can see every amount anyway.
    const hr = computeComp(context(d, { showPay: true })).cost
    expect(hr.total.people).toBe(11)
    expect(wholeUnits([{ u: 'A' }, { u: 'A' }, { u: 'B' }], (p) => p.u, 2).kept).toHaveLength(2)
    expect(unitOf({ businessUnit: '' })).toBe('__none')
  })

  it('leaves a small business unit out of the budget comparison in Finance', () => {
    const big = team(8, { businessUnit: 'Operations', costCenter: '4100' })
    const tiny = team(3, { businessUnit: 'Executive Office', costCenter: '1000' })
    const extra = emp({ businessUnit: 'Operations', costCenter: '4100' })
    const budget = [
      { period: '2026-09-01', businessUnit: 'Operations', department: null, costCenter: '4100' },
      { period: '2026-09-01', businessUnit: 'Executive Office', department: null, costCenter: '1000' },
    ].map((l, i) => ({
      ...l,
      budgetHeadcount: i === 0 ? 9 : 3,
      budgetCost: i === 0 ? 90_000 : 40_000,
      currency: 'USD',
      planVersion: 'FY27',
    }))
    const d = dataset({
      employees: [...big.employees, ...tiny.employees, extra],
      comp: [...big.comp, ...tiny.comp, comp(extra)],
      budget,
    })
    const ctx = context(d, { access: { mode: 'finance' } })
    const whole = computeBudget(ctx, { wholeUnits: true })!
    expect(whole.byUnit.map((r) => r.key)).toEqual(['Operations'])
    expect(whole.total?.budgetHeadcount).toBe(9)
    expect(whole.notes[0]).toBe(
      'Executive Office has fewer than 5 costed employees or budgeted heads, so it is left out of the comparison in Finance mode.',
    )
    const hr = computeBudget(context(d))!
    expect(hr.total?.budgetHeadcount).toBe(12)
  })
})
