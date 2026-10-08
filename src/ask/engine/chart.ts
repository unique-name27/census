/**
 * `make_chart` (docs/ASK-ACTIONS.md, part 4): Claude describes a chart, Census draws it. The spec
 * names a source (a Census tool call run here, a figure by id, or an earlier tool call's result
 * id), one of the chart kit's forms, the fields of the source rows each mark encodes, and a title.
 * Claude never supplies a number: the rows come from Census, so the chart cannot disagree with the
 * screens, and privacy suppression comes with them (a hidden small group stays hidden).
 *
 * Pure: `parseChartSpec` reads the spec, the `*Source` functions turn a source's output into flat
 * rows with field descriptions, refs and notes, and `buildChart` checks the spec against them and
 * returns the chart model the UI draws with the chart kit (`AskChart`) and the summary that goes
 * back to Claude. Every error is a sentence Claude can act on.
 */
import type { Column } from '@/charts/types'
import { customPeriodText } from '@/components/filterLabels'
import type { Tier } from '@/data/quality/tier'
import type { DrillSource } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { kpiTarget } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { type QueryField, queryDataset } from './allowlist'
import { isIdColumn, listsPeople } from './screenPrivacy'

/* ───────────── the model the UI draws ───────────── */

export const CHART_FORMS = [
  'bars',
  'columns',
  'stacked_columns',
  'lines',
  'heatmap',
  'scatter',
  'dot_strip',
  'histogram',
  'bullets',
] as const
export type ChartForm = (typeof CHART_FORMS)[number]

/** The forms in words, for errors and the tool description. */
export const FORM_WORDS: Readonly<Record<ChartForm, string>> = {
  bars: 'bars',
  columns: 'columns',
  stacked_columns: 'stacked columns',
  lines: 'lines',
  heatmap: 'heatmap',
  scatter: 'scatter',
  dot_strip: 'dot strip',
  histogram: 'histogram',
  bullets: 'bullets',
}

/** What a field of the chart's rows holds. Time kinds sort in time order. */
export type ChartFieldKind =
  | 'category'
  | 'person'
  | 'boolean'
  | 'month'
  | 'quarter'
  | 'year'
  | 'date'
  | 'number'

/** A field of the chart's rows: the table view's and the exports' column. */
export interface ChartColumn {
  key: string
  label: string
  kind: ChartFieldKind
  /** Census number format ('text' for categories). */
  format: Format
  /** The row field holding each row's own format, when rows differ (key figures in several units). */
  formatKey?: string
}

/**
 * A chart Ask drew, as the UI renders it: a full Census `Figure` (exports, table view, definitions,
 * tier) around a chart kit component picked by `form`, with drills on every mark.
 *
 * Form to kit: bars → `BarList` (label `x`, value `y`; with `series`, `HBars`), columns and
 * stacked_columns → `Columns` (`x`, `y`, `series`, `stack`, `xType`), lines → `Lines` (`x`, `y`,
 * `series`), heatmap → `Heatmap` (`x`, `y`, `value`), scatter → `Scatter` (`x`, `y`, `label`),
 * dot_strip → `DotStrip` (`x` number, `y` category), histogram → `Histogram` (`data` + `value` =
 * `x`), bullets → `BulletList` (`label` = `x`, `value` = `y`, `target`).
 */
export interface AskChart {
  /** 'ask-chart-1': unique in the conversation; the Figure's id. */
  id: string
  title: string
  subtitle: string | null
  form: ChartForm
  /**
   * The rows, in order: the table view and every export show exactly these (`columns` says which
   * fields). Category values may be person tokens: draw and export them through `chartWithNames`.
   * Rows may carry helper fields the columns do not list (`__x`, a month for a quarter axis).
   */
  rows: Record<string, string | number | boolean | null>[]
  columns: ChartColumn[]
  /** The fields each mark encodes; null when the form does not use one. */
  x: string | null
  /**
   * The field holding x as readers see it: the same as `x`, except for lines over quarters or
   * years, which plot `__x` (the period's first month) and label marks with this field.
   */
  xLabel: string | null
  y: string | null
  series: string | null
  value: string | null
  target: string | null
  /** A category field that names each mark (scatter, dot strip, tooltips). */
  label: string | null
  /** How `Columns` lays out x: months as a time band, else categories. */
  xType: 'band' | 'month'
  /** The records behind each row (same index): `conversation.records(ref)` opens them. */
  refs: (string | null)[]
  /** Plain sentences: what was left out or hidden, and why. */
  notes: string[]
  /** Where the numbers come from, in the reader's words, no tool names ("Employees, counted from records"). */
  source: string
  /** The scope and period the numbers are for (scope with person tokens). */
  scope: string
  period: string
  tier: Tier | null
  /** The metric dictionary entry, for the Figure's definitions. */
  metric: string | null
}

/* ───────────── the spec ───────────── */

/** Tools whose output a chart can draw. */
export const CHART_SOURCE_TOOLS = ['query_records', 'compare_groups', 'view_summary'] as const
export type ChartSourceTool = (typeof CHART_SOURCE_TOOLS)[number]

export type ChartSourceSpec =
  | { kind: 'tool'; tool: ChartSourceTool; input: unknown }
  | { kind: 'figure'; figure: string }
  | { kind: 'result'; result: string }

export interface ChartSpec {
  source: ChartSourceSpec
  form: ChartForm
  x: string | null
  y: string | null
  series: string | null
  value: string | null
  target: string | null
  label: string | null
  /** dir null: ascending for a category or time field, descending for a number (buildChart). */
  sort: { by: string; dir: 'asc' | 'desc' | null } | null
  limit: number | null
  title: string
  subtitle: string | null
}

export const MAX_CHART_ROWS = 50
const TITLE_MAX = 90

const SPEC_KEYS = [
  'source',
  'form',
  'x',
  'y',
  'series',
  'value',
  'target',
  'label',
  'sort',
  'limit',
  'title',
  'subtitle',
]

/** Plain house-style text: trimmed, em dashes as commas, no trailing full stop. */
function cleanText(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')
}

const optField = (v: unknown, name: string): string | null | { error: string } => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') return { error: `${name} must be a field name of the source rows.` }
  return v.trim()
}

