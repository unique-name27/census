/**
 * The tools that read and drive the screen (docs/ASK-ACTIONS.md, parts 2 to 5): `get_screen`,
 * the six action tools and `make_chart`. Their JSON schemas per mode, their progress lines, and
 * `runScreenTool`, which runs one call through the injected app (`ToolEnv.app`) and returns the
 * exact text that goes back to Claude, after the same privacy pass as every tool, with the action
 * record or chart model the UI shows.
 *
 * `get_screen` and `make_chart` read and draw: they are offered whenever the app is connected.
 * The action tools change the screen: they are offered only while "Let Ask change the screen" is
 * on (Settings > Ask Census), and each mode's enums list only what the mode shows.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AccessContext } from '@/access/context'
import { modeName, toolNotInMode } from '@/access/copy'
import { policyVersion, routeShown } from '@/access/policy'
import { scopeOfAccess } from '@/access/scopes/records'
import { errorMessage, logDevError } from '@/app/devlog'
import type { DataStandard } from '@/data/quality/tier'
import { DATASET_KEYS } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { recordSince } from '@/lib/timing'
import { DATASET_PANELS } from '@/views/data/links'
import type { ViewDef } from '@/views/types'
import {
  type AskAction,
  type AskApp,
  FIGURE_HIDDEN_FROM_ASK,
  figureHiddenFromAsk,
  MODE_CHANGED,
  modeMoved,
} from './app'
import { ReleaseAudit } from './audit'
import {
  type AskChart,
  buildChart,
  CHART_FORMS,
  CHART_SOURCE_TOOLS,
  type ChartSource,
  compareSource,
  figureSource,
  parseChartSpec,
  querySource,
  summarySource,
} from './chart'
import type { TokenMap } from './privacy'
import type { RefRegistry } from './refs'
import { excludeArgsIn, filterArgsIn, toolsKey } from './roles'
import { askOffReason, chatContext, PERIODS, scopeWords, withScope } from './scope'
import { getScreen, periodWords, placeOf, placeWords } from './screen'
import { figureHelpers, figureRefusal } from './screenPrivacy'
import { queryRecords } from './tools/query'
import {
  ACTION_TOOLS,
  ACTIONS_OFF,
  type ActionOutput,
  applySavedView,
  isActionTool,
  OPEN_PAGES,
  openRecords,
  openView,
  resetFilters,
  setFilters,
  showFigure,
} from './tools/screenActions'
import { fail, type ToolOutput, type ToolRuntime } from './tools/shared'
import { compareGroups, viewSummary } from './tools/summary'
import type { ToolEnv } from './types'

/** Tools that read the screen or draw: offered whenever Ask is connected to the app. */
export const SCREEN_READ_TOOLS = ['get_screen', 'make_chart'] as const
/** Every screen tool, in the order they are sent. */
export const SCREEN_TOOL_NAMES: readonly string[] = ['get_screen', ...ACTION_TOOLS, 'make_chart']

export const isScreenTool = (n: string): boolean => SCREEN_TOOL_NAMES.includes(n)

/* ───────────── schemas ───────────── */

type ModeAccess = Pick<AccessContext, 'mode' | 'can'> &
  Partial<Pick<AccessContext, 'scope' | 'lock' | 'unset'>>

/** What set_filters and apply_saved_view keep to in a mode, in a sentence for Claude ('' without a scope). */
function scopeKeeps(access: ModeAccess | null | undefined): string {
  switch (scopeOfAccess(access)?.kind) {
    case 'org':
      return " In Manager mode the scope stays inside the manager's org: a leader outside it is refused, and a leader cannot be left out."
    case 'unit':
      return " In HRBP mode the scope stays inside the mode's business unit: a business unit, department or leader outside it is refused, and the business unit cannot be left out."
    case 'region':
      return " In HRBP mode the scope stays inside the mode's region: a location outside it is refused."
    case 'reqs':
      return " In Recruiter mode the filters narrow the recruiter's reqs, their candidates and their starts."
  }
  return access?.mode === 'finance'
    ? ' Finance mode filters by business unit and period only: leader, department, location, level and exclude are refused.'
    : ''
}

