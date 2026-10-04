/**
 * Drill-down consistency: for the figures, tiles and findings a reader clicks, the number shown
 * equals the number of records the drill panel lists, the extra columns carry the metric (never a
 * pay amount), and a statistic hidden for anonymity has no records behind it.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { type CompRecord, DATASET_KEYS, type Datasets, type Employee } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import type { DrillSource } from '@/drill/Drill'
import { buildDrillTable } from '@/drill/records'
import type { DrillSpec } from '@/drill/types'
import {
  binColumns,
  binItems,
  compaGroupColumns,
  differentiationColumns,
  matrixColumns,
} from '../drillColumns'
import { binBy } from './cycle'
import {
  compaBinDrill,
  compaGroupDrill,
  compressionDrill,
  differentiationDrill,
  marketDrill,
  matrixDrill,
  meritBinDrill,
  missingDrill,
  mixDrill,
  penetrationDrill,
  positionDrill,
  spendDrill,
} from './drill'
import { marketBy } from './market'
import { type CompModel, computeComp } from './model'
import { differentiation, meritMatrix } from './performance'
import { buildPopulation, POSITIONS } from './population'
import { compaBy } from './ranges'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, context, dataset, emp, review, team } from './test-fixtures'

const resolve = (src: DrillSource): DrillSpec | null => (typeof src === 'function' ? src() : (src ?? null))
const rowsOf = (src: DrillSource): number => resolve(src)?.rows.length ?? 0

let data: Datasets
let ctx: AnalyticsContext
let m: CompModel
const kpi = (id: string): Kpi => [...m.kpis, ...m.cycle.kpis].find((k) => k.id === id)!
const finding = (id: string): Finding => m.findings.find((f) => f.id === id)!

beforeAll(() => {
  data = generateSample()
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
  m = computeComp(ctx, DEFAULT_SETTINGS)
})

describe('drill-down on the sample company', () => {
  it('every tile with a value opens its records, as comp rows', () => {
    for (const k of [...m.kpis, ...m.cycle.kpis]) {
      if (k.value == null || k.suppressed || k.value === 0) continue
      const spec = resolve(k.drill)
      expect(spec, k.id).not.toBeNull()
      expect(spec!.kind, k.id).toBe('comp')
      expect(spec!.rows.length, k.id).toBeGreaterThan(0)
      expect(spec!.subtitle, k.id).toContain('Whole company')
    }
  })

  it('tile counts and rates equal the records behind them', () => {
    const placed = m.pop.people.filter((p) => p.position != null).length
    expect(rowsOf(kpi('median-compa').drill)).toBe(1450)
    expect(rowsOf(kpi('in-band').drill) / 1450).toBeCloseTo(kpi('in-band').value!, 10)
    expect(rowsOf(kpi('below-min').drill)).toBe(78)
    expect(rowsOf(kpi('below-min').drill) / placed).toBeCloseTo(kpi('below-min').value!, 10)
    expect(resolve(kpi('below-min').drill)!.note).toBe(
      `Rate = 78 below minimum ÷ ${placed.toLocaleString('en-US')} people with a salary range.`,
    )
    expect(rowsOf(kpi('above-max').drill)).toBe(44)
    expect(rowsOf(kpi('merit-spend').drill)).toBe(m.cycle.spend.priced)
    const d = m.performance.differentiation
    expect(rowsOf(kpi('p4p').drill)).toBe(d.n45 + d.n3)
    expect(rowsOf(kpi('market').drill)).toBe(m.market.total.n)
    expect(rowsOf(kpi('eligible').drill)).toBe(kpi('eligible').value)
    expect(rowsOf(kpi('promotions').drill)).toBe(kpi('promotions').value)
    expect(rowsOf(kpi('exceptions').drill)).toBe(kpi('exceptions').value)
    expect(rowsOf(kpi('guideline-spend').drill)).toBe(m.cycle.spend.rated)
  })

  it('compa-ratio breakdowns: people, band share and out-of-range counts match the table', () => {
    for (const r of [...m.overview.byLocation, ...m.overview.byLevel, ...m.overview.byDepartment]) {
      expect(compaGroupDrill(m, r, 'measured', false)?.rows.length ?? 0, r.group).toBe(r.n)
      expect((compaGroupDrill(m, r, 'inBand')?.rows.length ?? 0) / r.n, r.group).toBeCloseTo(
        r.inBand ?? 0,
        10,
      )
      expect(compaGroupDrill(m, r, 'belowMin')?.rows.length ?? 0, r.group).toBe(r.belowMin)
      expect(compaGroupDrill(m, r, 'aboveMax')?.rows.length ?? 0, r.group).toBe(r.aboveMax)
    }
    const blr = m.overview.byLocation.find((r) => r.group === 'Bengaluru')!
    const cols = compaGroupColumns('Location', m)
    const nCol = cols.find((c) => c.key === 'n')!
    expect(rowsOf(nCol.drill!(blr))).toBe(blr.n)
    expect(resolve(nCol.drill!(blr))!.title).toBe('Compa-ratios, Bengaluru')
  })

  it('histogram bins: each bar, its table row and its drill agree', () => {
    const bins = m.overview.hist
    expect(bins.reduce((a, b) => a + b.n, 0)).toBe(1450)
    const items = binItems(bins)
    expect(items).toHaveLength(1450)
    bins.forEach((b, i) => {
      expect(compaBinDrill(m, b, i === bins.length - 1)?.rows.length ?? 0).toBe(b.n)
      expect(items.filter((x) => x.bin === i)).toHaveLength(b.n)
      // The plotted value sits strictly inside its bin, so the chart can't bin it differently.
      for (const x of items.filter((y) => y.bin === i)) expect(x.v > b.from && x.v < b.to).toBe(true)
    })
    const merit = m.cycle.hist
    expect(merit.reduce((a, b) => a + b.n, 0)).toBe(m.cycle.spend.eligible)
    merit.forEach((b, i) => {
      expect(meritBinDrill(m, b, i === merit.length - 1)?.rows.length ?? 0).toBe(b.n)
    })
    const nCol = binColumns(m, bins, 'compa').find((c) => c.key === 'n')!
    const full = bins.find((b) => b.n > 0)!
    expect(rowsOf(nCol.drill!(full))).toBe(full.n)
    const zero = bins.find((b) => b.n === 0)
    if (zero) expect(nCol.drill!(zero)).toBeNull()
  })

  it('range position segments hold the share of people shown', () => {
    for (const r of [m.overview.positionAll, ...m.overview.positionByBu]) {
      expect(positionDrill(m, r, null)?.rows.length ?? 0, r.group).toBe(r.n)
      for (const pos of POSITIONS) {
        const field = {
          'Below minimum': 'below',
          Q1: 'q1',
          Q2: 'q2',
          Q3: 'q3',
          Q4: 'q4',
          'Above maximum': 'above',
        }[pos] as 'below'
        const k = positionDrill(m, r, pos)?.rows.length ?? 0
        expect(k / r.n, `${r.group} ${pos}`).toBeCloseTo(r[field] ?? 0, 10)
      }
    }
  })

  it('performance, market and cycle breakdowns list the people they count', () => {
    for (const c of m.performance.matrix)
      expect(matrixDrill(m, c)?.rows.length ?? 0).toBe(c.mean == null ? 0 : c.n)
    for (const r of m.performance.byDepartment) {
      if (r.ratio != null) expect(differentiationDrill(m, r, r.group, null)!.rows).toHaveLength(r.n45 + r.n3)
      expect(differentiationDrill(m, r, r.group, '45')?.rows.length ?? 0).toBe(r.merit45 == null ? 0 : r.n45)
    }
    for (const r of [...m.market.byFamily, ...m.market.familyChart, ...m.market.byLocation, ...m.market.jobs])
      expect(marketDrill(m, r)?.rows.length ?? 0, r.group).toBe(r.median == null ? 0 : r.n)
    for (const r of m.cycle.byBu) {
      expect(spendDrill(m, r, 'eligible')?.rows.length ?? 0, r.group).toBe(r.spendPct == null ? 0 : r.n)
      expect(spendDrill(m, r, 'priced')?.rows.length ?? 0, r.group).toBeLessThanOrEqual(r.n)
    }
    for (const r of m.ranges.penetration) expect(penetrationDrill(m, r)?.rows.length ?? 0).toBe(r.n)
    for (const r of m.ranges.compression) {
      expect(compressionDrill(m, r, 'hires')!.rows).toHaveLength(r.newN)
      expect(compressionDrill(m, r, 'incumbents')!.rows).toHaveLength(r.incN)
    }
    for (const r of m.cycle.mix)
      expect(mixDrill(m, r, 'Base')?.rows.length ?? 0).toBe(r.base == null ? 0 : r.n)
  })

  it('a filtered scope names itself and lists only its own people', () => {
    const scoped = buildContext({
      data,
      sources: ctx.sources,
      filters: { ...DEFAULT_FILTERS, location: ['Bengaluru'] },
      asOfOverride: null,
      showPay: false,
    })
    const b = computeComp(scoped, DEFAULT_SETTINGS)
    const spec = resolve(b.kpis.find((k) => k.id === 'below-min')!.drill)!
    expect(spec.subtitle).toBe(`${scoped.scopeLabel} · as of 30 Sep 2026`)
    expect(spec.rows).toHaveLength(b.ranges.below.length)
    const inScope = new Set(scoped.data.employees.map((e) => e.employeeId))
    expect((spec.rows as readonly CompRecord[]).every((r) => inScope.has(r.employeeId))).toBe(true)
  })

  it('findings open the records behind their headline number', () => {
    for (const f of m.findings) expect(resolve(f.drill), f.id).not.toBeNull()
    expect(rowsOf(finding('comp-below-min').drill)).toBe(78)
    expect(rowsOf(finding('comp-above-max').drill)).toBe(44)
    expect(rowsOf(finding('comp-exceptions').drill)).toBe(11)
    const blr = m.overview.byLocation.find((r) => r.group === 'Bengaluru')!
    expect(rowsOf(finding('comp-low-compa-location-Bengaluru').drill)).toBe(blr.n)
    expect(rowsOf(finding('comp-compression-Design Verification').drill)).toBe(66)
    const gtm = m.cycle.byBu.find((r) => r.group === 'Go-to-Market')!
    expect(rowsOf(finding('comp-over-budget-Go-to-Market').drill)).toBe(gtm.n)
  })

  it('extra columns carry the metric and never a pay amount', () => {
    const specs: DrillSpec[] = []
    for (const k of [...m.kpis, ...m.cycle.kpis]) {
      const s = resolve(k.drill)
      if (s) specs.push(s)
    }
    for (const f of m.findings) {
      const s = resolve(f.drill)
      if (s) specs.push(s)
    }
    for (const s of specs) {
      for (const c of s.extra?.columns ?? [])
        expect((c as Column).pay, `${s.title}: ${c.key}`).toBeUndefined()
      const t = buildDrillTable(s, ctx)
      expect(t.rows).toHaveLength(s.rows.length)
      expect(t.columns.find((c) => c.key === 'baseSalary')?.pay).toBe(true)
    }
    const market = resolve(kpi('market').drill)!
    const t = buildDrillTable(market, ctx)
    expect(t.columns.map((c) => c.key)).toContain('xMarketRatio')
    expect(t.rows.every((r) => typeof r.xMarketRatio === 'number')).toBe(true)
    expect(t.columns.map((c) => c.key)).not.toContain('meritPct')
    const below = buildDrillTable(resolve(kpi('below-min').drill)!, ctx)
    expect(below.rows.every((r) => typeof r.xToMinimum === 'number' && (r.xToMinimum as number) > 0)).toBe(
      true,
    )
  })
})

/* ───────── suppression ───────── */