/** The spec Claude wrote, checked for shape (not yet against the source). */
export function parseChartSpec(raw: unknown): ChartSpec | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'make_chart takes an object.'
  const i = raw as Record<string, unknown>
  const extra = Object.keys(i).filter((k) => !SPEC_KEYS.includes(k))
  if (extra.length)
    return `Unknown argument ${extra.map((k) => `"${k}"`).join(', ')}. make_chart takes ${SPEC_KEYS.join(', ')}.`
  // Source: exactly one of a tool call, a figure id or an earlier result id.
  const s = i.source
  if (!s || typeof s !== 'object' || Array.isArray(s))
    return 'source is required: {"tool": "query_records", "input": {...}}, {"figure": "<figure id>"} or {"result": "<tool_use id>"}.'
  const src = s as Record<string, unknown>
  const named = ['tool', 'figure', 'result'].filter((k) => src[k] != null && src[k] !== '')
  if (named.length !== 1) return 'source names exactly one of tool (with input), figure or result.'
  const srcExtra = Object.keys(src).filter((k) => !['tool', 'input', 'figure', 'result'].includes(k))
  if (srcExtra.length) return `source takes tool and input, figure, or result; not ${srcExtra.join(', ')}.`
  let source: ChartSourceSpec
  if (named[0] === 'tool') {
    if (!CHART_SOURCE_TOOLS.includes(src.tool as ChartSourceTool))
      return `source.tool must be one of ${CHART_SOURCE_TOOLS.join(', ')}. For a figure on screen, use {"figure": "<id>"}.`
    source = { kind: 'tool', tool: src.tool as ChartSourceTool, input: src.input ?? {} }
  } else if (named[0] === 'figure') {
    if (typeof src.figure !== 'string') return 'source.figure must be a figure id from get_screen.'
    source = { kind: 'figure', figure: src.figure.trim() }
  } else {
    if (typeof src.result !== 'string')
      return 'source.result must be the tool_use id of an earlier tool call in this conversation.'
    source = { kind: 'result', result: src.result.trim() }
  }
  if (!CHART_FORMS.includes(i.form as ChartForm)) return `form must be one of ${CHART_FORMS.join(', ')}.`
  const fields: Record<string, string | null> = {}
  for (const k of ['x', 'y', 'series', 'value', 'target', 'label'] as const) {
    const f = optField(i[k], k)
    if (f && typeof f === 'object') return f.error
    fields[k] = f
  }
  let sort: ChartSpec['sort'] = null
  if (i.sort != null) {
    const so = i.sort as Record<string, unknown>
    if (typeof so !== 'object' || Array.isArray(so) || typeof so.by !== 'string')
      return 'sort is {"by": "<field>", "dir": "asc" or "desc"}.'
    if (so.dir != null && so.dir !== 'asc' && so.dir !== 'desc') return 'sort.dir must be asc or desc.'
    sort = { by: so.by.trim(), dir: so.dir === 'asc' || so.dir === 'desc' ? so.dir : null }
  }
  let limit: number | null = null
  if (i.limit != null) {
    if (typeof i.limit !== 'number' || !Number.isInteger(i.limit) || i.limit < 1 || i.limit > MAX_CHART_ROWS)
      return `limit must be a whole number from 1 to ${MAX_CHART_ROWS}.`
    limit = i.limit
  }
  if (typeof i.title !== 'string' || !cleanText(i.title))
    return 'title is required: a short sentence-case title, such as "Voluntary attrition by location".'
  const title = cleanText(i.title)
  if (title.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters; put detail in subtitle.`
  if (i.subtitle != null && typeof i.subtitle !== 'string') return 'subtitle must be text.'
  const subtitle = typeof i.subtitle === 'string' && cleanText(i.subtitle) ? cleanText(i.subtitle) : null
  return {
    source,
    form: i.form as ChartForm,
    x: fields.x,
    y: fields.y,
    series: fields.series,
    value: fields.value,
    target: fields.target,
    label: fields.label,
    sort,
    limit,
    title,
    subtitle,
  }
}

/* ───────────── sources ───────────── */

type Cell = string | number | boolean | null

/** A source's output as flat rows, with what each field is, the refs, and what was hidden. */
export interface ChartSource {
  /** Where the numbers come from, in words. */
  label: string
  rows: Record<string, Cell>[]
  /** The records behind each row (same index). */
  refs: (string | null)[]
  /** Why a row's numbers are hidden (same index), or null. */
  hidden: (string | null)[]
  fields: ChartColumn[]
  notes: string[]
  scope: string
  period: string
  tier: Tier | null
  metric: string | null
  /** The fields a chart uses when the spec names none. */
  defaults: { x: string | null; y: string | null; series: string | null }
  /**
   * The records behind one field of a row, when fields open different records (a figure's
   * "All exits" and "Voluntary exits"); without it every field of a row opens `refs[row]`.
   */
  refOf?: (row: number, key: string) => string | null
  /** When there is no default y: the sentence that tells Claude which fields to choose from. */
  pickY?: string
  /**
   * The source lists every group it has (no limit cut any, none hidden), so a period with no row
   * had no records: `zeroFields` are 0 there (counts and sums), the rest blank.
   */
  complete?: boolean
  zeroFields?: readonly string[]
  /**
   * The rows are not limited to the period (query_records without in_period): the chart reads as
   * of the as-of date, not for the period on screen.
   */
  unlimited?: boolean
}

// biome-ignore lint/suspicious/noExplicitAny: tool output is read defensively
type Json = any

const isCell = (v: unknown): v is Cell =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v))

const cell = (v: unknown): Cell => (isCell(v) ? v : v == null ? null : String(v))

const periodText = (v: Json): string => {
  const p = v?.period
  if (!p || typeof p !== 'object') return ''
  const label = typeof p.label === 'string' ? p.label : ''
  if (p.preset === 'custom' && p.start && p.end) return customPeriodText(String(p.start), String(p.end))
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** A format for a key figure's unit as tool output gives it ('%', 'd', 'yrs', or the format itself). */
export function formatOfUnit(unit: unknown): Format {
  switch (unit) {
    case '%':
      return 'pct'
    case 'pts':
      return 'pts'
    case 'd':
      return 'days'
    case 'h':
      return 'hours'
    case 'yrs':
      return 'years'
    case '×':
      return 'times'
    case 'count':
      return 'int'
    case 'ratio':
      return 'ratio'
    case 'USD':
      return 'money'
    default:
      return typeof unit === 'string' && FORMATS.has(unit) ? (unit as Format) : 'num1'
  }
}

const FORMATS: ReadonlySet<string> = new Set([
  'int',
  'compact',
  'num1',
  'num2',
  'pct',
  'pct0',
  'pct2',
  'pts',
  'pts2',
  'deltaDays',
  'deltaPct',
  'money',
  'moneyFull',
  'days',
  'hours',
  'years',
  'ratio',
  'times',
  'date',
  'text',
])

/** The format of a measure over a query field. */
function measureFormat(op: string, f: QueryField | undefined): Format {
  if (op === 'share') return 'pct'
  switch (f?.unit) {
    case 'fraction':
      return 'pct'
    case 'ratio':
      return 'ratio'
    case 'hours':
      return 'hours'
    case 'years':
      return 'years'
    case 'count':
      return op === 'sum' || op === 'min' || op === 'max' ? 'int' : 'num1'
    case 'score':
      return 'num2'
    default:
      return 'num1'
  }
}

const OP_WORD: Readonly<Record<string, string>> = {
  sum: 'Total',
  mean: 'Mean',
  median: 'Median',
  min: 'Lowest',
  max: 'Highest',
}

const lowerFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)

const PART_KIND = { month: 'month', quarter: 'quarter', year: 'year' } as const

/** query_records output as chart rows: one row per group, the group fields then the measures. */
export function querySource(v: Json): ChartSource | string {
  const d = queryDataset(String(v?.dataset ?? ''))
  if (!d) return 'That result is not a query_records result.'
  const rows: Json[] = Array.isArray(v.rows) ? v.rows : []
  if (!rows.length)
    return v?.hidden
      ? `The source has no numbers to draw: ${v.hidden}`
      : 'The source has no rows to draw. Check its where clause and scope.'
  const field = (name: string) => d.fields.find((f) => f.name === name)
  const groupKeys: string[] = []
  for (const r of rows)
    for (const k of Object.keys(r?.group ?? {})) if (!groupKeys.includes(k)) groupKeys.push(k)
  const fields: ChartColumn[] = groupKeys.map((k) => {
    const part = /^(.+)_(month|quarter|year)$/.exec(k)
    const f = field(part ? (part[1] as string) : k)
    if (part && f)
      return {
        key: k,
        label: `${f.label} (${part[2]})`,
        kind: PART_KIND[part[2] as keyof typeof PART_KIND],
        format: 'text',
      }
    return {
      key: k,
      label: f?.label ?? k,
      kind: f?.kind === 'person' ? 'person' : f?.kind === 'boolean' ? 'boolean' : 'category',
      format: 'text',
    }
  })
  const noun = d.noun[1]
  const measures: string[] = Array.isArray(v.measures) ? v.measures : []
  // One row per person (employees): distinct people equal the count, so the count alone goes, as
  // "People". Rows that can repeat a person count rows, with people beside them only when asked
  // for (or, one row per person in name only, when the two differ). Column labels stay unique.
  const perPerson = noun === 'people'
  const differ = rows.some((r) => typeof r?.people === 'number' && r.people !== r.count)
  const withPeople = !!d.person && (perPerson ? differ : measures.includes('people'))
  fields.push({
    key: 'count',
    label: perPerson ? (withPeople ? 'Rows' : 'People') : noun.charAt(0).toUpperCase() + noun.slice(1),
    kind: 'number',
    format: 'int',
  })
  if (withPeople) fields.push({ key: 'people', label: 'People', kind: 'number', format: 'int' })
  for (const m of measures) {
    if (m === 'count' || m === 'people') continue
    if (m === 'share') {
      fields.push({ key: m, label: 'Share of rows', kind: 'number', format: 'pct' })
      continue
    }
    const hit = /^(share|sum|mean|median|min|max)_(.+)$/.exec(m)
    const op = hit?.[1] ?? ''
    const f = hit ? field(hit[2] as string) : undefined
    const label = f
      ? op === 'share'
        ? `Share ${lowerFirst(f.label)}`
        : `${OP_WORD[op] ?? op} ${lowerFirst(f.label)}`
      : m
    fields.push({ key: m, label, kind: 'number', format: measureFormat(op, f) })
  }
  const flat = rows.map((r) => {
    const out: Record<string, Cell> = {}
    for (const k of groupKeys) {
      const g = r?.group?.[k]
      out[k] = typeof g === 'boolean' ? (g ? 'Yes' : 'No') : cell(g)
    }
    for (const f of fields)
      if (f.kind === 'number') out[f.key] = typeof r?.[f.key] === 'number' ? r[f.key] : null
    return out
  })
  const UNLIMITED = /^Rows are not limited to the period/
  const sourceNotes: unknown[] = Array.isArray(v.notes) ? v.notes : []
  const unlimited = sourceNotes.some((n) => typeof n === 'string' && UNLIMITED.test(n))
  const notes: string[] = sourceNotes.filter(
    (n: unknown): n is string => typeof n === 'string' && !UNLIMITED.test(n),
  )
  const listable =
    typeof v.groups_total === 'number'
      ? v.groups_total - (typeof v.groups_hidden === 'number' ? v.groups_hidden : 0)
      : 0
  if (typeof v.rows_shown === 'number' && listable > v.rows_shown)
    notes.push(`The source lists ${v.rows_shown} of ${listable} groups, by its own sort and limit.`)
  const firstMeasure = fields.find((f) => f.kind === 'number' && f.key !== 'count' && f.key !== 'people')
  const hiddenGroups = typeof v.groups_hidden === 'number' ? v.groups_hidden : 0
  const complete =
    typeof v.groups_total === 'number' &&
    typeof v.rows_shown === 'number' &&
    hiddenGroups === 0 &&
    v.rows_shown >= v.groups_total
  return {
    label: `${d.label}, counted from records`,
    rows: flat,
    refs: rows.map((r) => (typeof r?.ref === 'string' ? r.ref : null)),
    hidden: rows.map((r) => (typeof r?.hidden === 'string' ? r.hidden : null)),
    fields,
    notes,
    scope: typeof v.scope === 'string' ? v.scope : '',
    period: periodText(v),
    tier: (v.tier as Tier | null) ?? null,
    metric: null,
    defaults: {
      x: groupKeys[0] ?? null,
      y: firstMeasure?.key ?? 'count',
      series: groupKeys[1] ?? null,
    },
    complete,
    unlimited,
    // A group with no rows counts 0 and sums to 0; its means, medians and shares are blank.
    zeroFields: fields
      .filter((f) => f.key === 'count' || f.key === 'people' || /^sum_/.test(f.key))
      .map((f) => f.key),
  }
}

const BY_LABEL: Readonly<Record<string, string>> = {
  business_unit: 'Business unit',
  department: 'Department',
  location: 'Location',
  level: 'Level',
  leader: 'Leader',
}

/** A numeric target for a value in a format, when the metric's target applies to it. */
function targetOf(
  metrics: Pick<MetricsApi, 'def' | 'target'>,
  metric: unknown,
  value: unknown,
  format: Format,
) {
  if (typeof metric !== 'string' || typeof value !== 'number') return null
  try {
    return kpiTarget(metrics, metric, value, format)?.target.value ?? null
  } catch {
    return null
  }
}

/** compare_groups output as chart rows: one row per group with its headcount, value and change. */
export function compareSource(v: Json, metrics: Pick<MetricsApi, 'def' | 'target'>): ChartSource | string {
  const groups: Json[] = Array.isArray(v?.groups) ? v.groups : []
  if (!groups.length) return 'The source has no groups to draw.'
  const unit = v.overall?.unit ?? groups.find((g) => g?.unit)?.unit
  const format = formatOfUnit(unit)
  const changeFormat: Format = format === 'pct' ? 'pts' : format === 'days' ? 'deltaDays' : format
  const by = String(v.by ?? 'group')
  // What the change is measured against ("vs prior 6 months"), when every group says the same.
  const bases = new Set(
    groups.map((g) => (typeof g?.change_label === 'string' ? g.change_label : null)).filter(Boolean),
  )
  const basis = bases.size === 1 ? String([...bases][0]) : null
  const fields: ChartColumn[] = [
    {
      key: 'group',
      label: BY_LABEL[by] ?? 'Group',
      kind: by === 'leader' ? 'person' : 'category',
      format: 'text',
    },
    { key: 'headcount', label: 'Headcount', kind: 'number', format: 'int' },
    { key: 'value', label: String(v.key_figure ?? 'Value'), kind: 'number', format },
    { key: 'change', label: basis ? `Change ${basis}` : 'Change', kind: 'number', format: changeFormat },
  ]
  const rows = groups.map((g) => ({
    group: cell(g?.group),
    headcount: typeof g?.headcount === 'number' ? g.headcount : null,
    value: typeof g?.value === 'number' ? g.value : null,
    change: typeof g?.change === 'number' ? g.change : null,
    target: targetOf(metrics, v.metric, g?.value, format),
  }))
  if (rows.some((r) => r.target != null))
    fields.push({ key: 'target', label: 'Target', kind: 'number', format })
  else for (const r of rows) delete (r as Partial<typeof r>).target
  // Grouping by a filtered dimension compares every value of it: the groups' scope leaves that filter out.
  const regrouped = typeof v.groups_scope === 'string'
  return {
    label: `${String(v.label ?? 'A view')}, ${lowerFirst(String(v.key_figure ?? 'a key figure'))} by ${(BY_LABEL[by] ?? by).toLowerCase()}`,
    rows,
    refs: groups.map((g) => (typeof g?.ref === 'string' ? g.ref : null)),
    hidden: groups.map((g) =>
      typeof g?.hidden === 'string' ? g.hidden : typeof g?.suppressed === 'string' ? g.suppressed : null,
    ),
    fields,
    notes: regrouped
      ? [
          `Grouped by ${(BY_LABEL[by] ?? by).toLowerCase()}, so the ${(BY_LABEL[by] ?? by).toLowerCase()} filter is not applied`,
        ]
      : [],
    scope: regrouped ? v.groups_scope : typeof v.scope === 'string' ? v.scope : '',
    period: periodText(v),
    tier: (v.overall?.tier as Tier | null) ?? null,
    metric: typeof v.metric === 'string' ? v.metric : null,
    defaults: { x: 'group', y: 'value', series: null },
  }
}

/** view_summary output as chart rows: one row per key figure, each in its own unit. */
export function summarySource(v: Json, metrics: Pick<MetricsApi, 'def' | 'target'>): ChartSource | string {
  if (v?.view === 'scorecard')
    return "The scorecard's measures are in many units. Chart one view's key figures, or compare one key figure with compare_groups."
  const kpis: Json[] = Array.isArray(v?.key_figures) ? v.key_figures : []
  if (!kpis.length) return 'The source has no key figures to draw.'
  const rows = kpis.map((k) => {
    const format = formatOfUnit(k?.unit)
    return {
      label: cell(k?.label),
      value: typeof k?.value === 'number' ? k.value : null,
      target: targetOf(metrics, k?.metric, k?.value, format),
      status: typeof k?.status === 'string' ? k.status : null,
      _format: format,
    }
  })
  const fields: ChartColumn[] = [
    { key: 'label', label: 'Key figure', kind: 'category', format: 'text' },
    { key: 'value', label: 'Value', kind: 'number', format: 'num1', formatKey: '_format' },
    { key: 'target', label: 'Target', kind: 'number', format: 'num1', formatKey: '_format' },
    { key: 'status', label: 'Status', kind: 'category', format: 'text' },
  ]
  return {
    label: `${String(v.label ?? 'A view')} key figures`,
    rows,
    refs: kpis.map((k) => (typeof k?.ref === 'string' ? k.ref : null)),
    hidden: kpis.map((k) =>
      typeof k?.hidden === 'string' ? k.hidden : typeof k?.suppressed === 'string' ? k.suppressed : null,
    ),
    fields,
    notes: [],
    scope: typeof v.scope === 'string' ? v.scope : '',
    period: periodText(v),
    tier: null,
    metric: null,
    defaults: { x: 'label', y: 'value', series: null },
  }
}

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}/
const QUARTER_RE = /^\d{4} Q[1-4]$/
const YEAR_RE = /^\d{4}$/

/** What a column of figure rows holds, from its format and values. */
function kindOfValues(values: readonly unknown[], format: Format | null): ChartFieldKind {
  const present = values.filter((v) => v != null && v !== '')
  if (!present.length) return format && format !== 'text' && format !== 'date' ? 'number' : 'category'
  if (present.every((v) => typeof v === 'number')) return format === 'date' ? 'date' : 'number'
  if (present.every((v) => typeof v === 'boolean')) return 'boolean'
  const strings = present.map(String)
  if (strings.every((s) => MONTH_RE.test(s))) return 'month'
  if (strings.every((s) => QUARTER_RE.test(s))) return 'quarter'
  if (strings.every((s) => DATE_RE.test(s))) return 'date'
  return 'category'
}

/** What a figure source needs from the conversation: tokens for its text, refs for its drills. */
export interface FigureSourceHelpers {
  /** Text with names, IDs, emails and money amounts replaced (the privacy pass). */
  scan(text: string): string
  /** The person tokens in text, each with whether it may name a group (a leader with a big enough org). */
  people(text: string): { token: string; group: boolean }[]
  /** A ref for a row's records. */
  ref(source: DrillSource, label: string): string | null
}

const PAY_FORMATS: ReadonlySet<string> = new Set(['money', 'moneyFull', 'moneyM'])

const isPayColumn = (c: Column): boolean => {
  const fmt = typeof c.format === 'function' ? null : (c.format ?? null)
  return !!c.pay || (fmt != null && PAY_FORMATS.has(fmt))
}

/** A column of figure rows that holds numbers (not dates, not pay). */
function isNumberColumn(c: Column, rows: readonly Record<string, unknown>[]): boolean {
  if (isPayColumn(c)) return false
  const fmt = typeof c.format === 'function' ? null : (c.format ?? null)
  if (fmt === 'date' || fmt === 'text') return false
  const present = rows.map((r) => r[c.key]).filter((v) => v != null && v !== '')
  return present.length > 0 && present.every((v) => typeof v === 'number')
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The column a figure draws, read from what it declares: the number column named like its metric
 * ("Voluntary attrition" for hrbp.attrition.voluntary), else the longest number column label its
 * title holds ("Voluntary attrition by department"), else its only number column. Null when the
 * figure has several number columns and none of these says which: the caller asks for one.
 */
export function figureMeasure(
  fig: { title: string; columns: readonly Column[]; rows: readonly Record<string, unknown>[] },
  metricName: string | null,
): string | null {
  const numeric = fig.columns.filter((c) => isNumberColumn(c, fig.rows))
  if (metricName) {
    const named = numeric.find((c) => norm(c.label) === norm(metricName))
    if (named) return named.key
  }
  const title = ` ${norm(fig.title)} `
  const inTitle = numeric
    .filter((c) => title.includes(` ${norm(c.label)} `))
    .sort((a, b) => b.label.length - a.label.length)[0]
  if (inTitle) return inTitle.key
  return numeric.length === 1 ? (numeric[0]?.key ?? null) : null
}

/**
 * A figure's rows as chart rows. Pay and ID columns are left out; a figure that lists people one by one
 * (a person who is not a leader of a big enough org, a candidate, an email) is refused, since
 * names and one person's numbers never go to Claude.
 */
export function figureSource(
  fig: {
    id: string
    title: string
    columns: readonly Column[]
    rows: readonly Record<string, unknown>[]
    tier: Tier | null
    withheld: boolean
    metric: string | null
  },
  help: FigureSourceHelpers,
  ctx: { scope: string; period: string; metricName?: string | null },
): ChartSource | string {
  if (fig.withheld)
    return `The figure "${help.scan(fig.title)}" is held back by the data standard, so it has no numbers to draw.`
  if (!fig.rows.length) return `The figure "${help.scan(fig.title)}" has no rows to draw.`
  const notes: string[] = []
  const unpaid = fig.columns.filter((c) => !isPayColumn(c))
  if (unpaid.length < fig.columns.length)
    notes.push('Pay amounts are left out: they are never sent to Claude.')
  // IDs (requisition, position, case IDs) never go to Claude either.
  const cols = unpaid.filter((c) => !isIdColumn(c, fig.rows))
  if (cols.length < unpaid.length) notes.push('ID columns are left out: IDs are never sent to Claude.')
  // One person's row: refused, whatever the column.
  if (listsPeople({ columns: cols, rows: fig.rows }, help))
    return `The figure "${help.scan(fig.title)}" lists people one by one, so Ask does not chart it: names and one person's numbers never go to Claude. Chart a grouped count with query_records or compare_groups instead.`
  const fields: ChartColumn[] = []
  const formatKeys = new Map<string, string>()
  for (const c of cols) {
    const values = fig.rows.map((r) => r[c.key])
    let format: Format | null = null
    if (typeof c.format === 'function') {
      const per = fig.rows.map((r) => (c.format as (row: unknown) => Format)(r))
      if (new Set(per).size === 1) format = per[0] as Format
      else formatKeys.set(c.key, `_format_${c.key}`)
    } else format = c.format ?? null
    const kind = kindOfValues(values, format)
    fields.push({
      key: c.key,
      label: c.label,
      kind,
      format: kind === 'number' ? (format ?? 'num1') : format === 'date' ? 'date' : 'text',
      ...(formatKeys.has(c.key) ? { formatKey: formatKeys.get(c.key) } : {}),
    })
  }
  const rows = fig.rows.map((r) => {
    const out: Record<string, Cell> = {}
    for (const f of fields) {
      const v = r[f.key]
      out[f.key] = typeof v === 'string' ? help.scan(v) : cell(v)
    }
    for (const [key, fk] of formatKeys) {
      const c = cols.find((x) => x.key === key)
      out[fk] = typeof c?.format === 'function' ? (c.format as (row: unknown) => Format)(r) : null
    }
    return out
  })
  const numeric = fields.filter((f) => f.kind === 'number')
  const firstText = fields.find((f) => f.kind !== 'number')
  // The column the figure draws, so a chart with no y shows the figure's own measure.
  const measure = figureMeasure({ title: fig.title, columns: cols, rows: fig.rows }, ctx.metricName ?? null)
  const y = measure && numeric.some((f) => f.key === measure) ? measure : null
  // The records behind a field of a row: that column's own drill; for a number with none (an
  // average headcount), the row's records from a text column, never another number's.
  const rowDrills = fields
    .filter((f) => f.kind !== 'number')
    .map((f) => cols.find((c) => c.key === f.key))
    .filter((c): c is Column => !!c?.drill)
  const made = new Map<string, string | null>()
  const refOf = (i: number, key: string): string | null => {
    const at = `${i}|${key}`
    if (made.has(at)) return made.get(at) ?? null
    const r = fig.rows[i]
    const own = cols.find((c) => c.key === key)
    const tries = own?.drill ? [own] : rowDrills
    let ref: string | null = null
    if (r)
      for (const c of tries) {
        try {
          const src = c.drill?.(r)
          if (src) {
            const what = firstText ? String(rows[i]?.[firstText.key] ?? '') : `row ${i + 1}`
            ref = help.ref(src, `${help.scan(fig.title)}: ${what}, ${help.scan(c.label)}`)
            break
          }
        } catch {
          /* a drill that fails opens nothing */
        }
      }
    made.set(at, ref)
    return ref
  }
  return {
    label: `the figure "${help.scan(fig.title)}"`,
    rows,
    refs: fig.rows.map((_, i) => (y ? refOf(i, y) : null)),
    hidden: rows.map(() => null),
    fields,
    notes,
    scope: ctx.scope,
    period: ctx.period,
    tier: fig.tier,
    metric: fig.metric,
    defaults: {
      x: firstText?.key ?? null,
      y,
      series: null,
    },
    refOf,
    ...(y || numeric.length < 2
      ? {}
      : {
          pickY: `The figure "${help.scan(fig.title)}" has several number columns: ${numeric
            .map((f) => `${f.key} (${help.scan(f.label)})`)
            .join(', ')}. Name the one to draw as y (value for a heatmap, x for a histogram or dot strip).`,
        }),
  }
}

