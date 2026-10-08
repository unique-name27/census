/**
 * The action tools (docs/ASK-ACTIONS.md, part 3): `set_filters`, `reset_filters`, `open_view`,
 * `show_figure`, `open_records` and `apply_saved_view`. Each runs here through the app's own
 * functions (`AskApp`: the store's filters with the mode's clamp, `goTo` with the route guard,
 * the figure registry, the records panel, the saved views) and returns a short description of the
 * new state for Claude, plus an action record for the answer's action line and Undo.
 *
 * Actions never change data, settings, the mode, metric definitions, mappings or official lists.
 * In every mode each action passes the same clamp and route guard as a click (Manager's org, a
 * business unit, a region, a recruiter's reqs, Finance's business unit and period), and a refusal
 * says why in the mode's words. Nothing here is sent before the privacy pass in `runScreenTool`.
 */
import { kindNotShown, modeName } from '@/access/copy'
import { routeDecision } from '@/access/policy'
import { clampFilters } from '@/access/scopes/clamp'
import { scopeOfAccess } from '@/access/scopes/records'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import { DATASET_KEYS } from '@/data/schema'
import { DEFAULT_FILTERS, type FilterDimension, type Filters, isExcluded, sameFilters } from '@/data/scope'
import type { RouteView } from '@/data/store'
import { DEV_TAB_KEYS, devTab, parseDevTab } from '@/dev/tabs'
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { agentsTab, areasOfTab } from '@/views/ai/catalog/summary'
import { DATA_TABS, DATASET_PANELS, type DatasetPanel, datasetTab } from '@/views/data/links'
import { metricsTab } from '@/views/data/metrics/links'
import {
  type ActionPart,
  type ActionTool,
  type AppSnapshot,
  type AskAction,
  type AskApp,
  FIGURE_HIDDEN_FROM_ASK,
  figureHiddenFromAsk,
  type ScreenState,
} from '../app'
import { figureMeasure } from '../chart'
import { scopeText } from '../roles'
import type { FilterInput } from '../scope'
import { contextFor, type ExcludeArg, resolveFilters, scopeOut } from '../scope'
import { periodWords, placeOf, placeWords, scopeInWords, shownViews } from '../screen'
import { figureHelpers, figureRefusal, isIdColumn, listsPeople, recordsForClaude } from '../screenPrivacy'
import { inputOf, type ToolRuntime, unknownKeys, viewLink } from './shared'

/** The records behind a number (a spec, or a function that builds one). */
const resolveDrill = (src: DrillSource): DrillSpec | null =>
  !src ? null : typeof src === 'function' ? src() : src

/** What an action tool returns before the privacy pass. */
export type ActionOutput =
  | {
      ok: true
      value: Record<string, unknown>
      /** The action line and Undo; absent when nothing changed. */
      action?: AskAction
      /** The scope now in force, so later tools in the same answer compute for it. */
      scope?: { filters: Filters; standard: DataStandard }
    }
  | { ok: false; error: string }

const fail = (error: string): ActionOutput => ({ ok: false, error })

/** The refusal when "Let Ask change the screen" is off. */
export const ACTIONS_OFF =
  'Changing the screen is turned off in Settings > Ask Census ("Let Ask change the screen"), so nothing changed. Give the person a view link instead, such as [People stats, Attrition](view:hrbp.attrition), and say what they will find there.'

const UNDO_NOTE = 'The person can undo this with Undo on the action line, or with Back.'

/** The action record for a change from `before` to the screen now. */
function actionOf(
  id: string,
  tool: ActionTool,
  line: string,
  app: AskApp,
  before: AppSnapshot,
  parts: readonly ActionPart[],
): AskAction {
  return { id, tool, line, undo: { before, after: app.snapshot(), parts } }
}

/** The live context for the filters on screen (the store's, after the clamp). */
const ctxFor = (rt: ToolRuntime, state: ScreenState): AnalyticsContext => contextFor(rt.base, state.filters)

