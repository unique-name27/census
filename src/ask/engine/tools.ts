/**
 * The tools Claude can call (docs/ASK.md, Tools): their names and JSON schemas, the plain progress
 * line for each call, and `runTool`, which runs one call against the app's live context and
 * returns the exact text that goes back to Claude.
 *
 * Every result is JSON built from allowlisted fields, then passed through the privacy pass
 * (`TokenMap.scanDeep`): known names, person IDs and emails become tokens and money amounts are
 * withheld, whatever an engine wrote into its text.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AccessContext } from '@/access/context'
import { errorMessage, logDevError } from '@/app/devlog'
import { DATASET_KEYS, DATASETS } from '@/data/schema'
import { recordSince } from '@/lib/timing'
import { ACTION_OWNER_ROLES } from '@/views/types'
import { QUERY_DATASETS, queryDataset } from './allowlist'
import { ReleaseAudit } from './audit'
import type { TokenMap } from './privacy'
import type { RefRegistry } from './refs'
import { askOffReason, chatContext, EXCLUDE_ARGS, PERIODS, scopePhrase } from './scope'
import { openItems } from './tools/actions'
import { getContext } from './tools/context'
import { findMetrics } from './tools/metrics'
import { explainQuality } from './tools/quality'
import { DATE_PARTS, MEASURE_OPS, OPS, queryRecords } from './tools/query'
import type { ToolOutput, ToolRuntime } from './tools/shared'
import { COMPARE_BY, compareGroups, viewSummary } from './tools/summary'
import type { ToolEnv, ToolName } from './types'

export const TOOL_NAMES: readonly ToolName[] = [
  'get_context',
  'find_metrics',
  'view_summary',
  'compare_groups',
  'query_records',
  'explain_quality',
  'open_items',
]

export const isToolName = (v: unknown): v is ToolName => TOOL_NAMES.includes(v as ToolName)

const VIEW_KEYS_WITH_DATA = [
  'scorecard',
  'recruiting',
  'onboarding',
  'hrbp',
  'org',
  'services',
  'talent',
  'comp',
  'compliance',
  'listening',
]

const FILTERS_SCHEMA = {
  type: 'object',
  description:
    'The org scope and period for this call. Leave it out to use the scope and period the user has picked. When given, it replaces the user’s org filters (a dimension left out means no filter on it); the period stays the user’s unless given.',
  properties: {
    leader: {
      type: 'string',
      description:
        'A leader’s person token from get_context, such as {{P12}}: the leader and everyone below them.',
    },
    business_unit: {
      type: 'array',
      items: { type: 'string' },
      description: 'Business units, as get_context lists them.',
    },
    department: { type: 'array', items: { type: 'string' } },
    location: { type: 'array', items: { type: 'string' } },
    level: { type: 'array', items: { type: 'string' }, description: 'Level codes such as L4 or M1.' },
    period: {
      type: 'string',
      enum: PERIODS,
      description:
        't12m last 12 months, ytd year to date, lastQuarter last full quarter, t6m, t3m, custom (with start and end).',
    },
    start: { type: 'string', description: 'YYYY-MM-DD, with period custom.' },
    end: { type: 'string', description: 'YYYY-MM-DD, with period custom; on or before the as-of date.' },
    exclude: {
      type: 'array',
      items: { type: 'string', enum: EXCLUDE_ARGS },
      description:
        'Filters to leave out instead of keep: everyone except those values (for leader, everyone except that leader’s whole org). Name the filter here and give its values as usual, e.g. {"business_unit": ["Sales"], "exclude": ["business_unit"]} is the whole company except Sales. Filters combine with AND. Leaving out fewer people than the anonymity minimum is refused.',
    },
  },
  additionalProperties: false,
} as const

const fieldHelp = (datasets: typeof QUERY_DATASETS) =>
  datasets.map((d) => `${d.key}: ${d.fields.map((f) => f.name).join(', ')}`).join('\n')
const queryFieldHelp = fieldHelp(QUERY_DATASETS)

/** query_records' description, over the datasets a mode lets Ask read. */
const queryDescription = (help: string) =>
  `Aggregates over the rows of one dataset in scope: count, distinct people, share, and sum, mean, median, min or max of a number field. Group by up to 2 fields (dates by month, quarter or year); at most 50 rows, each with a ref to its records. Rows are not limited to the period unless a where clause uses op in_period on a date. People come back as person tokens. Groups smaller than the anonymity minimum show counts with their other numbers hidden. Fields named org.* are the org of the person the row is about. Fields per dataset:\n${help}`

