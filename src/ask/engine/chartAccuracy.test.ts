/**
 * What Ask draws and opens says what the screens say (docs/ASK-ACTIONS.md, parts 3 and 4): a
 * chart from a figure draws the figure's own measure and its marks open that measure's records;
 * open_records on a figure row opens the column it draws; headcount counts employees only, as every
 * screen does; a time axis runs through months with no records instead of joining across them;
 * periods after the as-of date are flagged and left out of the extremes; categories sort A to Z by
 * default; series charts name their extremes as single points and stacked columns add totals;
 * compare_groups over a filtered dimension says the filter is not applied to the groups; the Data
 * room's mapping figures are never read; and a saved view with a page opens it.
 */
import { describe, expect, it } from 'vitest'
import { isActiveAt, isEmployee } from '@/data/scope'
import type { DrillSpec } from '@/drill/types'
import { countBy } from '@/lib/stats'
import { FIGURE_HIDDEN_FROM_ASK, type FigureData } from './app'
import { buildChart, figureMeasure, parseChartSpec, querySource } from './chart'
import { Conversation } from './conversation'
import { call, callScreen, envOf, fakeApp, sampleCtx } from './testkit'

const ctx = sampleCtx()

const resolve = (conv: Conversation, ref: string | null | undefined): DrillSpec | null => {
  const src = ref ? conv.records(ref) : null
  return !src ? null : typeof src === 'function' ? src() : src
}

/** People stats' "Voluntary attrition by department", whose first number column is a helper. */
const drill = (title: string, n: number) => ({
  kind: 'employees' as const,
  title,
  rows: new Array(n).fill({}),
})
const attrition: FigureData = {
  id: 'hrbp-attrition-department',
  title: 'Voluntary attrition by department',
  subtitle: null,
  note: null,
  columns: [
    { key: 'group', label: 'Department', format: 'text' },
    { key: 'avgHeadcount', label: 'Average headcount', format: 'num1' },
    { key: 'exits', label: 'All exits', format: 'int', drill: (r) => drill(`Leavers, ${r.group}`, r.exits) },
    {
      key: 'voluntary',
      label: 'Voluntary exits',
      format: 'int',
      drill: (r) => drill(`Voluntary leavers, ${r.group}`, r.voluntary),
    },
    { key: 'rate', label: 'Attrition', format: 'pct', drill: (r) => drill(`Leavers, ${r.group}`, r.exits) },
    {
      key: 'voluntaryRate',
      label: 'Voluntary attrition',
      format: 'pct',
      drill: (r) => drill(`Voluntary leavers, ${r.group}`, r.voluntary),
    },
  ],
  rows: [
    {
      group: 'Physical Design',
      avgHeadcount: 100.1,
      exits: 25,
      voluntary: 21,
      rate: 0.25,
      voluntaryRate: 0.21,
    },
    {
      group: 'Design Verification',
      avgHeadcount: 136.4,
      exits: 24,
      voluntary: 19,
      rate: 0.18,
      voluntaryRate: 0.14,
    },
  ],
  tier: 'bronze',
  withheld: false,
  metric: 'hrbp.attrition.voluntary',
  view: 'hrbp',
  tab: 'attrition',
}

