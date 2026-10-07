/**
 * `make_chart` (docs/ASK-ACTIONS.md, parts 4 and 6) on the sample: every form validates; the data
 * equals the source tool's rows; refs open the counted records; suppression is carried over; a
 * figure's pay columns are left out and a figure that lists people is refused; bad specs come back
 * as errors Claude can act on; and what goes back to Claude is tokenized.
 */
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { DrillSpec } from '@/drill/types'
import type { FigureData } from './app'
import { type ChartForm, chartWithNames, parseChartSpec } from './chart'
import { Conversation } from './conversation'
import { call, callScreen, envOf, fakeApp, leaks, sampleCtx } from './testkit'

const ctx = sampleCtx()
const app = () => fakeApp(ctx).app
const env = () => envOf(ctx, { app: app() })

const ACTIVE = [{ field: 'active', op: 'eq', value: true }]
const byBu = { dataset: 'employees', where: ACTIVE, group_by: [{ field: 'businessUnit' }] }
const tenureByDept = {
  dataset: 'employees',
  where: ACTIVE,
  group_by: [{ field: 'department' }],
  measures: [{ op: 'count' }, { op: 'mean', field: 'tenureYears' }],
  limit: 30,
}

async function chart(spec: Record<string, unknown>, conv = new Conversation(), e = env()) {
  return callScreen(conv, e, 'make_chart', spec)
}

const resolve = (conv: Conversation, ref: string | null): DrillSpec | null => {
  const src = ref ? conv.records(ref) : null
  return !src ? null : typeof src === 'function' ? src() : src
}

