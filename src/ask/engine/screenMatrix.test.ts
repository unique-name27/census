/**
 * The privacy matrix (docs/ASK.md, Tests) extended to the screen tools (docs/ASK-ACTIONS.md, part
 * 6): get_screen, every action tool and make_chart with a matrix of arguments, in HR and Manager
 * mode, over the whole company, a leader's org and a scope under the anonymity minimum, with Show
 * pay amounts, Show immigration details and engagement surveys all on. No result, action line,
 * chart or screen line may hold an employee or candidate name, a person ID, an email, a money
 * amount or a pay amount.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { DATASETS } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { VIEWS } from '@/views/registry'
import { groupableFields, QUERY_DATASETS } from './allowlist'
import type { FigureData } from './app'
import { Conversation } from './conversation'
import { screenLine } from './screen'
import { call, callScreen, envOf, fakeApp, leaks, sampleCtx } from './testkit'
import { COMPARE_BY } from './tools/summary'

const PAY_KEYS = DATASETS.flatMap((d) =>
  d.fields.filter((f) => f.pay || f.type === 'money').map((f) => f.key),
)

interface Scope {
  name: string
  ctx: AnalyticsContext
}

let scopes: Scope[] = []
let checked = 0
const problems: string[] = []

const on = { showPay: true, showImmigration: true, engagement: true }

function clean(what: string, text: string): void {
  checked++
  const l = leaks(text)
  if (l.length) problems.push(`${what}: ${l.slice(0, 3).join(', ')}`)
  for (const k of PAY_KEYS) if (text.includes(`"${k}":`)) problems.push(`${what}: pay key ${k}`)
}

/** Figures as a page could register them: grouped numbers, leaders by name, and a list of people with pay. */
function figuresFor(ctx: AnalyticsContext): FigureData[] {
  const leaders = leaderOptions(ctx.org, ctx.asOf).filter((l) => l.size >= 5)
  const people = ctx.all.employees.slice(0, 6)
  const comp = ctx.all.comp.slice(0, 6)
  const base = {
    subtitle: null,
    note: null,
    tier: 'bronze' as const,
    withheld: false,
    metric: null,
    view: 'hrbp',
    tab: 'overview',
  }
  return [
    {
      ...base,
      id: 'hrbp-by-location',
      title: 'Headcount by location',
      columns: [
        { key: 'location', label: 'Location' },
        { key: 'n', label: 'Headcount', format: 'int' },
      ],
      rows: ['Bengaluru', 'Austin', 'San Jose'].map((location, i) => ({ location, n: 40 + i })),
    },
    {
      ...base,
      id: 'hrbp-by-leader',
      title: 'Attrition by leader',
      columns: [
        { key: 'leader', label: 'Leader' },
        { key: 'rate', label: 'Rate', format: 'pct' },
        { key: 'cost', label: 'Cost', format: 'money', pay: true },
      ],
      rows: leaders.slice(0, 4).map((l, i) => ({
        leader: ctx.org.byId.get(l.id)?.name,
        rate: 0.05 * (i + 1),
        cost: comp[i]?.baseSalary ?? 100_000,
      })),
    },
    {
      ...base,
      id: 'hrbp-people',
      title: 'People and pay',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'id', label: 'Employee ID' },
        { key: 'mail', label: 'Email' },
        { key: 'salary', label: 'Salary', format: 'int' },
      ],
      rows: people.map((p, i) => ({
        name: p.name,
        id: p.employeeId,
        mail: `${p.employeeId.toLowerCase()}@northgate.example`,
        salary: comp[i]?.baseSalary ?? 120_000,
      })),
    },
  ]
}

beforeAll(() => {
  const company = sampleCtx(on)
  const leaders = leaderOptions(company.org, company.asOf)
  const mid = leaders.find((l) => l.size >= 40 && l.size <= 150) ?? leaders[3]
  const small = leaders.find((l) => l.size < 5) ?? leaders[leaders.length - 1]
  const managerId = leaders.find(
    (l) => l.size >= 25 && l.size <= 90 && company.org.byId.get(l.id)?.managerId,
  )?.id
  scopes = [
    { name: 'company', ctx: company },
    { name: 'leader', ctx: sampleCtx({ ...on, filters: { leaderId: mid?.id ?? null } }) },
    { name: 'small leader', ctx: sampleCtx({ ...on, filters: { leaderId: small?.id ?? null } }) },
    { name: 'manager', ctx: sampleCtx({ ...on, access: { mode: 'manager', managerId } }) },
  ]
}, 60_000)