/* ───────────── building the chart ───────────── */

const TIME_KINDS: ReadonlySet<ChartFieldKind> = new Set(['month', 'quarter', 'year', 'date'])
const CATEGORY_KINDS: ReadonlySet<ChartFieldKind> = new Set(['category', 'person', 'boolean'])
const ADDITIVE: ReadonlySet<Format> = new Set(['int', 'compact', 'hours'])

const MAX_SERIES = 8
const MAX_BARS = 25
const MAX_COLUMNS = 24
const MAX_HEAT_ROWS = 20

const KIND_WORD: Readonly<Record<ChartFieldKind, string>> = {
  category: 'a category',
  person: 'a person field (tokens)',
  boolean: 'a yes/no field',
  month: 'months',
  quarter: 'quarters',
  year: 'years',
  date: 'dates',
  number: 'a number',
}

/** What the form needs of each encoding, and which are required. */
const NEEDS: Readonly<
  Record<
    ChartForm,
    Partial<
      Record<'x' | 'y' | 'series' | 'value' | 'target' | 'label', 'category' | 'time' | 'axis' | 'number'>
    >
  >
> = {
  bars: { x: 'axis', y: 'number', series: 'category' },
  columns: { x: 'axis', y: 'number', series: 'category' },
  stacked_columns: { x: 'axis', y: 'number', series: 'category' },
  lines: { x: 'time', y: 'number', series: 'category' },
  heatmap: { x: 'axis', y: 'axis', value: 'number' },
  scatter: { x: 'number', y: 'number', label: 'category', series: 'category' },
  dot_strip: { x: 'number', y: 'category', label: 'category' },
  histogram: { x: 'number' },
  bullets: { x: 'category', y: 'number', target: 'number' },
}

