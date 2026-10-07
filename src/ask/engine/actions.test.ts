/**
 * The action tools (docs/ASK-ACTIONS.md, parts 3 and 6) in every mode, on the sample, through a
 * fake app with a history stack and the mode's clamp and route guard: what each one changes, one
 * history entry per change, Undo, the Manager clamp and route guard, refusals worded for the mode,
 * and nothing changing when "Let Ask change the screen" is off.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { KIND_NOT_SHOWN } from '@/access/copy'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, type Filters, isActiveAt, isEmployee } from '@/data/scope'
import { VIEWS } from '@/views/registry'
import { type FigureData, undoAction } from './app'
import { Conversation } from './conversation'
import { screenToolDefinitions } from './screenTools'
import { call, callScreen, envOf, fakeApp, leaks, sampleCtx } from './testkit'
import { toolDefinitionsFor } from './tools'
import { ACTION_TOOLS, ACTIONS_OFF } from './tools/screenActions'

const hr = sampleCtx()
const developer = sampleCtx({ access: { mode: 'developer' } })
const leaders = leaderOptions(hr.org, hr.asOf)
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && hr.org.byId.get(l.id)?.managerId)!
let manager: AnalyticsContext

const F = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

/** A figure on People stats, Attrition, as the registry gives it. */
const attritionFigure: FigureData = {
  id: 'hrbp-attrition-by-location',
  title: 'Voluntary attrition by location',
  subtitle: null,
  note: null,
  columns: [
    { key: 'location', label: 'Location' },
    { key: 'rate', label: 'Voluntary attrition', format: 'pct' },
  ],
  rows: [
    { location: 'Bengaluru', rate: 0.188 },
    { location: 'San Jose', rate: 0.091 },
  ],
  tier: 'bronze',
  withheld: false,
  metric: 'hrbp.attrition.voluntary',
  view: 'hrbp',
  tab: 'attrition',
}

beforeAll(() => {
  manager = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })
}, 60_000)

describe('set_filters', () => {
  it('merges what it names into the scope on screen, as one history entry with Undo', async () => {
    const f = fakeApp(hr, { filters: F({ businessUnit: ['Silicon Engineering'] }) })
    const conv = new Conversation()
    const r = await callScreen(conv, envOf(hr, { app: f.app }), 'set_filters', {
      location: ['bengaluru'],
      period: 't6m',
    })
    expect(r.isError).toBe(false)
    expect(f.history).toHaveLength(2)
    const now = f.app.screen().filters
    expect(now.businessUnit).toEqual(['Silicon Engineering'])
    expect(now.location).toEqual(['Bengaluru'])
    expect(now.period).toBe('t6m')
    expect(r.json.changed).toEqual(['location', 'period'])
    expect(r.action?.line).toBe('Filtered to Silicon Engineering, Bengaluru, last 6 months')
    expect(r.scope?.filters.location).toEqual(['Bengaluru'])
    // Undo steps back to the entry before it.
    expect(r.action && undoAction(f.app, r.action)).toBe(true)
    expect(f.at).toBe(0)
    expect(f.app.screen().filters.location).toEqual([])
  })

  it('clears a filter with an empty list, and replace starts from the whole company', async () => {
    const start = F({ businessUnit: ['Silicon Engineering'], location: ['Bengaluru'] })
    const f = fakeApp(hr, { filters: start })
    const env = envOf(hr, { app: f.app })
    await callScreen(new Conversation(), env, 'set_filters', { location: [] })
    expect(f.app.screen().filters.location).toEqual([])
    expect(f.app.screen().filters.businessUnit).toEqual(['Silicon Engineering'])
    const g = fakeApp(hr, { filters: start })
    const r = await callScreen(new Conversation(), envOf(hr, { app: g.app }), 'set_filters', {
      mode: 'replace',
      location: ['Austin'],
    })
    expect(g.app.screen().filters.businessUnit).toEqual([])
    expect(g.app.screen().filters.location).toEqual(['Austin'])
    expect(r.action?.line).toBe('Filtered to Austin')
  })

  it('leaves values out with exclude, and says so in the line', async () => {
    const f = fakeApp(hr)
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'set_filters', {
      business_unit: ['Go-to-Market'],
      exclude: ['business_unit'],
    })
    expect(r.isError).toBe(false)
    expect(f.app.screen().filters.modes.businessUnit).toBe('exclude')
    expect(r.action?.line).toBe('Filtered to the whole company except Go-to-Market')
  })

  it('refuses values the data does not have, and exclusions that single people out; nothing changes', async () => {
    const f = fakeApp(hr)
    const env = envOf(hr, { app: f.app })
    const bad = await callScreen(new Conversation(), env, 'set_filters', { location: ['Atlantis'] })
    expect(bad.isError).toBe(true)
    expect(String(bad.json.error)).toMatch(/No location "Atlantis" in the data\. Locations: .*Bengaluru/)
    // A department of 1 to 4 active employees cannot be left out.
    const counts = new Map<string, number>()
    for (const e of hr.all.employees)
      if (isEmployee(e) && isActiveAt(e, hr.asOf))
        counts.set(e.department, (counts.get(e.department) ?? 0) + 1)
    const tiny = [...counts].find(([, n]) => n >= 1 && n < 5)?.[0]
    if (tiny) {
      const r = await callScreen(new Conversation(), env, 'set_filters', {
        department: [tiny],
        exclude: ['department'],
      })
      expect(r.isError).toBe(true)
      expect(String(r.json.error)).toMatch(/anonymity minimum/)
    }
    const empty = await callScreen(new Conversation(), env, 'set_filters', {})
    expect(String(empty.json.error)).toMatch(/Name at least one filter/)
    expect(f.history).toHaveLength(1)
  })

  it('changes nothing, and adds no entry, when the filters are already on', async () => {
    const f = fakeApp(hr, { filters: F({ location: ['Bengaluru'] }) })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'set_filters', {
      location: ['Bengaluru'],
    })
    expect(r.isError).toBe(false)
    expect(r.json.changed).toBe(false)
    expect(r.action).toBeUndefined()
    expect(f.history).toHaveLength(1)
  })
})

