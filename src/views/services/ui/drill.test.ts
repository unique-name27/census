/**
 * "Filter to this" on HR ops (docs/FILTERS.md, part 4): the figures whose marks are groups of a
 * filterable dimension reproduce their number after "Filter to", "Leave out" removes exactly that
 * group, and no drill in the view sets a filter on anything but the groups HR ops draws.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { filterDimensions, filterInData } from '@/drill/filter'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { computeCached } from '../engine'
import { servicesActions } from '../engine/actions'
import type { LeaveFact } from '../engine/leave'
import { sampleContext } from '../engine/testkit'
import { typeQuarterDrill } from '../engine/trendDrills'
import { finalPayCells, leaveUnitSegment, onLeaveUnitDrill, retroCells, unitCasesDrill } from './drill'

const ctx = sampleContext()
const model = (c: AnalyticsContext) => computeCached(c)

interface UnitBar {
  unit: string
  people: number
  unitRecords: LeaveFact[]
}

/** On leave now by business unit as the chart stacks it: one bar per unit, its segments summed. */
function unitBars(c: AnalyticsContext): UnitBar[] {
  const out = new Map<string, UnitBar>()
  for (const r of model(c).leave.onLeave) {
    const bar = out.get(r.unit) ?? { unit: r.unit, people: 0, unitRecords: r.unitRecords }
    bar.people += r.people
    out.set(r.unit, bar)
  }
  return [...out.values()]
}

describe('HR ops: Filter to and Leave out', () => {
  it('final pay by jurisdiction filters to its sites and keeps its exits and on-time rate', () => {
    const exits = {
      name: 'final pay exits by jurisdiction',
      rows: (c: AnalyticsContext) => model(c).finalPay,
      key: (r: { jurisdiction: string }) => r.jurisdiction,
      value: (r: { exits: number }) => r.exits,
      drill: (r: ReturnType<typeof model>['finalPay'][number], c: AnalyticsContext) =>
        finalPayCells(model(c).scope).all(r),
    }
    expectFilterTo(ctx, exits, { sample: 4 })
    expectLeaveOut(ctx, exits, { sample: 2 })
    expectFilterTo(ctx, {
      ...exits,
      name: 'final pay on time by jurisdiction',
      value: (r) => r.rate,
      kind: 'rate',
    })
    // A jurisdiction is the set of its sites: San Jose for California.
    const ca = model(ctx).finalPay.find((r) => r.jurisdiction === 'us-ca')
    expect(ca && resolveDrill(finalPayCells(model(ctx).scope).late(ca))?.filter).toEqual({
      location: ['San Jose'],
      modes: {},
    })
    // The actions name the jurisdiction, not its sites.
    expect(ca && resolveDrill(finalPayCells(model(ctx).scope).late(ca))?.filterLabel).toBe(ca?.name)
    // The folded row is no group.
    const other = model(ctx).finalPay.find((r) => r.jurisdiction === 'other')
    if (other) expect(resolveDrill(finalPayCells(model(ctx).scope).all(other))?.filter).toBeUndefined()
  }, 60_000)

  it('on leave now by business unit filters to the unit, and Leave out removes its people', () => {
    const bars = {
      name: 'on leave now by business unit',
      rows: unitBars,
      key: (r: UnitBar) => r.unit,
      value: (r: UnitBar) => r.people,
      drill: (r: UnitBar, c: AnalyticsContext) => onLeaveUnitDrill(model(c).scope)(r),
    }
    // From inside other filters too: units included and excluded, a leader's org, everyone but one.
    expectFilterTo(ctx, bars, { sample: 4, variants: true })
    expectLeaveOut(ctx, bars, { sample: 2, variants: true })
    // A reason segment within a unit keeps its number beside the unit's other reasons, and the
    // records name the unit, not the people's leave reasons.
    const segments = {
      name: 'on leave now by business unit and reason',
      rows: (c: AnalyticsContext) => model(c).leave.onLeave,
      key: (r: { unit: string; reason: string }) => `${r.unit} · ${r.reason}`,
      value: (r: { people: number }) => r.people,
      drill: (r: ReturnType<typeof model>['leave']['onLeave'][number], c: AnalyticsContext) =>
        leaveUnitSegment((x: typeof r) => onLeaveUnitDrill(model(c).scope)(x))(r),
      kind: 'rate' as const,
    }
    expectFilterTo(ctx, segments, { sample: 4 })
    for (const r of model(ctx).leave.onLeave.slice(0, 3))
      expect(resolveDrill(segments.drill(r, ctx))?.filter?.businessUnit).toEqual([r.unit])
  }, 60_000)

  it('a retro month filters to that cut-off month and shows the same changes and share', () => {
    const months = {
      name: 'job and pay changes by cut-off month',
      rows: (c: AnalyticsContext) => model(c).retro.filter((r) => r.changes > 0),
      key: (r: { month: string }) => r.month,
      value: (r: { changes: number }) => r.changes,
      drill: (r: ReturnType<typeof model>['retro'][number], c: AnalyticsContext) =>
        retroCells(model(c).scope).changes(r),
    }
    expectFilterTo(ctx, months, { sample: 3 })
    expectFilterTo(
      ctx,
      { ...months, name: 'retro share by month', value: (r) => r.share, kind: 'rate' },
      { sample: 3 },
    )
    const jan = model(ctx).retro.find((r) => r.month === '2026-01')
    expect(jan && resolveDrill(retroCells(model(ctx).scope).retro(jan))?.filter).toMatchObject({
      period: 'custom',
      customStart: '2026-01-01',
      customEnd: '2026-01-31',
    })
  }, 60_000)

  it('readout findings about a site or jurisdiction come back unchanged after Filter to', () => {
    const grouped = model(ctx).findings.filter((f) => resolveDrill(f.drill)?.filter)
    expect(grouped.map((f) => f.id)).toEqual(
      expect.arrayContaining(['services-final-pay-us-ca', 'services-final-pay-in']),
    )
    for (const f of grouped) {
      const filter = resolveDrill(f.drill)?.filter as DrillFilter
      expect(filterDimensions(filter), f.id).toEqual(['location'])
      const next = applyDrillFilter(ctx, filter)
      expect(model(next).findings.find((x) => x.id === f.id)?.title, f.id).toBe(f.title)
    }
  }, 60_000)
})

