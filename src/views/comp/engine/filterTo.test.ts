/**
 * "Filter to this" on Compensation (docs/FILTERS.md, part 4): breakdowns by business unit,
 * department, location or level set the filter that reproduces their group, the invariant holds
 * on a sample per tab, and job families, ratings, positions, bins and whole-scope numbers set none.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, FILTER_DIMENSIONS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import {
  compaBinDrill,
  compaGroupDrill,
  compressionDrill,
  differentiationDrill,
  marketDrill,
  meritRatingDrill,
  mixDrill,
  penetrationDrill,
  positionDrill,
  spendDrill,
} from './drill'
import { compModel } from './model'
import type { CompaGroupRow } from './ranges'

let ctx: AnalyticsContext
beforeAll(() => {
  const data: Datasets = generateSample()
  ctx = buildContext({
    data,
    sources: Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>,
    filters: { ...DEFAULT_FILTERS },
    asOfOverride: null,
    showPay: false,
  })
}, 60_000)

const m = (x: AnalyticsContext) => compModel(x)
const filterOf = (d: DrillSource): DrillFilter | undefined => resolveDrill(d)?.filter

describe('Filter to on Compensation', () => {
  it('Overview: compa-ratio by location, level and department, range position by business unit', () => {
    for (const dim of ['location', 'level', 'department'] as const) {
      const rows = (x: AnalyticsContext): CompaGroupRow[] =>
        dim === 'location'
          ? m(x).overview.byLocation
          : dim === 'level'
            ? m(x).overview.byLevel
            : m(x).overview.byDepartment
      const measured = {
        name: `people with a compa-ratio by ${dim}`,
        rows,
        key: (r: CompaGroupRow) => r.group,
        value: (r: CompaGroupRow) => r.n,
        drill: (r: CompaGroupRow, x: AnalyticsContext) => () => compaGroupDrill(m(x), r, 'measured'),
      }
      // By location also from inside other filters (`variants`).
      expectFilterTo(ctx, measured, { sample: 3, variants: dim === 'location' })
      expectLeaveOut(ctx, measured, { sample: 2, variants: dim === 'location' })
      expectFilterTo(
        ctx,
        { ...measured, name: `median compa-ratio by ${dim}`, value: (r) => r.median, kind: 'rate' },
        { sample: 3 },
      )
      for (const r of rows(ctx).filter((x) => x.group.startsWith('Other (')))
        expect(filterOf(() => compaGroupDrill(m(ctx), r, 'measured'))).toBeUndefined()
    }
    expectFilterTo(
      ctx,
      {
        name: 'range position by unit, Q1 share',
        rows: (x) => m(x).overview.positionByBu,
        key: (r) => r.group,
        value: (r) => r.q1,
        drill: (r, x) => () => positionDrill(m(x), r, 'Q1'),
        kind: 'rate',
      },
      { sample: 3 },
    )
  })

  it('Ranges: penetration by level and the department and level compression cells', () => {
    expectFilterTo(
      ctx,
      {
        name: 'range penetration by level',
        rows: (x) => m(x).ranges.penetration,
        key: (r) => r.level,
        value: (r) => r.median,
        drill: (r, x) => () => penetrationDrill(m(x), r),
        kind: 'rate',
      },
      { sample: 3 },
    )
    const cells = m(ctx).ranges.compression
    expect(cells.length).toBeGreaterThan(0)
    expectFilterTo(
      ctx,
      {
        name: 'compression by department and level',
        rows: (x) => m(x).ranges.compression,
        key: (r) => r.group,
        value: (r) => r.newMedian - r.incMedian,
        drill: (r, x) => () => compressionDrill(m(x), r, null),
        kind: 'rate',
      },
      { sample: 3 },
    )
  })

  it('Pay for performance and market: differentiation by department, market ratio by location and level', () => {
    expectFilterTo(
      ctx,
      {
        name: 'differentiation by department',
        rows: (x) => m(x).performance.byDepartment,
        key: (r) => r.group,
        value: (r) => r.ratio,
        drill: (r, x) => () => differentiationDrill(m(x), r, r.group, null),
        kind: 'rate',
      },
      { sample: 3 },
    )
    for (const dim of ['location', 'level'] as const)
      expectFilterTo(
        ctx,
        {
          name: `market ratio by ${dim}`,
          rows: (x) => (dim === 'location' ? m(x).market.byLocation : m(x).market.byLevel),
          key: (r) => r.group,
          value: (r) => r.median,
          drill: (r, x) => () => marketDrill(m(x), r),
          kind: 'rate',
        },
        { sample: 3 },
      )
  })

  it('Merit cycle: proposals and spend by business unit, the rewards mix by level', () => {
    const proposals = {
      name: 'merit proposals by unit',
      rows: (x: AnalyticsContext) => m(x).cycle.byBu,
      key: (r: { group: string }) => r.group,
      value: (r: { n: number }) => r.n,
      drill: (r: Parameters<typeof spendDrill>[1], x: AnalyticsContext) => () =>
        spendDrill(m(x), r, 'eligible'),
    }
    expectFilterTo(ctx, proposals, { sample: 3 })
    expectLeaveOut(ctx, proposals, { sample: 2 })
    expectFilterTo(
      ctx,
      {
        name: 'merit spend by unit',
        rows: (x) => m(x).cycle.byBu,
        key: (r) => r.group,
        value: (r) => r.spendPct,
        drill: (r, x) => () => spendDrill(m(x), r, 'priced'),
        kind: 'rate',
      },
      { sample: 3 },
    )
    expectFilterTo(
      ctx,
      {
        name: 'target pay mix by level, base share',
        rows: (x) => m(x).cycle.mix,
        key: (r) => r.level,
        value: (r) => r.base,
        drill: (r, x) => () => mixDrill(m(x), r, 'Base'),
        kind: 'rate',
      },
      { sample: 3 },
    )
  })

  it('Readout: a finding’s group filter gives a scope with the same number', () => {
    const model = m(ctx)
    let checked = 0
    for (const f of model.findings) {
      const filter = filterOf(f.drill)
      if (!filter) continue
      const after = m(applyDrillFilter(ctx, filter))
      const records = resolveDrill(f.drill)?.rows.length
      if (f.id.startsWith('comp-low-compa-')) {
        const dim = filter.location ? 'location' : 'department'
        const row = (dim === 'location' ? after.overview.byLocation : after.overview.byDepartment).find(
          (r) => r.group === filter[dim]?.[0],
        )
        expect(row?.n, f.id).toBe(records)
      } else if (f.id.startsWith('comp-over-budget-')) {
        expect(after.cycle.spend.priced, f.id).toBe(records)
      } else if (f.id.startsWith('comp-no-differentiation-')) {
        expect(after.performance.differentiation.n45 + after.performance.differentiation.n3, f.id).toBe(
          records,
        )
      } else if (f.id.startsWith('comp-compression-')) {
        const people = after.ranges.compression.reduce((s, c) => s + c.hires.length + c.incumbents.length, 0)
        expect(people, f.id).toBe(records)
      } else throw new Error(`${f.id} sets a filter the test does not check`)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('sets filters only on org filters, for values in the data; job functions, ratings and bins set none', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes'])
    const model = m(ctx)
    const o = model.overview
    const grouped: DrillSource[] = [
      ...[...o.byLocation, ...o.byLevel, ...o.byDepartment].flatMap((r) => [
        () => compaGroupDrill(model, r, 'measured'),
        () => compaGroupDrill(model, r, 'belowMin'),
      ]),
      ...o.positionByBu.map((r) => () => positionDrill(model, r, null)),
      ...model.ranges.penetration.map((r) => () => penetrationDrill(model, r)),
      ...model.ranges.compression.map((r) => () => compressionDrill(model, r, 'hires')),
      ...model.performance.byDepartment.map((r) => () => differentiationDrill(model, r, r.group, '45')),
      ...[...model.market.byLocation, ...model.market.byLevel].map((r) => () => marketDrill(model, r)),
      ...model.cycle.byBu.map((r) => () => spendDrill(model, r, 'priced')),
      ...model.cycle.mix.map((r) => () => mixDrill(model, r, null)),
    ]
    let n = 0
    for (const g of grouped) {
      const filter = filterOf(g)
      if (!filter) continue
      n++
      for (const k of Object.keys(filter)) expect(allowed.has(k), `filter key ${k}`).toBe(true)
      for (const dim of ['businessUnit', 'department', 'location', 'level'] as const)
        for (const v of filter[dim] ?? [])
          expect(
            ctx.all.employees.some((e) => e[dim] === v),
            `${dim} ${v}`,
          ).toBe(true)
    }
    expect(n).toBeGreaterThan(30)
    const none: DrillSource[] = [
      ...model.market.byJob.map((r) => () => marketDrill(model, r)),
      ...model.market.jobs.map((r) => () => marketDrill(model, r)),
      () => marketDrill(model, model.market.total, true),
      // A headline tile titles the row as the whole scope: no group.
      ...o.byLocation.slice(0, 1).map((r) => () => compaGroupDrill(model, r, 'measured', true)),
      ...model.performance.meritByRating.map((r) => () => meritRatingDrill(model, r)),
      ...o.hist.slice(0, 3).map((b) => () => compaBinDrill(model, b, false)),
      () => differentiationDrill(model, model.performance.differentiation, null, null),
      () => spendDrill(model, { ...model.cycle.spend, group: null }, 'priced'),
    ]
    for (const g of none) expect(filterOf(g)).toBeUndefined()
  })
})