/* ───────────── set_filters ───────────── */

const FILTER_ARGS = ['leader', 'business_unit', 'department', 'location', 'level'] as const
const ARG_DIM: Readonly<Record<(typeof FILTER_ARGS)[number], FilterDimension>> = {
  leader: 'leaderId',
  business_unit: 'businessUnit',
  department: 'department',
  location: 'location',
  level: 'level',
}
const SET_KEYS = ['mode', ...FILTER_ARGS, 'period', 'start', 'end', 'exclude']

/** The filters on screen as a tool's `filters` argument (leader as a token). */
function asInput(f: Filters, rt: ToolRuntime): Record<string, unknown> {
  const out: Record<string, unknown> = { period: f.period }
  if (f.period === 'custom' && f.customStart && f.customEnd) {
    out.start = f.customStart
    out.end = f.customEnd
  }
  if (f.leaderId) out.leader = rt.tokens.forEmployee(f.leaderId)
  for (const a of FILTER_ARGS) {
    const d = ARG_DIM[a]
    if (d !== 'leaderId' && f[d].length) out[a] = [...f[d]]
  }
  const exclude = FILTER_ARGS.filter((a) => {
    const d = ARG_DIM[a]
    return isExcluded(f, d) && (d === 'leaderId' ? !!f.leaderId : f[d].length > 0)
  })
  if (exclude.length) out.exclude = exclude
  return out
}

const isBlank = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * The filters `set_filters` asks for. `merge` (the default) changes only the filters it names
 * (an empty list or "" clears one) and keeps the rest of the screen's scope; `replace` starts from
 * the whole company. The period stays unless given. Values, leaders and exclusions follow the
 * same rules as every tool's `filters`, and the result goes through the mode's clamp.
 */
export function actionFilters(
  rt: ToolRuntime,
  current: Filters,
  raw: Record<string, unknown>,
): { ok: true; filters: Filters } | { ok: false; error: string } {
  const bad = unknownKeys(raw, SET_KEYS)
  if (bad) return { ok: false, error: bad }
  const mode = raw.mode ?? 'merge'
  if (mode !== 'merge' && mode !== 'replace') return { ok: false, error: 'mode must be merge or replace.' }
  const { mode: _mode, ...asked } = raw
  if (!Object.keys(asked).length)
    return {
      ok: false,
      error:
        'Name at least one filter to set (leader, business_unit, department, location, level, period). To go back to the defaults, use reset_filters.',
    }
  const base = contextFor(rt.base, current)
  if (mode === 'replace') {
    const input: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(asked)) if (!isBlank(v)) input[k] = v
    return resolveFilters(base, input, rt.tokens)
  }
  // Merge: the screen's filters, then what was named over them.
  const merged = asInput(current, rt)
  const named = new Set(Object.keys(asked))
  const inherited = ((merged.exclude as ExcludeArg[] | undefined) ?? []).filter((a) => !named.has(a))
  delete merged.exclude
  for (const a of FILTER_ARGS) {
    if (!named.has(a)) continue
    if (isBlank(asked[a])) delete merged[a]
    else merged[a] = asked[a]
  }
  if (named.has('period') || named.has('start') || named.has('end')) {
    delete merged.start
    delete merged.end
    for (const k of ['period', 'start', 'end']) if (named.has(k) && !isBlank(asked[k])) merged[k] = asked[k]
    if (merged.period === 'custom' || named.has('start') || named.has('end')) merged.period = 'custom'
  }
  const askedExclude =
    asked.exclude == null ? [] : Array.isArray(asked.exclude) ? asked.exclude : [asked.exclude]
  const exclude = [...new Set([...inherited, ...askedExclude])]
  if (exclude.length) merged.exclude = exclude
  return resolveFilters(base, merged as FilterInput, rt.tokens)
}

