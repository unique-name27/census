/**
 * Development builds only: a scripted Claude for the test key "sk-ant-test-fake-0000", so the
 * whole Ask sheet can be tried with no network and no real key. It reads the (tokenized) question,
 * calls real Census tools picked by keywords, then writes an answer from what the tools returned,
 * with their refs, person tokens, a table, a view link and a metric link. Its events have the
 * Messages API's streaming shape, so the engine's real loop runs.
 *
 * Imported only behind `import.meta.env.DEV`, so production builds leave it out entirely.
 *
 * Words in the question that bring up each error state: "fake 401", "fake 404", "fake 429",
 * "fake 529", "fake offline", "fake blocked", "fake declined", "fake cut off", "fake rounds" (the
 * tool round limit) and "fake slow" (time to press Stop).
 *
 * Ask on the screen (docs/ASK-ACTIONS.md, part 5): "filter to Bengaluru" (or a business unit, with
 * "last 6 months" or "year to date") calls set_filters; "reset the filters" reset_filters; "open
 * attrition" (or "go to", "take me to" and a view) open_view; "point to the chart" or "highlight"
 * get_screen then show_figure; "chart", "graph", "plot" or "draw" make_chart (attrition by
 * location, hires over time, or headcount by business unit or location); "open the records" (or
 * "show me the people") query_records then open_records; "saved view" apply_saved_view; "what am I looking at" or "on screen" get_screen. With "Let Ask change the
 * screen" off, the actions are left out and the answer says so.
 */
import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AskClient, AskRequest, AskStream } from '@/ask/engine'
import { SITES } from '@/data/schema'

export interface DevClient extends AskClient {
  /** Whether the browser counts as online for the question asked last ("fake offline" says no). */
  online: () => boolean
}

export interface ToolCall {
  name: string
  input: Record<string, unknown>
}

export type Fault = 401 | 404 | 429 | 529 | 'offline' | 'blocked' | 'declined' | 'cut-off'

export interface Plan {
  /**
   * Tool calls per round; the answer follows the last round. An input value "$first_figure",
   * "$first_saved_view" or "$first_ref" is filled in from an earlier round's result (open_view,
   * get_screen or query_records).
   */
  rounds: ToolCall[][]
  fault: Fault | null
  slow: boolean
  /** The question asked to change the screen, and "Let Ask change the screen" is off. */
  actionsOff?: boolean
}

/** The line Census puts before each question when Ask is beside the screen. */
const SCREEN_LINE = /^On screen: [^\n]*\n\n/

/** The sample's business units, for "filter to Go-to-Market". */
const BUSINESS_UNITS = [
  'Silicon Engineering',
  'Systems & Software',
  'Corporate',
  'Operations',
  'Go-to-Market',
  'Executive Office',
]

const PERIOD_WORDS: [RegExp, string][] = [
  [/last 6 months|six months/, 't6m'],
  [/last 3 months|three months/, 't3m'],
  [/year to date|\bytd\b/, 'ytd'],
  [/last (full )?quarter/, 'lastQuarter'],
  [/last 12 months|last year/, 't12m'],
]

/** Words that name a view and tab, for "open attrition". */
const VIEW_WORDS: [RegExp, string, string][] = [
  [/attrition/, 'hrbp', 'attrition'],
  [/workforce/, 'hrbp', 'workforce'],
  [/movement|promotion/, 'hrbp', 'movement'],
  [/people stats/, 'hrbp', ''],
  [/recruiting|pipeline/, 'recruiting', ''],
  [/onboarding/, 'onboarding', ''],
  [/org chart/, 'org', ''],
  [/hr ops|\bcases\b/, 'services', ''],
  [/talent|performance/, 'talent', ''],
  [/compensation|\bcomp\b/, 'comp', ''],
  [/compliance/, 'compliance', ''],
  [/listening|survey/, 'listening', ''],
  [/scorecard/, 'scorecard', ''],
  [/data quality/, 'data', 'quality'],
  [/data room/, 'data', ''],
]

const ACTION_NAMES = [
  'set_filters',
  'reset_filters',
  'open_view',
  'show_figure',
  'open_records',
  'apply_saved_view',
]