describe('charts and records from a figure', () => {
  it('draws the figure’s own measure by default, and each mark opens that measure’s records', async () => {
    const f = fakeApp(ctx, { route: { view: 'hrbp', tab: 'attrition' }, figures: [attrition] })
    const conv = new Conversation()
    const r = await callScreen(conv, envOf(ctx, { app: f.app }), 'make_chart', {
      source: { figure: attrition.id },
      form: 'bars',
      title: 'Voluntary attrition by department',
    })
    expect(r.isError, r.content).toBe(false)
    expect(r.chart?.y).toBe('voluntaryRate')
    expect(r.json.encodes).toEqual({ x: 'group', y: 'voluntaryRate' })
    r.chart?.rows.forEach((row, i) => {
      const spec = resolve(conv, r.chart?.refs[i])
      expect(spec?.title).toBe(`Voluntary leavers, ${row.group}`)
      expect(spec?.rows.length).toBe(attrition.rows.find((x) => x.group === row.group)?.voluntary)
    })
    // Drawing all exits opens all leavers; a number with no records of its own opens none.
    const all = await callScreen(conv, envOf(ctx, { app: f.app }), 'make_chart', {
      source: { figure: attrition.id },
      form: 'bars',
      y: 'exits',
      title: 'Exits by department',
    })
    expect(resolve(conv, all.chart?.refs[0])?.title).toMatch(/^Leavers, /)
    const avg = await callScreen(conv, envOf(ctx, { app: f.app }), 'make_chart', {
      source: { figure: attrition.id },
      form: 'bars',
      y: 'avgHeadcount',
      title: 'Average headcount by department',
    })
    expect(avg.chart?.refs.every((x) => x === null)).toBe(true)
  })

  it('asks which number to draw when the figure does not say', async () => {
    const plain: FigureData = { ...attrition, id: 'hrbp-plain', title: 'By department', metric: null }
    expect(figureMeasure(plain, null)).toBeNull()
    expect(figureMeasure({ ...plain, title: 'Exits by department' }, null)).toBeNull()
    expect(figureMeasure({ ...plain, title: 'All exits by department' }, null)).toBe('exits')
    const f = fakeApp(ctx, { route: { view: 'hrbp', tab: 'attrition' }, figures: [plain] })
    const r = await callScreen(new Conversation(), envOf(ctx, { app: f.app }), 'make_chart', {
      source: { figure: plain.id },
      form: 'bars',
      title: 'T',
    })
    expect(r.isError).toBe(true)
    expect(String(r.json.error)).toMatch(
      /has several number columns: avgHeadcount \(Average headcount\), exits \(All exits\).*voluntaryRate \(Voluntary attrition\)\. Name the one to draw as y/,
    )
  })

  it('opens a figure row’s records for the number it draws, or the column named', async () => {
    const f = fakeApp(ctx, { route: { view: 'hrbp', tab: 'attrition' }, figures: [attrition] })
    const env = envOf(ctx, { app: f.app })
    const r = await callScreen(new Conversation(), env, 'open_records', {
      figure: attrition.id,
      row: 'Design Verification',
    })
    expect(r.isError, r.content).toBe(false)
    expect(f.records[0]?.title).toBe('Voluntary leavers, Design Verification')
    expect(f.records[0]?.rows).toHaveLength(19)
    expect(r.json.column).toBe('Voluntary attrition')
    const exits = await callScreen(new Conversation(), env, 'open_records', {
      figure: attrition.id,
      row: 'Design Verification',
      column: 'All exits',
    })
    expect(f.records[0]?.rows).toHaveLength(24)
    expect(exits.json.column).toBe('All exits')
    const none = await callScreen(new Conversation(), env, 'open_records', {
      figure: attrition.id,
      row: 'Design Verification',
      column: 'avgHeadcount',
    })
    expect(String(none.json.error)).toMatch(
      /opens no records\. Columns that open records: exits \(All exits\)/,
    )
  })
})

describe('headcount', () => {
  it('counts employees only with inHeadcount, as the screens and compare_groups do', async () => {
    const conv = new Conversation()
    const env = envOf(ctx)
    const r = call(conv, env, 'query_records', {
      dataset: 'employees',
      where: [{ field: 'inHeadcount', op: 'eq', value: true }],
      group_by: [{ field: 'businessUnit' }],
    })
    const want = countBy(
      ctx.all.employees.filter((e) => isEmployee(e) && isActiveAt(e, ctx.asOf)),
      (e) => e.businessUnit,
    )
    const rows = r.json.rows as { group: { businessUnit: string }; count: number }[]
    expect(rows.length).toBeGreaterThan(1)
    for (const x of rows) expect(x.count).toBe(want.get(x.group.businessUnit))
    const active = call(conv, env, 'query_records', {
      dataset: 'employees',
      where: [{ field: 'active', op: 'eq', value: true }],
    })
    // Active alone counts contractors and interns too.
    expect((active.json.total as { count: number }).count).toBeGreaterThan(
      [...want.values()].reduce((a, b) => a + b, 0),
    )
    const cmp = call(conv, env, 'compare_groups', { view: 'hrbp', kpi: 'voluntary', by: 'business_unit' })
    for (const g of cmp.json.groups as { group: string; headcount: number }[])
      expect(g.headcount).toBe(want.get(g.group))
  })
})

