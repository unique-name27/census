/**
 * "Filter to this" on Talent (docs/FILTERS.md, part 4): the numbers that count one business unit,
 * department, location or level (and a completions month) set the filter that reproduces them,
 * the invariant holds on a sample per tab, and no drill sets a filter on anything else.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, FILTER_DIMENSIONS } from '@/data/scope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import type { HighShareDim, TalentDrill } from './drills'
import { talentModel } from './index'
import type { OverdueCell } from './learning'
import type { HighShareRow } from './performance'
import { sourcesFor } from './test-fixtures'

let ctx: AnalyticsContext
beforeAll(() => {
  const data: Datasets = generateSample()
  ctx = buildContext({
    data,
    sources: sourcesFor(data, 'sample'),
    filters: { ...DEFAULT_FILTERS },
    asOfOverride: null,
    showPay: false,
  })
}, 60_000)

const m = (x: AnalyticsContext) => talentModel(x)
const filterOf = (d: DrillSource): DrillFilter | undefined => resolveDrill(d)?.filter

/** One row per business unit: the sum of a breakdown's segments. */
function perUnit<T extends { businessUnit: string }>(rows: readonly T[], value: (r: T) => number) {
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.businessUnit, (by.get(r.businessUnit) ?? 0) + value(r))
  return [...by].map(([businessUnit, n]) => ({ businessUnit, n }))
}