/** The chart a question asks for: attrition by a dimension, hires over time, or headcount. */
function chartFor(q: string): Record<string, unknown> {
  const by = /department/.test(q)
    ? 'department'
    : /business unit/.test(q)
      ? 'business_unit'
      : /level/.test(q)
        ? 'level'
        : 'location'
  if (/attrition|leav|turnover/.test(q))
    return {
      source: { tool: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by } },
      form: 'bars',
      title: `Voluntary attrition by ${by.replace('_', ' ')}`,
    }
  if (/trend|over time|by month|hires|hiring/.test(q))
    return {
      source: {
        tool: 'query_records',
        input: {
          dataset: 'employees',
          where: [{ field: 'hireDate', op: 'in_period', value: 'current' }],
          group_by: [{ field: 'hireDate', by: 'month' }],
          sort: { by: 'group', dir: 'asc' },
        },
      },
      form: 'columns',
      title: 'Hires by month',
    }
  // Headcount as the screens count it (employees only, not contractors or interns), by the
  // dimension asked for: business unit when the question names none.
  const field = /location|site/.test(q)
    ? 'location'
    : by === 'department'
      ? 'department'
      : by === 'level'
        ? 'level'
        : 'businessUnit'
  const words: Readonly<Record<string, string>> = {
    location: 'location',
    department: 'department',
    level: 'level',
    businessUnit: 'business unit',
  }
  return {
    source: {
      tool: 'query_records',
      input: {
        dataset: 'employees',
        where: [{ field: 'inHeadcount', op: 'eq', value: true }],
        group_by: [{ field }],
      },
    },
    form: 'bars',
    title: `Headcount by ${words[field]}`,
  }
}

/** The screen flows for a question: actions when the tools allow them, get_screen otherwise. */
function screenPlans(q: string, tools: ReadonlySet<string> | null): { plans: ToolCall[][][]; off: boolean } {
  const can = (n: string) => !tools || tools.has(n)
  const plans: ToolCall[][][] = []
  let wantsAction = false
  const site = SITES.find((x) => q.includes(x.location.toLowerCase()))?.location
  const bu = BUSINESS_UNITS.find((x) => q.includes(x.toLowerCase()))
  const period = PERIOD_WORDS.find(([re]) => re.test(q))?.[1]
  // "Open attrition", "go to the scorecard": the verb right before the view's words.
  const view = VIEW_WORDS.find(([re]) =>
    new RegExp(`\\b(open|go to|take me to|switch to|navigate to|bring up)\\s+(the\\s+)?(${re.source})`).test(
      q,
    ),
  )
  if (/\breset\b|clear (the )?filters/.test(q)) {
    wantsAction = true
    if (can('reset_filters')) plans.push([[{ name: 'reset_filters', input: {} }]])
  } else if ((site || bu || period) && /\b(filter|narrow|only|focus|show|switch|look at)\b/.test(q)) {
    wantsAction = true
    const input: Record<string, unknown> = {}
    if (site) input.location = [site]
    if (bu) input.business_unit = [bu]
    if (period) input.period = period
    if (can('set_filters')) plans.push([[{ name: 'set_filters', input }]])
  }
  if (view) {
    wantsAction = true
    if (can('open_view'))
      plans.push([[{ name: 'open_view', input: { view: view[1], ...(view[2] ? { tab: view[2] } : {}) } }]])
  }
  if (/\b(point|highlight)\b|which (chart|figure)|show (me )?the (chart|figure)/.test(q)) {
    wantsAction = true
    if (can('show_figure'))
      plans.push(
        view && can('open_view')
          ? [[], [{ name: 'show_figure', input: { figure: '$first_figure' } }]]
          : [
              [{ name: 'get_screen', input: {} }],
              [{ name: 'show_figure', input: { figure: '$first_figure' } }],
            ],
      )
  }
  if (/\bopen (the |their )?records\b|show me the (people|records)\b/.test(q)) {
    wantsAction = true
    if (can('open_records'))
      plans.push([
        [
          {
            name: 'query_records',
            input: {
              dataset: 'employees',
              where: [{ field: 'active', op: 'eq', value: true }],
              group_by: [{ field: 'location' }],
            },
          },
        ],
        [{ name: 'open_records', input: { ref: '$first_ref' } }],
      ])
  }
  if (/saved view/.test(q)) {
    wantsAction = true
    if (can('apply_saved_view'))
      plans.push([
        [{ name: 'get_screen', input: {} }],
        [{ name: 'apply_saved_view', input: { name: '$first_saved_view' } }],
      ])
  }
  if (
    /\b(chart|graph|plot|draw|visuali[sz]e)\b/.test(q) &&
    !/which chart|the chart|this chart/.test(q) &&
    can('make_chart')
  )
    plans.push([[{ name: 'make_chart', input: chartFor(q) }]])
  const off = wantsAction && !!tools && !ACTION_NAMES.some((n) => tools.has(n))
  if (
    (off || /on screen|looking at|this (view|chart|page|tab)/.test(q)) &&
    can('get_screen') &&
    !plans.length
  )
    plans.push([[{ name: 'get_screen', input: {} }]])
  return { plans, off }
}