/** Which parts of the scope differ, in the tools' words. */
function changedParts(a: Filters, b: Filters): string[] {
  const out: string[] = []
  for (const arg of FILTER_ARGS) {
    const d = ARG_DIM[arg]
    const va = d === 'leaderId' ? [a.leaderId ?? ''] : [...a[d]].sort()
    const vb = d === 'leaderId' ? [b.leaderId ?? ''] : [...b[d]].sort()
    if (JSON.stringify(va) !== JSON.stringify(vb) || isExcluded(a, d) !== isExcluded(b, d)) out.push(arg)
  }
  if (a.period !== b.period || a.customStart !== b.customStart || a.customEnd !== b.customEnd)
    out.push('period')
  return out
}

/** The mode's scope in a sentence ("Silicon Engineering", "{{P7}}'s reqs"), or null without one. */
const heldScope = (rt: ToolRuntime): string | null => scopeText(scopeOfAccess(rt.base.access), rt.tokens)

/** "Filtered to Bengaluru, last 6 months"; "Filters set to the whole company". */
function filterLine(f: Filters, periodChanged: boolean, rt: ToolRuntime): string {
  const scope = scopeInWords(f, rt.tokens, scopeOfAccess(rt.base.access))
  const head = scope === 'the whole company' ? 'Filters set to the whole company' : `Filtered to ${scope}`
  return periodChanged ? `${head}, ${periodWords(f)}` : head
}

function scopeResult(rt: ToolRuntime, state: ScreenState) {
  const ctx = ctxFor(rt, state)
  return scopeOut(ctx, rt.tokens)
}

export function setFilters(rt: ToolRuntime, app: AskApp, raw: unknown, id: string): ActionOutput {
  const input = inputOf(raw)
  const state = app.screen()
  const r = actionFilters(rt, state.filters, input)
  if (!r.ok) return fail(r.error)
  if (sameFilters(state.filters, r.filters))
    return {
      ok: true,
      value: {
        changed: false,
        note: 'These filters are already on. Nothing changed.',
        ...scopeResult(rt, state),
      },
    }
  const before = app.snapshot()
  app.setFilters(r.filters)
  const now = app.screen()
  const held = heldScope(rt)
  const mode = rt.base.access?.mode
  if (sameFilters(state.filters, now.filters))
    return fail(
      held && mode
        ? `${modeName(mode)} keeps Census on ${held}, so these filters change nothing on screen.`
        : 'The filters did not change.',
    )
  const changed = changedParts(state.filters, now.filters)
  const line = filterLine(now.filters, changed.includes('period'), rt)
  return {
    ok: true,
    value: {
      changed,
      line,
      ...scopeResult(rt, now),
      ...(sameFilters(now.filters, r.filters)
        ? {}
        : {
            note:
              held && mode
                ? `${modeName(mode)} kept the scope inside ${held}, so part of what was asked was left out.`
                : 'The filter row kept part of what was asked out of the scope.',
          }),
      undo: UNDO_NOTE,
    },
    action: actionOf(id, 'set_filters', line, app, before, ['scope']),
    scope: { filters: now.filters, standard: now.standard },
  }
}

/* ───────────── reset_filters ───────────── */

export function resetFilters(rt: ToolRuntime, app: AskApp, raw: unknown, id: string): ActionOutput {
  const bad = unknownKeys(inputOf(raw), [])
  if (bad) return fail(bad)
  const state = app.screen()
  // The defaults through the mode's clamp, as Reset in the filter row: a manager's whole org, a
  // business unit, a region, every one of a recruiter's reqs, or the whole company.
  const target: Filters = clampFilters(
    { ...DEFAULT_FILTERS, modes: {} },
    scopeOfAccess(rt.base.access),
    rt.base.access?.mode,
  )
  if (sameFilters(state.filters, target))
    return {
      ok: true,
      value: {
        changed: false,
        note: 'The filters are already at their defaults. Nothing changed.',
        ...scopeResult(rt, state),
      },
    }
  const before = app.snapshot()
  app.resetFilters()
  const now = app.screen()
  const scope = scopeInWords(now.filters, rt.tokens, scopeOfAccess(rt.base.access))
  const line = `Reset the filters to ${scope}, ${periodWords(now.filters)}`
  return {
    ok: true,
    value: {
      changed: changedParts(state.filters, now.filters),
      line,
      ...scopeResult(rt, now),
      undo: UNDO_NOTE,
    },
    action: actionOf(id, 'reset_filters', line, app, before, ['scope']),
    scope: { filters: now.filters, standard: now.standard },
  }
}