describe('reset_filters', () => {
  it('goes back to the whole company over the last 12 months, with Undo', async () => {
    const f = fakeApp(hr, { filters: F({ location: ['Bengaluru'], period: 't3m' }) })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'reset_filters')
    expect(r.action?.line).toBe('Reset the filters to the whole company, last 12 months')
    expect(f.app.screen().filters).toMatchObject({ period: 't12m', location: [] })
    expect(f.history).toHaveLength(2)
    if (r.action) undoAction(f.app, r.action)
    expect(f.app.screen().filters.location).toEqual(['Bengaluru'])
    const again = await callScreen(new Conversation(), envOf(hr, { app: fakeApp(hr).app }), 'reset_filters')
    expect(again.json.changed).toBe(false)
    expect(again.action).toBeUndefined()
  })
})

describe('open_view', () => {
  it('opens a view and tab by key or label as one entry, and lists its figures', async () => {
    const f = fakeApp(hr, { figures: [attritionFigure] })
    const env = envOf(hr, { app: f.app })
    const r = await callScreen(new Conversation(), env, 'open_view', { view: 'hrbp', tab: 'Attrition' })
    expect(r.isError).toBe(false)
    expect(f.app.screen().route).toEqual({ view: 'hrbp', tab: 'attrition' })
    expect(r.action?.line).toBe('Opened People stats, Attrition')
    expect(r.json.link).toBe('view:hrbp.attrition')
    expect((r.json.figures as { figure: string }[]).map((x) => x.figure)).toEqual([attritionFigure.id])
    expect(f.history).toHaveLength(2)
    if (r.action) undoAction(f.app, r.action)
    expect(f.app.screen().route).toEqual({ view: 'hrbp', tab: 'overview' })
  })

  it('opens the Data room at a dataset panel or a metric definition', async () => {
    const f = fakeApp(hr)
    const env = envOf(hr, { app: f.app })
    await callScreen(new Conversation(), env, 'open_view', {
      view: 'data',
      metric: 'hrbp.attrition.voluntary',
    })
    expect(f.app.screen().route).toEqual({ view: 'data', tab: 'metrics/hrbp/attrition/voluntary' })
    await callScreen(new Conversation(), env, 'open_view', {
      view: 'data',
      dataset: 'employees',
      panel: 'quality',
    })
    expect(f.app.screen().route).toEqual({ view: 'data', tab: 'employees-quality' })
  })

  it('names the tabs when one does not exist', async () => {
    const r = await callScreen(new Conversation(), envOf(hr, { app: fakeApp(hr).app }), 'open_view', {
      view: 'hrbp',
      tab: 'payroll',
    })
    expect(r.isError).toBe(true)
    expect(String(r.json.error)).toMatch(/People stats has no tab "payroll"\. Tabs: overview \(Overview\)/)
  })

  it('refuses in each mode what the mode hides, in the mode’s words', async () => {
    const h = fakeApp(hr)
    const dev = await callScreen(new Conversation(), envOf(hr, { app: h.app }), 'open_view', { view: 'dev' })
    expect(String(dev.json.error)).toMatch(/^The Developer page is not shown in HR mode\. Ask opens only/)
    const actions = await callScreen(new Conversation(), envOf(hr, { app: h.app }), 'open_view', {
      view: 'actions',
    })
    expect(String(actions.json.error)).toMatch(/^The Action center is not ready yet\./)
    expect(h.history).toHaveLength(1)
    const m = fakeApp(manager, { route: { view: 'team', tab: '' } })
    const env = envOf(manager, { app: m.app })
    const comp = await callScreen(new Conversation(), env, 'open_view', { view: 'comp' })
    expect(String(comp.json.error)).toMatch(/^Compensation is not shown in Manager mode\./)
    const tab = await callScreen(new Conversation(), env, 'open_view', { view: 'talent', tab: 'retention' })
    expect(String(tab.json.error)).toMatch(/^Talent, Retention risk is not shown in Manager mode\./)
    const data = await callScreen(new Conversation(), env, 'open_view', { view: 'data' })
    expect(String(data.json.error)).toMatch(/^The Data room is not shown in Manager mode\./)
    expect(m.history).toHaveLength(1)
    // Developer mode opens everything.
    const d = fakeApp(developer)
    const ok = await callScreen(new Conversation(), envOf(developer, { app: d.app }), 'open_view', {
      view: 'dev',
    })
    expect(ok.isError).toBe(false)
    expect(d.app.screen().route.view).toBe('dev')
  })
})

