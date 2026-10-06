/**
 * "Filter to this" on Recruiting (docs/FILTERS.md, part 4): the grouped drills set the filter that
 * reproduces their group, the invariant holds on a sample of them (every tab with grouped
 * figures), month and quarter bars set their period, and no drill sets a filter on anything the
 * view does not scope by: stages, states, sources, recruiters, reasons and single records set none.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS, FILTER_DIMENSIONS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { canLeaveOut, filterInData } from '@/drill/filter'
import { applyDrillFilter, expectFilterTo, expectLeaveOut, rescopeContext } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { median } from '@/lib/stats'
import { computeRecruiting, type HiresMonthRow } from '../engine'
import {
  candidateDrill,
  flowDrill,
  hiresMonthDrill,
  leftDrill,
  nextStateDrill,
  outcomeDrill,
  pipelineCellDrill,
  pipelineStageDrill,
  quarterOffersDrill,
  queueOwnerDrill,
  recruiterDrill,
  reqMonthDrill,
  reqRowDrill,
  sourceDrill,
  sourceMonthDrill,
  speedCellDrill,
  stepDaysDrill,
} from '../engine/drills'
import { allProblemFindings } from '../engine/findings'
import { TRANSITIONS, transitionsIn } from '../engine/flow'
import type { MonthReqRow } from '../engine/reqs'
import { acceptance, type QuarterAcceptance } from '../engine/sources'
import { NEXT_STATES } from '../engine/types'
import { named, offersLocationDrill, openReqsDepartmentDrill, ttfDrill } from './drill'

const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter
const model = (x: AnalyticsContext) => computeRecruiting(x)

/** A month bar's drill, as the Requisitions tab builds it from both series of the month. */
function reqMonthSource(x: AnalyticsContext, r: MonthReqRow): DrillSource {
  const rows = model(x).openedFilled.filter((y) => y.month === r.month)
  const of = (s: MonthReqRow['series']) => rows.find((y) => y.series === s)?.list ?? []
  return r.reqs ? () => reqMonthDrill(model(x).base, r.month, of('Opened'), of('Filled'), r.series) : null
}

let ctx: AnalyticsContext
beforeAll(() => {
  const data = generateSample()
  ctx = buildContext({
    data,
    sources: Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>,
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })
}, 60_000)