/** Where reset_filters goes back to in a mode. */
function resetTo(access: ModeAccess | null | undefined): string {
  switch (scopeOfAccess(access)?.kind) {
    case 'org':
      return "the manager's whole org"
    case 'unit':
      return "the mode's whole business unit"
    case 'region':
      return "the mode's whole region"
    case 'reqs':
      return "all of the recruiter's reqs"
  }
  return 'the whole company'
}

const LIST = (description?: string) => ({
  type: 'array',
  items: { type: 'string' },
  ...(description ? { description } : {}),
})

/** The routes a mode shows, with their tabs, for open_view's enum and description. */
function routesFor(mode: AccessContext['mode'], views: readonly ViewDef[]) {
  const shown = views.filter((v) => routeShown(mode, v.key))
  const pages = OPEN_PAGES.filter((p) => routeShown(mode, p))
  return {
    keys: [...shown.map((v) => v.key), ...pages],
    help: [
      ...shown.map(
        (v) =>
          `${v.key} (${v.label}): ${v.tabs
            .filter((t) => routeShown(mode, v.key, t.key))
            .map((t) => (t.feature ? `${t.key} [when switched on]` : t.key))
            .join(', ')}`,
      ),
      ...(pages.includes('data')
        ? ['data (Data room): datasets "", quality, metrics, mapping; or dataset with panel, or metric']
        : []),
      ...(pages.includes('actions') ? ['actions (Action center)'] : []),
      ...(pages.includes('dev') ? ['dev (Developer page)'] : []),
    ].join('\n'),
    data: pages.includes('data'),
  }
}

const MAKE_CHART_DESCRIPTION = `Draw a chart in the answer from numbers Census calculates. You never supply numbers: name a source and Census runs it here, so the chart matches the screens, with exports, a table view and the records behind every mark. Prefer pointing at an existing figure (open_view and show_figure) when one already shows what was asked; draw a chart when none does.
source: exactly one of {"tool": "query_records" | "compare_groups" | "view_summary", "input": {...the tool's input}}, {"figure": "<figure id from get_screen>"}, or {"result": "<tool_use id of an earlier query_records, compare_groups or view_summary call>"}.
Fields are the source rows' keys: query_records rows have their group_by fields (dates as field_month, field_quarter, field_year), count, people and measure keys such as mean_tenureYears; compare_groups rows have group, headcount, value, change and target; view_summary rows have label, value, target and status; a figure's rows have its column keys (with no y, Census draws the column the figure itself draws, or lists its number columns to choose from).
Headcount as every screen counts it is employees only, active on the as-of date, not contractors or interns: for a headcount chart from query_records use where [{"field": "inHeadcount", "op": "eq", "value": true}] on employees (active alone counts contractors and interns too).
form and what it encodes:
- bars: x a category, y a number (ranked, largest first); optional series.
- columns: x a category or time field, y a number; optional series (side by side).
- stacked_columns: x, y a count, series (parts that add up).
- lines: x a month, quarter, year or date field, y a number; optional series.
- heatmap: x and y categories or times, value a number.
- scatter: x and y numbers; label names each point.
- dot_strip: x a number, y a category.
- histogram: x a number field (its distribution).
- bullets: x a category, y a number, target a number (each row on its own scale).
sort {"by": field, "dir": "asc" | "desc"} (dir defaults to asc for a category or time field, desc for a number) and limit (up to 50 groups) are optional. Time axes run through every period from the first to the last: a period with no records shows 0 for counts, and periods after the as-of date are flagged. title is short, in sentence case, with no em dashes; subtitle says the scope and period when they matter. Census checks the spec against the rows and says what does not fit. The result lists the points with their refs and anything hidden.`