describe('show_figure', () => {
  it('points at a figure on the tab (an event for the UI), with nothing to undo', async () => {
    const f = fakeApp(hr, { route: { view: 'hrbp', tab: 'attrition' }, figures: [attritionFigure] })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'show_figure', {
      figure: attritionFigure.id,
      table: true,
    })
    expect(r.isError).toBe(false)
    expect(f.events).toEqual([{ id: attritionFigure.id, table: true }])
    expect(r.action).toMatchObject({
      tool: 'show_figure',
      line: 'Pointed to Voluntary attrition by location, as a table',
      undo: null,
      figure: { id: attritionFigure.id, table: true },
    })
    expect(f.history).toHaveLength(1)
  })

  it('lists the figures on the tab when the one asked for is not there, and words a hidden one for the mode', async () => {
    const f = fakeApp(hr, { route: { view: 'hrbp', tab: 'attrition' }, figures: [attritionFigure] })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'show_figure', {
      figure: 'nope',
    })
    expect(String(r.json.error)).toMatch(
      /No figure "nope" on People stats, Attrition\. Figures here: hrbp-attrition-by-location/,
    )
    const m = fakeApp(manager, { route: { view: 'team', tab: '' } })
    const hidden = await callScreen(new Conversation(), envOf(manager, { app: m.app }), 'show_figure', {
      figure: 'comp-compa-by-level',
    })
    expect(hidden.json.error).toBe('That figure is not shown in Manager mode.')
    expect(m.events).toEqual([])
  })
})