describe('HR ops: no drill sets a filter the view does not group by', () => {
  it('only business unit, location and a cut-off month, always for values in the data', () => {
    const m = model(ctx)
    const s = m.scope
    const sources: DrillSource[] = [
      ...m.kpis.map((k) => k.drill),
      ...m.findings.map((f) => f.drill),
      ...m.leave.kpis.map((k) => k.drill),
      ...m.leave.findings.map((f) => f.drill),
      ...servicesActions(ctx).map((a) => a.drill),
    ]
    const pay = finalPayCells(s)
    for (const r of m.finalPay)
      sources.push(
        pay.all(r),
        pay.late(r),
        pay.completedLate(r),
        pay.byExitType('Involuntary')(r),
        pay.byExitType('Voluntary')(r),
      )
    const retro = retroCells(s)
    for (const r of m.retro) sources.push(retro.retro(r), retro.changes(r))
    for (const r of unitBars(ctx)) sources.push(onLeaveUnitDrill(s)(r))
    // The design-refresh figures: a quarter cell carries its period, a unit's cases its unit.
    for (const c of m.txQuarters) sources.push(typeQuarterDrill(s, c))
    for (const r of m.per100.rows) sources.push(unitCasesDrill(s)(r))
    const vocab = vocabularyOf(ctx)
    let filtered = 0
    for (const src of sources) {
      const filter = resolveDrill(src)?.filter
      if (!filter) continue
      filtered++
      for (const d of filterDimensions(filter)) expect(['businessUnit', 'location']).toContain(d)
      if (filter.period !== undefined) expect(filter.period).toBe('custom')
      expect(filterInData(filter, vocab), JSON.stringify(filter)).toBe(true)
    }
    expect(filtered).toBeGreaterThan(10)
    // The KPI tiles and the Action center items are whole-scope numbers or single records.
    for (const k of [...m.kpis, ...m.leave.kpis]) expect(resolveDrill(k.drill)?.filter).toBeUndefined()
  }, 60_000)
})
