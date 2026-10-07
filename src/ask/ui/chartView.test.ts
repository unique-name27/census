/**
 * A chart Ask drew, as the chart kit draws it (docs/ASK-ACTIONS.md, part 4): every form maps to
 * its kit component with the encoded fields; rows keep their order and their index, so a mark
 * opens its own row's records; quarters on a line are named; categories read as text; the
 * columns the table and exports use are the source's fields with the drawn number drilling.
 */
import { describe, expect, it } from 'vitest'
import { type AskChart, Conversation } from '@/ask/engine'
import { callScreen, envOf, fakeApp, sampleCtx } from '@/ask/engine/testkit'
import { chartNote, chartView, distinctOf, measureOf, ROW_INDEX, refOf, refsOf, rowFormat } from './chartView'

const ctx = sampleCtx()
const env = () => envOf(ctx, { app: fakeApp(ctx).app })

const ACTIVE = [{ field: 'active', op: 'eq', value: true }]
const byBu = { dataset: 'employees', where: ACTIVE, group_by: [{ field: 'businessUnit' }] }
const tenureByDept = {
  dataset: 'employees',
  where: ACTIVE,
  group_by: [{ field: 'department' }],
  measures: [{ op: 'count' }, { op: 'mean', field: 'tenureYears' }],
  limit: 30,
}

async function draw(spec: Record<string, unknown>): Promise<{ chart: AskChart; conv: Conversation }> {
  const conv = new Conversation()
  const r = await callScreen(conv, env(), 'make_chart', { title: 'A chart', ...spec })
  if (!r.chart) throw new Error(r.content)
  return { chart: r.chart, conv }
}