const REQUIRED: Readonly<Record<ChartForm, readonly string[]>> = {
  bars: ['x', 'y'],
  columns: ['x', 'y'],
  stacked_columns: ['x', 'y', 'series'],
  lines: ['x', 'y'],
  heatmap: ['x', 'y', 'value'],
  scatter: ['x', 'y'],
  dot_strip: ['x', 'y'],
  histogram: ['x'],
  bullets: ['x', 'y', 'target'],
}

/** "businessUnit (a category), count (a number)": the fields Claude can name. */
const fieldList = (fields: readonly ChartColumn[]): string =>
  fields.map((f) => `${f.key} (${KIND_WORD[f.kind]})`).join(', ')

const fits = (need: 'category' | 'time' | 'axis' | 'number', kind: ChartFieldKind): boolean =>
  need === 'number'
    ? kind === 'number'
    : need === 'time'
      ? TIME_KINDS.has(kind)
      : need === 'category'
        ? CATEGORY_KINDS.has(kind)
        : kind !== 'number'

const NEED_WORD = {
  category: 'a category, person or yes/no field',
  time: 'a month, quarter, year or date field',
  axis: 'a category or time field',
  number: 'a number field',
} as const

/** The first day's month of a quarter or year ("2026 Q3" → "2026-07"), for a time axis. */
function monthOf(v: Cell, kind: ChartFieldKind): string | null {
  if (typeof v !== 'string') return null
  if (kind === 'month' && MONTH_RE.test(v)) return v
  if (kind === 'date' && DATE_RE.test(v)) return v.slice(0, 10)
  if (kind === 'quarter' && QUARTER_RE.test(v)) {
    const q = Number(v.slice(-1))
    return `${v.slice(0, 4)}-${String((q - 1) * 3 + 1).padStart(2, '0')}`
  }
  if (kind === 'year' && YEAR_RE.test(v)) return `${v}-01`
  return null
}