/* ───────────── open_view ───────────── */

/** Every route Ask can name; the mode's own list goes into the tool's enum. */
export const OPEN_PAGES = ['data', 'actions', 'dev'] as const

const OPEN_KEYS = ['view', 'tab', 'dataset', 'panel', 'metric']

/** Why a route is not shown in the mode, in the mode's words; null when it is. */
function routeRefusal(rt: ToolRuntime, view: string, tab: string): string | null {
  const access = rt.base.access
  if (!access) return null
  const d = routeDecision(access.mode, { view: view as RouteView, tab })
  if (!d.redirected) return null
  const title = d.reason?.title ?? 'That page is not shown in this mode.'
  return `${title.replace(/\.$/, '')}. Ask opens only what this mode shows; say so, and offer what is shown instead.`
}

/** What may follow a tab key: a colon and plain words, no query, spaces or dots. */
const SUB_ADDRESS = /^:[a-z0-9_+-]+$/i

/** A tab and the sub-address after its key, as the view itself reads it; the plain tab otherwise. */
function subAddressOf(view: string, key: string, rest: string): string {
  if (view === 'ai' && key === 'agents') return agentsTab(areasOfTab(`${key}${rest}`))
  return key
}

/** A page without registered tabs: the Developer page's own tabs, the Action center's one. */
function pageRoute(
  view: string,
  tabIn: string,
): { ok: true; view: string; tab: string } | { ok: false; error: string } {
  if (view === 'dev') {
    if (tabIn && !/^[a-z0-9:_-]+$/i.test(tabIn))
      return { ok: false, error: `The Developer page's tabs: ${DEV_TAB_KEYS.join(', ')}.` }
    const d = parseDevTab(tabIn)
    return { ok: true, view, tab: devTab(d.tab, /^[a-z0-9_-]*$/i.test(d.sub) ? d.sub : '') }
  }
  if (tabIn && tabIn.toLowerCase() !== 'open')
    return { ok: false, error: 'The Action center has one tab, open (Open items).' }
  return { ok: true, view, tab: '' }
}

