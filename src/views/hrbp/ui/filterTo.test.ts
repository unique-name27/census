/**
 * "Filter to this" on People stats (docs/FILTERS.md, part 4): the grouped drills set the filter
 * that reproduces their group, the invariant holds on a sample of them (at least one per tab with
 * grouped figures), and no drill sets a filter on anything but the org filters.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { FILTER_DIMENSIONS } from '@/data/scope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo, expectLeaveOut, rescopeContext } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { hrbpModel } from '../engine'
import { type GrowthCell, scoreSpec } from '../engine/buckets'
import { departmentGrowth } from '../engine/findings'
import { sampleCtx } from '../engine/fixtures'
import { CONTINGENT, type CountRow, type MixRow } from '../engine/workforce'
import {
  attritionGroupDrill,
  growthDrill,
  headcountDrill,
  layerDrill,
  type MixDim,
  managerDrill,
  mixDrill,
  mixGroupDrill,
} from './drill'

const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter

/** The contractor and intern bars of the worker mix figure: one row per site or unit. */
function contingentBars(x: AnalyticsContext, dim: MixDim) {
  const rows = hrbpModel(x).workforce.mix[dim].filter((r) =>
    (CONTINGENT as readonly string[]).includes(r.workerType),
  )
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.group, (by.get(r.group) ?? 0) + r.people)
  return { rows, bars: [...by].map(([group, people]) => ({ group, people })).filter((b) => b.people > 0) }
}

let ctx: AnalyticsContext
beforeAll(() => {
  ctx = sampleCtx()
}, 60_000)