const TOKEN = /\{\{P\d+\}\}/

const has = (q: string, re: RegExp) => re.test(q)

/**
 * The tool rounds for a question (as sent, so people are tokens), picked by keywords. `tools` is
 * what the request offers (null: every tool), so the screen flows follow "Let Ask change the
 * screen".
 */
export function planFor(sent: string, tools: ReadonlySet<string> | null = null): Plan {
  const question = sent.replace(SCREEN_LINE, '')
  const q = question.toLowerCase()
  const fault: Fault | null = has(q, /fake 401/)
    ? 401
    : has(q, /fake 404/)
      ? 404
      : has(q, /fake 429/)
        ? 429
        : has(q, /fake 529/)
          ? 529
          : has(q, /fake offline/)
            ? 'offline'
            : has(q, /fake blocked/)
              ? 'blocked'
              : has(q, /fake declined/)
                ? 'declined'
                : has(q, /fake cut ?off/)
                  ? 'cut-off'
                  : null
  const slow = has(q, /fake slow/)
  if (has(q, /fake rounds/))
    return { rounds: Array.from({ length: 11 }, () => [{ name: 'get_context', input: {} }]), fault, slow }

  const leader = TOKEN.exec(question)?.[0]
  const filters = leader ? { filters: { leader } } : {}
  const screen = tools && !tools.has('get_screen') ? { plans: [], off: false } : screenPlans(q, tools)
  const plans: ToolCall[][][] = [...screen.plans]
  if (has(q, /attrition|leav|turnover|resign|quit|exit/))
    plans.push([
      [{ name: 'view_summary', input: { view: 'hrbp', ...filters } }],
      [{ name: 'compare_groups', input: { view: 'hrbp', kpi: 'voluntary', by: 'location', ...filters } }],
    ])
  if (has(q, /\breqs?\b|requisition|recruit|time to fill|hiring|candidate|offer|pipeline/))
    plans.push([
      [
        { name: 'view_summary', input: { view: 'recruiting', ...filters } },
        {
          name: 'query_records',
          input: {
            dataset: 'requisitions',
            where: [{ field: 'status', op: 'eq', value: 'Open' }],
            group_by: [{ field: 'recruiter' }],
            limit: 8,
            ...filters,
          },
        },
      ],
    ])
  if (has(q, /compa|\bpay\b|salary|merit|compensation|range/))
    plans.push([[{ name: 'view_summary', input: { view: 'comp', ...filters } }]])
  if (has(q, /quality|tier|bronze|silver|gold|standard|dataset|official list|mapping|field/))
    plans.push([[{ name: 'explain_quality', input: {} }]])
  if (has(q, /open item|overdue|action|owner|due /)) plans.push([[{ name: 'open_items', input: {} }]])
  if (has(q, /defin|formula|calculat|what does|mean\b|measure/)) {
    const term =
      /attrition|time to fill|compa-ratio|headcount|merit|engagement|retention|nps/.exec(q)?.[0] ??
      'attrition'
    plans.push([[{ name: 'find_metrics', input: { query: term } }]])
  }
  if (has(q, /headcount|business unit|\borg\b|team|location|department|contractor|largest/))
    plans.push([
      [
        {
          name: 'query_records',
          input: {
            dataset: 'employees',
            where: [{ field: 'active', op: 'eq', value: true }],
            group_by: [{ field: 'businessUnit' }],
            ...filters,
          },
        },
      ],
    ])
  if (has(q, /scorecard|target|finding|serious|overall/))
    plans.push([[{ name: 'view_summary', input: { view: 'scorecard', ...filters } }]])
  if (!plans.length)
    plans.push([
      [{ name: 'get_context', input: {} }],
      [{ name: 'view_summary', input: { view: 'scorecard', ...filters } }],
    ])

  // A chart covers its question: no other numbers beside it. Otherwise at most two topics (more
  // when the screen flows ask for them), merged round by round.
  const charting = screen.plans.some((p) => p.some((r) => r.some((c) => c.name === 'make_chart')))
  const picked = charting ? screen.plans : plans.slice(0, Math.max(2, screen.plans.length))
  const depth = Math.max(...picked.map((p) => p.length))
  const rounds: ToolCall[][] = []
  for (let i = 0; i < depth; i++) rounds.push(picked.flatMap((p) => p[i] ?? []))
  return { rounds: rounds.filter((r) => r.length), fault, slow, ...(screen.off ? { actionsOff: true } : {}) }
}