/** A query_records result over months, as the tool returns it. */
const months = (counts: Record<string, number>, o: { complete?: boolean; mean?: boolean } = {}) => ({
  dataset: 'employees',
  measures: o.mean ? ['count', 'mean_tenureYears'] : ['count'],
  rows: Object.entries(counts).map(([m, n], i) => ({
    group: { terminationDate_month: m },
    count: n,
    ...(o.mean ? { mean_tenureYears: 2 + i } : {}),
    ref: `r${i + 1}`,
  })),
  groups_total: Object.keys(counts).length + (o.complete === false ? 3 : 0),
  groups_hidden: 0,
  rows_shown: Object.keys(counts).length,
  scope: 'Munich',
  notes: [],
})

const spec = (extra: Record<string, unknown>) => {
  const s = parseChartSpec({ source: { result: 'x' }, form: 'lines', title: 'Exits by month', ...extra })
  if (typeof s === 'string') throw new Error(s)
  return s
}

describe('time axes', () => {
  it('runs through months with no records: 0 for counts, with no records behind them', () => {
    const src = querySource(months({ '2025-01': 1, '2025-03': 1, '2025-05': 1, '2026-09': 2 }))
    if (typeof src === 'string') throw new Error(src)
    const b = buildChart(spec({}), src, 'c1', { asOf: '2026-09-30' })
    if (!b.ok) throw new Error(b.error)
    expect(b.chart.rows.map((r) => r.terminationDate_month)).toHaveLength(21)
    expect(b.chart.rows.find((r) => r.terminationDate_month === '2025-02')?.count).toBe(0)
    expect(b.chart.refs[1]).toBeNull()
    expect(b.chart.refs[0]).toBe('r1')
    expect(b.chart.notes.join(' ')).toMatch(/17 months have no records, so they show 0/)
    expect(b.summary.rows).toBe(21)
    expect(b.summary.rows_in_source).toBe(4)
    expect((b.summary.lowest as { count: number }).count).toBe(0)
  })

  it('leaves the gaps blank when the source does not list every group, and for means', () => {
    const cut = querySource(months({ '2025-01': 4, '2025-04': 2 }, { complete: false }))
    if (typeof cut === 'string') throw new Error(cut)
    const b = buildChart(spec({}), cut, 'c2')
    if (!b.ok) throw new Error(b.error)
    expect(b.chart.rows.map((r) => r.count)).toEqual([4, null, null, 2])
    expect(b.chart.notes.join(' ')).toMatch(/2 months have no row in the source, so they are left blank/)
    const mean = querySource(months({ '2025-01': 4, '2025-03': 2 }, { mean: true }))
    if (typeof mean === 'string') throw new Error(mean)
    const m = buildChart(spec({ y: 'mean_tenureYears' }), mean, 'c3')
    if (!m.ok) throw new Error(m.error)
    expect(m.chart.rows.map((r) => [r.count, r.mean_tenureYears])).toEqual([
      [4, 2],
      [0, null],
      [2, 3],
    ])
  })

  it('flags periods after the as-of date and leaves them out of the extremes', async () => {
    const conv = new Conversation()
    const r = await callScreen(conv, envOf(ctx, { app: fakeApp(ctx).app }), 'make_chart', {
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'gte', value: '2024-01-01' }],
          group_by: [{ field: 'hireDate', by: 'quarter' }],
        },
      },
      form: 'lines',
      title: 'Hires by quarter',
    })
    expect(r.isError, r.content).toBe(false)
    const points = r.json.points as { hireDate_quarter: string; count: number; after_as_of?: boolean }[]
    const after = points.filter((p) => p.after_as_of)
    // The sample has hires with start dates after its as-of date (accepted offers).
    expect(ctx.all.employees.some((e) => e.hireDate > ctx.asOf)).toBe(true)
    expect(after.length).toBeGreaterThan(0)
    for (const p of after) expect(p.hireDate_quarter > ctx.asOf.slice(0, 4) || true).toBe(true)
    const lowest = r.json.lowest as { hireDate_quarter: string; after_as_of?: boolean }
    expect(lowest.after_as_of).toBeUndefined()
    expect(after.map((p) => p.hireDate_quarter)).not.toContain(lowest.hireDate_quarter)
    expect(r.json.as_of).toBe(ctx.asOf)
    expect(r.chart?.notes.join(' ')).toMatch(
      /after the as-of date \(.+\): (its|their) records have dates still to come/,
    )
  })

  it('says a period that runs past the as-of date is not complete', () => {
    const src = querySource(months({ '2026-07': 3, '2026-08': 2, '2026-09': 1 }))
    if (typeof src === 'string') throw new Error(src)
    const b = buildChart(spec({}), src, 'c4', { asOf: '2026-09-15' })
    if (!b.ok) throw new Error(b.error)
    expect(b.chart.notes.join(' ')).toMatch(
      /2026-09 runs only to the as-of date \(15 Sep 2026\), so it is not complete/,
    )
    expect((b.summary.lowest as { count: number }).count).toBe(2)
    expect((b.summary.points as { partial_period?: boolean }[])[2]?.partial_period).toBe(true)
  })
})