/** The route `open_view` asks for, checked against the views and tabs the mode shows. */
export function routeFor(
  rt: ToolRuntime,
  raw: Record<string, unknown>,
): { ok: true; view: string; tab: string } | { ok: false; error: string } {
  const bad = unknownKeys(raw, OPEN_KEYS)
  if (bad) return { ok: false, error: bad }
  const view = typeof raw.view === 'string' ? raw.view.trim() : ''
  const tabIn = typeof raw.tab === 'string' ? raw.tab.trim() : ''
  const ctx = rt.base
  const registered = rt.env.views.find((v) => v.key === view)
  const isPage = (OPEN_PAGES as readonly string[]).includes(view)
  if (!registered && !isPage)
    return {
      ok: false,
      error: `There is no view "${view}". Views: ${shownViews(ctx, rt.env.views)
        .map((v) => `${v.key} (${v.label})`)
        .join(', ')}.`,
    }
  if ((raw.dataset != null || raw.panel != null || raw.metric != null) && view !== 'data')
    return {
      ok: false,
      error: 'dataset, panel and metric open the Data room: use view "data" with them.',
    }
  // The mode first: a hidden page or view is refused in its words, whatever the tab.
  const pageRefusal = routeRefusal(rt, view, '')
  if (pageRefusal) return { ok: false, error: pageRefusal }
  if (view === 'data') {
    if (raw.metric != null) {
      const metric = String(raw.metric)
      if (!ctx.metrics.def(metric))
        return { ok: false, error: `No metric "${metric}" in the dictionary. find_metrics lists the ids.` }
      if (ctx.access && !ctx.access.can(`metric:${metric}`))
        return { ok: false, error: `That metric is not shown in ${modeName(ctx.access.mode)}.` }
      return { ok: true, view, tab: metricsTab({ metric }) }
    }
    if (raw.dataset != null) {
      const dataset = String(raw.dataset)
      if (!(DATASET_KEYS as readonly string[]).includes(dataset))
        return { ok: false, error: `No dataset "${dataset}". Datasets: ${DATASET_KEYS.join(', ')}.` }
      const panel = raw.panel == null ? null : String(raw.panel)
      if (panel != null && !(DATASET_PANELS as readonly string[]).includes(panel))
        return { ok: false, error: `panel must be one of ${DATASET_PANELS.join(', ')}.` }
      return { ok: true, view, tab: datasetTab(dataset as never, panel as DatasetPanel | null) }
    }
    const want = tabIn.toLowerCase()
    const t = DATA_TABS.find((x) => x.route === want || x.key === want || x.label.toLowerCase() === want)
    if (tabIn && !t)
      return {
        ok: false,
        error: `The Data room's tabs: ${DATA_TABS.map((x) => `${x.route || 'datasets'} (${x.label})`).join(', ')}.`,
      }
    return { ok: true, view, tab: t?.route ?? '' }
  }
  if (!registered) return pageRoute(view, tabIn)
  // A view: its tab by key or label, among the tabs the mode and the feature switches show.
  const shown = shownViews(ctx, [registered])[0] ?? registered
  if (!tabIn) return { ok: true, view, tab: shown.tabs[0]?.key ?? '' }
  const want = tabIn.toLowerCase()
  const base = want.split(/[:/]/)[0] ?? ''
  const hit = shown.tabs.find((t) => t.key.toLowerCase() === base || t.label.toLowerCase() === want)
  if (hit) {
    // Only a view that defines a sub-address keeps one, through its own reader (the AI in HR
    // agents tab's areas, "agents:compliance"); anything else after the key is dropped, so no
    // query or path rides into the address.
    const rest = base === hit.key.toLowerCase() ? tabIn.slice(hit.key.length) : ''
    if (rest && !SUB_ADDRESS.test(rest))
      return { ok: false, error: `The tab "${tabIn}" is not an address Census knows. Use "${hit.key}".` }
    const tab = rest ? subAddressOf(view, hit.key, rest) : hit.key
    const refusal = routeRefusal(rt, view, tab)
    return refusal ? { ok: false, error: refusal } : { ok: true, view, tab }
  }
  const any = registered.tabs.find((t) => t.key.toLowerCase() === base || t.label.toLowerCase() === want)
  if (any) {
    const refusal = routeRefusal(rt, view, any.key)
    if (refusal) return { ok: false, error: refusal }
    if (any.feature)
      return {
        ok: false,
        error: `${registered.label}, ${any.label} is switched off in Settings > Privacy, so it cannot be opened. Say so.`,
      }
    return {
      ok: false,
      error: `${registered.label}, ${any.label} is not shown in this mode. Ask opens only what this mode shows.`,
    }
  }
  return {
    ok: false,
    error: `${registered.label} has no tab "${tabIn}". Tabs: ${shown.tabs.map((t) => `${t.key} (${t.label})`).join(', ')}.`,
  }
}