describe('make_chart', () => {
  it('draws every form from a fitting source', async () => {
    const cases: [ChartForm, Record<string, unknown>][] = [
      ['bars', { source: { tool: 'query_records', input: byBu } }],
      [
        'columns',
        {
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: [{ field: 'hireDate', op: 'in_period', value: 'current' }],
              group_by: [{ field: 'hireDate', by: 'month' }],
            },
          },
        },
      ],
      [
        'stacked_columns',
        {
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: [{ field: 'hireDate', op: 'gte', value: '2023-01-01' }],
              group_by: [{ field: 'hireDate', by: 'year' }, { field: 'businessUnit' }],
              limit: 50,
            },
          },
        },
      ],
      [
        'lines',
        {
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: [{ field: 'hireDate', op: 'gte', value: '2024-01-01' }],
              group_by: [{ field: 'hireDate', by: 'quarter' }],
              sort: { by: 'group', dir: 'asc' },
            },
          },
        },
      ],
      [
        'heatmap',
        {
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: ACTIVE,
              group_by: [{ field: 'businessUnit' }, { field: 'level' }],
              limit: 50,
            },
          },
        },
      ],
      [
        'scatter',
        { source: { tool: 'query_records', input: tenureByDept }, x: 'count', y: 'mean_tenureYears' },
      ],
      [
        'dot_strip',
        { source: { tool: 'query_records', input: tenureByDept }, x: 'mean_tenureYears', y: 'department' },
      ],
      ['histogram', { source: { tool: 'query_records', input: tenureByDept }, x: 'mean_tenureYears' }],
      [
        'bullets',
        { source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location' } } },
      ],
    ]
    for (const [form, spec] of cases) {
      const conv = new Conversation()
      const r = await chart({ ...spec, form, title: `A ${form} chart` }, conv)
      expect(r.isError, `${form}: ${r.content.slice(0, 300)}`).toBe(false)
      expect(r.chart?.form).toBe(form)
      expect(r.chart?.rows.length, form).toBeGreaterThan(0)
      expect(r.chart?.refs).toHaveLength(r.chart?.rows.length ?? -1)
      expect(r.json.chart).toBe(r.chart?.id)
      expect(leaks(r.content), form).toEqual([])
      expect(leaks(JSON.stringify(r.chart)), form).toEqual([])
    }
  })

  it('draws exactly the source tool’s rows, and each ref opens the records it counts', async () => {
    const conv = new Conversation()
    const e = env()
    const direct = call(new Conversation(), e, 'query_records', byBu)
    const r = await chart(
      { source: { tool: 'query_records', input: byBu }, form: 'bars', title: 'Headcount by business unit' },
      conv,
      e,
    )
    const rows = (direct.json.rows as { group: { businessUnit: string }; count: number }[]).map((x) => [
      x.group.businessUnit,
      x.count,
    ])
    // Bars rank largest first, as query_records sorts by count.
    expect(r.chart?.rows.map((x) => [x.businessUnit, x.count])).toEqual(rows)
    expect(r.chart?.x).toBe('businessUnit')
    expect(r.chart?.y).toBe('count')
    r.chart?.rows.forEach((row, i) => {
      const spec = resolve(conv, r.chart?.refs[i] ?? null)
      expect(spec?.rows.length, String(row.businessUnit)).toBe(row.count)
    })
    const points = r.json.points as { businessUnit: string; count: number; ref: string }[]
    expect(points.map((p) => [p.businessUnit, p.count])).toEqual(rows)
    expect((r.json.highest as { businessUnit: string }).businessUnit).toBe(rows[0]?.[0])
  })

  it('carries the source’s suppression: hidden groups stay hidden and are said so', async () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf)
    const mid = leaders.find((l) => l.size >= 25 && l.size <= 90)!
    const conv = new Conversation()
    conv.tokens.index(ctx)
    const r = await chart(
      {
        source: {
          tool: 'query_records',
          input: {
            dataset: 'employees',
            where: ACTIVE,
            group_by: [{ field: 'level' }],
            measures: [{ op: 'count' }, { op: 'mean', field: 'tenureYears' }],
            filters: { leader: conv.tokens.forEmployee(mid.id) },
          },
        },
        form: 'bars',
        y: 'mean_tenureYears',
        title: 'Tenure by level',
      },
      conv,
    )
    expect(r.isError, r.content).toBe(false)
    const hidden = r.chart?.rows.filter((x) => x.mean_tenureYears == null) ?? []
    expect(hidden.length).toBeGreaterThan(0)
    for (const h of hidden) expect(typeof h.count === 'number' && h.count < 5).toBe(true)
    expect(r.chart?.notes.join(' ')).toMatch(/hidden/)
    expect(r.json.hidden_groups).toBe(hidden.length)
  })

  it('draws an earlier result by its tool_use id', async () => {
    const conv = new Conversation()
    const e = env()
    const prior = call(conv, e, 'compare_groups', { view: 'hrbp', kpi: 'voluntary', by: 'business_unit' })
    const results = (id: string) =>
      id === 'toolu_prior' ? { name: 'compare_groups', input: {}, content: prior.content } : undefined
    const r = await callScreen(
      conv,
      e,
      'make_chart',
      { source: { result: 'toolu_prior' }, form: 'bars', title: 'Voluntary attrition by business unit' },
      results,
    )
    expect(r.isError, r.content).toBe(false)
    const groups = prior.json.groups as { group: string; value: number | null; ref: string | null }[]
    const byGroup = new Map(r.chart?.rows.map((x, i) => [x.group, [x.value, r.chart?.refs[i]]]))
    for (const g of groups) expect(byGroup.get(g.group)).toEqual([g.value, g.ref])
    expect(r.chart?.metric).toBe('hrbp.attrition.voluntary')
    expect(r.chart?.columns.find((c) => c.key === 'value')?.format).toBe('pct')
    const none = await callScreen(conv, e, 'make_chart', {
      source: { result: 'toolu_x' },
      form: 'bars',
      title: 'T',
    })
    expect(String(none.json.error)).toMatch(/No earlier result "toolu_x"/)
  })

  it('draws a figure: pay columns left out, people refused, leaders allowed, refs from its drills', async () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf).filter((l) => l.size >= 5)
    const leaderName = (i: number) => ctx.org.byId.get(leaders[i]?.id as string)?.name as string
    const base: FigureData = {
      id: 'hrbp-by-leader',
      title: 'Attrition by leader',
      subtitle: null,
      note: null,
      columns: [
        { key: 'leader', label: 'Leader' },
        {
          key: 'rate',
          label: 'Voluntary attrition',
          format: 'pct',
          drill: (row: Record<string, unknown>) => ({
            kind: 'employees',
            title: `Leavers, ${row.leader}`,
            rows: [],
          }),
        },
        { key: 'cost', label: 'Salary cost', format: 'money', pay: true },
      ],
      rows: [
        { leader: leaderName(1), rate: 0.12, cost: 4_250_000 },
        { leader: leaderName(2), rate: 0.08, cost: 3_100_000 },
      ],
      tier: 'bronze',
      withheld: false,
      metric: 'hrbp.attrition.voluntary',
      view: 'hrbp',
      tab: 'attrition',
    }
    const ic = ctx.all.employees.find((e) => !ctx.org.children.get(e.employeeId)?.length)?.name as string
    const people: FigureData = { ...base, id: 'hrbp-people', rows: [{ leader: ic, rate: 0.5, cost: 1 }] }
    const f = fakeApp(ctx, { route: { view: 'hrbp', tab: 'attrition' }, figures: [base, people] })
    const conv = new Conversation()
    const e = envOf(ctx, { app: f.app })
    const r = await callScreen(conv, e, 'make_chart', {
      source: { figure: base.id },
      form: 'bars',
      title: 'Attrition by leader',
    })
    expect(r.isError, r.content).toBe(false)
    expect(r.chart?.columns.map((c) => c.key)).toEqual(['leader', 'rate'])
    expect(r.chart?.notes.join(' ')).toMatch(/Pay amounts are left out/)
    expect(String(r.chart?.rows[0]?.leader)).toMatch(/^\{\{P\d+\}\}$/)
    expect(leaks(r.content)).toEqual([])
    expect(leaks(JSON.stringify(r.chart))).toEqual([])
    expect(r.content).not.toContain('4250000')
    const spec = resolve(conv, r.chart?.refs[0] ?? null)
    expect(spec?.title).toMatch(/^Leavers, /)
    // Names come back here, never to Claude.
    const named = chartWithNames(r.chart!, (t) => conv.person(t)?.name ?? 'someone')
    expect(named.rows.map((x) => x.leader).sort()).toEqual([leaderName(1), leaderName(2)].sort())
    const refused = await callScreen(conv, e, 'make_chart', {
      source: { figure: people.id },
      form: 'bars',
      title: 'People',
    })
    expect(String(refused.json.error)).toMatch(/lists people one by one/)
    expect(leaks(refused.content)).toEqual([])
  })

  it('returns bad specs as errors that say what to fix', async () => {
    const q = { tool: 'query_records', input: byBu }
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ form: 'bars', title: 'T' }, /source is required/],
      [{ source: { tool: 'query_records', figure: 'x' }, form: 'bars', title: 'T' }, /exactly one of tool/],
      [{ source: { tool: 'get_context' }, form: 'bars', title: 'T' }, /source.tool must be one of/],
      [{ source: q, form: 'pie', title: 'T' }, /form must be one of bars, columns/],
      [{ source: q, form: 'bars' }, /title is required/],
      [{ source: q, form: 'bars', title: 'x'.repeat(120) }, /under 90 characters/],
      [{ source: q, form: 'bars', title: 'T', limit: 80 }, /limit must be a whole number from 1 to 50/],
      [
        { source: q, form: 'bars', title: 'T', y: 'salary' },
        /y "salary" is not a field of the source rows\. Fields: businessUnit \(a category\), count/,
      ],
      [
        { source: q, form: 'lines', title: 'T' },
        /lines needs x to be a month, quarter, year or date field; businessUnit is a category\. Use columns or bars/,
      ],
      [{ source: q, form: 'bullets', title: 'T' }, /bullets needs a target/],
      [{ source: q, form: 'histogram', title: 'T', x: 'count', limit: 4 }, /at least 5 values/],
      [
        { source: q, form: 'stacked_columns', title: 'T', series: 'businessUnit' },
        /x and series must be different/,
      ],
      [
        {
          source: {
            tool: 'query_records',
            input: {
              ...tenureByDept,
              group_by: [{ field: 'businessUnit' }, { field: 'department' }],
              limit: 50,
            },
          },
          form: 'columns',
          series: 'department',
          title: 'T',
        },
        /series has \d+ values; Census draws at most 8/,
      ],
      [
        { source: { tool: 'query_records', input: { dataset: 'nope' } }, form: 'bars', title: 'T' },
        /The source query_records call did not run/,
      ],
      [{ source: { figure: 'nope' }, form: 'bars', title: 'T' }, /No figure "nope"/],
      [
        {
          source: {
            tool: 'query_records',
            input: {
              dataset: 'employees',
              where: ACTIVE,
              group_by: [{ field: 'businessUnit' }, { field: 'level' }],
              limit: 50,
            },
          },
          form: 'columns',
          x: 'businessUnit',
          title: 'T',
        },
        /businessUnit ".+" appears in more than one row, so the rows need a series to tell them apart: level\. Name it as series/,
      ],
    ]
    for (const [spec, re] of cases) {
      const r = await chart(spec)
      expect(r.isError, JSON.stringify(spec).slice(0, 80)).toBe(true)
      expect(String(r.json.error)).toMatch(re)
      expect(r.chart).toBeUndefined()
    }
    // Stacked columns add values up: a rate does not stack.
    const rate = await chart({
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location' } },
      form: 'stacked_columns',
      series: 'group',
      x: 'headcount',
      title: 'T',
    })
    expect(rate.isError).toBe(true)
  })

  it('cleans the title to house style', () => {
    const spec = parseChartSpec({
      source: { figure: 'x' },
      form: 'bars',
      title: '  Attrition — by site. ',
      subtitle: 'Last 12 months',
    })
    expect(typeof spec === 'object' && spec.title).toBe('Attrition, by site')
  })
})