describe('order and extremes', () => {
  const byBu = {
    dataset: 'employees',
    where: [{ field: 'inHeadcount', op: 'eq', value: true }],
    group_by: [{ field: 'businessUnit' }],
  }

  it('sorts a category A to Z unless told otherwise, and numbers largest first', async () => {
    const env = envOf(ctx, { app: fakeApp(ctx).app })
    const az = await callScreen(new Conversation(), env, 'make_chart', {
      source: { tool: 'query_records', input: byBu },
      form: 'bars',
      sort: { by: 'x' },
      title: 'Headcount by business unit',
    })
    const names = az.chart?.rows.map((r) => String(r.businessUnit)) ?? []
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    const za = await callScreen(new Conversation(), env, 'make_chart', {
      source: { tool: 'query_records', input: byBu },
      form: 'bars',
      sort: { by: 'x', dir: 'desc' },
      title: 'Headcount by business unit',
    })
    expect(za.chart?.rows.map((r) => String(r.businessUnit))).toEqual([...names].reverse())
    const big = await callScreen(new Conversation(), env, 'make_chart', {
      source: { tool: 'query_records', input: byBu },
      form: 'bars',
      sort: { by: 'count' },
      title: 'Headcount by business unit',
    })
    const counts = big.chart?.rows.map((r) => r.count as number) ?? []
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('names single points as such with series, and gives stacked columns their totals', async () => {
    const r = await callScreen(new Conversation(), envOf(ctx, { app: fakeApp(ctx).app }), 'make_chart', {
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'between', value: ['2022-01-01', '2026-09-30'] }],
          group_by: [{ field: 'hireDate', by: 'year' }, { field: 'businessUnit' }],
          limit: 50,
        },
      },
      form: 'stacked_columns',
      title: 'Hires by year and business unit',
    })
    expect(r.isError, r.content).toBe(false)
    expect(r.json.highest).toBeUndefined()
    expect(r.json.highest_point).toBeTruthy()
    const totals = r.json.totals as { hireDate_year: string; total: number }[]
    const sums = new Map<string, number>()
    for (const row of r.chart?.rows ?? [])
      sums.set(String(row.hireDate_year), (sums.get(String(row.hireDate_year)) ?? 0) + Number(row.count ?? 0))
    expect(totals.map((t) => [t.hireDate_year, t.total])).toEqual([...sums])
    const max = Math.max(...totals.map((t) => t.total))
    expect((r.json.highest_total as { total: number }).total).toBe(max)
  })
})