/** Tool definitions as the Messages API takes them; the last one carries the cache breakpoint. */
export const TOOL_DEFINITIONS: BetaTool[] = [
  {
    name: 'get_context',
    description:
      'Start here. Returns the as-of date, the current period and comparison windows, the user’s scope (leader as a person token), the data standard, each dataset (loaded, sample or uploaded, rows, tier), feature switches, the views and their tabs, and the filter vocabularies: business units, departments, locations, levels, and leaders as person tokens with org sizes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'find_metrics',
    description:
      'Look up metric definitions in the metric dictionary in force (with the user’s wording and targets): id, name, views, definition, formula, population, window, unit, target, good direction, and whether it was changed from the default. Up to 25 entries.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Words to match, such as "voluntary attrition" or "time to fill".',
        },
        view: { type: 'string', description: 'Only metrics shown on this view (a view key).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'view_summary',
    description:
      'A view’s key figures and findings, computed by the view’s own engine exactly as the screen shows them. Key figures carry value (number) and value_text, unit, change and its label, target and status as the tile shows it (met or missed; none without a target, unknown when hidden), tier, and hidden or suppressed with the reason. A missed figure inside the People scorecard’s watch margin also has scorecard_status watch, which only the scorecard shows. Findings carry severity, title, detail and next step. Each number has a ref for its records. The scorecard view returns every practice’s measures against target with the scorecard’s status (met, watch, missed) and the top findings across Census.',
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: VIEW_KEYS_WITH_DATA, description: 'The view key.' },
        filters: FILTERS_SCHEMA,
      },
      required: ['view'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_groups',
    description:
      'One key figure of a view for each group of a dimension (the 12 largest groups by default, or the values you name), computed with the view’s own engine for each group’s scope. Small groups follow the figure’s own suppression. Use the key figure id or metric id from view_summary.',
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: VIEW_KEYS_WITH_DATA.filter((v) => v !== 'scorecard' && v !== 'org') },
        kpi: {
          type: 'string',
          description: 'A key figure id (such as "voluntary") or metric id from view_summary.',
        },
        by: { type: 'string', enum: COMPARE_BY },
        values: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Groups to compare: names of business units, departments, locations or levels, or leader tokens.',
        },
        filters: FILTERS_SCHEMA,
      },
      required: ['view', 'kpi', 'by'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_records',
    description: queryDescription(queryFieldHelp),
    input_schema: {
      type: 'object',
      properties: {
        dataset: { type: 'string', enum: QUERY_DATASETS.map((d) => d.key) },
        where: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              op: { type: 'string', enum: OPS },
              value: {
                description:
                  'Text, number, true or false, a YYYY-MM-DD date, a list for in, not_in and between, a person token for person fields, or "current" or "prior" for in_period.',
              },
            },
            required: ['field', 'op'],
            additionalProperties: false,
          },
        },
        group_by: {
          type: 'array',
          maxItems: 2,
          items: {
            type: 'object',
            properties: { field: { type: 'string' }, by: { type: 'string', enum: DATE_PARTS } },
            required: ['field'],
            additionalProperties: false,
          },
        },
        measures: {
          type: 'array',
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: MEASURE_OPS },
              field: { type: 'string', description: 'A number field; for share, a yes/no field (or none).' },
            },
            required: ['op'],
            additionalProperties: false,
          },
          description: 'Defaults to count.',
        },
        filters: FILTERS_SCHEMA,
        sort: {
          type: 'object',
          properties: {
            by: {
              type: 'string',
              description: '"count" (default), "group", "people" or a measure key such as mean_tenureYears.',
            },
            dir: { type: 'string', enum: ['asc', 'desc'] },
          },
          additionalProperties: false,
        },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['dataset'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_quality',
    description:
      'Data quality: each dataset’s tier (gold, silver, bronze, none) and why, the checks it passes or fails, the fields that hold it back, and values not on the official lists with counts. Give a dataset for its checks, and a field for that field.',
    input_schema: {
      type: 'object',
      properties: {
        dataset: { type: 'string', enum: DATASET_KEYS },
        field: { type: 'string', description: 'A field key of the dataset.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'open_items',
    description:
      'The Action center: open items that wait on someone, counted by owner group, severity, due date and source view, with the owners who have the most pressing items as person tokens. Uses the user’s scope.',
    input_schema: {
      type: 'object',
      properties: {
        owner_group: { type: 'string', enum: ACTION_OWNER_ROLES },
        overdue_only: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    cache_control: { type: 'ephemeral' },
  },
]

/* ───────────── per mode (docs/ROLES.md, 4.7) ───────────── */

type ModeAccess = Pick<AccessContext, 'mode' | 'can'>

let managerTools: BetaTool[] | null = null
let hrTools: BetaTool[] | null = null

/**
 * The tool definitions sent to Claude in a mode. HR and Developer mode send every tool. Manager
 * mode leaves out `explain_quality`, and the view and dataset enums and descriptions list only
 * what Manager mode shows. The last tool keeps the cache breakpoint.
 */
export function toolDefinitionsFor(access: ModeAccess | null | undefined): BetaTool[] {
  if (!access || access.mode === 'developer') return TOOL_DEFINITIONS
  if (access.mode !== 'manager') {
    // HR mode: every tool but the ones not ready yet (open_items while the Action center is
    // Developer mode only). The last tool keeps the cache breakpoint.
    if (hrTools) return hrTools
    const shown = TOOL_DEFINITIONS.filter((t) => access.can(`ask:${t.name}`))
    if (shown.length === TOOL_DEFINITIONS.length) {
      hrTools = TOOL_DEFINITIONS
      return hrTools
    }
    hrTools = shown.map(({ cache_control: _cache, ...rest }, i) =>
      i === shown.length - 1 ? { ...rest, cache_control: { type: 'ephemeral' as const } } : rest,
    )
    return hrTools
  }
  if (managerTools) return managerTools
  const views = VIEW_KEYS_WITH_DATA.filter((v) => access.can(`view:${v}`))
  const datasets = QUERY_DATASETS.filter((d) => access.can(`dataset:${d.key}`))
  const withEnum = (schema: BetaTool['input_schema'], key: string, values: readonly string[]) => {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined
    if (!props?.[key]) return schema
    return { ...schema, properties: { ...props, [key]: { ...props[key], enum: values } } }
  }
  const out = TOOL_DEFINITIONS.filter((t) => access.can(`ask:${t.name}`)).map((t): BetaTool => {
    const { cache_control: _cache, ...rest } = t
    switch (t.name) {
      case 'view_summary':
        return { ...rest, input_schema: withEnum(t.input_schema, 'view', views) }
      case 'compare_groups':
        return {
          ...rest,
          input_schema: withEnum(
            t.input_schema,
            'view',
            views.filter((v) => v !== 'scorecard' && v !== 'org'),
          ),
        }
      case 'query_records':
        return {
          ...rest,
          description: queryDescription(fieldHelp(datasets)),
          input_schema: withEnum(
            t.input_schema,
            'dataset',
            datasets.map((d) => d.key),
          ),
        }
      default:
        return rest
    }
  })
  const last = out[out.length - 1]
  if (last) out[out.length - 1] = { ...last, cache_control: { type: 'ephemeral' } }
  managerTools = out
  return out
}

/* ───────────── progress lines ───────────── */

/** A label inside a sentence: "Employees" becomes "employees", "HR cases" stays. */
const midSentence = (s: string): string =>
  /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s

function viewLabel(env: ToolEnv, key: unknown): string {
  if (typeof key !== 'string') return 'view'
  return env.views.find((v) => v.key === key)?.label ?? key
}

/** A key figure's name from the metric dictionary ("voluntary attrition"), by metric id or the view's key figure id. */
function kpiName(env: ToolEnv, view: unknown, kpi: unknown): string | null {
  if (typeof kpi !== 'string' || !kpi) return null
  const m = env.ctx.metrics
  const def =
    m.def(kpi) ??
    m.list.find((d) => typeof view === 'string' && d.id.startsWith(`${view}.`) && d.id.endsWith(`.${kpi}`))
  return def ? midSentence(def.name) : null
}

/**
 * The plain line shown while a tool runs: "Calculating People stats key figures for Bengaluru".
 * It may hold a person token (a leader); the UI shows the name.
 */
export function toolLabel(name: string, input: unknown, env: ToolEnv, tokens: TokenMap): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const scope = () => scopePhrase(chatContext(env.ctx), i.filters, tokens)
  switch (name) {
    case 'get_context':
      return 'Reading the scope, period and datasets'
    case 'find_metrics':
      return typeof i.query === 'string' && i.query.trim()
        ? `Looking up the definition of ${i.query.trim().toLowerCase()}`
        : 'Looking up metric definitions'
    case 'view_summary':
      return i.view === 'scorecard'
        ? `Calculating the scorecard${scope()}`
        : `Calculating ${viewLabel(env, i.view)} key figures${scope()}`
    case 'compare_groups': {
      const by = typeof i.by === 'string' ? i.by.replace('_', ' ') : 'group'
      const what = kpiName(env, i.view, i.kpi) ?? `${viewLabel(env, i.view)} key figures`
      return `Comparing ${what} by ${by}${scope()}`
    }
    case 'query_records': {
      const d = queryDataset(String(i.dataset ?? ''))
      const groups = Array.isArray(i.group_by)
        ? i.group_by
            .map((g) => (typeof g === 'string' ? g : (g as { field?: unknown })?.field))
            .filter((g): g is string => typeof g === 'string')
        : []
      const fields = groups.map((g) => midSentence(d?.fields.find((f) => f.name === g)?.label ?? g))
      return `Counting ${d ? midSentence(d.label) : 'records'}${fields.length ? ` by ${fields.join(' and ')}` : ''}${scope()}`
    }
    case 'explain_quality': {
      const label = DATASETS.find((d) => d.key === i.dataset)?.label
      return label ? `Checking data quality of ${midSentence(label)}` : 'Checking data quality'
    }
    case 'open_items':
      return 'Counting open items in the Action center'
    default:
      return `Running ${name}`
  }
}

/* ───────────── running a call ───────────── */

export interface ToolRun {
  /** The exact text sent back to Claude as the tool_result content. */
  content: string
  isError: boolean
  label: string
  ms: number
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/**
 * Run one tool call. Never throws: an unknown tool, bad input or an engine error comes back as an
 * error result Claude can read and act on. The result has been through the privacy pass.
 */
export function runTool(
  name: string,
  input: unknown,
  env: ToolEnv,
  conv: { tokens: TokenMap; refs: RefRegistry; audit?: ReleaseAudit },
): ToolRun {
  const t = clock()
  conv.tokens.index(env.ctx)
  const label = toolLabel(name, input, env, conv.tokens)
  const rt: ToolRuntime = {
    env,
    base: chatContext(env.ctx),
    tokens: conv.tokens,
    refs: conv.refs,
    audit: conv.audit ?? new ReleaseAudit(),
  }
  let out: ToolOutput
  // The mode's policy first: a tool it hides returns a plain error, never a number.
  const access = env.ctx.access
  const off = access?.lock ? askOffReason(env.ctx) : null
  if (off) return { content: JSON.stringify({ error: off }), isError: true, label, ms: clock() - t }
  if (access && isToolName(name) && !access.can(`ask:${name}`))
    return {
      content: JSON.stringify({
        error:
          access.mode === 'manager'
            ? `${name} is not available in Manager mode.`
            : `${name} is not available: the Action center it reads is not ready yet.`,
      }),
      isError: true,
      label,
      ms: clock() - t,
    }
  try {
    switch (name) {
      case 'get_context':
        out = getContext(rt)
        break
      case 'find_metrics':
        out = findMetrics(rt, input)
        break
      case 'view_summary':
        out = viewSummary(rt, input)
        break
      case 'compare_groups':
        out = compareGroups(rt, input)
        break
      case 'query_records':
        out = queryRecords(rt, input)
        break
      case 'explain_quality':
        out = explainQuality(rt, input)
        break
      case 'open_items':
        out = openItems(rt, input)
        break
      default:
        out = { ok: false, error: `There is no tool "${name}". Tools: ${TOOL_NAMES.join(', ')}.` }
    }
  } catch (err) {
    console.error(`Ask Census: ${name} could not be computed`, err)
    logDevError({ where: 'ask tool', view: null, tab: name, message: errorMessage(err) })
    out = { ok: false, error: `${name} could not be computed for this scope. Try another scope or tool.` }
  }
  const body = out.ok ? out.value : { error: out.error }
  const content = JSON.stringify(conv.tokens.scanDeep(body))
  recordSince(`census:ask:${name}`, t)
  return { content, isError: !out.ok, label, ms: clock() - t }
}