describe('open_records', () => {
  it('opens the records behind a ref, and offers Open again instead of Undo', async () => {
    const conv = new Conversation()
    const f = fakeApp(hr)
    const env = envOf(hr, { app: f.app })
    const s = call(conv, env, 'view_summary', { view: 'hrbp' })
    const ref = (s.json.key_figures as { ref: string | null }[]).find((k) => k.ref)?.ref as string
    const r = await callScreen(conv, env, 'open_records', { ref })
    expect(r.isError).toBe(false)
    expect(f.records).toHaveLength(1)
    expect(r.action?.line).toMatch(/^Opened the records for /)
    expect(leaks(r.content)).toEqual([])
    expect(leaks(r.action?.line ?? '')).toEqual([])
    // Closing the panel is the person's own undo: the line opens the same records again.
    expect(r.action?.undo).toBeNull()
    expect(r.action && undoAction(f.app, r.action)).toBe(false)
    expect(r.action?.records).toBe(f.records[0])
    expect(r.content).not.toMatch(/Undo/)
    const bad = await callScreen(conv, env, 'open_records', { ref: 'r999' })
    expect(String(bad.json.error)).toMatch(/There is no ref "r999"/)
  })

  it('opens a figure row’s records', async () => {
    const fig: FigureData = {
      ...attritionFigure,
      columns: [
        { key: 'location', label: 'Location' },
        {
          key: 'rate',
          label: 'Voluntary attrition',
          format: 'pct',
          drill: (row: Record<string, unknown>) => ({
            kind: 'employees',
            title: `Leavers in ${row.location}`,
            rows: [],
          }),
        },
      ],
    }
    const f = fakeApp(hr, { route: { view: 'hrbp', tab: 'attrition' }, figures: [fig] })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'open_records', {
      figure: fig.id,
      row: 'bengaluru',
    })
    expect(r.isError).toBe(false)
    expect(f.records[0]?.title).toBe('Leavers in Bengaluru')
  })

  it('keeps to the kinds of records Manager mode lists', async () => {
    const conv = new Conversation()
    const ref = conv.refs.add({ kind: 'cases', title: 'Open cases', rows: [] }, 'cases') as string
    const m = fakeApp(manager, { route: { view: 'team', tab: '' } })
    const r = await callScreen(conv, envOf(manager, { app: m.app }), 'open_records', { ref })
    expect(r.json.error).toBe(KIND_NOT_SHOWN)
    expect(m.records).toHaveLength(0)
  })
})

describe('apply_saved_view', () => {
  const views = [
    {
      id: 'v1',
      name: 'Bengaluru, year to date',
      page: { view: 'hrbp', tab: 'attrition' },
      filters: F({ location: ['Bengaluru'], period: 'ytd' }),
    },
  ]
  it('applies a saved view by name (scope and page) as one entry, with Undo', async () => {
    const f = fakeApp(hr, { savedViews: views })
    const r = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'apply_saved_view', {
      name: 'bengaluru, year to date',
    })
    expect(r.isError).toBe(false)
    expect(r.action?.line).toBe('Applied the saved view "Bengaluru, year to date"')
    expect(f.app.screen().filters.location).toEqual(['Bengaluru'])
    expect(f.app.screen().route).toEqual({ view: 'hrbp', tab: 'attrition' })
    expect(r.json.opened).toBe('People stats, Attrition')
    expect(f.history).toHaveLength(2)
    if (r.action) undoAction(f.app, r.action)
    expect(f.app.screen().filters.location).toEqual([])
    const bad = await callScreen(new Conversation(), envOf(hr, { app: f.app }), 'apply_saved_view', {
      name: 'Nope',
    })
    expect(String(bad.json.error)).toMatch(/No saved view "Nope"\. Saved views: "Bengaluru, year to date"/)
  })
})