/** Fill "$first_figure", "$first_saved_view" and "$first_ref" from the latest result that lists them. */
export function resolveInput(
  input: Record<string, unknown>,
  results: readonly ToolResult[],
): Record<string, unknown> {
  const latest = (pick: (v: Json) => unknown) => {
    for (let i = results.length - 1; i >= 0; i--) {
      try {
        const got = pick(JSON.parse(results[i]?.content ?? ''))
        if (got != null) return got
      } catch {
        /* not JSON */
      }
    }
    return null
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input))
    out[k] =
      v === '$first_figure'
        ? (latest(
            (x) =>
              x?.figures?.find((f: Json) => f?.draws !== 'table or list')?.figure ?? x?.figures?.[0]?.figure,
          ) ?? 'none')
        : v === '$first_saved_view'
          ? (latest((x) => x?.saved_views?.[0]) ?? 'none')
          : v === '$first_ref'
            ? (latest(
                (x) => x?.rows?.find((r: Json) => r?.ref)?.ref ?? x?.groups?.find((g: Json) => g?.ref)?.ref,
              ) ?? 'none')
            : v
  return out
}

/* ───────────── writing the answer ───────────── */

// biome-ignore lint/suspicious/noExplicitAny: tool results are untyped JSON read defensively
type Json = any