describe('Filter to on Talent', () => {
  it('Performance: rated and rated 4-5 by department, unit and level; the rating mix, calibration and cycles', () => {
    const rows = (dim: HighShareDim) => (x: AnalyticsContext) => {
      const p = m(x).performance
      return dim === 'department' ? p.byDepartment : dim === 'businessUnit' ? p.byBusinessUnit : p.byLevel
    }
    for (const dim of ['department', 'businessUnit', 'level'] as const) {
      const rated = {
        name: `people rated by ${dim}`,
        rows: rows(dim),
        key: (r: HighShareRow) => r.group,
        value: (r: HighShareRow) => r.rated,
        drill: (r: HighShareRow, x: AnalyticsContext) => m(x).drill.highShare(dim, r, 'rated'),
      }
      // By department also from inside other filters (`variants`).
      expectFilterTo(ctx, rated, { sample: 3, variants: dim === 'department' })
      expectLeaveOut(ctx, rated, { sample: 2, variants: dim === 'department' })
      expectFilterTo(
        ctx,
        { ...rated, name: `share rated 4-5 by ${dim}`, value: (r) => r.share, kind: 'rate' },
        { sample: 3 },
      )
      // A folded "Other" row is no group.
      for (const r of rows(dim)(ctx).filter((x) => x.other))
        expect(filterOf(m(ctx).drill.highShare(dim, r, 'rated'))).toBeUndefined()
    }
    expectFilterTo(
      ctx,
      {
        name: 'rating mix, rated 4 by unit',
        rows: (x) => m(x).performance.mix,
        key: (r) => r.businessUnit,
        value: (r) => r.r4,
        drill: (r, x) => m(x).drill.mix(r.businessUnit, 4),
        kind: 'rate',
      },
      { sample: 3 },
    )
    expectFilterTo(
      ctx,
      {
        name: 'calibration shift by unit',
        rows: (x) => m(x).performance.calibration,
        key: (r) => r.businessUnit,
        value: (r) => r.shift,
        drill: (r, x) => m(x).drill.calibration(r.businessUnit, 'all'),
        kind: 'rate',
      },
      { sample: 3 },
    )
    expectFilterTo(
      ctx,
      {
        name: 'average rating by cycle and unit',
        rows: (x) => m(x).performance.cycles,
        key: (r) => `${r.cycle} · ${r.businessUnit}`,
        value: (r) => r.mean,
        drill: (r, x) => m(x).drill.cycleUnit(r.cycle, r.businessUnit),
        kind: 'rate',
      },
      { sample: 4 },
    )
  })

  it('Overview and succession: roles by unit, successors by unit, high potentials by unit and level', () => {
    const roles = {
      name: 'critical and key roles by unit',
      rows: (x: AnalyticsContext) => perUnit(m(x).succession.coverageByUnit, (r) => r.roles),
      key: (r: { businessUnit: string }) => r.businessUnit,
      value: (r: { n: number }) => r.n,
      drill: (r: { businessUnit: string }, x: AnalyticsContext) =>
        m(x).drill.coverageCell(r.businessUnit, null),
    }
    expectFilterTo(ctx, roles, { sample: 3 })
    expectLeaveOut(ctx, roles, { sample: 2 })
    expectFilterTo(
      ctx,
      {
        name: 'roles by unit and coverage',
        rows: (x) => m(x).succession.coverageByUnit,
        key: (r) => `${r.businessUnit} · ${r.coverage}`,
        value: (r) => r.roles,
        drill: (r, x) => m(x).drill.coverageCell(r.businessUnit, r.coverage),
        kind: 'rate',
      },
      { sample: 4 },
    )
    expectFilterTo(
      ctx,
      {
        name: 'successors by unit',
        rows: (x) => m(x).succession.benchTable.All,
        key: (r) => r.businessUnit,
        value: (r) => r.successors,
        drill: (r, x) => m(x).drill.bench('All', r.businessUnit, null),
      },
      { sample: 3 },
    )
    for (const dim of ['businessUnit', 'level'] as const)
      expectFilterTo(
        ctx,
        {
          name: `high potential share by ${dim}`,
          rows: (x) => (dim === 'level' ? m(x).succession.hipoByLevel : m(x).succession.hipoByUnit),
          key: (r) => r.group,
          value: (r) => r.share,
          drill: (r, x) => m(x).drill.hipo(dim, r, 'high'),
          kind: 'rate',
        },
        { sample: 3 },
      )
  })

  it('Learning: hours by unit, completions by month, overdue by department and location', () => {
    expectFilterTo(
      ctx,
      {
        name: 'learning hours per employee by unit',
        rows: (x) => m(x).learning.hours,
        key: (r) => r.businessUnit,
        value: (r) => r.perEmployee,
        drill: (r, x) => m(x).drill.hours(r.businessUnit),
        kind: 'rate',
      },
      { sample: 3 },
    )
    const months = (x: AnalyticsContext) => {
      const by = new Map<string, number>()
      for (const r of m(x).learning.completions) by.set(r.month, (by.get(r.month) ?? 0) + r.completions)
      return [...by].map(([month, n]) => ({ month, n }))
    }
    expectFilterTo(
      ctx,
      {
        name: 'completions by month',
        rows: months,
        key: (r) => r.month,
        value: (r) => r.n,
        drill: (r, x) => m(x).drill.completions(r.month, null),
      },
      { sample: 3 },
    )
    const month = months(ctx).find((r) => r.n > 0)?.month as string
    expect(filterOf(m(ctx).drill.completions(month, 'Required'))).toMatchObject({
      period: 'custom',
      customStart: `${month}-01`,
    })
    for (const dim of ['department', 'location'] as const)
      expectFilterTo(
        ctx,
        {
          name: `overdue share by course and ${dim}`,
          rows: (x) =>
            dim === 'department' ? m(x).learning.overdueByDepartment : m(x).learning.overdueByLocation,
          key: (r: OverdueCell) => `${r.course} · ${r.group}`,
          value: (r) => (r.overdue == null ? null : r.share),
          drill: (r, x) => m(x).drill.overdueCell(dim, r, 'overdue'),
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
      const records = resolveDrill(f.drill)?.rows.length
      const after = m(applyDrillFilter(ctx, filter))
      if (f.id === 'talent-training-overdue') {
        // The overdue course, all of it now inside the group (the readout then looks deeper).
        expect(after.learning.concentration?.course).toBe(model.learning.concentration?.course)
        expect(after.learning.concentration?.overdue).toBe(records)
      } else {
        // The unit's figure in the new scope opens the same records (the readout compares a unit
        // with the rest of the scope, so a scope of one unit has no finding to compare).
        const bu = filter.businessUnit?.[0] as string
        const same = f.id.startsWith('talent-calibration-')
          ? after.drill.calibration(bu, 'all')
          : f.id.startsWith('talent-inflation-') || f.id === 'talent-good-distribution'
            ? after.drill.unitHigh(bu)
            : null
        expect(same, `${f.id} sets a filter the test does not check`).toBeTruthy()
        expect(resolveDrill(same)?.rows.length, f.id).toBe(records)
      }
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('sets filters only on org filters and a completions month, for values in the data', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes'])
    const model = m(ctx)
    const d = model.drill
    const p = model.performance
    const s = model.succession
    const l = model.learning
    const grouped: TalentDrill[] = [
      ...p.byDepartment.map((r) => d.highShare('department', r, 'high')),
      ...p.byBusinessUnit.map((r) => d.highShare('businessUnit', r, 'rated')),
      ...p.byLevel.map((r) => d.highShare('level', r, 'high')),
      ...p.mix.flatMap((r) => [d.mix(r.businessUnit, null), d.unitHigh(r.businessUnit)]),
      ...p.calibration.flatMap((r) => [
        d.calibration(r.businessUnit, 'all'),
        d.calibration(r.businessUnit, 'down'),
      ]),
      ...p.cycles.map((r) => d.cycleUnit(r.cycle, r.businessUnit)),
      ...s.coverageByUnit.map((r) => d.coverageCell(r.businessUnit, r.coverage)),
      ...s.bench.Critical.map((r) => d.bench('Critical', r.businessUnit, r.readiness)),
      ...s.benchTable.All.map((r) => d.benchRoles('All', r.businessUnit, 'none')),
      ...s.hipoByLevel.map((r) => d.hipo('level', r, 'assessed')),
      ...s.hipoByUnit.map((r) => d.hipo('businessUnit', r, 'high')),
      ...l.hours.map((r) => d.hours(r.businessUnit)),
      ...l.overdueByDepartment.map((r) => d.overdueCell('department', r, 'pastDue')),
      ...l.overdueByLocation.map((r) => d.overdueCell('location', r, 'overdue')),
      d.overdueSegment(),
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
    expect(n).toBeGreaterThan(40)
    for (const c of l.completions.filter((r) => r.completions > 0).slice(0, 3)) {
      const filter = filterOf(d.completions(c.month, c.kind)) as DrillFilter
      expect(Object.keys(filter).sort()).toEqual(['customEnd', 'customStart', 'period'])
      expect((filter.customStart as string) >= ctx.window.start).toBe(true)
      expect((filter.customEnd as string) <= ctx.window.end).toBe(true)
    }
    // Ratings, boxes, bands, drivers, courses, roles and the scope's own totals are no group.
    const none: TalentDrill[] = [
      d.ratedActive(),
      d.highPerformers(),
      d.rating(3),
      d.hipo(null, null, 'high'),
      d.coverage(),
      d.keyTalent(),
      d.band('High', 'scope'),
      d.onTime(null, 'onTime'),
      d.exitCohort(3, 'rated'),
      d.nineBox('High', 'High', 'all'),
      ...s.roles.slice(0, 3).map((r) => d.roleBench(r.roleId, null)),
    ]
    for (const g of none) expect(filterOf(g)).toBeUndefined()
  })
})