describe('in Manager mode', () => {
  it('keeps every scope inside the org: the clamp, refusals for a leader outside it, no leader left out', async () => {
    const m = fakeApp(manager, { route: { view: 'hrbp', tab: 'overview' } })
    const env = envOf(manager, { app: m.app })
    const conv = new Conversation()
    const outside = leaders.find((l) => l.size >= 5 && !manager.access.lock?.orgIds.has(l.id))!
    conv.tokens.index(manager)
    const token = conv.tokens.forEmployee(outside.id)
    const r = await callScreen(conv, env, 'set_filters', { leader: token })
    expect(String(r.json.error)).toMatch(
      /In Manager mode a leader filter must be someone in \{\{P\d+\}\}'s org\./,
    )
    const ex = await callScreen(conv, env, 'set_filters', {
      leader: conv.tokens.forEmployee(mid.id),
      exclude: ['leader'],
    })
    expect(String(ex.json.error)).toMatch(/a leader cannot be left out/)
    expect(m.history).toHaveLength(1)
    // A location inside the org keeps the manager's org.
    const loc = manager.data.employees.find((e) => isEmployee(e) && isActiveAt(e, manager.asOf))
      ?.location as string
    const ok = await callScreen(conv, env, 'set_filters', { location: [loc] })
    expect(ok.isError, ok.content).toBe(false)
    expect(m.app.screen().filters.leaderId).toBe(mid.id)
    expect(ok.action?.line).toMatch(new RegExp(`^Filtered to \\{\\{P\\d+\\}\\}'s org, ${loc}$`))
    // Reset goes back to the manager's whole org.
    const reset = await callScreen(conv, env, 'reset_filters')
    expect(m.app.screen().filters).toMatchObject({ leaderId: mid.id, location: [] })
    expect(reset.action?.line).toMatch(/^Reset the filters to \{\{P\d+\}\}'s org, last 12 months$/)
    for (const run of [r, ex, ok, reset]) expect(leaks(run.content)).toEqual([])
  })
})

describe('"Let Ask change the screen" off', () => {
  it('refuses every action tool and changes nothing; reading and charts still work', async () => {
    for (const ctx of [hr, manager, developer]) {
      const f = fakeApp(ctx, {
        actions: false,
        route: { view: 'hrbp', tab: 'attrition' },
        figures: [attritionFigure],
      })
      const env = envOf(ctx, { app: f.app })
      const inputs: Record<string, unknown> = {
        set_filters: { location: ['Bengaluru'] },
        reset_filters: {},
        open_view: { view: 'talent' },
        show_figure: { figure: attritionFigure.id },
        open_records: { ref: 'r1' },
        apply_saved_view: { name: 'x' },
      }
      for (const name of ACTION_TOOLS) {
        const r = await callScreen(new Conversation(), env, name, inputs[name])
        expect(r.isError, `${ctx.access.mode} ${name}`).toBe(true)
        expect(r.json.error).toBe(ACTIONS_OFF)
        expect(r.action).toBeUndefined()
      }
      expect(f.history).toHaveLength(1)
      expect(f.events).toEqual([])
      const s = await callScreen(new Conversation(), env, 'get_screen')
      expect(s.isError).toBe(false)
      expect(s.json.can_change_screen).toBe(false)
    }
    // The tools sent leave the action tools out.
    expect(screenToolDefinitions(hr.access, VIEWS, false).map((t) => t.name)).toEqual([
      'get_screen',
      'make_chart',
    ])
  })
})

describe('the tool definitions per mode', () => {
  it('list only what each mode shows, keep one cache breakpoint on the last tool, and stay stable', () => {
    const props = (ctx: AnalyticsContext, name: string) =>
      (screenToolDefinitions(ctx.access, VIEWS, true).find((t) => t.name === name)?.input_schema.properties ??
        {}) as Record<string, { enum?: string[]; items?: { enum?: string[] } }>
    const openView = (ctx: AnalyticsContext) => props(ctx, 'open_view')
    const hrViews = openView(hr).view?.enum ?? []
    expect(hrViews).toContain('hrbp')
    expect(hrViews).toContain('data')
    expect(hrViews).not.toContain('dev')
    expect(hrViews).not.toContain('team')
    expect(hrViews).not.toContain('actions')
    const mViews = openView(manager).view?.enum ?? []
    expect(mViews).toContain('team')
    for (const hidden of ['comp', 'scorecard', 'services', 'compliance', 'listening', 'data', 'dev'])
      expect(mViews).not.toContain(hidden)
    expect(openView(manager).dataset).toBeUndefined()
    const dViews = openView(developer).view?.enum ?? []
    for (const v of ['dev', 'actions', 'team', 'comp', 'data']) expect(dViews).toContain(v)
    const exclude = (ctx: AnalyticsContext) => props(ctx, 'set_filters').exclude?.items?.enum
    expect(exclude(hr)).toContain('leader')
    expect(exclude(manager)).not.toContain('leader')
    for (const ctx of [hr, manager, developer]) {
      const tools = toolDefinitionsFor(ctx.access, { views: VIEWS, actions: true })
      expect(tools.filter((t) => t.cache_control)).toHaveLength(1)
      expect(tools.at(-1)?.cache_control).toEqual({ type: 'ephemeral' })
      expect(tools.at(-1)?.name).toBe('make_chart')
      expect(toolDefinitionsFor(ctx.access, { views: VIEWS, actions: true })).toBe(tools)
      for (const name of ['get_screen', ...ACTION_TOOLS, 'make_chart'])
        expect(
          tools.some((t) => t.name === name),
          `${ctx.access.mode} ${name}`,
        ).toBe(true)
      // Without the app: the data tools only, as before.
      expect(toolDefinitionsFor(ctx.access).some((t) => t.name === 'get_screen')).toBe(false)
    }
  })
})