describe('the privacy matrix for the screen tools', () => {
  it('holds for get_screen, every action and make_chart in every scope and mode', async () => {
    for (const scope of scopes) {
      const { ctx } = scope
      const leaderName = ctx.org.byId.get(leaderOptions(ctx.org, ctx.asOf)[1]?.id ?? '')?.name ?? 'Someone'
      const f = fakeApp(ctx, {
        route: { view: 'hrbp', tab: 'overview' },
        figures: figuresFor(ctx),
        savedViews: [
          {
            id: 'v1',
            name: `${leaderName}'s org`,
            page: { view: 'hrbp', tab: 'attrition' },
            filters: { ...DEFAULT_FILTERS, location: ['Bengaluru'], modes: {} },
          },
        ],
      })
      const env = envOf(ctx, { app: f.app })
      const conv = new Conversation()
      const run = async (name: string, input: unknown = {}) => {
        const r = await callScreen(conv, env, name, input)
        const what = `${scope.name} ${name} ${JSON.stringify(input).slice(0, 120)}`
        clean(what, r.content)
        clean(`${what} label`, r.label)
        if (r.action)
          clean(`${what} action`, JSON.stringify({ line: r.action.line, figure: r.action.figure }))
        if (r.chart) clean(`${what} chart`, JSON.stringify(r.chart))
        clean(`${what} screen line`, screenLine(f.app.screen(), ctx, VIEWS, conv.tokens))
        return r
      }
      const context = call(conv, env, 'get_context', {})
      const tokens = ((context.json.vocabularies as { leaders: { leader: string }[] }).leaders ?? []).map(
        (l) => l.leader,
      )
      await run('get_screen')
      // Filters, every way.
      for (const input of [
        { location: ['Bengaluru'] },
        { leader: tokens[1] },
        { leader: tokens[1], exclude: ['leader'] },
        { business_unit: ['Go-to-Market'], exclude: ['business_unit'] },
        { mode: 'replace', level: ['L4', 'L5'], period: 't6m' },
        { period: 'custom', start: '2026-01-01', end: '2026-06-30' },
        { location: [] },
      ])
        await run('set_filters', input)
      await run('get_screen')
      await run('reset_filters')
      // Every view and tab, the Data room and the pages.
      for (const v of VIEWS) {
        await run('open_view', { view: v.key })
        for (const t of v.tabs) await run('open_view', { view: v.key, tab: t.key })
      }
      await run('open_view', { view: 'data', metric: 'comp.payEquity.gap' })
      await run('open_view', { view: 'data', dataset: 'comp', panel: 'raw' })
      await run('open_view', { view: 'hrbp', tab: 'overview' })
      for (const fig of figuresFor(ctx)) {
        await run('show_figure', { figure: fig.id })
        await run('open_records', { figure: fig.id, row: String(Object.values(fig.rows[0] ?? {})[0]) })
      }
      // Records behind numbers of every view.
      for (const v of VIEWS.filter((x) => x.summary)) {
        const s = call(conv, env, 'view_summary', { view: v.key })
        const ref = ((s.json.key_figures as { ref: string | null }[] | undefined) ?? []).find(
          (k) => k.ref,
        )?.ref
        if (ref) await run('open_records', { ref })
      }
      await run('apply_saved_view', { name: `${leaderName}'s org` })
      await run('apply_saved_view', { name: 'nope' })
      // Charts from every dataset's groupings, every comparison, the key figures and the figures.
      for (const d of QUERY_DATASETS) {
        for (const g of groupableFields(d).slice(0, 6))
          await run('make_chart', {
            source: {
              tool: 'query_records',
              input: {
                dataset: d.key,
                group_by: [{ field: g.name, ...(g.kind === 'date' ? { by: 'year' } : {}) }],
                limit: 20,
              },
            },
            form: g.kind === 'date' ? 'lines' : 'bars',
            title: `${d.label} by ${g.label}`,
          })
      }
      for (const by of COMPARE_BY)
        await run('make_chart', {
          source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by } },
          form: 'bars',
          title: `Voluntary attrition by ${by}`,
        })
      await run('make_chart', {
        source: { tool: 'view_summary', input: { view: 'talent' } },
        form: 'bullets',
        title: 'Talent key figures',
      })
      for (const fig of figuresFor(ctx))
        await run('make_chart', { source: { figure: fig.id }, form: 'bars', title: fig.title })
    }
    console.info(`Screen privacy matrix: ${checked} checks`)
    expect(checked).toBeGreaterThan(500)
    expect(problems.slice(0, 10)).toEqual([])
  }, 240_000)
})