describe('chartView', () => {
  it('draws bars as a ranked BarList, in the engine’s order, each row keeping its index', async () => {
    const { chart } = await draw({ source: { tool: 'query_records', input: byBu }, form: 'bars' })
    const v = chartView(chart)
    expect(v.spec).toEqual({ kit: 'BarList', label: 'businessUnit', value: 'count', format: 'int' })
    expect(v.rows.map((r) => r.businessUnit)).toEqual(chart.rows.map((r) => r.businessUnit))
    v.rows.forEach((r, i) => {
      expect(r[ROW_INDEX]).toBe(i)
      expect(refOf(chart, r)).toBe(chart.refs[i])
    })
    expect(v.measure).toBe('count')
    expect(v.columns.find((c) => c.key === 'count')?.drills).toBe(true)
    expect(v.columns.find((c) => c.key === 'businessUnit')?.drills).toBe(false)
    // The index is not a column: exports show the source's fields only.
    expect(v.columns.some((c) => c.key === ROW_INDEX)).toBe(false)
  })

  it('draws bars with a series as grouped HBars', async () => {
    const { chart } = await draw({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: ACTIVE,
          group_by: [{ field: 'businessUnit' }, { field: 'employmentType' }],
          limit: 50,
        },
      },
      form: 'bars',
      x: 'businessUnit',
      series: 'employmentType',
    })
    const v = chartView(chart)
    expect(v.spec.kit).toBe('HBars')
    if (v.spec.kit !== 'HBars') return
    expect(v.spec.y).toBe('businessUnit')
    expect(v.spec.x).toBe('count')
    expect(v.spec.seriesOrder).toEqual(distinctOf(v.rows, 'employmentType'))
  })

  it('draws columns over months on a time band, and stacked columns stacked', async () => {
    const { chart } = await draw({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'in_period', value: 'current' }],
          group_by: [{ field: 'hireDate', by: 'month' }],
        },
      },
      form: 'columns',
    })
    const v = chartView(chart)
    expect(v.spec).toMatchObject({ kit: 'Columns', x: chart.x, y: 'count', stack: false, xType: 'month' })
    expect(chart.x).toMatch(/^hireDate/)
    const stacked = chartView(
      (
        await draw({
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: [{ field: 'hireDate', op: 'gte', value: '2023-01-01' }],
              group_by: [{ field: 'hireDate', by: 'year' }, { field: 'businessUnit' }],
              limit: 50,
            },
          },
          form: 'stacked_columns',
        })
      ).chart,
    )
    expect(stacked.spec).toMatchObject({ kit: 'Columns', stack: true, series: 'businessUnit', xType: 'band' })
  })

  it('names quarters on a line drawn at their first month', async () => {
    const { chart } = await draw({
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'gte', value: '2024-01-01' }],
          group_by: [{ field: 'hireDate', by: 'quarter' }],
          sort: { by: 'group', dir: 'asc' },
        },
      },
      form: 'lines',
    })
    const v = chartView(chart)
    expect(v.spec.kit).toBe('Lines')
    if (v.spec.kit !== 'Lines') return
    expect(v.spec.x).toBe('__x')
    const names = v.spec.xNames ?? {}
    for (const r of v.rows) expect(names[r.__x as string]).toBe(String(r[chart.xLabel ?? '']))
    expect(Object.keys(names).length).toBe(v.rows.length)
    // The helper field is not a column.
    expect(v.columns.some((c) => c.key === '__x')).toBe(false)
  })

  it('maps heatmap, scatter, dot strip, histogram and bullets to their kit components', async () => {
    const heat = chartView(
      (
        await draw({
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: ACTIVE,
              group_by: [{ field: 'businessUnit' }, { field: 'level' }],
              limit: 50,
            },
          },
          form: 'heatmap',
        })
      ).chart,
    )
    expect(heat.spec).toMatchObject({ kit: 'Heatmap', value: 'count' })
    if (heat.spec.kit === 'Heatmap') {
      expect(heat.spec.xOrder).toEqual(distinctOf(heat.rows, heat.spec.x))
      expect(heat.spec.yOrder).toEqual(distinctOf(heat.rows, heat.spec.y))
    }
    const scatter = chartView(
      (
        await draw({
          source: { tool: 'query_records', input: tenureByDept },
          form: 'scatter',
          x: 'count',
          y: 'mean_tenureYears',
        })
      ).chart,
    )
    expect(scatter.spec).toMatchObject({
      kit: 'Scatter',
      x: 'count',
      y: 'mean_tenureYears',
      label: 'department',
    })
    // Both numbers a scatter draws open the records.
    expect(scatter.columns.filter((c) => c.drills).map((c) => c.key)).toEqual(
      expect.arrayContaining(['count', 'mean_tenureYears']),
    )
    const strip = chartView(
      (
        await draw({
          source: { tool: 'query_records', input: tenureByDept },
          form: 'dot_strip',
          x: 'mean_tenureYears',
          y: 'department',
        })
      ).chart,
    )
    expect(strip.spec).toMatchObject({ kit: 'DotStrip', x: 'mean_tenureYears', y: 'department' })
    const hist = await draw({
      source: { tool: 'query_records', input: tenureByDept },
      form: 'histogram',
      x: 'mean_tenureYears',
    })
    const hv = chartView(hist.chart)
    expect(hv.spec).toMatchObject({ kit: 'Histogram', value: 'mean_tenureYears' })
    // A bin opens the records of every row in it.
    expect(refsOf(hist.chart, hv.rows.slice(0, 3))).toEqual(
      hist.chart.refs.slice(0, 3).filter((r): r is string => !!r),
    )
    const bullets = await draw({
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location' } },
      form: 'bullets',
    })
    const bv = chartView(bullets.chart)
    expect(bv.spec).toEqual({ kit: 'BulletList', label: 'group', value: 'value', target: 'target' })
    expect(bv.columns.find((c) => c.key === 'target')?.drills).toBe(false)
    expect(rowFormat(bullets.chart, 'value', bv.rows[0] ?? {})).toBe('pct')
  })

  it('reads true and false as Yes and No where they name a group', () => {
    const chart: AskChart = {
      id: 'ask-chart-1',
      title: 'Leavers by regret',
      subtitle: null,
      form: 'bars',
      rows: [
        { regrettable: true, count: 12 },
        { regrettable: false, count: 30 },
      ],
      columns: [
        { key: 'regrettable', label: 'Regrettable', kind: 'boolean', format: 'text' },
        { key: 'count', label: 'Count', kind: 'number', format: 'int' },
      ],
      x: 'regrettable',
      xLabel: 'regrettable',
      y: 'count',
      series: null,
      value: null,
      target: null,
      label: null,
      xType: 'band',
      refs: ['r1', null],
      notes: ['1 group has its numbers hidden: fewer than 5 people'],
      source: 'Employees, counted from records',
      scope: 'Bengaluru',
      period: 'last 12 months',
      tier: 'gold',
      metric: null,
    }
    const v = chartView(chart)
    expect(v.rows.map((r) => r.regrettable)).toEqual(['Yes', 'No'])
    expect(refOf(chart, v.rows[1])).toBeNull()
    expect(measureOf(chart)).toBe('count')
    expect(chartNote(chart)).toBe(
      'Bengaluru, last 12 months. 1 group has its numbers hidden: fewer than 5 people.',
    )
  })
})

describe('mergeDrills', () => {
  it('opens a bin’s rows together when they are of one kind', async () => {
    const { mergeDrills } = await import('./chartView')
    const a = { kind: 'employees', title: 'A', rows: [{ id: 1 }], filter: { location: ['X'] } }
    const b = { kind: 'employees', title: 'B', rows: [{ id: 2 }, { id: 3 }] }
    const merged = mergeDrills([a, null, b] as never, '2 to 3 yrs')
    expect(merged?.title).toBe('2 to 3 yrs')
    expect(merged?.rows).toHaveLength(3)
    // A merged list is not one group, so it offers no "Filter to this".
    expect(merged && 'filter' in merged).toBe(false)
    expect(mergeDrills([a] as never, 'x')).toBe(a)
    expect(mergeDrills([a, { ...b, kind: 'cases' }] as never, 'x')).toBeNull()
    expect(mergeDrills([], 'x')).toBeNull()
  })
})