function merge(...ts: { employees: Employee[]; comp: CompRecord[] }[]) {
  return { employees: ts.flatMap((t) => t.employees), comp: ts.flatMap((t) => t.comp) }
}

describe('suppressed numbers have no records behind them', () => {
  it('a group under 5 keeps its count hidden from the drill', () => {
    const big = team(10, { location: 'San Jose' }, () => ({ compa: 0.75 }))
    const small = team(3, { location: 'Austin' }, () => ({ compa: 0.75 }))
    const people = buildPopulation(dataset(merge(big, small)), AS_OF).people
    const rows = compaBy(people, (p) => p.location, DEFAULT_SETTINGS)
    const austin = rows.find((r) => r.group === 'Austin')!
    expect(austin.median).toBeNull()
    expect(austin.members).toEqual([])
    expect(compaGroupDrill(scopeOf(), austin, 'measured')).toBeNull()
    expect(compaGroupDrill(scopeOf(), austin, 'belowMin')).toBeNull()
    const cols = compaGroupColumns('Location', scopeOf())
    for (const c of cols) expect(c.drill?.(austin) ?? null, c.key).toBeNull()
    const sj = rows.find((r) => r.group === 'San Jose')!
    expect(compaGroupDrill(scopeOf(), sj, 'belowMin')!.rows).toHaveLength(10)

    const market = marketBy(people, (p) => p.location).find((r) => r.group === 'Austin')!
    expect(market.median).toBeNull()
    expect(marketDrill(scopeOf(), market)).toBeNull()
  })

  it('a merit matrix cell or a rating side under 5 does not drill', () => {
    const top = team(3, {}, () => ({ meritPct: 0.05 }))
    const mid = team(8, {}, () => ({ meritPct: 0.03 }))
    const reviews = [...top.employees.map((e) => review(e, 5)), ...mid.employees.map((e) => review(e, 3))]
    const people = buildPopulation(dataset({ ...merge(top, mid), reviews }), AS_OF).people
    const d = differentiation(people)
    expect(d.ratio).toBeNull()
    expect(d.rated45).toEqual([])
    expect(differentiationDrill(scopeOf(), d, null, null)).toBeNull()
    expect(differentiationDrill(scopeOf(), d, null, '45')).toBeNull()
    expect(differentiationDrill(scopeOf(), d, null, '3')!.rows).toHaveLength(8)
    const cols = differentiationColumns(scopeOf())
    const row = { ...d, group: 'All' }
    expect(cols.find((c) => c.key === 'n45')!.drill!(row)).toBeNull()
    expect(rowsOf(cols.find((c) => c.key === 'n3')!.drill!(row))).toBe(8)

    const matrix = meritMatrix(people, DEFAULT_SETTINGS)
    const hidden = matrix.find((c) => c.rating.startsWith('5'))!
    expect(hidden.mean).toBeNull()
    expect(matrixDrill(scopeOf(), hidden)).toBeNull()
    expect(matrixColumns(scopeOf()).find((c) => c.key === 'n')!.drill!(hidden)).toBeNull()
  })

  it('hidden tiles on a small scope stay hidden', () => {
    const t = team(3, {}, () => ({ compa: 0.8 }))
    const small = computeComp(context(dataset(merge(t))), DEFAULT_SETTINGS)
    const median = small.kpis.find((k) => k.id === 'median-compa')!
    expect(median.suppressed).toBe(true)
    expect(rowsOf(median.drill)).toBe(0)
    expect(small.overview.positionAll.members).toEqual([])
  })

  it('bins every item once, in the bin the engine reads', () => {
    const bins = binBy([0.9, 0.92 - 1e-12, 0.92, 0.95], (x) => x, 0.9, 0.96, 0.02)
    expect(bins.map((b) => b.members)).toEqual([[0.9], [0.92 - 1e-12, 0.92], [0.95]])
  })

  it('lists active employees with no comp record', () => {
    const t = team(6, {})
    const extra = [emp(), emp()]
    const m2 = computeComp(
      context(dataset({ employees: [...t.employees, ...extra], comp: t.comp })),
      DEFAULT_SETTINGS,
    )
    expect(m2.pop.missingComp).toBe(2)
    const spec = missingDrill(m2, m2.pop.missing)!
    expect(spec.kind).toBe('employees')
    expect(spec.rows.map((e) => e.employeeId).sort()).toEqual(extra.map((e) => e.employeeId).sort())
    expect(missingDrill(m2, [])).toBeNull()
  })
})

function scopeOf() {
  return {
    scopeLabel: 'Whole company',
    asOf: AS_OF,
    settings: DEFAULT_SETTINGS,
    pop: { latestCycle: null, annualCycle: null },
  }
}