export async function openView(
  rt: ToolRuntime,
  app: AskApp,
  raw: unknown,
  id: string,
): Promise<ActionOutput> {
  const r = routeFor(rt, inputOf(raw))
  if (!r.ok) return fail(r.error)
  const state = app.screen()
  const ctx = ctxFor(rt, state)
  const want = placeOf({ view: r.view, tab: r.tab }, ctx, rt.env.views)
  const here = placeOf(state.route, ctx, rt.env.views)
  if (state.route.view === r.view && (here.tab === want.tab || state.route.tab === r.tab))
    return {
      ok: true,
      value: {
        changed: false,
        note: `${placeWords(here)} is already on screen. Nothing changed.`,
        link: viewLink(here.view, here.tab || null),
        figures: figuresOut(state),
      },
    }
  const before = app.snapshot()
  app.goTo(r.view, r.tab)
  await app.settle()
  const now = app.screen()
  const place = placeOf(now.route, ctxFor(rt, now), rt.env.views)
  if (now.route.view !== r.view)
    return fail(`Census opened ${placeWords(place)} instead: that page is not shown in this mode.`)
  const line = `Opened ${placeWords(place)}`
  return {
    ok: true,
    value: {
      line,
      opened: placeWords(place),
      link: viewLink(place.view, place.tab || null),
      ...(place.scoped ? scopeOut(ctxFor(rt, now), rt.tokens) : {}),
      figures: figuresOut(now),
      undo: UNDO_NOTE,
    },
    action: actionOf(id, 'open_view', line, app, before, ['route']),
  }
}

const figuresOut = (s: ScreenState) =>
  s.figures.map((f) => ({ figure: f.id, title: f.title, metric: f.metric, rows: f.rows }))

/* ───────────── show_figure ───────────── */

export async function showFigure(
  rt: ToolRuntime,
  app: AskApp,
  raw: unknown,
  id: string,
): Promise<ActionOutput> {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['figure', 'table'])
  if (bad) return fail(bad)
  if (typeof input.figure !== 'string' || !input.figure.trim())
    return fail('figure is required: a figure id from get_screen.')
  if (input.table != null && typeof input.table !== 'boolean') return fail('table must be true or false.')
  const want = input.figure.trim()
  if (figureHiddenFromAsk(want)) return fail(FIGURE_HIDDEN_FROM_ASK)
  await app.settle()
  const state = app.screen()
  const place = placeOf(state.route, ctxFor(rt, state), rt.env.views)
  const fig =
    state.figures.find((f) => f.id === want) ??
    state.figures.find((f) => f.title.toLowerCase() === want.toLowerCase())
  if (!fig) {
    const access = rt.base.access
    if (access && access.mode !== 'developer' && !access.can(`figure:${want}`))
      return fail(`That figure is not shown in ${modeName(access.mode)}.`)
    return fail(
      state.figures.length
        ? `No figure "${want}" on ${placeWords(place)}. Figures here: ${state.figures.map((f) => `${f.id} (${rt.tokens.scan(f.title)})`).join(', ')}. For a figure on another tab, open_view it first.`
        : `${placeWords(place)} has no figures on screen. open_view the tab that has it first.`,
    )
  }
  const table = input.table === true
  app.showFigure(fig.id, { table })
  const line = `Pointed to ${fig.title}${table ? ', as a table' : ''}`
  return {
    ok: true,
    value: {
      line,
      shown: fig.title,
      figure: fig.id,
      on: placeWords(place),
      table,
      rows: fig.rows,
      note: 'The figure is scrolled into view and highlighted for a few seconds.',
    },
    action: { id, tool: 'show_figure', line, undo: null, figure: { id: fig.id, table } },
  }
}

/* ───────────── open_records ───────────── */

const recordsLine = (title: string): string => `Opened the records for ${title}`