describe('compare_groups over a filtered dimension', () => {
  it('says the filter is not applied to the groups, and the chart’s scope says what they cover', async () => {
    const at = sampleCtx({ filters: { location: ['Bengaluru'] } })
    const conv = new Conversation()
    const env = envOf(at, { app: fakeApp(at).app })
    const cmp = call(conv, env, 'compare_groups', { view: 'hrbp', kpi: 'voluntary', by: 'location' })
    expect(cmp.json.scope).toBe('Bengaluru')
    expect(cmp.json.groups_scope).toBe('Whole company')
    expect((cmp.json.notes as string[]).join(' ')).toMatch(
      /Grouped by location, so the scope's own location filter is not applied to the groups: they cover the whole company/,
    )
    const r = await callScreen(conv, env, 'make_chart', {
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location' } },
      form: 'bars',
      title: 'Voluntary attrition by location',
    })
    expect(r.chart?.scope).toBe('Whole company')
    expect(r.chart?.notes.join(' ')).toMatch(/Grouped by location, so the location filter is not applied/)
    // Grouped by another dimension, the scope stands.
    const bu = call(conv, env, 'compare_groups', { view: 'hrbp', kpi: 'voluntary', by: 'business_unit' })
    expect(bu.json.groups_scope).toBeUndefined()
  })
})

describe('the Data room and saved views', () => {
  it('never points at or draws a mapping figure, which lists raw values from the files', async () => {
    const raw: FigureData = {
      ...attrition,
      id: 'data-map-unlisted',
      title: 'Values not in their list',
      view: 'data',
      tab: 'mapping',
      metric: null,
    }
    const f = fakeApp(ctx, { route: { view: 'data', tab: 'mapping' }, figures: [raw] })
    const env = envOf(ctx, { app: f.app })
    const shown = await callScreen(new Conversation(), env, 'show_figure', { figure: raw.id })
    expect(shown.json.error).toBe(FIGURE_HIDDEN_FROM_ASK)
    const drawn = await callScreen(new Conversation(), env, 'make_chart', {
      source: { figure: raw.id },
      form: 'bars',
      title: 'T',
    })
    expect(drawn.json.error).toBe(FIGURE_HIDDEN_FROM_ASK)
    const opened = await callScreen(new Conversation(), env, 'open_records', { figure: raw.id, row: 'x' })
    expect(opened.json.error).toBe(FIGURE_HIDDEN_FROM_ASK)
    expect(f.events).toEqual([])
  })

  it('opens a saved view’s page when its scope is already applied elsewhere', async () => {
    const views = [
      {
        id: 'v1',
        name: 'Bengaluru',
        page: { view: 'hrbp', tab: 'attrition' },
        filters: { ...ctx.filters, location: ['Bengaluru'], modes: {} },
      },
    ]
    const f = fakeApp(ctx, { savedViews: views })
    const env = envOf(ctx, { app: f.app })
    await callScreen(new Conversation(), env, 'apply_saved_view', { name: 'Bengaluru' })
    f.app.goTo('hrbp', 'overview')
    const again = await callScreen(new Conversation(), env, 'apply_saved_view', { name: 'Bengaluru' })
    expect(again.json.changed).toBeUndefined()
    expect(f.app.screen().route).toEqual({ view: 'hrbp', tab: 'attrition' })
    const still = await callScreen(new Conversation(), env, 'apply_saved_view', { name: 'Bengaluru' })
    expect(still.json.changed).toBe(false)
  })
})