describe('Filter to on Recruiting', () => {
  it('Overview: open reqs by department keep their count, and Leave out takes exactly them away', () => {
    const c = {
      name: 'open reqs by department',
      rows: (x: AnalyticsContext) => model(x).openByDepartment,
      key: (r: { department: string }) => r.department,
      value: (r: { open: number }) => r.open,
      drill: (r: Parameters<ReturnType<typeof openReqsDepartmentDrill>>[0], x: AnalyticsContext) =>
        openReqsDepartmentDrill(model(x).base)(r),
    }
    // From the default scope and from inside other filters: departments included and excluded,
    // one department alone, a leader's org and everyone except one.
    expectFilterTo(ctx, c, { sample: 4, variants: true })
    expectLeaveOut(ctx, c, { sample: 2, variants: true })
    // From inside another scope: the merge keeps the other filters.
    expectFilterTo(
      rescopeContext(ctx, { ...ctx.filters, location: ['Bengaluru'], modes: { location: 'exclude' } }),
      c,
      {
        sample: 2,
      },
    )
  })

  it('Overview and Requisitions: time to fill by level and by department keep the median and the count', () => {
    for (const dim of ['level', 'department'] as const)
      for (const value of ['days', 'reqs'] as const)
        expectFilterTo(
          ctx,
          {
            name: `time to fill by ${dim} (${value})`,
            rows: (x) => (dim === 'level' ? model(x).ttfByLevel : model(x).ttfByDepartment),
            key: (r) => r.group,
            value: (r) => r[value],
            drill: (r, x) => ttfDrill(model(x).base, dim)(r),
            kind: value === 'days' ? 'rate' : 'count',
          },
          { sample: 3 },
        )
    // A hidden median carries no records, so it neither drills nor filters.
    const m = model(ctx)
    for (const r of [...m.ttfByLevel, ...m.ttfByDepartment].filter((x) => x.days == null))
      expect(ttfDrill(m.base, 'level')(r)).toBeNull()
  })

  it('Overview: a month of offers accepted and a quarter of offer acceptance become the period', () => {
    expectFilterTo(
      ctx,
      {
        name: 'offers accepted by month',
        rows: (x) => model(x).hiresByMonth,
        key: (r: HiresMonthRow) => r.month,
        value: (r) => r.hires,
        drill: (r, x) => (r.hires ? () => hiresMonthDrill(model(x).base, r) : null),
        // The figure shows 24 months to the period's end, so only the month keeps its number.
        kind: 'rate',
      },
      { sample: 4 },
    )
    const m = model(ctx)
    for (const r of m.hiresByMonth.filter((x) => x.hires).slice(-3)) {
      const filter = filterOf(() => hiresMonthDrill(m.base, r)) as DrillFilter
      expect(filter.period).toBe('custom')
      expect(canLeaveOut(filter)).toBe(false)
      // The tile counts the same offers accepted.
      expect(model(applyDrillFilter(ctx, filter)).base.hires.length, r.month).toBe(r.hires)
    }
    const quarters = (x: AnalyticsContext) => model(x).acceptanceByQuarter
    expectFilterTo(
      ctx,
      {
        name: 'offer acceptance by quarter',
        rows: quarters,
        key: (q: QuarterAcceptance) => q.quarter,
        value: (q) => q.rate,
        drill: (q, x) => (q.apps.length ? () => quarterOffersDrill(model(x).base, q) : null),
        kind: 'rate',
      },
      { sample: 4 },
    )
    for (const q of quarters(ctx)
      .filter((x) => x.rate != null)
      .slice(-2)) {
      const filter = filterOf(() => quarterOffersDrill(m.base, q)) as DrillFilter
      expect(acceptance(model(applyDrillFilter(ctx, filter)).base.offers).rate, q.label).toBeCloseTo(
        q.rate as number,
        12,
      )
    }
  })

  it('Requisitions: a month of reqs opened or filled becomes the period and keeps its count', () => {
    expectFilterTo(
      ctx,
      {
        name: 'reqs opened and filled by month',
        rows: (x) => model(x).openedFilled,
        key: (r: MonthReqRow) => `${r.month} ${r.series}`,
        value: (r) => r.reqs,
        drill: (r, x) => reqMonthSource(x, r),
        kind: 'rate',
      },
      { sample: 4 },
    )
  })

  it('Sources: offer acceptance by location keeps the rate and the offers, on both bases', () => {
    const m = model(ctx)
    const q = m.latestQuarter
    for (const basis of ['period', 'quarter'] as const) {
      const rows = (x: AnalyticsContext) =>
        basis === 'quarter' ? model(x).acceptanceByLocationQuarter : model(x).acceptanceByLocation
      const w = (x: AnalyticsContext) =>
        basis === 'quarter' ? { start: q.start, end: q.end } : model(x).base.window
      for (const value of ['rate', 'offers'] as const)
        expectFilterTo(
          ctx,
          {
            name: `offer acceptance by location, ${basis} (${value})`,
            rows,
            key: (r) => r.group,
            value: (r) => r[value],
            drill: (r, x) => offersLocationDrill(model(x).base, w(x))(r),
            kind: value === 'rate' ? 'rate' : 'count',
          },
          { sample: 3 },
        )
      expectLeaveOut(
        ctx,
        {
          name: `offers resolved by location, ${basis}`,
          rows,
          key: (r) => r.group,
          value: (r) => r.offers,
          drill: (r, x) => offersLocationDrill(model(x).base, w(x))(r),
        },
        { sample: 2 },
      )
    }
    // The accepted and declined counts open the same site's offers with the same filter.
    const row = m.acceptanceByLocation.find((r) => r.rate != null && r.declined)
    expect(row).toBeDefined()
    if (row) {
      const all = filterOf(offersLocationDrill(m.base, m.base.window)(row))
      expect(all).toEqual({ location: [row.group], modes: {} })
      expect(filterOf(offersLocationDrill(m.base, m.base.window, 'Declined')(row))).toEqual(all)
    }
  })

  it('Readout: a slow group’s filled reqs reproduce its median under Filter to', () => {
    const b = model(ctx).base
    const slow = allProblemFindings(b).find((f) => f.id === 'rec-time-to-fill')
    expect(slow).toBeDefined()
    const spec = resolveDrill(slow?.drill)
    expect(spec?.filter).toEqual(slow?.filter && { ...slow.filter, modes: {} })
    const filter = spec?.filter as DrillFilter
    const rows = (spec?.rows ?? []) as Parameters<typeof b.ttf>[0][]
    expect(model(applyDrillFilter(ctx, filter)).ttf).toBe(median(rows.map(b.ttf)))
    // A bottleneck in a department, site or level: its steps over the recent months, with that
    // group and those months as the filter, so "Filter to" keeps the same steps and median.
    const neck = allProblemFindings(b).find((f) => f.id === 'rec-bottleneck')
    const neckSpec = resolveDrill(neck?.drill)
    if (neckSpec?.filter) {
      const f = neckSpec.filter
      expect(f.period).toBe('custom')
      expect(Object.keys(f).filter((k) => ['department', 'location', 'level'].includes(k))).toHaveLength(1)
      const after = model(applyDrillFilter(ctx, f)).base
      const ids = new Set(neckSpec.rows.map((r) => (r as { applicationId: string }).applicationId))
      const steps = TRANSITIONS.map((_, i) =>
        transitionsIn(after.apps, { start: f.customStart as string, end: f.customEnd as string }).filter(
          (e) => e.i === i,
        ),
      )
      expect(
        steps.some((list) => list.length === ids.size && list.every((e) => ids.has(e.app.id))),
        'the same steps after Filter to',
      ).toBe(true)
    }
    // Every other finding's number is the scope's, a stage's or a source's: no filter.
    for (const f of allProblemFindings(b).filter(
      (x) => x.id !== 'rec-time-to-fill' && x.id !== 'rec-bottleneck',
    ))
      expect(filterOf(f.drill), f.id).toBeUndefined()
  })

  it('Pipeline, tiles and the other figures set no filter: stages, states, sources and recruiters are not filters', () => {
    const m = model(ctx)
    const b = m.base
    const none: DrillSource[] = [
      ...m.kpis.flatMap((k) => [k.drill, k.deltaDrill, k.noteDrill]),
      ...m.pipeline.flatMap((s) => [
        () => pipelineStageDrill(b, s),
        () => pipelineStageDrill(b, s, true),
        ...s.cells.map((c) => () => pipelineCellDrill(b, c)),
      ]),
      ...NEXT_STATES.map((s) => () => nextStateDrill(b, s, s)),
      ...m.queue.map((g) => () => queueOwnerDrill(b, g)),
      ...m.waiting.slice(0, 20).map((d) => () => candidateDrill(b, d.item)),
      ...[0, 1, 2, 3, 4].flatMap((i) => [
        () => flowDrill(b, 'node', i),
        () => flowDrill(b, 'advanced', i),
        () => flowDrill(b, 'rejected', i),
        () => stepDaysDrill(b, i),
      ]),
      () => leftDrill(b),
      () => outcomeDrill(b, 'withdrawn'),
      ...m.speed.slice(0, 20).map((c) => () => speedCellDrill(b, c)),
      ...m.sources.flatMap((r) => [
        () => sourceDrill(b, r, 'applications'),
        () => sourceDrill(b, r, 'hires'),
      ]),
      ...m.sourcesByMonth.slice(0, 20).map((r) => () => sourceMonthDrill(b, r)),
      ...m.recruiters.map((r) => () => recruiterDrill(b, r, 'openReqs')),
      ...b.req.rows.slice(0, 20).map((r) => () => reqRowDrill(b, r, 'req')),
    ]
    for (const src of none) expect(filterOf(src)).toBeUndefined()
  })

  it('sets filters only on the org filters and the period, for values in the loaded data', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes', 'period', 'customStart', 'customEnd'])
    const m = model(ctx)
    const b = m.base
    const vocab = vocabularyOf(ctx)
    const grouped: DrillSource[] = [
      ...m.openByDepartment.map(openReqsDepartmentDrill(b)),
      ...m.ttfByLevel.map(ttfDrill(b, 'level')),
      ...m.ttfByDepartment.map(ttfDrill(b, 'department')),
      ...m.acceptanceByLocation.map(offersLocationDrill(b, b.window)),
      ...m.acceptanceByLocationQuarter.map(offersLocationDrill(b, m.latestQuarter)),
      ...m.hiresByMonth.map((r) => () => hiresMonthDrill(b, r)),
      ...m.acceptanceByQuarter.map((q) => () => quarterOffersDrill(b, q)),
      ...m.openedFilled.map((r) => reqMonthSource(ctx, r)),
      ...m.findings.map((f) => f.drill),
    ]
    let set = 0
    for (const src of grouped) {
      const f = filterOf(src)
      if (!f) continue
      set++
      for (const k of Object.keys(f)) expect(allowed.has(k), k).toBe(true)
      // A hiring manager's reqs are not the leader's whole org, so no recruiting drill names a leader.
      expect(f.leaderId).toBeUndefined()
      expect(filterInData(f, vocab), JSON.stringify(f)).toBe(true)
    }
    expect(set).toBeGreaterThan(20)
    // A bucket with no value is no group.
    expect(named('Not set')).toBeNull()
    const blank = { department: 'Not set', open: 1, oldest: 1, medianAge: 1, reqs: b.req.open.slice(0, 1) }
    expect(filterOf(openReqsDepartmentDrill(b)(blank))).toBeUndefined()
  })

  it('in a narrower scope, a department bar still reproduces itself', () => {
    const narrowed = rescopeContext(ctx, {
      ...ctx.filters,
      period: 't6m',
      level: ['L1'],
      modes: { level: 'exclude' },
    } as Filters)
    expectFilterTo(
      narrowed,
      {
        name: 'time to fill by department, not L1, last 6 months',
        rows: (x) => model(x).ttfByDepartment,
        key: (r) => r.group,
        value: (r) => r.reqs,
        drill: (r, x) => ttfDrill(model(x).base, 'department')(r),
      },
      { sample: 2 },
    )
  })
})