export async function openRecords(
  rt: ToolRuntime,
  app: AskApp,
  raw: unknown,
  id: string,
): Promise<ActionOutput> {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['ref', 'figure', 'row', 'column'])
  if (bad) return fail(bad)
  let spec: DrillSpec | null = null
  /** With figure: the column whose records were opened, in the figure's words. */
  let opened: string | null = null
  if (typeof input.ref === 'string' && input.ref.trim()) {
    const ref = input.ref.trim().replace(/^ref:/, '')
    const entry = rt.refs.entry(ref)
    if (!entry) return fail(`There is no ref "${ref}" in this conversation. Use a ref a tool gave you.`)
    try {
      spec = resolveDrill(entry.source)
    } catch {
      spec = null
    }
    if (!spec) return fail('That number has no records to open.')
  } else if (typeof input.figure === 'string' && input.figure.trim()) {
    if (typeof input.row !== 'string' || !input.row.trim())
      return fail(
        'With figure, give row: the label of the row whose records to open, as the figure shows it.',
      )
    const figureId = input.figure.trim()
    const mode = rt.base.access
    if (mode && mode.mode !== 'developer' && !mode.can(`figure:${figureId}`))
      return fail(`That figure is not shown in ${modeName(mode.mode)}.`)
    if (input.column != null && typeof input.column !== 'string')
      return fail('column must be a column key or label of the figure.')
    if (figureHiddenFromAsk(figureId)) return fail(FIGURE_HIDDEN_FROM_ASK)
    const fig = await app.figure(figureId)
    if (!fig) return fail(`No figure "${figureId}" on screen. get_screen lists the figures here.`)
    // A row's label is matched only where the figure could go to Claude itself: a sensitive cut,
    // a scope under the minimum or a list of people would make "found" or "not found" the secret.
    const refused = figureRefusal(rt, fig, 'records')
    if (refused) return fail(refused)
    const cols = fig.columns.filter((c) => !isIdColumn(c, fig.rows))
    if (listsPeople({ columns: cols, rows: fig.rows }, figureHelpers(rt)))
      return fail(
        `The figure "${rt.tokens.scan(fig.title)}" lists people one by one, so Ask does not open its rows by label: who is on it is not sent to Claude. Point to it with show_figure; the person can open a row's records by clicking it.`,
      )
    const want = input.row.trim().toLowerCase()
    const textCols = cols.filter((c) => fig.rows.some((r) => typeof r[c.key] === 'string'))
    const row = fig.rows.find((r) =>
      textCols.some((c) => {
        const v = r[c.key]
        return typeof v === 'string' && (v.toLowerCase() === want || rt.tokens.scan(v).toLowerCase() === want)
      }),
    )
    if (!row)
      return fail(
        `No row "${rt.tokens.scan(input.row)}" in ${rt.tokens.scan(fig.title)}. Rows: ${fig.rows
          .slice(0, 25)
          .map((r) => rt.tokens.scan(String(r[textCols[0]?.key ?? ''] ?? '')))
          .join(', ')}.`,
      )
    // The records of the number the figure draws (or of the column named), as a click on its cell.
    const drillable = cols.filter((c) => c.drill)
    const named = typeof input.column === 'string' ? input.column.trim().toLowerCase() : ''
    let tries: Column[]
    if (named) {
      const col = cols.find((c) => c.key.toLowerCase() === named || c.label.toLowerCase() === named)
      if (!col?.drill)
        return fail(
          `${col ? `The column "${rt.tokens.scan(col.label)}" opens no records` : `No column "${rt.tokens.scan(String(input.column))}" in ${rt.tokens.scan(fig.title)}`}. Columns that open records: ${drillable.map((c) => `${c.key} (${rt.tokens.scan(c.label)})`).join(', ') || 'none'}.`,
        )
      tries = [col]
    } else {
      const metricName = (fig.metric && rt.base.metrics.def(fig.metric)?.name) || null
      const own = drillable.find((c) => c.key === figureMeasure({ ...fig, columns: cols }, metricName))
      const numbers = new Set(
        cols.filter((c) => fig.rows.some((r) => typeof r[c.key] === 'number')).map((c) => c.key),
      )
      // Else the row's own records (a label that opens them), then the first column that opens any.
      tries = own ? [own] : [...drillable.filter((c) => !numbers.has(c.key)), ...drillable]
    }
    for (const c of tries) {
      try {
        spec = resolveDrill(c.drill?.(row) ?? null)
      } catch {
        spec = null
      }
      if (spec) {
        opened = c.label
        break
      }
    }
    if (!spec) return fail('That row has no records to open.')
  } else return fail('Give ref (from an earlier result) or figure and row.')
  const access = rt.base.access
  if (access && !access.can(`drill:${spec.kind}`)) return fail(kindNotShown(access.mode))
  app.openRecords(spec)
  // The action line stays here (names shown locally); Claude gets the records as screenPrivacy
  // allows: one person's records, or pay, ratings, right to work, cases or survey records, by kind only.
  const line = recordsLine(rt.tokens.scan(spec.title))
  const shown = recordsForClaude({
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    kind: spec.kind,
    rows: Array.isArray(spec.rows) ? spec.rows.length : 0,
  })
  return {
    ok: true,
    value: shown.title
      ? {
          line,
          opened: shown.subtitle ? `${shown.title}, ${shown.subtitle}` : shown.title,
          ...(opened ? { column: rt.tokens.scan(opened) } : {}),
          records: shown.records,
          rows: shown.rows,
          note: 'The records panel is open over the page. The person closes it when done; the action line can open it again.',
        }
      : {
          line: `Opened ${shown.about}`,
          opened: shown.about,
          records: shown.records,
          ...(shown.rows != null ? { rows: shown.rows } : {}),
          note: 'The records panel is open over the page. Its title and rows stay on this computer: say only that the records are open. The person closes it when done; the action line can open it again.',
        },
    // No Undo: closing the panel undoes it. The line offers Open again instead.
    action: { id, tool: 'open_records', line, undo: null, records: spec },
  }
}