/** Text safe inside Markdown: no stray emphasis, links or table pipes. */
export const md = (s: unknown): string => String(s ?? '').replace(/([\\`*_[\]|])/g, '\\$1')

const num = (n: unknown): string => (typeof n === 'number' ? n.toLocaleString('en-US') : String(n ?? '—'))

const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

const link = (label: string, ref: unknown) =>
  typeof ref === 'string' && ref ? `[${label}](ref:${ref})` : label

function scopeText(v: Json): string {
  const scope = typeof v?.scope === 'string' ? lower(v.scope) : 'the scope you picked'
  const period = typeof v?.period?.label === 'string' ? lower(v.period.label) : null
  return period ? `${scope}, ${period}` : scope
}

function figureLine(k: Json): string | null {
  if (!k || k.value_text === '—' || k.value_text == null) return null
  const name = k.metric ? `[${md(k.label)}](metric:${k.metric})` : md(k.label)
  let s = `${name}: ${link(md(k.value_text), k.ref)}`
  if (k.change_text) s += `, ${md(k.change_text)} ${md(k.change_label ?? '')}`.trimEnd()
  if (k.target)
    s += `. Target ${md(lower(k.target))}, ${k.status === 'met' ? 'met' : k.status === 'missed' ? 'missed' : 'to watch'}`
  if (k.tier === 'bronze') s += ' (bronze data)'
  return `- ${s}.`
}

function summaryText(v: Json): string[] {
  const out: string[] = []
  if (v.view === 'scorecard') {
    out.push(`The scorecard for ${scopeText(v)}: ${md(v.targets_met ?? 'no targets judged')} targets met.`)
    const missed = (v.practices ?? []).flatMap((p: Json) =>
      (p.measures ?? [])
        .filter((m: Json) => m.status === 'missed' && m.value_text !== '—')
        .map(
          (m: Json) =>
            `- ${md(p.label)}, ${md(m.label)}: ${link(md(m.value_text), m.ref)} against ${md(lower(m.target ?? 'its target'))}.`,
        ),
    )
    if (missed.length) out.push(`Missed targets:\n${missed.slice(0, 5).join('\n')}`)
    const top = v.top_findings?.[0]
    if (top) out.push(`Most serious finding, from ${md(top.practice)}: ${link(md(top.title), top.ref)}`)
    return out
  }
  out.push(`**${md(v.label)}** for ${scopeText(v)}:`)
  const lines = (v.key_figures ?? []).map(figureLine).filter(Boolean).slice(0, 3)
  if (lines.length) out.push(lines.join('\n'))
  const findings: Json[] = (v.findings ?? []).slice(0, 2)
  if (findings.length) {
    const line = (f: Json) => {
      const people = typeof f.people === 'number' ? ` ${link(`See the ${num(f.people)} people`, f.ref)}.` : ''
      return `${md(f.title)}${people}`
    }
    out.push(
      findings.length === 1
        ? `Most serious finding: ${line(findings[0])}`
        : `The most serious findings:\n${findings.map((f) => `1. ${line(f)}`).join('\n')}`,
    )
  }
  const opens = v.key_figures?.[0]?.opens
  if (typeof opens === 'string' && opens.startsWith('view:')) out.push(`[Open ${md(v.label)}](${opens})`)
  return out
}

function compareText(v: Json): string[] {
  const groups: Json[] = v.groups ?? []
  const by = String(v.by ?? 'group').replace('_', ' ')
  const out = [
    `${md(v.key_figure)} by ${by}, ${scopeText(v)}. Overall ${link(md(v.overall?.value_text ?? '—'), v.overall?.ref)}.`,
  ]
  const shown = groups.filter((g) => typeof g.value === 'number')
  const top = [...shown].sort((a, b) => b.value - a.value)[0]
  if (top) out.push(`Highest: ${md(top.group)} at ${link(md(top.value_text), top.ref)}.`)
  if (groups.length) {
    const head = `| ${by.charAt(0).toUpperCase()}${by.slice(1)} | Headcount | ${md(v.key_figure)} |\n|---|---:|---:|`
    const rows = groups
      .slice(0, 10)
      .map(
        (g) =>
          `| ${md(g.group)} | ${num(g.headcount)} | ${g.value_text === '—' ? '—' : link(md(g.value_text), g.ref)} |`,
      )
    out.push([head, ...rows].join('\n'))
  }
  return out
}

/** "businessUnit" as a column label: "Business unit". */
export function fieldLabel(field: string): string {
  const words = field
    .replace(/^org\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function queryText(v: Json): string[] {
  const rows: Json[] = v.rows ?? []
  const out = [
    `${md(v.label)} in ${scopeText(v)}: ${link(`${num(v.total?.count ?? 0)} matching rows`, v.total?.ref)}.`,
  ]
  if (v.hidden) out.push(md(v.hidden))
  if (rows.length && rows[0]?.group) {
    const keys = Object.keys(rows[0].group)
    const head = `| ${keys.map((k) => md(fieldLabel(k))).join(' | ')} | Count |\n|${keys.map(() => '---').join('|')}|---:|`
    const body = rows
      .slice(0, 12)
      .map(
        (r) => `| ${keys.map((k) => md(r.group?.[k] ?? '—')).join(' | ')} | ${link(num(r.count), r.ref)} |`,
      )
    out.push([head, ...body].join('\n'))
  }
  return out
}

function openItemsText(v: Json): string[] {
  const out = [
    `The Action center has ${link(`${num(v.open?.count ?? 0)} open items`, v.open?.ref)}: ${link(`${v.overdue?.count ?? 0} overdue`, v.overdue?.ref)}, ${link(`${v.critical?.count ?? 0} critical`, v.critical?.ref)} and ${link(`${v.due_soon?.count ?? 0} due within ${v.due_soon?.within_days ?? 7} days`, v.due_soon?.ref)}.`,
  ]
  const groups: Json[] = [...(v.by_owner_group ?? [])]
    .sort((a, b) => (b.open ?? 0) - (a.open ?? 0))
    .slice(0, 5)
  if (groups.length)
    out.push(
      [
        '| Owner group | Open | Overdue |\n|---|---:|---:|',
        ...groups.map((g) => `| ${md(g.group)} | ${link(num(g.open ?? 0), g.ref)} | ${g.overdue ?? 0} |`),
      ].join('\n'),
    )
  out.push('[Open the Action center](view:actions)')
  return out
}

function qualityText(v: Json): string[] {
  const sets: Json[] = v.datasets ?? []
  const out = [`The data standard is ${md(v.data_standard ?? 'not set')}.`]
  if (sets.length)
    out.push(
      sets
        .slice(0, 8)
        .map((d) => `- ${md(d.label)}: ${md(d.tier)}. ${md(d.explain ?? '')}`.trimEnd())
        .join('\n'),
    )
  out.push('[Open Data quality](view:data.quality)')
  return out
}

function metricsText(v: Json): string[] {
  const list: Json[] = v.metrics ?? []
  if (!list.length) return ['No metric definition matches that.']
  return [
    list
      .slice(0, 3)
      .map(
        (m) =>
          `- [${md(m.name)}](metric:${m.metric}): ${md(m.definition)}${m.target ? ` Target ${md(lower(m.target))}.` : ''}`,
      )
      .join('\n'),
  ]
}

function actionText(name: string, v: Json): string[] {
  if (typeof v.line === 'string') {
    const out = [`${md(v.line)}.`]
    if (typeof v.left_out === 'string') out.push(md(v.left_out))
    return out
  }
  if (name === 'show_figure') return [`Pointed to ${md(v.shown)} on ${md(v.on)}.`]
  if (name === 'open_records') return [`Opened the records for ${md(v.opened)}.`]
  return [md(v.note ?? 'Nothing changed.')]
}

/** A scope inside a sentence: "the whole company", "Bengaluru". */
const scopeIn = (scope: unknown): string =>
  typeof scope === 'string' ? scope.replace(/^Whole company/, 'the whole company') : 'the scope on screen'

function screenText(v: Json): string[] {
  const where = v.tab_label ? `${md(v.view_label)}, ${md(v.tab_label)}` : md(v.view_label)
  const scope =
    typeof v.period?.label === 'string' ? ` for ${md(scopeIn(v.scope))}, ${md(lower(v.period.label))}` : ''
  const out = [`You are looking at [${where}](${v.link})${scope}.`]
  const figs: Json[] = v.figures ?? []
  if (figs.length)
    out.push(
      `Figures here: ${figs
        .slice(0, 5)
        .map((f) => md(f.title))
        .join('; ')}${figs.length > 5 ? ' and more' : ''}.`,
    )
  if (v.records_panel?.open) out.push(`The records panel is open on ${md(v.records_panel.title)}.`)
  return out
}

/** A number as the scripted answer writes it: shares as percentages. */
const figureNum = (n: unknown, format?: unknown): string =>
  typeof n === 'number' && (format === 'pct' || (!format && !Number.isInteger(n) && Math.abs(n) < 1.5))
    ? `${(n * 100).toFixed(1)}%`
    : num(n)

function chartText(v: Json): string[] {
  const x = v.encodes?.x
  const y = v.encodes?.y ?? v.encodes?.value
  const out = [`Here is **${md(v.title)}**, from ${md(v.source)} (${md(scopeIn(v.scope))}, ${md(v.period)}).`]
  const point = (p: Json) =>
    p && x && y ? `${md(p[x])} at ${link(figureNum(p[y], v.formats?.[y]), p.ref)}` : null
  const hi = point(v.highest)
  const lo = point(v.lowest)
  if (hi && lo) out.push(`Highest: ${hi}. Lowest: ${lo}.`)
  if (v.hidden_groups) out.push(`${v.hidden_groups} groups have their numbers hidden to protect anonymity.`)
  return out
}

function contextText(v: Json): string[] {
  const loaded = (v.datasets ?? []).filter((d: Json) => d.loaded).length
  return [
    `Scope: ${md(v.scope ?? 'whole company')}. Period: ${md(lower(v.period?.label ?? 'last 12 months'))}, as of ${md(v.as_of ?? '')}. ${loaded} datasets are loaded.`,
  ]
}

export interface ToolResult {
  name: string
  input: unknown
  /** The exact text the tool returned. */
  content: string
}

/** The scripted answer: what the tools said, with their refs, people and links. */
export function composeAnswer(results: readonly ToolResult[], opts: { actionsOff?: boolean } = {}): string {
  const parts: string[] = []
  if (opts.actionsOff)
    parts.push('Changing the screen is turned off in Settings > Ask Census, so I left it as it is.')
  const seen = new Set<string>()
  for (const r of results) {
    // The round-limit test calls the same tool eleven times; say it once.
    const key = `${r.name}:${JSON.stringify(r.input)}`
    if (seen.has(key)) continue
    seen.add(key)
    let v: Json
    try {
      v = JSON.parse(r.content)
    } catch {
      continue
    }
    if (v?.error) {
      parts.push(
        ACTION_NAMES.includes(r.name)
          ? `Census did not change the screen: ${md(v.error)}`
          : `Census could not work this out: ${md(v.error)}`,
      )
      continue
    }
    if (ACTION_NAMES.includes(r.name)) parts.push(...actionText(r.name, v))
    else if (r.name === 'get_screen') parts.push(...screenText(v))
    else if (r.name === 'make_chart') parts.push(...chartText(v))
    else if (r.name === 'view_summary') parts.push(...summaryText(v))
    else if (r.name === 'compare_groups') parts.push(...compareText(v))
    else if (r.name === 'query_records') parts.push(...queryText(v))
    else if (r.name === 'open_items') parts.push(...openItemsText(v))
    else if (r.name === 'explain_quality') parts.push(...qualityText(v))
    else if (r.name === 'find_metrics') parts.push(...metricsText(v))
    else if (r.name === 'get_context') parts.push(...contextText(v))
  }
  if (!parts.length) parts.push('Census found nothing to report for this question.')
  parts.push('_A scripted test answer from the development build. Claude was not asked._')
  return parts.join('\n\n')
}

/* ───────────── the stream ───────────── */

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

interface Reply {
  blocks: Block[]
  stop: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal'
}

let ids = 0

function eventsOf(reply: Reply, model: string, input: number, cacheRead: number) {
  const output = Math.max(
    12,
    Math.round(reply.blocks.reduce((n, b) => n + (b.type === 'text' ? b.text.length : 60), 0) / 4),
  )
  const usage = {
    input_tokens: input,
    output_tokens: 1,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: 0,
  }
  const message = {
    id: `msg_dev_${++ids}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage,
  }
  const events: Record<string, unknown>[] = [{ type: 'message_start', message }]
  reply.blocks.forEach((b, index) => {
    if (b.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })
      for (const piece of b.text.match(/[\s\S]{1,9}/g) ?? [])
        events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } })
    } else {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
      })
      for (const piece of JSON.stringify(b.input).match(/[\s\S]{1,24}/g) ?? [])
        events.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: piece },
        })
    }
    events.push({ type: 'content_block_stop', index })
  })
  events.push({
    type: 'message_delta',
    delta: { stop_reason: reply.stop, stop_sequence: null },
    usage: { ...usage, output_tokens: output },
  })
  events.push({ type: 'message_stop' })
  const final = {
    ...message,
    content: reply.blocks.map((b) => (b.type === 'text' ? { type: 'text', text: b.text } : b)),
    stop_reason: reply.stop,
    usage: { ...usage, output_tokens: output },
  }
  return {
    events: events as unknown as BetaRawMessageStreamEvent[],
    message: final as unknown as BetaMessage,
  }
}