/** The screen tools' definitions for a mode (no cache breakpoint: the caller sets it on the last tool). */
function buildScreenTools(
  access: ModeAccess | null | undefined,
  views: readonly ViewDef[],
  actions: boolean,
): BetaTool[] {
  const mode = access?.mode ?? 'developer'
  const routes = routesFor(mode, views)
  const args = new Set<string>(filterArgsIn(access))
  const excl = excludeArgsIn(access)
  const keeps = scopeKeeps(access)
  const out: BetaTool[] = [
    {
      name: 'get_screen',
      description:
        'What the person is looking at now: the view and tab (with its view link), the scope in words (leader as a person token), the period, the data standard, the figures on the tab (figure id, title, metric id), whether the records panel is open and on what, the saved view in force, the saved views by name, and whether Ask may change the screen. Each question starts with a one-line summary of the screen; call this for the figures and saved views.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ]
  if (actions)
    out.push(
      {
        name: 'set_filters',
        description: `Change the filter row: the scope and period every view shows. mode merge (the default) changes only the filters you name and keeps the rest; an empty list or "" clears one. mode replace sets exactly what you name, starting from ${resetTo(access)}. The period stays unless given. Values as get_context lists them; a leader as a person token.${excl.length ? ' exclude names the filters whose values are left out instead of kept.' : ''} One history entry, with Undo. Returns the new scope; tool calls after it in this answer use it.${keeps}`,
        input_schema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['merge', 'replace'] },
            ...(args.has('leader')
              ? {
                  leader: {
                    type: 'string',
                    description: 'A leader’s person token from get_context, or "" to clear.',
                  },
                }
              : {}),
            business_unit: LIST(),
            ...(args.has('department') ? { department: LIST() } : {}),
            ...(args.has('location') ? { location: LIST() } : {}),
            ...(args.has('level') ? { level: LIST('Level codes such as L4 or M1.') } : {}),
            period: {
              type: 'string',
              enum: PERIODS,
              description: 't12m last 12 months, ytd, lastQuarter, t6m, t3m, custom (with start and end).',
            },
            start: { type: 'string', description: 'YYYY-MM-DD, for a custom period.' },
            end: {
              type: 'string',
              description: 'YYYY-MM-DD, for a custom period; on or before the as-of date.',
            },
            ...(excl.length
              ? { exclude: { type: 'array', items: { type: 'string', enum: [...excl] } } }
              : {}),
          },
          additionalProperties: false,
        },
      },
      {
        name: 'reset_filters',
        description: `Reset the filter row to ${resetTo(access)} over the last 12 months. One history entry, with Undo.`,
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'open_view',
        description: `Open a view and tab${routes.data ? ' (or a Data room tab, a dataset panel, or a metric definition)' : ''} as a click on its tab would. One history entry, with Undo. Returns the figures on the tab. Views and tabs this mode shows:\n${routes.help}`,
        input_schema: {
          type: 'object',
          properties: {
            view: { type: 'string', enum: routes.keys },
            tab: { type: 'string', description: 'A tab key of the view; the first tab when left out.' },
            ...(routes.data
              ? {
                  dataset: {
                    type: 'string',
                    enum: DATASET_KEYS,
                    description: 'With view data: open a dataset.',
                  },
                  panel: { type: 'string', enum: DATASET_PANELS },
                  metric: {
                    type: 'string',
                    description: 'With view data: a metric id, to open its definition.',
                  },
                }
              : {}),
          },
          required: ['view'],
          additionalProperties: false,
        },
      },
      {
        name: 'show_figure',
        description:
          'Scroll to a figure on the tab on screen and highlight it for a few seconds; table true shows its table view. Use get_screen or open_view for the figure ids. Nothing to undo.',
        input_schema: {
          type: 'object',
          properties: { figure: { type: 'string' }, table: { type: 'boolean' } },
          required: ['figure'],
          additionalProperties: false,
        },
      },
      {
        name: 'open_records',
        description:
          'Open the records panel on the records behind a number: a ref from an earlier result, or a figure on screen and the label of one of its rows (the records of the number the figure draws, or of column when given; the result says which column opened). The panel follows the mode’s rules. Undo closes it.',
        input_schema: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'A ref such as r7.' },
            figure: { type: 'string' },
            row: { type: 'string', description: 'With figure: the row’s label as the figure shows it.' },
            column: {
              type: 'string',
              description:
                'With figure: the column key or label whose records to open (default: the one it draws).',
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'apply_saved_view',
        description: `Apply one of the person’s saved views by name (get_screen lists them): its scope and, when it has one, its page, as one history entry with Undo. It goes through the same clamp and route guard as the Views menu: what this mode does not show is left out, and the result says what.${keeps}`,
        input_schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      },
    )
  out.push({
    name: 'make_chart',
    description: MAKE_CHART_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: CHART_SOURCE_TOOLS },
            input: { type: 'object', description: 'The tool’s input, as you would call it.' },
            figure: { type: 'string' },
            result: { type: 'string' },
          },
          additionalProperties: false,
        },
        form: { type: 'string', enum: CHART_FORMS },
        x: { type: 'string' },
        y: { type: 'string' },
        series: { type: 'string' },
        value: { type: 'string' },
        target: { type: 'string' },
        label: { type: 'string' },
        sort: {
          type: 'object',
          properties: { by: { type: 'string' }, dir: { type: 'string', enum: ['asc', 'desc'] } },
          required: ['by'],
          additionalProperties: false,
        },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        title: { type: 'string' },
        subtitle: { type: 'string' },
      },
      required: ['source', 'form', 'title'],
      additionalProperties: false,
    },
  })
  return out
}