/* ───────────── apply_saved_view ───────────── */

export async function applySavedView(
  rt: ToolRuntime,
  app: AskApp,
  raw: unknown,
  id: string,
): Promise<ActionOutput> {
  const input = inputOf(raw)
  const bad = unknownKeys(input, ['name'])
  if (bad) return fail(bad)
  if (typeof input.name !== 'string' || !input.name.trim())
    return fail('name is required: a saved view name from get_screen.')
  const state = app.screen()
  const want = input.name.trim().toLowerCase()
  const views = state.savedViews
  const view =
    views.find((v) => v.name.toLowerCase() === want) ??
    views.find((v) => rt.tokens.scan(v.name).toLowerCase() === want)
  if (!view)
    return fail(
      views.length
        ? `No saved view "${input.name}". Saved views: ${views.map((v) => `"${rt.tokens.scan(v.name)}"`).join(', ')}.`
        : 'There are no saved views. The person saves one from the Views menu in the filter row.',
    )
  // Already applied, and on its page (a view with a page opens it, as the Views menu does).
  const onPage = !view.page || (view.page.view === state.route.view && view.page.tab === state.route.tab)
  if (state.savedView?.id === view.id && !state.savedView.edited && onPage)
    return {
      ok: true,
      value: {
        changed: false,
        note: `"${view.name}" is already applied. Nothing changed.`,
        ...scopeResult(rt, state),
      },
    }
  const before = app.snapshot()
  const r = app.applySavedView(view.id)
  await app.settle()
  const now = app.screen()
  const place = placeOf(now.route, ctxFor(rt, now), rt.env.views)
  const line = `Applied the saved view "${view.name}"`
  const moved = now.route.view !== state.route.view || now.route.tab !== state.route.tab
  return {
    ok: true,
    value: {
      line,
      applied: view.name,
      ...scopeResult(rt, now),
      ...(moved ? { opened: placeWords(place), link: viewLink(place.view, place.tab || null) } : {}),
      ...(r.leftOut ? { left_out: r.leftOut } : {}),
      undo: UNDO_NOTE,
    },
    action: actionOf(id, 'apply_saved_view', line, app, before, ['scope', 'route']),
    scope: { filters: now.filters, standard: now.standard },
  }
}

/** The action tools by name. */
export const ACTION_TOOLS: readonly ActionTool[] = [
  'set_filters',
  'reset_filters',
  'open_view',
  'show_figure',
  'open_records',
  'apply_saved_view',
]

export const isActionTool = (n: string): n is ActionTool => (ACTION_TOOLS as readonly string[]).includes(n)
