/**
 * Ask Census, the sheet's pure model (docs/ASK.md, What the user sees): one turn of the
 * conversation as the sheet shows it, built from the engine's events and result; the progress
 * line and what the live region says; answer tables as DataTable rows with their formats, refs
 * and people; "What was sent"; the keyboard rules (the shortcut, Enter in the composer); and the
 * Settings wording for the key. No React and no DOM, so all of it is tested.
 */
import {
  type AskError,
  type AskEvent,
  type AskResult,
  type Block,
  type Inline,
  inlineText,
  modelById,
  NO_USAGE,
  type PersonLookup,
  SOMEONE,
  type StoredKey,
  TOKEN_RE,
  type ToolCallRecord,
  tableData,
  type Usage,
} from '@/ask/engine'
import type { AnalyticsContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import { FILTER_DIMENSIONS, type FilterDimension, isExcluded } from '@/data/scope'
import { formatRange } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { plural } from '@/lib/format'

/* ───────────── a turn ───────────── */

export type TurnStatus = 'answering' | 'done' | 'stopped' | 'error'

/** A tool run as the progress list shows it. */
export interface Step {
  id: string
  /** The progress line ("Calculating People stats key figures for Bengaluru"); may hold person tokens. */
  label: string
  done: boolean
  isError: boolean
}

export interface Turn {
  id: number
  /** The question as typed (shown as typed; never sent like this). */
  question: string
  /** The question as it was sent (names, IDs and emails tokenized); null until it is sent. */
  sent: string | null
  /** The answer as Claude wrote it (tokens and markers); rendered with `parseAnswer`. */
  text: string
  status: TurnStatus
  steps: Step[]
  calls: ToolCallRecord[]
  usage: Usage
  error: AskError | null
  truncated: boolean
  roundLimited: boolean
  /** The model id asked. */
  model: string
  /** Requests sent to Claude so far. */
  requests: number
  /** Where the text after the last tool round starts (what came before is Claude's preamble). */
  answerFrom: number
  /** The app's scope, period and data standard when the question was asked (for exports). */
  asked: AskedScope | null
}

export function newTurn(id: number, question: string, model: string, asked: AskedScope | null = null): Turn {
  return {
    id,
    question,
    sent: null,
    text: '',
    status: 'answering',
    steps: [],
    calls: [],
    usage: { ...NO_USAGE },
    error: null,
    truncated: false,
    roundLimited: false,
    model,
    requests: 0,
    answerFrom: 0,
    asked,
  }
}

/** The turn after one streamed event. */
export function applyEvent(t: Turn, e: AskEvent): Turn {
  switch (e.type) {
    case 'question':
      return { ...t, sent: e.sent }
    case 'request':
      return { ...t, requests: e.round }
    case 'text':
      return { ...t, text: t.text + e.delta }
    case 'tool_start':
      return {
        ...t,
        answerFrom: t.text.length,
        steps: [...t.steps, { id: e.id, label: e.label, done: false, isError: false }],
      }
    case 'tool_end':
      return {
        ...t,
        calls: [...t.calls, e.call],
        steps: t.steps.some((s) => s.id === e.call.id)
          ? t.steps.map((s) =>
              s.id === e.call.id ? { ...s, label: e.call.label, done: true, isError: e.call.isError } : s,
            )
          : [...t.steps, { id: e.call.id, label: e.call.label, done: true, isError: e.call.isError }],
      }
    case 'round_limit':
      return { ...t, roundLimited: true }
    case 'usage':
      return { ...t, usage: e.usage }
  }
}

/** The turn once `ask` has resolved. The result is the record: its text, calls and usage win. */
export function finishTurn(t: Turn, r: AskResult): Turn {
  return {
    ...t,
    status: r.status,
    sent: r.sent || t.sent,
    text: r.text,
    calls: r.calls,
    usage: r.usage,
    error: r.status === 'done' ? null : r.error,
    truncated: r.truncated,
    roundLimited: r.roundLimited,
    model: r.model || t.model,
    answerFrom: Math.min(t.answerFrom, r.text.length),
    steps: t.steps.map((s) => ({ ...s, done: true })),
  }
}

/**
 * The answer Claude wrote after its last round of calculations: the text before it is a preamble
 * ("I will look at People stats for Bengaluru."). The whole text when nothing follows the tools.
 */
export function finalText(t: Pick<Turn, 'text' | 'answerFrom'>): string {
  const last = t.text.slice(t.answerFrom)
  return last.trim() ? last : t.text
}

/** The turn when nothing could be sent (no key, the SDK did not load). */
export function failTurn(t: Turn, error: AskError): Turn {
  return {
    ...t,
    status: error.kind === 'stopped' ? 'stopped' : 'error',
    error,
    steps: t.steps.map((s) => ({ ...s, done: true })),
  }
}

/** A text with person tokens shown as names ("someone" for a token this chat never handed out). */
export function withNames(text: string, person: PersonLookup): string {
  return text.replace(new RegExp(TOKEN_RE.source, 'g'), (m) => person(m)?.name || SOMEONE)
}

/**
 * The quiet line under a question while it is answered: the tool running now, "Writing the
 * answer" once text arrives, or "Waiting for Claude" while Claude reads and thinks. Null when the
 * turn is finished.
 */
export function statusLine(t: Turn, person: PersonLookup): string | null {
  if (t.status !== 'answering') return null
  const running = t.steps.find((s) => !s.done)
  if (running) return withNames(running.label, person)
  if (t.text.trim()) return 'Writing the answer'
  return 'Waiting for Claude'
}

/**
 * An answer that is still arriving (or was cut off) without its last, unfinished link or person
 * token, so "[57 leav" or "{{P1" never shows as raw text; it appears once it is complete.
 */
export function withoutPartial(text: string): string {
  const open = text.lastIndexOf('[')
  if (open >= 0) {
    const rest = text.slice(open)
    // An unclosed label, or a closed label whose target has not closed yet.
    if (!rest.includes(']') || /^\[[^\]]*\]\([^)]*$/.test(rest)) return text.slice(0, open)
  }
  const token = text.lastIndexOf('{{')
  if (token >= 0 && !text.slice(token).includes('}}')) return text.slice(0, token)
  return text
}