const abortError = () => {
  const e = new Error('Request was aborted.')
  e.name = 'AbortError'
  return e
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const statusError = (status: number, type: string) =>
  Object.assign(new Error(`Scripted ${status} from the development client`), { status, type })

/** The question of this turn and the tool calls and results since it. */
function turnOf(messages: readonly BetaMessageParam[]) {
  let start = messages.length - 1
  while (start >= 0 && !(messages[start]?.role === 'user' && typeof messages[start]?.content === 'string'))
    start--
  const question = start >= 0 ? (messages[start]?.content as string) : ''
  const after = messages.slice(start + 1)
  const calls = new Map<string, { name: string; input: unknown }>()
  const results: ToolResult[] = []
  let rounds = 0
  for (const m of after) {
    if (typeof m.content === 'string') continue
    for (const b of m.content as unknown as Json[]) {
      if (b.type === 'tool_use') calls.set(b.id, { name: b.name, input: b.input })
      if (b.type === 'tool_result') {
        const call = calls.get(b.tool_use_id)
        const content = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        if (call) results.push({ name: call.name, input: call.input, content })
      }
    }
    if (m.role === 'assistant') rounds++
  }
  return { question, rounds, results }
}

/**
 * The scripted client. `pace` scales its pauses (1: like a quick Claude; 0: none, for tests); a
 * question with "fake slow" streams ten times slower, so there is time to press Stop.
 */
export function createDevClient(opts: { pace?: number } = {}): DevClient {
  const pace = opts.pace ?? 1
  let isOnline = true
  return {
    online: () => isOnline,
    isConnectionError: (err) => err instanceof TypeError,
    stream(body: AskRequest, o: { signal?: AbortSignal }): AskStream {
      const { question, rounds, results } = turnOf(body.messages as BetaMessageParam[])
      const offered = new Set((body.tools ?? []).map((t) => (t as { name: string }).name))
      const plan = planFor(question, offered)
      isOnline = plan.fault !== 'offline'
      if (rounds === 0 && plan.fault) {
        if (plan.fault === 'offline' || plan.fault === 'blocked') throw new TypeError('Failed to fetch')
        if (typeof plan.fault === 'number')
          throw statusError(
            plan.fault,
            {
              401: 'authentication_error',
              404: 'not_found_error',
              429: 'rate_limit_error',
              529: 'overloaded_error',
            }[plan.fault],
          )
      }
      const final = (body as { tool_choice?: { type?: string } }).tool_choice?.type === 'none'
      let reply: Reply
      if (plan.fault === 'declined')
        reply = { blocks: [{ type: 'text', text: 'Census can' }], stop: 'refusal' }
      else if (!final && rounds < plan.rounds.length)
        reply = {
          blocks: (plan.rounds[rounds] ?? []).map((c) => ({
            type: 'tool_use',
            id: `toolu_dev_${++ids}`,
            name: c.name,
            input: resolveInput(c.input, results),
          })),
          stop: 'tool_use',
        }
      else if (plan.fault === 'cut-off')
        reply = {
          blocks: [{ type: 'text', text: `${composeAnswer(results, plan).slice(0, 220)}` }],
          stop: 'max_tokens',
        }
      else reply = { blocks: [{ type: 'text', text: composeAnswer(results, plan) }], stop: 'end_turn' }

      const input = Math.round(JSON.stringify(body.messages).length / 4)
      const { events, message } = eventsOf(reply, body.model, input, rounds ? 2600 : 0)
      const step = (plan.slow ? 140 : 14) * pace
      let finished = false
      return {
        async *[Symbol.asyncIterator]() {
          // Claude reads and thinks before the first word.
          await wait((rounds ? 250 : 500) * pace, o.signal)
          for (const e of events) {
            if (o.signal?.aborted) throw abortError()
            if (e.type === 'content_block_delta' && step > 0) await wait(step, o.signal)
            yield e
          }
          finished = true
        },
        finalMessage: async () => {
          if (!finished && o.signal?.aborted) throw abortError()
          return message
        },
      }
    },
  }
}