const cache = new WeakMap<readonly ViewDef[], Map<string, BetaTool[]>>()

/**
 * The screen tools sent in a mode: get_screen and make_chart, plus the action tools when Ask may
 * change the screen. Stable per mode, so the tools stay cached with the system prompt.
 */
export function screenToolDefinitions(
  access: ModeAccess | null | undefined,
  views: readonly ViewDef[],
  actions: boolean,
): BetaTool[] {
  let byKey = cache.get(views)
  if (!byKey) {
    byKey = new Map()
    cache.set(views, byKey)
  }
  const key = `${toolsKey(access)}|${actions}|${policyVersion()}`
  let out = byKey.get(key)
  if (!out) {
    out = buildScreenTools(access, views, actions).filter((t) => !access || access.can(`ask:${t.name}`))
    byKey.set(key, out)
  }
  return out
}

/* ───────────── progress lines ───────────── */

/** The plain line shown while a screen tool runs (it may hold person tokens). */
export function screenToolLabel(name: string, input: unknown, env: ToolEnv): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  switch (name) {
    case 'get_screen':
      return 'Reading what is on screen'
    case 'set_filters':
      return 'Changing the filters'
    case 'reset_filters':
      return 'Resetting the filters'
    case 'open_view': {
      if (typeof i.view !== 'string') return 'Opening a view'
      const p = placeOf({ view: i.view, tab: typeof i.tab === 'string' ? i.tab : '' }, env.ctx, env.views)
      return `Opening ${placeWords(p)}`
    }
    case 'show_figure':
      return 'Pointing to a figure'
    case 'open_records':
      return 'Opening the records'
    case 'apply_saved_view':
      return typeof i.name === 'string' && i.name.trim()
        ? `Applying the saved view "${i.name.trim()}"`
        : 'Applying a saved view'
    case 'make_chart':
      return typeof i.title === 'string' && i.title.trim()
        ? `Drawing a chart: ${i.title.trim().replace(/\.$/, '')}`
        : 'Drawing a chart'
    default:
      return `Running ${name}`
  }
}

/* ───────────── running a call ───────────── */

/** An earlier tool call's result, for make_chart's `result` source. */
export interface PriorResult {
  name: string
  input: unknown
  /** The exact text sent to Claude. */
  content: string
}

export interface ScreenRun {
  content: string
  isError: boolean
  label: string
  ms: number
  /** The action line and Undo (action tools that changed something). */
  action?: AskAction
  /** The chart to draw (make_chart). */
  chart?: AskChart
  /** The scope now on screen, for the tools after it in this answer. */
  scope?: { filters: Filters; standard: DataStandard }
}