export type ChartBuild =
  | { ok: true; chart: AskChart; summary: Record<string, unknown> }
  | { ok: false; error: string }

type PeriodKind = 'month' | 'quarter' | 'year'
const PERIOD_RE: Readonly<Record<PeriodKind, RegExp>> = {
  month: MONTH_RE,
  quarter: QUARTER_RE,
  year: YEAR_RE,
}
const PERIOD_WORD: Readonly<Record<PeriodKind, [string, string]>> = {
  month: ['month', 'months'],
  quarter: ['quarter', 'quarters'],
  year: ['year', 'years'],
}
const isPeriodKind = (k: ChartFieldKind | undefined): k is PeriodKind =>
  k === 'month' || k === 'quarter' || k === 'year'

/** The period after this one: "2026-12" → "2027-01", "2026 Q4" → "2027 Q1", "2026" → "2027". */
function nextPeriod(v: string, kind: PeriodKind): string {
  const y = Number(v.slice(0, 4))
  if (kind === 'year') return String(y + 1)
  if (kind === 'quarter') {
    const q = Number(v.slice(-1))
    return q === 4 ? `${y + 1} Q1` : `${y} Q${q + 1}`
  }
  const m = Number(v.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

const lastDay = (y: number, m: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`

/** The first and last day a time value covers, or null when it is not one. */
function spanOf(v: Cell, kind: ChartFieldKind): { start: string; end: string } | null {
  if (typeof v !== 'string') return null
  const y = Number(v.slice(0, 4))
  if (kind === 'month' && MONTH_RE.test(v))
    return { start: `${v}-01`, end: lastDay(y, Number(v.slice(5, 7))) }
  if (kind === 'quarter' && QUARTER_RE.test(v)) {
    const q = Number(v.slice(-1))
    return { start: `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`, end: lastDay(y, q * 3) }
  }
  if (kind === 'year' && YEAR_RE.test(v)) return { start: `${v}-01-01`, end: `${v}-12-31` }
  if (kind === 'date' && DATE_RE.test(v)) return { start: v.slice(0, 10), end: v.slice(0, 10) }
  return null
}

const MAX_FILL = 240

/**
 * The rows with the periods between the first and the last that have none (per series): a period
 * with no row had no records when the source lists every group, so its counts and sums are 0;
 * otherwise, and for rates and means, its numbers are blank and a line breaks there. Added rows
 * come after the source's, so row indexes (and refs) stay as they were.
 */
function fillPeriods(
  src: ChartSource,
  x: ChartColumn & { kind: PeriodKind },
  series: string | null,
): { rows: Record<string, Cell>[]; added: number; zero: boolean } {
  const rows = src.rows
  const re = PERIOD_RE[x.kind]
  const at = rows.map((r) => r[x.key]).filter((v): v is string => typeof v === 'string' && re.test(v))
  if (at.length < 2) return { rows, added: 0, zero: false }
  const first = at.reduce((a, b) => (b < a ? b : a))
  const last = at.reduce((a, b) => (b > a ? b : a))
  const periods: string[] = [first]
  while ((periods[periods.length - 1] as string) < last) {
    periods.push(nextPeriod(periods[periods.length - 1] as string, x.kind))
    if (periods.length > MAX_FILL) return { rows, added: 0, zero: false }
  }
  const groups = series ? [...new Set(rows.map((r) => r[series] ?? null))].filter((v) => v != null) : [null]
  const have = new Set(
    rows.map((r) => JSON.stringify([r[x.key] ?? null, series ? (r[series] ?? null) : null])),
  )
  const zero = !!src.complete
  const zeros = new Set(zero ? (src.zeroFields ?? []) : [])
  const added: Record<string, Cell>[] = []
  for (const p of periods)
    for (const g of groups) {
      if (have.has(JSON.stringify([p, g]))) continue
      const row: Record<string, Cell> = {}
      for (const f of src.fields) row[f.key] = f.kind === 'number' ? (zeros.has(f.key) ? 0 : null) : null
      row[x.key] = p
      if (series) row[series] = g
      added.push(row)
    }
  return { rows: added.length ? [...rows, ...added] : rows, added: added.length, zero }
}

const compare = (a: Cell, b: Cell): number => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/** The scope in one separator style, as action lines word it: "Whole company", "{{P3}}'s org, Bengaluru". */
export function chartScope(scope: string): string {
  return scope
    .replaceAll(' · ', ', ')
    .replace(/^the whole company/, 'Whole company')
    .trim()
}

/** A window like the period filter's: "last 6 months", "year to date", "this quarter". */
const RELATIVE_PERIOD =
  /\b(?:(?:last|past|this|prior|previous|next)\s+(?:\d+\s+|full\s+)?(?:months?|weeks?|years?|quarters?|days?)|year to date|ytd)\b/i
/** A dated period: "Q2", "Mar 2026", "2025", "FY26". */
const DATED_PERIOD =
  /\b(?:q[1-4]|fy\s?\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+'?\d{2,4}|(?:19|20)\d{2})\b/i
const COMPANY_WORDS = /\b(?:whole|entire) company\b|\bcompany-?wide\b|\ball employees\b/i

/** `text` names `word` as a whole word (any case). */
const names = (text: string, word: string): boolean =>
  !!word &&
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text)

/**
 * Claude's subtitle, checked against the scope and period Census computed. One that names a period,
 * the whole company, a person (an org) or a place the numbers are not for would contradict the
 * chart, so it is left out (`leftOut`, and Claude is told); one that only repeats the scope and
 * period adds nothing and is dropped. `places` are the filter values Census knows (locations,
 * business units, departments); `shown` the values the chart's own rows name, which a subtitle may.
 * Rows not limited to the period (`unlimited`) may be described by dates ("Hires since 2023": the
 * source's own where clause), never by a window like the period filter's.
 */
export function chartSubtitle(
  sub: string | null,
  at: {
    scope: string
    period: string
    unlimited?: boolean
    places: readonly string[]
    shown: ReadonlySet<string>
  },
): { text: string | null; leftOut: boolean } {
  if (!sub) return { text: null, leftOut: false }
  const scope = at.scope
  const period = at.period.replace(/^as of /, '')
  const saysPeriod = !!period && sub.toLowerCase().includes(period.toLowerCase())
  const periodClash = at.unlimited
    ? RELATIVE_PERIOD.test(sub)
    : (RELATIVE_PERIOD.test(sub) || DATED_PERIOD.test(sub)) && !saysPeriod
  const personClash = (sub.match(/\{\{P\d+\}\}/g) ?? []).some((t) => !scope.includes(t))
  const companyClash = COMPANY_WORDS.test(sub) && !/^Whole company/.test(scope)
  const placeClash = at.places.some((p) => names(sub, p) && !names(scope, p) && !at.shown.has(p))
  if (periodClash || personClash || companyClash || placeClash) return { text: null, leftOut: true }
  // Only the scope and period again.
  let rest = sub.toLowerCase()
  for (const w of [scope, at.period, period, 'whole company', 'the'])
    rest = rest.replaceAll(w.toLowerCase(), ' ')
  if (!/[\p{L}\p{N}]/u.test(rest)) return { text: null, leftOut: false }
  return { text: sub, leftOut: false }
}

/**
 * Check the spec against the source and build the chart. Errors name the fields that exist and
 * what the form needs, so Claude can correct the spec. `asOf` (the data's as-of date) marks time
 * periods that start after it or run past it, which the summary leaves out of its extremes, and
 * dates a chart whose rows are not limited to the period. `places` are the filter values Census
 * knows, so a subtitle that names one the chart is not for is left out.
 */
export function buildChart(
  spec: ChartSpec,
  src: ChartSource,
  id: string,
  opts: { asOf?: string | null; places?: readonly string[] } = {},
): ChartBuild {
  const need = NEEDS[spec.form]
  const enc: Record<'x' | 'y' | 'series' | 'value' | 'target' | 'label', string | null> = {
    x: spec.x ?? src.defaults.x,
    y: spec.y ?? (spec.form === 'histogram' ? null : src.defaults.y),
    series: spec.series ?? (spec.form === 'stacked_columns' ? src.defaults.series : null),
    value: spec.value,
    target:
      spec.target ??
      (spec.form === 'bullets' && src.fields.some((f) => f.key === 'target') ? 'target' : null),
    label: spec.label,
  }
  // A histogram counts one number field: x.
  if (spec.form === 'histogram' && !spec.x) enc.x = src.defaults.y
  // Heatmap: x and y are categories; the number is value (or the source's default number).
  if (spec.form === 'heatmap') {
    enc.y = spec.y ?? src.defaults.series
    enc.value = spec.value ?? src.defaults.y
  }
  const field = (k: string | null) => (k ? src.fields.find((f) => f.key === k) : undefined)
  for (const [k, v] of Object.entries(enc) as [keyof typeof enc, string | null][]) {
    if (v == null) continue
    const want = need[k]
    if (!want) {
      enc[k] = null
      continue
    }
    const f = field(v)
    if (!f)
      return {
        ok: false,
        error: `${k} "${v}" is not a field of the source rows. Fields: ${fieldList(src.fields)}.`,
      }
    if (!fits(want, f.kind))
      return {
        ok: false,
        error: `${FORM_WORDS[spec.form]} needs ${k} to be ${NEED_WORD[want]}; ${v} is ${KIND_WORD[f.kind]}.${
          spec.form === 'lines' && k === 'x' ? ' Use columns or bars for categories.' : ''
        } Fields: ${fieldList(src.fields)}.`,
      }
  }
  // The field that holds the number each mark draws.
  const numberKey =
    spec.form === 'heatmap'
      ? enc.value
      : spec.form === 'dot_strip' || spec.form === 'histogram'
        ? enc.x
        : enc.y
  for (const k of REQUIRED[spec.form])
    if (!enc[k as keyof typeof enc]) {
      // The source could not tell which of its numbers to draw: it says which there are.
      const isNumber = need[k as keyof typeof need] === 'number'
      if (isNumber && src.pickY) return { ok: false, error: src.pickY }
      return {
        ok: false,
        error:
          spec.form === 'bullets' && k === 'target'
            ? 'bullets needs a target, and the source has none. Use bars, or a source whose figure has a target (compare_groups or view_summary).'
            : `${FORM_WORDS[spec.form]} needs ${k}: ${NEED_WORD[need[k as keyof typeof need] ?? 'number']}. Fields: ${fieldList(src.fields)}.`,
      }
    }
  const distinct = (k: string | null, rows: readonly Record<string, Cell>[]) =>
    k ? [...new Set(rows.map((r) => r[k]))] : []
  if (enc.x && enc.x === enc.series) return { ok: false, error: 'x and series must be different fields.' }
  if (spec.form === 'heatmap' && enc.x === enc.y)
    return { ok: false, error: 'x and y must be different fields.' }
  const yField = field(enc.y)
  if (spec.form === 'stacked_columns' && yField && !ADDITIVE.has(yField.format))
    return {
      ok: false,
      error: `stacked columns add values up, and ${yField.key} is not a count. Use columns with series to set the groups side by side.`,
    }
  // One unit on a shared axis: key figures in several units go as bullets, each on its own scale.
  const mixedUnits = yField?.formatKey && new Set(src.rows.map((r) => r[yField.formatKey as string])).size > 1
  if (mixedUnits && spec.form !== 'bullets')
    return {
      ok: false,
      error: `${yField.key} holds numbers in several units, which cannot share one axis. Use bullets (each on its own scale), or chart key figures of one unit.`,
    }

  const notes = [...src.notes]
  const xField = field(enc.x)
  const timeX = !!xField && TIME_KINDS.has(xField.kind)
  // A time axis has every period from the first to the last, so a line never joins across months
  // that had no row: those are 0 when the source lists every group (counts and sums), else blank.
  let srcRows = src.rows
  if (
    xField &&
    isPeriodKind(xField.kind) &&
    (spec.form === 'lines' || spec.form === 'columns' || spec.form === 'stacked_columns')
  ) {
    const filled = fillPeriods(src, xField as ChartColumn & { kind: PeriodKind }, enc.series)
    if (filled.added) {
      srcRows = filled.rows
      const [one, many] = PERIOD_WORD[xField.kind]
      const n = filled.added
      const zeroDrawn = filled.zero && !!numberKey && (src.zeroFields ?? []).includes(numberKey)
      notes.push(
        zeroDrawn
          ? `${n} ${n === 1 ? `${one} has` : `${many} have`} no records, so ${n === 1 ? 'it shows' : 'they show'} 0`
          : `${n} ${n === 1 ? `${one} has` : `${many} have`} no row in the source, so ${n === 1 ? 'it is' : 'they are'} left blank`,
      )
    }
  }
  const refAt = (i: number): string | null =>
    i >= src.rows.length ? null : src.refOf && numberKey ? src.refOf(i, numberKey) : (src.refs[i] ?? null)
  const hiddenAt = (i: number): string | null => (i >= src.rows.length ? null : (src.hidden[i] ?? null))

  // Sort, then limit the categories (x), keeping every series of the ones kept.
  let order = srcRows.map((_, i) => i)
  const sortBy = spec.sort
    ? spec.sort.by === 'x'
      ? enc.x
      : spec.sort.by === 'y'
        ? enc.y
        : spec.sort.by
    : null
  if (sortBy && !field(sortBy))
    return {
      ok: false,
      error: `sort.by "${spec.sort?.by}" is not a field of the source rows. Fields: ${fieldList(src.fields)}.`,
    }
  const timeOrder = spec.form === 'lines' || (timeX && !sortBy && spec.form !== 'bars')
  if (timeOrder) {
    if (spec.sort && spec.form === 'lines') notes.push('Lines run in time order, so sort was not used.')
    const k = enc.x as string
    order.sort((a, b) => compare(srcRows[a]?.[k] ?? null, srcRows[b]?.[k] ?? null))
  } else if (sortBy || (spec.form === 'bars' && enc.y && !enc.series)) {
    const k = (sortBy ?? enc.y) as string
    // Categories and times read in order (A to Z, oldest first); numbers largest first.
    const dir = spec.sort?.dir ?? (field(k)?.kind === 'number' ? 'desc' : 'asc')
    order.sort((a, b) => {
      const c = compare(srcRows[a]?.[k] ?? null, srcRows[b]?.[k] ?? null)
      // Hidden values stay last either way.
      const an = srcRows[a]?.[k] == null
      const bn = srcRows[b]?.[k] == null
      if (an !== bn) return an ? 1 : -1
      return dir === 'asc' ? c : -c
    })
  }
  const byX =
    !!enc.x && ['bars', 'columns', 'stacked_columns', 'lines', 'heatmap', 'bullets'].includes(spec.form)
  const sortedRows = order.map((i) => srcRows[i] as Record<string, Cell>)
  const xs = byX ? distinct(enc.x, sortedRows) : []
  const totalUnits = byX ? xs.length : order.length
  if (spec.limit != null && spec.limit < totalUnits) {
    if (byX) {
      const keep = new Set(xs.slice(0, spec.limit))
      order = order.filter((i) => keep.has(srcRows[i]?.[enc.x as string] ?? null))
    } else order = order.slice(0, spec.limit)
    notes.push(`Showing the first ${spec.limit} of ${totalUnits} ${byX ? 'groups' : 'rows'} in this order.`)
  } else if (order.length > MAX_CHART_ROWS) {
    // A time series keeps its latest periods; anything else its first rows in order.
    if (timeOrder) {
      order = order.slice(-MAX_CHART_ROWS)
      notes.push(`Showing the latest ${MAX_CHART_ROWS} of ${srcRows.length} rows.`)
    } else {
      order = order.slice(0, MAX_CHART_ROWS)
      notes.push(`Showing the first ${MAX_CHART_ROWS} of ${srcRows.length} rows.`)
    }
  }
  const rows = order.map((i) => ({ ...(srcRows[i] as Record<string, Cell>) }))
  const refs = order.map((i) => refAt(i))
  const hidden = order.map((i) => hiddenAt(i))

  // Sizes the kit draws well.
  const cats = distinct(enc.x, rows).length
  if (spec.form === 'bars' && cats > MAX_BARS)
    return {
      ok: false,
      error: `bars has ${cats} groups; at most ${MAX_BARS} read well. Pass limit, with sort.`,
    }
  if ((spec.form === 'columns' || spec.form === 'stacked_columns') && cats > MAX_COLUMNS)
    return {
      ok: false,
      error: `columns has ${cats} groups; at most ${MAX_COLUMNS} read well. Pass limit, or use lines for a long time series.`,
    }
  if (spec.form === 'heatmap' && distinct(enc.y, rows).length > MAX_HEAT_ROWS)
    return {
      ok: false,
      error: `The heatmap has ${distinct(enc.y, rows).length} rows; at most ${MAX_HEAT_ROWS} read well. Use y for the field with fewer values, or pass limit.`,
    }
  const seriesValues = distinct(enc.series, rows)
  if (seriesValues.length > MAX_SERIES)
    return {
      ok: false,
      error: `series has ${seriesValues.length} values; Census draws at most ${MAX_SERIES} series in their own colors. Narrow the source (a where clause or filters) or pick a field with fewer values.`,
    }
  // One mark per x (and series, or y for a heatmap): rows that repeat one need the field that
  // tells them apart.
  if (byX) {
    const second = spec.form === 'heatmap' ? enc.y : enc.series
    const seen = new Set<string>()
    for (const r of rows) {
      const key = JSON.stringify([r[enc.x as string] ?? null, second ? (r[second] ?? null) : null])
      if (!seen.has(key)) {
        seen.add(key)
        continue
      }
      const others = src.fields.filter(
        (f) => CATEGORY_KINDS.has(f.kind) && f.key !== enc.x && f.key !== second,
      )
      return {
        ok: false,
        error: `${enc.x} "${r[enc.x as string]}" appears in more than one row${second ? ` for the same ${second}` : ''}, so the rows need ${spec.form === 'heatmap' ? 'another field' : 'a series'} to tell them apart${others.length ? `: ${others.map((f) => f.key).join(', ')}` : ''}. ${spec.form === 'bars' || spec.form === 'columns' || spec.form === 'lines' ? 'Name it as series, or use stacked_columns.' : 'Use a source with one row per group.'}`,
      }
    }
  }
  const drawn = rows.filter((r) => numberKey && typeof r[numberKey] === 'number')
  if (!drawn.length)
    return {
      ok: false,
      error: `Every value of ${numberKey} is hidden or missing in this source${hidden.find(Boolean) ? `: ${hidden.find(Boolean)}` : ''}. There is nothing to draw.`,
    }
  if (spec.form === 'lines' && distinct(enc.x, rows).length < 2)
    return {
      ok: false,
      error: 'lines needs at least two points in time. Use columns or bars for one period.',
    }
  if (spec.form === 'histogram' && drawn.length < 5)
    return {
      ok: false,
      error: `A histogram needs at least 5 values; the source has ${drawn.length}. Use bars.`,
    }
  if (spec.form === 'scatter' && drawn.length < 3)
    return { ok: false, error: 'A scatter needs at least 3 rows with both numbers. Use bars.' }
  const hiddenRows = hidden.filter(Boolean).length
  if (hiddenRows) {
    const reasons = [...new Set(hidden.filter((h): h is string => !!h))]
    notes.push(
      `${hiddenRows} ${hiddenRows === 1 ? 'group has its numbers' : 'groups have their numbers'} hidden: ${reasons.join(' ')}`,
    )
  }
  // Periods after the as-of date (future start dates, plans) or running past it (a month not yet
  // over) are said so, and left out of the summary's highest and lowest.
  const timing: ('after' | 'partial' | null)[] = rows.map(() => null)
  const asOf = opts.asOf ?? null
  if (asOf && xField && timeX) {
    const after: string[] = []
    const partial: string[] = []
    rows.forEach((r, i) => {
      const span = spanOf(r[xField.key] ?? null, xField.kind)
      if (!span) return
      const label = String(r[xField.key])
      if (span.start > asOf) {
        timing[i] = 'after'
        if (!after.includes(label)) after.push(label)
      } else if (span.end > asOf) {
        timing[i] = 'partial'
        if (!partial.includes(label)) partial.push(label)
      }
    })
    const list = (xs: string[]) =>
      xs.length <= 3 ? xs.join(', ') : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`
    const asOfText = formatDate(asOf)
    if (after.length)
      notes.push(
        `${list(after)} ${after.length === 1 ? 'is' : 'are'} after the as-of date (${asOfText}): ${after.length === 1 ? 'its' : 'their'} records have dates still to come`,
      )
    if (partial.length)
      notes.push(
        `${list(partial)} ${partial.length === 1 ? 'runs' : 'run'} only to the as-of date (${asOfText}), so ${partial.length === 1 ? 'it is' : 'they are'} not complete`,
      )
  }
  // Rows not limited to the period read as of the as-of date, so the chart is not taken for a
  // figure of the period on screen.
  let period = src.period
  if (src.unlimited) {
    notes.push(
      src.period
        ? `Not limited to the period on screen (${src.period}): every matching record is counted`
        : 'Every matching record is counted, whatever its date',
    )
    if (asOf) period = `as of ${formatDate(asOf)}`
  }
  const scope = chartScope(src.scope)
  const subtitle = chartSubtitle(spec.subtitle, {
    scope,
    period,
    unlimited: !!src.unlimited,
    places: opts.places ?? [],
    shown: new Set(rows.flatMap((r) => Object.values(r).filter((v): v is string => typeof v === 'string'))),
  })
  // A scatter or dot strip names its marks with the first category field.
  if ((spec.form === 'scatter' || spec.form === 'dot_strip') && !enc.label)
    enc.label = src.fields.find((f) => CATEGORY_KINDS.has(f.kind) && f.key !== enc.y)?.key ?? null
  // A time axis for lines over quarters or years: a month field beside the label.
  let x = enc.x
  if (spec.form === 'lines' && xField && xField.kind !== 'month') {
    for (const r of rows) r.__x = monthOf(r[xField.key] ?? null, xField.kind)
    x = '__x'
  }
  const used = new Set(
    [enc.x, enc.y, enc.series, enc.value, enc.target, enc.label].filter((k): k is string => !!k),
  )
  // The table shows the encoded fields first, then the rest of the source's fields.
  const columns = [
    ...src.fields.filter((f) => used.has(f.key)).sort((a, b) => order2(a.key) - order2(b.key)),
    ...src.fields.filter((f) => !used.has(f.key)),
  ]
  function order2(k: string): number {
    return [enc.label, enc.x, enc.y, enc.series, enc.value, enc.target].indexOf(k)
  }
  const chart: AskChart = {
    id,
    title: spec.title,
    subtitle: subtitle.text,
    form: spec.form,
    rows,
    columns,
    x,
    xLabel: enc.x,
    y: enc.y,
    series: enc.series,
    value: enc.value,
    target: enc.target,
    label: enc.label,
    xType:
      xField &&
      (xField.kind === 'month' ||
        (spec.form !== 'bars' &&
          TIME_KINDS.has(xField.kind) &&
          xField.kind !== 'quarter' &&
          xField.kind !== 'year'))
        ? 'month'
        : 'band',
    refs,
    notes,
    source: src.label,
    scope,
    period,
    tier: src.tier,
    metric: src.metric,
  }
  const summary = chartSummary(chart, src.rows.length, hiddenRows, timing, asOf)
  if (subtitle.leftOut)
    summary.subtitle_left_out = `The subtitle named a scope or period these numbers are not for, so the chart has none. Its numbers are for ${scope.replace(/^Whole company/, 'the whole company')}, ${period}.`
  return { ok: true, chart, summary }
}

/**
 * What goes back to Claude: the chart's rows as points (with their refs), the extremes, what is
 * hidden and the notes, so it can describe the chart accurately and link its numbers. Points
 * after the as-of date or in a period not yet over are flagged and left out of the extremes. With
 * series the extremes are single points (one series at one x); stacked columns add each x's total.
 */
function chartSummary(
  c: AskChart,
  sourceRows: number,
  hiddenRows: number,
  timing: readonly ('after' | 'partial' | null)[],
  asOf: string | null,
): Record<string, unknown> {
  const keys = [c.label, c.xLabel, c.y, c.series, c.value, c.target].filter(
    (k, i, a): k is string => !!k && a.indexOf(k) === i,
  )
  const num =
    c.form === 'heatmap' ? c.value : c.form === 'dot_strip' || c.form === 'histogram' ? c.xLabel : c.y
  const points = c.rows.map((r, i) => {
    const p: Record<string, unknown> = {}
    for (const k of keys) p[k] = r[k] ?? null
    p.ref = c.refs[i] ?? null
    if (timing[i] === 'after') p.after_as_of = true
    if (timing[i] === 'partial') p.partial_period = true
    return p
  })
  const counted = points.filter((_, i) => !timing[i])
  const extreme = <T extends Record<string, unknown>>(list: readonly T[], k: string, dir: 1 | -1) => {
    const withValue = list.filter((p) => typeof p[k] === 'number')
    return withValue.length
      ? withValue.reduce((best, p) => ((p[k] as number) * dir > (best[k] as number) * dir ? p : best))
      : null
  }
  const extremes: Record<string, unknown> = {}
  if (num && !(c.form === 'histogram' || c.form === 'scatter' || c.form === 'dot_strip')) {
    if (c.series) {
      extremes.highest_point = extreme(counted, num, 1)
      extremes.lowest_point = extreme(counted, num, -1)
    } else {
      extremes.highest = extreme(counted, num, 1)
      extremes.lowest = extreme(counted, num, -1)
    }
    if (c.form === 'stacked_columns' && c.xLabel) {
      const xk = c.xLabel
      const totals = new Map<string, { total: number; flagged: boolean }>()
      c.rows.forEach((r, i) => {
        const at = String(r[xk] ?? '')
        const t = totals.get(at) ?? { total: 0, flagged: false }
        if (typeof r[num] === 'number') t.total += r[num] as number
        if (timing[i]) t.flagged = true
        totals.set(at, t)
      })
      const list = [...totals].map(([at, t]) => ({ [xk]: at, total: t.total, flagged: t.flagged }))
      extremes.totals = list.map(({ flagged: _f, ...t }) => t)
      const fair = list.filter((t) => !t.flagged).map(({ flagged: _f, ...t }) => t)
      extremes.highest_total = extreme(fair, 'total', 1)
      extremes.lowest_total = extreme(fair, 'total', -1)
    }
  }
  return {
    chart: c.id,
    form: c.form,
    title: c.title,
    ...(c.subtitle ? { subtitle: c.subtitle } : {}),
    source: c.source,
    scope: c.scope,
    period: c.period,
    ...(asOf ? { as_of: asOf } : {}),
    encodes: Object.fromEntries(
      (['x', 'y', 'series', 'value', 'target', 'label'] as const)
        .map((k) => [k, k === 'x' ? c.xLabel : c[k]])
        .filter(([, v]) => v),
    ),
    // How each number reads: pct is a fraction shown as a percentage (0.188 is 18.8%).
    formats: Object.fromEntries(
      c.columns
        .filter((f) => f.kind === 'number' && keys.includes(f.key))
        .map((f) => [f.key, f.formatKey ? 'per row' : f.format]),
    ),
    rows: c.rows.length,
    rows_in_source: sourceRows,
    points,
    ...extremes,
    hidden_groups: hiddenRows,
    notes: c.notes,
    tier: c.tier,
    shown:
      'The chart is drawn in the answer, with its table, exports and the records behind every mark. Say in a sentence or two what it shows, linking the numbers you state to their refs; do not repeat it as a table.',
  }
}

/** The chart with person tokens shown as names (unknown tokens as "someone"), for drawing and exports here. */
export function chartWithNames(c: AskChart, name: (token: string) => string): AskChart {
  const swap = (v: Cell): Cell =>
    typeof v === 'string' && v.includes('{{') ? v.replace(/\{\{P\d+\}\}/g, (t) => name(t)) : v
  return {
    ...c,
    title: swap(c.title) as string,
    subtitle: c.subtitle == null ? null : (swap(c.subtitle) as string),
    rows: c.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, swap(v)]))),
    notes: c.notes.map((n) => swap(n) as string),
    scope: swap(c.scope) as string,
  }
}
