/**
 * The Ask tools console (docs/ROLES.md, 5.5): run one Ask tool in this browser and show exactly
 * the JSON Claude would get, without calling Claude. It imports the tools and the conversation's
 * parts (`TokenMap`, `RefRegistry`, `ReleaseAudit`), never the client module, and runs `runTool`
 * with the live `ToolEnv` (the current mode included) and a fresh conversation. A test runs every
 * tool's example with a client that throws if called. Pure: no React, no network.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { ReleaseAudit } from '@/ask/engine/audit'
import { TOKEN_RE, TokenMap } from '@/ask/engine/privacy'
import { RefRegistry } from '@/ask/engine/refs'
import { runTool, TOOL_DEFINITIONS, TOOL_NAMES, toolDefinitionsFor } from '@/ask/engine/tools'
import type { ToolEnv, ToolName } from '@/ask/engine/types'

/** The line above "Run here". */
export const CONSOLE_NOTE = 'Runs the tool in this browser. Nothing is sent to Anthropic.'

/** A working input for every tool, prefilled in the console. */
export const TOOL_EXAMPLES: Readonly<Record<ToolName, Record<string, unknown>>> = {
  get_context: {},
  find_metrics: { query: 'voluntary attrition' },
  view_summary: { view: 'hrbp' },
  compare_groups: { view: 'hrbp', kpi: 'hrbp.attrition.voluntary', by: 'department' },
  query_records: {
    dataset: 'employees',
    group_by: [{ field: 'department' }],
    measures: [{ op: 'count' }],
    limit: 10,
  },
  explain_quality: { dataset: 'employees' },
  open_items: { overdue_only: true },
}

export const exampleText = (name: string): string =>
  JSON.stringify(TOOL_EXAMPLES[name as ToolName] ?? {}, null, 2)

/** The tool's definition as Claude gets it in this mode (null when the mode leaves it out). */
export function toolDefinition(name: string, env: Pick<ToolEnv, 'ctx'>): BetaTool | null {
  const inMode = toolDefinitionsFor(env.ctx.access)
  return inMode.find((t) => t.name === name) ?? null
}

/** Every tool name, whether or not the mode sends it. */
export const CONSOLE_TOOLS: readonly string[] = TOOL_NAMES

/* ───────────── checking an input against its schema ───────────── */

type Schema = {
  type?: string
  enum?: readonly unknown[]
  properties?: Record<string, Schema>
  required?: readonly string[]
  additionalProperties?: boolean
  items?: Schema
  maxItems?: number
  minimum?: number
  maximum?: number
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v

function check(schema: Schema, v: unknown, at: string, out: string[]): void {
  const where = at || 'The input'
  if (schema.type) {
    const t = typeOf(v)
    const ok = schema.type === 'number' ? t === 'number' || t === 'integer' : t === schema.type
    if (!ok) {
      out.push(`${where} should be ${schema.type === 'integer' ? 'a whole number' : `a ${schema.type}`}.`)
      return
    }
  }
  if (schema.enum && !schema.enum.includes(v))
    out.push(`${where} should be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}.`)
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum)
      out.push(`${where} should be at least ${schema.minimum}.`)
    if (schema.maximum != null && v > schema.maximum)
      out.push(`${where} should be at most ${schema.maximum}.`)
  }
  if (Array.isArray(v)) {
    if (schema.maxItems != null && v.length > schema.maxItems)
      out.push(`${where} should have at most ${schema.maxItems} items.`)
    const items = schema.items
    if (items) for (const [i, x] of v.entries()) check(items, x, `${at}[${i}]`, out)
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && (schema.properties || schema.required)) {
    const obj = v as Record<string, unknown>
    for (const r of schema.required ?? []) if (!(r in obj)) out.push(`${at ? `${at}.` : ''}${r} is required.`)
    for (const [k, x] of Object.entries(obj)) {
      const p = schema.properties?.[k]
      if (p) check(p, x, at ? `${at}.${k}` : k, out)
      else if (schema.additionalProperties === false)
        out.push(`${at ? `${at}.` : ''}${k} is not an input of this tool.`)
    }
  }
}

export type ParsedInput = { ok: true; value: unknown } | { ok: false; error: string }

/** The JSON in the input box, or why it is not JSON. */
export function parseInput(text: string): ParsedInput {
  const t = text.trim()
  if (!t) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(t) }
  } catch (err) {
    return {
      ok: false,
      error: `The input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** "Check input": the problems with an input against the tool's schema; empty when it fits. */
export function checkInput(
  name: string,
  text: string,
  tools: readonly BetaTool[] = TOOL_DEFINITIONS,
): string[] {
  const def = tools.find((t) => t.name === name)
  if (!def) return [`There is no tool "${name}".`]
  const parsed = parseInput(text)
  if (!parsed.ok) return [parsed.error]
  const out: string[] = []
  check(def.input_schema as Schema, parsed.value, '', out)
  return out
}

/* ───────────── running ───────────── */

/** A fresh conversation's parts: person tokens, record refs and the release audit. */
export interface ConsoleConversation {
  tokens: TokenMap
  refs: RefRegistry
  audit: ReleaseAudit
}

export const freshConversation = (): ConsoleConversation => ({
  tokens: new TokenMap(),
  refs: new RefRegistry(),
  audit: new ReleaseAudit(),
})

export interface ConsoleRun {
  tool: string
  /** The progress line Ask shows while the tool runs. */
  label: string
  ms: number
  isError: boolean
  /** The exact text that would go back to Claude as the tool result. */
  content: string
  /** The same, pretty-printed. */
  pretty: string
  /** Record refs in the result, in order. */
  refs: string[]
  conversation: ConsoleConversation
}

/** Pretty-print JSON text; the text itself when it is not JSON. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** The record refs ("r1", "r2" …) a result hands out, in order of first appearance. */
export function refsIn(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(/"(r[1-9]\d*)"/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Person tokens replaced by names, locally, as the Ask sheet shows them ("Show names"). */
export function withNames(text: string, tokens: Pick<TokenMap, 'resolve'>): string {
  return text.replace(TOKEN_RE, (whole, n: string) => tokens.resolve(`P${n}`)?.name ?? whole)
}

/**
 * "Run here": run one tool on the live context in a fresh conversation, as Ask would, and return
 * what would be sent. Never throws; bad JSON comes back as an error result.
 */
export function runInConsole(
  name: string,
  inputText: string,
  env: ToolEnv,
  conversation: ConsoleConversation = freshConversation(),
): ConsoleRun {
  const parsed = parseInput(inputText)
  if (!parsed.ok) {
    const content = JSON.stringify({ error: parsed.error })
    return {
      tool: name,
      label: 'Reading the input',
      ms: 0,
      isError: true,
      content,
      pretty: prettyJson(content),
      refs: [],
      conversation,
    }
  }
  const run = runTool(name, parsed.value, env, conversation)
  return {
    tool: name,
    label: run.label,
    ms: run.ms,
    isError: run.isError,
    content: run.content,
    pretty: prettyJson(run.content),
    refs: refsIn(run.content),
    conversation,
  }
}