export interface ScreenConversation {
  tokens: TokenMap
  refs: RefRegistry
  audit?: ReleaseAudit
  /** A fresh chart id ('ask-chart-3'). */
  chartId?: () => string
}

let charts = 0

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const places = new WeakMap<object, readonly string[]>()

/**
 * The filter values Census knows (locations, business units, departments), so a chart's subtitle
 * cannot name one its numbers are not for.
 */
function placesOf(rt: ToolRuntime): readonly string[] {
  const all = rt.base.all.employees
  let out = places.get(all)
  if (!out) {
    const seen = new Set<string>()
    for (const e of all)
      for (const v of [e.location, e.businessUnit, e.department])
        if (typeof v === 'string' && v.length > 2) seen.add(v)
    out = [...seen]
    places.set(all, out)
  }
  return out
}

async function makeChart(
  rt: ToolRuntime,
  app: AskApp,
  raw: unknown,
  conv: ScreenConversation,
  results: (id: string) => PriorResult | undefined,
): Promise<ToolOutput & { chart?: AskChart }> {
  const spec = parseChartSpec(raw)
  if (typeof spec === 'string') return fail(spec)
  const access = rt.base.access
  const metrics = rt.base.metrics
  let src: ChartSource | string
  const fromOutput = (tool: string, value: unknown): ChartSource | string =>
    tool === 'query_records'
      ? querySource(value)
      : tool === 'compare_groups'
        ? compareSource(value, metrics)
        : tool === 'view_summary'
          ? summarySource(value, metrics)
          : `A ${tool} result cannot be drawn. Draw from query_records, compare_groups or view_summary.`
  const s = spec.source
  if (s.kind === 'tool') {
    if (access && !access.can(`ask:${s.tool}`)) return fail(toolNotInMode(s.tool, access.mode))
    const out =
      s.tool === 'query_records'
        ? queryRecords(rt, s.input)
        : s.tool === 'compare_groups'
          ? compareGroups(rt, s.input)
          : viewSummary(rt, s.input)
    if (!out.ok) return fail(`The source ${s.tool} call did not run: ${out.error}`)
    src = fromOutput(s.tool, out.value)
  } else if (s.kind === 'result') {
    const prior = results(s.result)
    if (!prior)
      return fail(
        `No earlier result "${s.result}" in this conversation. Use the tool_use id of an earlier query_records, compare_groups or view_summary call, or pass the call itself as source.tool and source.input.`,
      )
    let value: unknown
    try {
      value = JSON.parse(prior.content)
    } catch {
      return fail('That result could not be read.')
    }
    if (value && typeof value === 'object' && 'error' in value)
      return fail('That result was an error, so it has nothing to draw.')
    src = fromOutput(prior.name, value)
  } else {
    if (access && access.mode !== 'developer' && !access.can(`figure:${s.figure}`))
      return fail(`That figure is not shown in ${modeName(access.mode)}.`)
    if (figureHiddenFromAsk(s.figure)) return fail(FIGURE_HIDDEN_FROM_ASK)
    await app.settle()
    const fig = await app.figure(s.figure)
    if (!fig)
      return fail(
        s.figure.startsWith('data-')
          ? `No figure "${s.figure}" on screen. A Data room figure can be drawn only from the tab it is on: open_view view "data" with that tab first, then get_screen lists its figures.`
          : `No figure "${s.figure}". get_screen lists the figures on screen; a figure on another tab can be drawn by its id too (ids start with their view key).`,
      )
    // The rules the tools apply: the scope on screen, and the figure's topic (docs/ASK.md, Privacy rules).
    const refused = figureRefusal(rt, fig, 'chart')
    if (refused) return fail(refused)
    const state = app.screen()
    src = figureSource(fig, figureHelpers(rt), {
      // The scope as tool results word it, so every chart's caption reads the same way.
      scope: scopeWords(state.filters, rt.tokens, scopeOfAccess(rt.base.access)),
      period: periodWords(state.filters),
      metricName: (fig.metric && metrics.def(fig.metric)?.name) || null,
    })
  }
  if (typeof src === 'string') return fail(src)
  const id = conv.chartId?.() ?? `ask-chart-${++charts}`
  const built = buildChart(spec, src, id, { asOf: rt.base.asOf, places: placesOf(rt) })
  if (!built.ok) return fail(built.error)
  return { ok: true, value: built.summary, chart: built.chart }
}