/* ───────────── the live region ───────────── */

const SENTENCE = /^(.{20,}?[.?!])(\s|$)/s

/** The first sentence or so of an answer, for the screen reader: at most `max` characters. */
export function firstWords(text: string, max = 240): string {
  const flat = text
    .replace(/^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  const m = SENTENCE.exec(flat)
  const s = m ? (m[1] as string) : flat
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`
}

/**
 * What the live region says when a turn changes, or null for nothing. It speaks when a tool
 * starts, once when the answer starts to arrive, and when the turn ends; never once per streamed
 * word. `plain` is the answer as plain text with names (the text after the last tool round, see
 * `finalText`); `person` shows a progress line's people. A cut-off answer says so first.
 */
export function announcement(
  prev: Turn | undefined,
  next: Turn,
  plain: () => string,
  person: PersonLookup = () => null,
): string | null {
  if (next.status !== 'answering') {
    if (prev && prev.status === next.status) return null
    if (next.status === 'done') {
      const lead = next.truncated ? 'Answer cut off at its length limit.' : 'Answer ready.'
      const first = firstWords(plain())
      return first ? `${lead} ${first}` : lead
    }
    if (next.status === 'stopped') return 'Stopped.'
    return next.error ? `${next.error.title} ${next.error.detail}` : 'Something went wrong.'
  }
  if (!prev) return 'Asking Claude.'
  const started = next.steps.filter((s) => !prev.steps.some((p) => p.id === s.id))
  if (started.length) return started.map((s) => withNames(s.label, person)).join('. ')
  if (!prev.text.trim() && next.text.trim()) return 'Writing the answer.'
  return null
}

/* ───────────── usage and "What was sent" ───────────── */

const int = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n))

/** "1,240 input tokens and 320 output tokens, 2,100 read from cache. 3 requests to Claude Opus 5.5." */
export function usageLine(u: Usage, model: string, error?: Pick<AskError, 'status'> | null): string {
  const parts = [plural(u.input, 'input token'), plural(u.output, 'output token')]
  const cache: string[] = []
  if (u.cacheRead) cache.push(`${int(u.cacheRead)} read from cache`)
  if (u.cacheWrite) cache.push(`${int(u.cacheWrite)} written to cache`)
  const tokens = `${parts.join(' and ')}${cache.length ? `, ${cache.join(' and ')}` : ''}.`
  // A status means Anthropic answered: the request arrived and was turned down before Claude read it.
  if (!u.requests && error?.status != null)
    return `Anthropic turned the request down before ${modelById(model).label} read it (HTTP ${error.status}), so no tokens were used.`
  if (!u.requests) return `No request reached ${modelById(model).label}.`
  const partial = u.partial ? ' A request that was stopped or failed is counted as far as it got.' : ''
  return `${tokens} ${plural(u.requests, 'request')} to ${modelById(model).label}.${partial}`
}

/** A JSON text laid out for reading; the text as it was when it is not JSON. */
export function readableJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** "4.2 KB" or "870 bytes": how much a tool result weighed. */
export function sizeText(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1000) return plural(bytes, 'byte')
  return `${(bytes / 1000).toFixed(1)} KB`
}

/** One tool call as "What was sent" lists it. */
export interface SentCall {
  id: string
  name: string
  /** The progress line, with names (shown here only). */
  label: string
  /** The input Claude wrote, laid out. */
  input: string
  /** The result that went to Claude, laid out. */
  result: string
  size: string
  ms: string
  isError: boolean
}

export function sentCalls(calls: readonly ToolCallRecord[], person: PersonLookup): SentCall[] {
  return calls.map((c) => ({
    id: c.id,
    name: c.name,
    label: withNames(c.label, person),
    input: JSON.stringify(c.input ?? {}, null, 2),
    result: readableJson(c.result),
    size: sizeText(c.result),
    ms: c.ms < 1 ? 'under 1 ms' : `${int(c.ms)} ms`,
    isError: c.isError,
  }))
}

/* ───────────── answer tables ───────────── */

/** The units Census writes after a number, by the kind of value they stand for. */
type Unit = '' | '%' | 'pts' | 'd' | 'h' | 'yrs' | 'x'

const UNIT_OF: Readonly<Record<string, Unit>> = {
  '%': '%',
  pt: 'pts',
  pts: 'pts',
  d: 'd',
  h: 'h',
  yr: 'yrs',
  yrs: 'yrs',
  '×': 'x',
  x: 'x',
}

/** "1,284", "−3", "18.8%", "+9.4 pts", "−5.1 pts", "52 d", "±0 d", "4.2 yrs", "6.5 h", "1.58×". */
const NUMBER_TEXT = /^([+−\-±])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|pts?|d|h|yrs?|×|x)?$/

interface NumberText {
  /** The number as written, with its sign. */
  value: number
  unit: Unit
  decimals: number
  /** The sign as written ('' for none). */
  sign: '' | '+' | '-' | '±'
  /** Written with thousands separators. */
  grouped: boolean
}

/** A cell's text as a number with its unit, or null when it is not one. */
export function numberText(text: string): NumberText | null {
  const m = NUMBER_TEXT.exec(text.trim())
  if (!m) return null
  const sign = m[1] === '−' || m[1] === '-' ? '-' : ((m[1] ?? '') as NumberText['sign'])
  const body = Number(`${(m[2] as string).replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`)
  if (!Number.isFinite(body)) return null
  return {
    value: sign === '-' ? -body : body,
    unit: UNIT_OF[m[4] ?? ''] ?? '',
    decimals: m[3]?.length ?? 0,
    sign,
    grouped: (m[2] as string).includes(','),
  }
}

/** Formats that always show a plus before a positive value ("+9.4 pts", "+4 d", "+3.1%"). */
const SIGNED: ReadonlySet<Format> = new Set(['pts', 'pts2', 'deltaDays', 'deltaPct'])

/**
 * The display format of a column of number texts, or null when they are not one kind of number:
 * percentages mixed with counts, points mixed with days, or signs a Census format would not show
 * the same way stay text, so nothing is shown as something it is not. Units are Census's own
 * (%, pts, d, h, yrs, ×), so a change column ("+9.4 pts") or a duration ("52 d") sorts by value.
 * A column of bare years (2025, 2026) stays text.
 */
export function inferFormat(texts: readonly string[]): Format | null {
  const filled = texts.map((s) => s.trim()).filter((s) => s && s !== '—')
  if (!filled.length) return null
  const cells: NumberText[] = []
  for (const s of filled) {
    const n = numberText(s)
    if (!n) return null
    cells.push(n)
  }
  const unit = (cells[0] as NumberText).unit
  if (cells.some((c) => c.unit !== unit)) return null
  const decimals = Math.max(...cells.map((c) => c.decimals))
  const plus = cells.some((c) => c.sign === '+' || c.sign === '±')
  let format: Format
  switch (unit) {
    case '':
      if (decimals === 0 && cells.every((c) => !c.grouped && !c.sign && c.value >= 1900 && c.value <= 2100))
        return null
      format = decimals === 0 ? 'int' : decimals === 1 ? 'num1' : 'num2'
      break
    case '%':
      format = plus ? 'deltaPct' : decimals === 0 ? 'pct0' : decimals === 1 ? 'pct' : 'pct2'
      break
    case 'pts':
      format = decimals <= 1 ? 'pts' : 'pts2'
      break
    case 'd':
      format = plus ? 'deltaDays' : 'days'
      break
    case 'h':
      format = 'hours'
      break
    case 'yrs':
      format = 'years'
      break
    case 'x':
      format = 'times'
      break
  }
  // A format that signs positives needs every positive written with its plus; one that does not
  // needs none written.
  const fits = SIGNED.has(format)
    ? cells.every((c) => c.value <= 0 || c.sign === '+')
    : cells.every((c) => c.sign !== '+' && c.sign !== '±')
  return fits ? format : null
}

/** A cell's value for its column's format: rates and points as fractions, other units as written. */
export function cellValue(text: string, format: Format): number | null {
  const n = numberText(text)
  if (!n) return null
  const fraction = format === 'pct' || format === 'pct0' || format === 'pct2' || format === 'deltaPct'
  return fraction || format === 'pts' || format === 'pts2' ? n.value / 100 : n.value
}

/** The first ref inside a run of inline nodes. */
export function firstRef(nodes: readonly Inline[]): string | null {
  for (const n of nodes) {
    if (n.type === 'ref') return n.ref
    if ('children' in n) {
      const r = firstRef(n.children)
      if (r) return r
    }
  }
  return null
}

/** The first person token inside a run of inline nodes. */
export function firstPerson(nodes: readonly Inline[]): string | null {
  for (const n of nodes) {
    if (n.type === 'person') {
      if (n.token) return n.token
      continue
    }
    if ('children' in n) {
      const p = firstPerson(n.children)
      if (p) return p
    }
  }
  return null
}

export const REF_KEY = '__refs'
export const PERSON_KEY = '__person'

export interface AnswerTableColumn {
  key: string
  label: string
  format: Format
}

export interface AnswerTableModel {
  columns: AnswerTableColumn[]
  /**
   * Rows for DataTable and the exports: cells as numbers (formatted by the column) or text with
   * names; `__refs` holds the ref each cell links to, `__person` the first person token in the row.
   */
  rows: Record<string, unknown>[]
}

/** A table block as DataTable rows, with a format per column and the refs and people behind cells. */
export function answerTable(t: Extract<Block, { type: 'table' }>, person: PersonLookup): AnswerTableModel {
  const base = tableData(t, person)
  const texts = t.rows.map((r) => r.map((c) => inlineText(c, person).replace(/\n/g, ' ').trim()))
  const columns: AnswerTableColumn[] = base.columns.map((c, k) => {
    const format = inferFormat(texts.map((r) => r[k] ?? ''))
    return { key: c.key, label: c.label, format: format ?? 'text' }
  })
  const rows = t.rows.map((cells, i) => {
    const row: Record<string, unknown> = {}
    const refs: Record<string, string> = {}
    columns.forEach((c, k) => {
      const text = texts[i]?.[k] ?? ''
      row[c.key] = c.format !== 'text' ? cellValue(text, c.format) : text || null
      const ref = firstRef(cells[k] ?? [])
      if (ref) refs[c.key] = ref
    })
    row[REF_KEY] = refs
    let who: string | null = null
    for (const c of cells) {
      who = firstPerson(c)
      if (who) break
    }
    row[PERSON_KEY] = who
    return row
  })
  return { columns, rows }
}

/* ───────────── view links ───────────── */

/**
 * A view link points at a page and tab that exist: a folder tab view and one of its tabs, the Data
 * room and one of its addresses, or the Action center. Anything else renders as plain text.
 */
export function routeExists(
  view: string,
  tab: string | null,
  viewTabs: ReadonlyMap<string, readonly string[]>,
  isDataTab: (tab: string) => boolean,
): boolean {
  if (view === 'data') return !tab || isDataTab(tab)
  if (view === 'actions') return !tab || tab === 'open'
  const tabs = viewTabs.get(view)
  if (!tabs) return false
  return !tab || tabs.includes(tab)
}

/* ───────────── keys ───────────── */

type Keyish = Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

/**
 * The Ask shortcut: Alt+A (Option+A on a Mac). Nothing else in Census uses Alt, and browsers leave
 * Alt+A free. The key code is checked too, since Option+A types "å" on a Mac; AltGr (Ctrl+Alt on
 * Windows) is left alone so it can type its own characters.
 */
export function isAskShortcut(e: Keyish): boolean {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
  return e.code === 'KeyA' || e.key === 'a' || e.key === 'A'
}

/** What a key press in the composer does: Enter asks, Shift+Enter is a new line. */
export function composerKey(
  e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing'>,
): 'send' | null {
  if (e.key !== 'Enter' || e.isComposing) return null
  if (e.shiftKey || e.altKey) return null
  return 'send'
}

/** Settings: where the key in force is kept, in words. */
export function keyLine(stored: StoredKey | null, masked: (key: string) => string): string {
  if (!stored) return 'No key yet. Nothing is sent until you add one.'
  return `Using ${masked(stored.key)}, kept ${stored.kept ? 'on this device until you forget it' : 'for this tab only'}.`
}

/**
 * Settings, Ask Census: an error's "what to do" for the Settings page itself, which should not
 * send the reader to the page they are on.
 */
/**
 * Anthropic's own reason and the request's reference, under an error's plain-words title:
 * 'Anthropic said: "Your credit balance is too low …" (HTTP 400, request req_011…)'. Null when the
 * request never got an answer from Anthropic.
 */
export function errorFacts(e: Pick<AskError, 'status' | 'apiMessage' | 'requestId'>): string | null {
  if (e.status == null && !e.apiMessage) return null
  const ref = [e.status != null ? `HTTP ${e.status}` : null, e.requestId ? `request ${e.requestId}` : null]
    .filter(Boolean)
    .join(', ')
  if (!e.apiMessage) return `Anthropic sent no reason (${ref}).`
  return `Anthropic said: “${e.apiMessage}”${ref ? ` (${ref})` : ''}`
}

export function settingsErrorDetail(e: Pick<AskError, 'kind' | 'detail'>): string {
  switch (e.kind) {
    case 'key':
      return 'Check the key, or create a new one in the Claude Console.'
    case 'model':
      return 'Pick another model below.'
    case 'permission':
      return 'Pick another model below, or check the key’s permissions in the Claude Console.'
    case 'no_key':
      return 'Add a key above. Nothing is sent until you do.'
  }
  return e.detail
}

/* ───────────── the scope an answer was calculated for ───────────── */

/** The app's scope, period and data standard when a question was asked. */
export interface AskedScope {
  /** "Whole company", "Bengaluru · L5" (the app's own scope line). */
  scope: string
  leaderId: string | null
  businessUnit: readonly string[]
  department: readonly string[]
  location: readonly string[]
  level: readonly string[]
  /** The filters left out rather than kept, as the tools name them ("business_unit"), sorted. */
  exclude: readonly string[]
  start: string
  end: string
  /** "1 Oct 2025 – 30 Sep 2026" */
  window: string
  asOf: string
  standard: DataStandard
  isSample: boolean
}

export function askedScope(
  ctx: Pick<AnalyticsContext, 'scopeLabel' | 'filters' | 'window' | 'asOf' | 'standard' | 'isSample'>,
): AskedScope {
  const f = ctx.filters
  return {
    scope: ctx.scopeLabel,
    leaderId: f.leaderId ?? null,
    businessUnit: [...f.businessUnit],
    department: [...f.department],
    location: [...f.location],
    level: [...f.level],
    exclude: excludedArgs(f),
    start: ctx.window.start,
    end: ctx.window.end,
    window: ctx.window.label,
    asOf: ctx.asOf,
    standard: ctx.standard,
    isSample: ctx.isSample,
  }
}

const EXCLUDE_ARG: Record<FilterDimension, string> = {
  leaderId: 'leader',
  businessUnit: 'business_unit',
  department: 'department',
  location: 'location',
  level: 'level',
}

/** The filters with values that exclude them, as the tools name them, sorted. */
function excludedArgs(f: AnalyticsContext['filters']): string[] {
  return FILTER_DIMENSIONS.filter(
    (d) => isExcluded(f, d) && (d === 'leaderId' ? !!f.leaderId : (f[d] ?? []).length > 0),
  )
    .map((d) => EXCLUDE_ARG[d])
    .sort()
}

/** What an exported answer table is stamped with. */
export interface ExportScope {
  /** The scope line; MIXED_SCOPE when the answer's numbers come from different scopes. */
  scope: string
  /** The period, or '' when the answer's numbers come from different periods. */
  window: string
  asOf: string
  standard: DataStandard
  isSample: boolean
}

export const MIXED_SCOPE = 'Scope as stated in the answer'

/** The scope and period a tool result was computed for (from its `scope`, `filters` and `period`). */
interface ResultScope {
  /** Scope words with the leader as a token. */
  words: string
  leader: string | null
  lists: string[][]
  /** The filters the result left out (`filters.exclude`), sorted. */
  exclude: string[]
  start: string
  end: string
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').sort() : []

function resultScope(result: string): ResultScope | null {
  let r: unknown
  try {
    r = JSON.parse(result)
  } catch {
    return null
  }
  if (!r || typeof r !== 'object') return null
  const o = r as { scope?: unknown; filters?: unknown; period?: unknown }
  const f = o.filters as Record<string, unknown> | null | undefined
  const p = o.period as { start?: unknown; end?: unknown } | null | undefined
  if (typeof o.scope !== 'string' || !f || typeof f !== 'object' || !p || typeof p !== 'object') return null
  if (typeof p.start !== 'string' || typeof p.end !== 'string') return null
  return {
    words: o.scope,
    leader: typeof f.leader === 'string' ? f.leader : null,
    lists: [f.business_unit, f.department, f.location, f.level].map(strings),
    exclude: strings(f.exclude),
    start: p.start,
    end: p.end,
  }
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === b[i])

/**
 * The scope to stamp on an exported answer table. The tools compute with the scope the app had
 * when the question was asked unless a call gives its own filters, and every result says which
 * scope and period it used. When they all used the asked scope, the export says that one; when
 * they all used one other scope, that one; when they differ, the scope and period lines give way
 * to "Scope as stated in the answer". An answer that ran no tools (a table of earlier results)
 * goes by the calls earlier in the chat.
 */
export function exportScope(
  asked: AskedScope,
  calls: readonly ToolCallRecord[],
  earlier: readonly ToolCallRecord[],
  person: (token: string) => { name: string; employeeId?: string | null } | null,
): ExportScope {
  const base = { asOf: asked.asOf, standard: asked.standard, isSample: asked.isSample }
  const scoped = (list: readonly ToolCallRecord[]) =>
    list.filter((c) => !c.isError).flatMap((c) => resultScope(c.result) ?? [])
  const own = scoped(calls)
  const used = own.length ? own : scoped(earlier)
  const isAsked = (s: ResultScope) =>
    (s.leader ? (person(s.leader)?.employeeId ?? s.leader) : null) === asked.leaderId &&
    [asked.businessUnit, asked.department, asked.location, asked.level].every((l, i) =>
      sameList(l, s.lists[i] ?? []),
    ) &&
    sameList(asked.exclude ?? [], s.exclude) &&
    s.start === asked.start &&
    s.end === asked.end
  if (used.every(isAsked)) return { ...base, scope: asked.scope, window: asked.window }
  const key = (s: ResultScope) => JSON.stringify([s.leader, s.lists, s.exclude, s.start, s.end])
  const first = used[0] as ResultScope
  if (used.every((s) => key(s) === key(first)))
    return { ...base, scope: withNames(first.words, person), window: formatRange(first.start, first.end) }
  return { ...base, scope: MIXED_SCOPE, window: '' }
}

/* ───────────── the names of record links ───────────── */

/**
 * The label a run of inline nodes leads with: "**Bengaluru**: 18.8% …" leads with "Bengaluru". Only
 * a bold label that opens the item and links nothing itself counts.
 */
export function leadOf(nodes: readonly Inline[], person: PersonLookup): string | null {
  const first = nodes.find((n) => n.type !== 'text' || n.text.trim())
  if (first?.type !== 'strong' || firstRef(first.children)) return null
  const text = inlineText(first.children, person)
    .replace(/\s+/g, ' ')
    .replace(/[\s:,;.]+$/, '')
    .trim()
  return text || null
}

/**
 * The accessible name of a number linked to its records: "Bengaluru: show the records behind
 * 18.8%" under a bold label, "Show the records behind 52 d" without one, and "Records: See the 42
 * people" when the link is a phrase rather than a number.
 */
export function refLabel(text: string, lead: string | null): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!/^[+−\-±]?\d/.test(t)) return `Records: ${t}`
  return lead && !lead.includes(t) ? `${lead}: show the records behind ${t}` : `Show the records behind ${t}`
}