describe('Filter to on People stats', () => {
  it('Workforce: contractors and interns by site and unit, bars and segments', () => {
    for (const dim of ['location', 'businessUnit'] as const) {
      const bars = {
        name: `contractors and interns by ${dim}`,
        rows: (x: AnalyticsContext) => contingentBars(x, dim).bars,
        key: (r: { group: string }) => r.group,
        value: (r: { people: number }) => r.people,
        drill: (r: { group: string }, x: AnalyticsContext) =>
          mixGroupDrill(hrbpModel(x).prep, dim, contingentBars(x, dim).rows)(r),
      }
      expectFilterTo(ctx, bars, { sample: 3 })
      expectLeaveOut(ctx, bars, { sample: 2 })
      // A segment (contractors in one site) keeps its number; the site's other types stay beside it.
      expectFilterTo(
        ctx,
        {
          name: `worker type by ${dim}`,
          rows: (x) => hrbpModel(x).workforce.mix[dim],
          key: (r: MixRow) => `${r.group} · ${r.workerType}`,
          value: (r) => r.people,
          drill: (r, x) => mixDrill(hrbpModel(x).prep, dim)(r),
          kind: 'rate',
        },
        { sample: 3 },
      )
    }
  })

  it('Workforce: a share of the scope becomes the whole scope after Filter to, with the same count', () => {
    // The Share column opens the same people as Employees, so it offers the same actions; its
    // number is a share of the scope, so after "Filter to" the group is all of it (docs/FILTERS.md).
    for (const dim of ['location', 'department', 'level'] as const) {
      const rows = (x: AnalyticsContext): CountRow[] => {
        const w = hrbpModel(x).workforce
        return dim === 'location' ? w.byLocation : dim === 'department' ? w.byDepartment : w.byLevel
      }
      expectFilterTo(
        ctx,
        {
          name: `headcount share by ${dim}`,
          rows,
          key: (r) => r.label,
          value: (r) => r.share,
          count: (r) => r.headcount,
          drill: (r, x) => headcountDrill(hrbpModel(x).prep, dim)(r),
          kind: 'share',
        },
        { sample: 3 },
      )
    }
  })

  it('Workforce: growth by business unit keeps the unit’s totals, by department keeps the row', () => {
    const m = hrbpModel(ctx)
    expect(m.workforce.growthBy).toBe('businessUnit')
    // Inside one unit the figure groups by department, so the unit's totals are what must hold.
    for (const r of m.workforce.growth.filter((g) => g.growth != null).slice(0, 3)) {
      const filter = filterOf(growthDrill(m.prep, m.workforce, 'now')(r)) as DrillFilter
      expect(filter).toEqual({ businessUnit: [r.group], modes: {} })
      const after = hrbpModel(applyDrillFilter(ctx, filter)).workforce.growth
      expect(
        after.reduce((s, g) => s + g.now, 0),
        r.group,
      ).toBe(r.now)
      expect(
        after.reduce((s, g) => s + g.yearAgo, 0),
        r.group,
      ).toBe(r.yearAgo)
    }
    const unit = rescopeContext(ctx, { ...ctx.filters, businessUnit: [m.workforce.growth[0].group] })
    expect(hrbpModel(unit).workforce.growthBy).toBe('department')
    for (const cell of ['now', 'yearAgo', 'growth'] as GrowthCell[])
      expectFilterTo(
        unit,
        {
          name: `growth by department (${cell})`,
          rows: (x) => hrbpModel(x).workforce.growth,
          key: (r) => r.group,
          value: (r) => (cell === 'now' ? r.now : cell === 'yearAgo' ? r.yearAgo : r.growth),
          drill: (r, x) => growthDrill(hrbpModel(x).prep, hrbpModel(x).workforce, cell)(r),
          kind: cell === 'growth' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
  })

  it('Attrition: the location bars reproduce their rate and exits; department and level set nothing', () => {
    for (const value of ['voluntaryRate', 'rate'] as const)
      expectFilterTo(
        ctx,
        {
          name: `attrition by location (${value})`,
          rows: (x) => hrbpModel(x).attrition.byLocation,
          key: (r) => r.group,
          value: (r) => r[value],
          drill: (r, x) => attritionGroupDrill(hrbpModel(x).prep, 'location', value === 'voluntaryRate')(r),
          kind: 'rate',
        },
        { sample: 4 },
      )
    const exits = {
      name: 'exits by location',
      rows: (x: AnalyticsContext) => hrbpModel(x).attrition.byLocation,
      key: (r: { group: string }) => r.group,
      value: (r: { exits: number }) => r.exits,
      drill: (r: Parameters<ReturnType<typeof attritionGroupDrill>>[0], x: AnalyticsContext) =>
        attritionGroupDrill(hrbpModel(x).prep, 'location', false)(r),
    }
    expectFilterTo(ctx, exits, { sample: 3 })
    expectLeaveOut(ctx, exits, { sample: 2 })
    const m = hrbpModel(ctx)
    for (const r of m.attrition.byDepartment)
      expect(filterOf(attritionGroupDrill(m.prep, 'department', true)(r))).toBeUndefined()
    for (const r of m.attrition.byLevel)
      expect(filterOf(attritionGroupDrill(m.prep, 'level', false)(r))).toBeUndefined()
  })

  it('Org design: layers by business unit and a manager’s total org', () => {
    expectFilterTo(
      ctx,
      {
        name: 'active workers by business unit',
        rows: (x) => hrbpModel(x).org.layersByBu,
        key: (r) => r.businessUnit,
        value: (r) => r.people,
        drill: (r, x) => layerDrill(hrbpModel(x).prep, hrbpModel(x).org)(r),
      },
      { sample: 3 },
    )
    expectFilterTo(
      ctx,
      {
        name: 'layers by business unit',
        rows: (x) => hrbpModel(x).org.layersByBu,
        key: (r) => r.businessUnit,
        value: (r) => r.layers,
        drill: (r, x) => layerDrill(hrbpModel(x).prep, hrbpModel(x).org)(r),
        kind: 'rate',
      },
      { sample: 3 },
    )
    const total = (r: { totalOrg: number }) => r.totalOrg
    expectFilterTo(
      ctx,
      {
        name: 'manager total org',
        rows: (x) => hrbpModel(x).org.managers,
        key: (r) => r.managerId,
        value: total,
        drill: (r, x) => managerDrill(hrbpModel(x).prep, hrbpModel(x).org, 'totalOrg', total)(r),
        // Orgs nest, so the column has no total: the manager's own number is what must hold.
        kind: 'rate',
      },
      { sample: 4 },
    )
    const m = hrbpModel(ctx)
    const mgr = m.org.managers[0]
    expect(filterOf(managerDrill(m.prep, m.org, 'directs', (r) => r.directs)(mgr))).toBeUndefined()
  })

  it('Overview: a scorecard row’s filter gives a scope whose tiles show the row’s numbers', () => {
    const top = [...ctx.org.byId.values()].find((e) => !e.managerId && !e.terminationDate)
    expect(top).toBeDefined()
    const leaderScope = rescopeContext(ctx, { ...ctx.filters, leaderId: top?.employeeId ?? null })
    for (const base of [ctx, leaderScope]) {
      const m = hrbpModel(base)
      const rows = m.scorecard.rows.filter((r) => r.filter)
      expect(rows.length).toBeGreaterThan(1)
      for (const row of rows.slice(0, 3)) {
        const filter = scoreSpec(m.prep, row, 'headcount')?.filter as DrillFilter
        expect(filter).toEqual(row.filter)
        const after = hrbpModel(applyDrillFilter(base, filter))
        expect(after.kpi.headcount, row.label).toBe(row.headcount)
        expect(after.kpi.vol.rate, row.label).toBeCloseTo(row.voluntary as number, 9)
        expect(after.kpi.firstYear.rate ?? null, row.label).toBe(row.firstYear)
      }
      for (const row of m.scorecard.rows.filter((r) => !r.filter))
        expect(scoreSpec(m.prep, row, 'headcount')?.filter).toBeUndefined()
    }
  })

  it('Readout: a site’s attrition, a group’s first-year attrition and growth reproduce under Filter to', () => {
    const m = hrbpModel(ctx)
    let checked = 0
    for (const f of m.findings) {
      const filter = filterOf(f.drill)
      if (!filter) continue
      const after = hrbpModel(applyDrillFilter(ctx, filter))
      if (f.id === 'hrbp-voluntary-location') {
        const row = m.attrition.byLocation.find((r) => r.group === filter.location?.[0])
        expect(after.kpi.vol.rate).toBeCloseTo(row?.voluntaryRate as number, 9)
        checked++
      } else if (f.id === 'hrbp-first-year') {
        expect(f.title).toContain(`(${after.kpi.firstYear.leavers} of ${after.kpi.firstYear.cohort} hires)`)
        checked++
      } else if (f.id === 'hrbp-rapid-growth') {
        const dept = filter.department?.[0]
        const was = departmentGrowth(m.prep).find((g) => g.dept === dept)
        const now = departmentGrowth(after.prep).find((g) => g.dept === dept)
        expect(now && [now.before, now.now]).toEqual(was && [was.before, was.now])
        checked++
      } else if (f.id === 'hrbp-uneven-growth') {
        expect(after.workforce.growth.reduce((s, g) => s + g.now, 0)).toBe(
          m.workforce.growth.find((g) => g.group === (filter.businessUnit ?? filter.department)?.[0])?.now,
        )
        checked++
      } else throw new Error(`${f.id} sets a filter the test does not check`)
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('sets filters only on the org filters, never a period, and only for values in the data', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes'])
    const m = hrbpModel(ctx)
    const p = m.prep
    const wf = m.workforce
    const sources: DrillSource[] = [
      ...(['department', 'location', 'level', 'tenure'] as const).flatMap((dim) =>
        (dim === 'tenure'
          ? wf.tenure
          : dim === 'department'
            ? wf.byDepartment
            : dim === 'location'
              ? wf.byLocation
              : wf.byLevel
        ).map(headcountDrill(p, dim)),
      ),
      ...(['location', 'businessUnit'] as const).flatMap((dim) => [
        ...wf.mix[dim].map(mixDrill(p, dim)),
        ...contingentBars(ctx, dim).bars.map(mixGroupDrill(p, dim, wf.mix[dim])),
      ]),
      ...(['yearAgo', 'now', 'change', 'growth'] as GrowthCell[]).flatMap((c) =>
        wf.growth.map(growthDrill(p, wf, c)),
      ),
      ...(['department', 'location', 'level'] as const).flatMap((dim) =>
        (dim === 'department'
          ? m.attrition.byDepartment
          : dim === 'location'
            ? m.attrition.byLocation
            : m.attrition.byLevel
        ).map(attritionGroupDrill(p, dim, false)),
      ),
      ...m.org.layersByBu.map(layerDrill(p, m.org)),
      ...m.org.managers.map(managerDrill(p, m.org, 'totalOrg', (r) => r.totalOrg)),
      ...m.scorecard.rows.map((r) => () => scoreSpec(p, r, 'headcount')),
      ...m.findings.map((f) => f.drill),
    ]
    let withFilter = 0
    for (const src of sources) {
      const filter = filterOf(src)
      if (!filter) continue
      withFilter++
      for (const k of Object.keys(filter)) expect(allowed.has(k), `filter key ${k}`).toBe(true)
      if (filter.leaderId) expect(ctx.org.byId.has(filter.leaderId)).toBe(true)
      for (const dim of ['businessUnit', 'department', 'location', 'level'] as const)
        for (const v of filter[dim] ?? [])
          expect(
            ctx.all.employees.some((e) => e[dim] === v),
            `${dim} ${v}`,
          ).toBe(true)
    }
    expect(withFilter).toBeGreaterThan(20)
    // Tenure bands are not a filter.
    for (const r of wf.tenure) expect(filterOf(headcountDrill(p, 'tenure')(r))).toBeUndefined()
  })
})