/**
 * Run one screen tool call. Never throws: no app, a mode that hides the tool, actions switched
 * off, bad input or a failure come back as an error result Claude can read and act on. The
 * result, the action line and the chart have been through the privacy pass.
 */
export async function runScreenTool(
  name: string,
  input: unknown,
  env: ToolEnv,
  conv: ScreenConversation,
  opts: { id: string; results?: (id: string) => PriorResult | undefined },
): Promise<ScreenRun> {
  const t = clock()
  conv.tokens.index(env.ctx)
  let label: string
  try {
    label = screenToolLabel(name, input, env)
  } catch {
    label = `Running ${name}`
  }
  const done = (out: ToolOutput | ActionOutput, chart?: AskChart): ScreenRun => {
    const body = out.ok ? out.value : { error: out.error }
    const content = JSON.stringify(conv.tokens.scanDeep(body))
    recordSince(`census:ask:${name}`, t)
    const action = out.ok && 'action' in out && out.action ? out.action : undefined
    return {
      content,
      isError: !out.ok,
      label: conv.tokens.scan(label),
      ms: clock() - t,
      ...(action ? { action: { ...action, line: conv.tokens.scan(action.line) } } : {}),
      ...(chart ? { chart: conv.tokens.scanDeep(chart) } : {}),
      ...(out.ok && 'scope' in out && out.scope ? { scope: out.scope } : {}),
    }
  }
  const access = env.ctx.access
  // An answer that outlived a change of mode: its context is the old mode's.
  if (modeMoved(env.app, access)) return done(fail(MODE_CHANGED))
  const off = askOffReason(env.ctx)
  if (off) return done(fail(off))
  if (access && !access.can(`ask:${name}`)) return done(fail(toolNotInMode(name, access.mode)))
  const app = env.app
  if (!app) return done(fail(`${name} needs the Census screen, and Ask is not connected to it here.`))
  if (isActionTool(name) && !app.actionsOn()) return done(fail(ACTIONS_OFF))
  // Compute for the scope on screen, whatever the context handed in was rendered with.
  const here = app.screen()
  const live = withScope(env, { filters: here.filters, standard: here.standard })
  const rt: ToolRuntime = {
    env: live,
    base: chatContext(live.ctx),
    tokens: conv.tokens,
    refs: conv.refs,
    audit: conv.audit ?? new ReleaseAudit(),
  }
  try {
    switch (name) {
      case 'get_screen':
        await app.settle()
        return done(getScreen(rt, app.screen(), app.actionsOn()))
      case 'set_filters':
        return done(setFilters(rt, app, input, opts.id))
      case 'reset_filters':
        return done(resetFilters(rt, app, input, opts.id))
      case 'open_view':
        return done(await openView(rt, app, input, opts.id))
      case 'show_figure':
        return done(await showFigure(rt, app, input, opts.id))
      case 'open_records':
        return done(await openRecords(rt, app, input, opts.id))
      case 'apply_saved_view':
        return done(await applySavedView(rt, app, input, opts.id))
      case 'make_chart': {
        const out = await makeChart(rt, app, input, conv, opts.results ?? (() => undefined))
        return done(out, out.ok ? out.chart : undefined)
      }
      default:
        return done(fail(`There is no tool "${name}".`))
    }
  } catch (err) {
    console.error(`Ask Census: ${name} failed`, err)
    logDevError({ where: 'ask tool', view: null, tab: name, message: errorMessage(err) })
    return done(fail(`${name} could not be done here. Nothing changed; try again or answer without it.`))
  }
}
