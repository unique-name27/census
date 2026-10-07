/**
 * The agent loop (docs/ASK.md, Agent loop), with the client injected so tests use a fake.
 *
 * One question: tokenize it, stream a request with the system prompt, the tools and the
 * conversation so far; when Claude asks for tools, run them here against the live context and
 * send the (tokenized) results back; repeat. At most 10 tool rounds per question: after the tenth,
 * the next request asks Claude to answer with what it has and allows no more tools. Stop aborts
 * the request in flight and runs no further tool. Usage is summed per answer.
 */
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  MessageCreateParamsBase,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AskAction } from './app'
import type { AskChart } from './chart'
import type { Conversation } from './conversation'
import { type AskError, CUT_OFF, classifyError, DECLINED, EMPTY_QUESTION, errorLog, STOPPED } from './errors'
import { type ModelId, modelById } from './models'
import { ROUND_LIMIT_NOTE, SYSTEM_BLOCKS, systemBlocksFor } from './prompt'
import { askOffReason, withScope } from './scope'
import { screenLine } from './screen'
import { isScreenTool, type PriorResult, runScreenTool, type ScreenRun } from './screenTools'
import { runTool, TOOL_DEFINITIONS, toolDefinitionsFor, toolLabel } from './tools'
import { NO_USAGE, type ToolCallRecord, type ToolEnv, type Usage } from './types'

/** The request body (the Messages API's streaming params, beta surface). */
export type AskRequest = MessageCreateParamsBase

/** What the loop reads from a streaming response: the events, then the whole message. */
export interface AskStream extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<BetaMessage>
}

/** The client the loop calls. `createAnthropicClient` makes the real one; tests pass a fake. */
export interface AskClient {
  stream(body: AskRequest, options: { signal?: AbortSignal }): AskStream
  /** True when an error means the request never reached the API (the SDK's connection errors). */
  isConnectionError?(err: unknown): boolean
  /** Requests carry a workspace ID (the `anthropic-workspace-id` header), so Anthropic can turn it down. */
  sendsWorkspaceId?: boolean
}

export const MAX_TOKENS = 4096
export const MAX_TOOL_ROUNDS = 10
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export type AskEvent =
  /**
   * The question as it was sent (tokenized), after the screen line when Ask is connected to the
   * app; `screen` is that line on its own.
   */
  | { type: 'question'; sent: string; screen?: string | null }
  /** A request to Claude starts (1-based). */
  | { type: 'request'; round: number }
  /** Answer text as it streams: person tokens and ref/view/metric links, never names. */
  | { type: 'text'; delta: string }
  /** A tool starts running here; `label` is the progress line (it may hold person tokens). */
  | { type: 'tool_start'; id: string; name: string; label: string; round: number }
  | { type: 'tool_end'; call: ToolCallRecord }
  /** The tool round limit was reached; Claude is asked to answer with what it has. */
  | { type: 'round_limit' }
  | { type: 'usage'; usage: Usage }

export interface AskOptions {
  client: AskClient
  conversation: Conversation
  /** The question as the user typed it. */
  question: string
  env: ToolEnv
  model?: ModelId
  /** The Stop button. */
  signal?: AbortSignal
  onEvent?: (e: AskEvent) => void
  maxRounds?: number
  /** `navigator.onLine`, for telling "offline" from "blocked". */
  online?: () => boolean
}

export interface AskResult {
  status: 'done' | 'stopped' | 'error'
  /** The answer as Claude wrote it (person tokens, ref/view/metric links). Render it with `parseAnswer`. */
  text: string
  /** The question as it was sent (tokenized), after the screen line when there is one. */
  sent: string
  /** The screen line the question carried ("On screen: People stats, Attrition; ..."), or null (always set by `ask`). */
  screen?: string | null
  calls: ToolCallRecord[]
  /** What Ask changed on screen, in order, each with its action line and Undo (always set by `ask`). */
  actions?: AskAction[]
  /** The charts Ask drew, in order (always set by `ask`). */
  charts?: AskChart[]
  usage: Usage
  /** Tool rounds run. */
  rounds: number
  roundLimited: boolean
  /** The answer stopped at the length limit. */
  truncated: boolean
  stopReason: string | null
  error: AskError | null
  model: string
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Let the page paint the progress line before a tool computes (tools run on the main thread). */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0))

/** Token counts as the API reports them on a message, `message_start` or `message_delta`. */
interface RawUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

function addUsage(u: Usage, m: { usage?: RawUsage | null } | null): Usage {
  if (!m?.usage) return u
  return {
    ...u,
    input: u.input + (m.usage.input_tokens ?? 0),
    output: u.output + (m.usage.output_tokens ?? 0),
    cacheRead: u.cacheRead + (m.usage.cache_read_input_tokens ?? 0),
    cacheWrite: u.cacheWrite + (m.usage.cache_creation_input_tokens ?? 0),
    requests: u.requests + 1,
  }
}

/** A stream's usage so far: `message_start` gives the input, each `message_delta` the output to date. */
function streamUsage(seen: RawUsage | null, ev: BetaRawMessageStreamEvent): RawUsage | null {
  if (ev.type === 'message_start') return { ...ev.message.usage }
  if (ev.type !== 'message_delta' || !seen) return seen
  const d = ev.usage as RawUsage
  return {
    input_tokens: d.input_tokens ?? seen.input_tokens,
    output_tokens: d.output_tokens ?? seen.output_tokens,
    cache_read_input_tokens: d.cache_read_input_tokens ?? seen.cache_read_input_tokens,
    cache_creation_input_tokens: d.cache_creation_input_tokens ?? seen.cache_creation_input_tokens,
  }
}

/** Blocks a declined attempt leaves before a fallback boundary that are never echoed back. */
const DECLINED_ONLY = new Set(['thinking', 'redacted_thinking', 'tool_use'])

/**
 * A turn's content as it is echoed back, after a mid-output fallback (server-side fallback): the
 * thinking, redacted thinking and tool calls of the declined attempt, before the last `fallback`
 * block, are left out, and so are server tool calls without their result and any other block of
 * the model's own; text, paired server-tool blocks and everything after the boundary stay.
 * Content with no `fallback` block comes back unchanged.
 */
export function echoContent(content: readonly BetaContentBlock[]): BetaContentBlock[] {
  const last = content.findLastIndex((b) => b.type === 'fallback')
  if (last < 0) return [...content]
  const resultIds = new Set(
    content.flatMap((b) =>
      b.type.endsWith('_tool_result') && 'tool_use_id' in b ? [String(b.tool_use_id)] : [],
    ),
  )
  return content.filter((b, i) => {
    if (i >= last) return true
    if (b.type === 'text' || b.type === 'fallback') return true
    if (DECLINED_ONLY.has(b.type)) return false
    if (b.type.endsWith('_tool_result')) return true
    if (b.type === 'server_tool_use' || b.type === 'mcp_tool_use') return resultIds.has(b.id)
    return false
  })
}

/** The request for this turn of the loop. */
export function buildRequest(
  model: ModelId | undefined,
  messages: BetaMessageParam[],
  final: boolean,
  /** The mode's system blocks and tools (Manager mode: docs/ROLES.md, 4.7); every tool by default. */
  mode?: { system: AskRequest['system']; tools: AskRequest['tools'] },
): AskRequest {
  const info = modelById(model)
  return {
    model: info.id,
    max_tokens: MAX_TOKENS,
    system: mode?.system ?? SYSTEM_BLOCKS,
    tools: mode?.tools ?? TOOL_DEFINITIONS,
    messages,
    // Caches the conversation so far; the system prompt and tools carry their own breakpoints.
    cache_control: { type: 'ephemeral' },
    ...(info.effort ? { output_config: { effort: info.effort } } : {}),
    ...(info.fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    ...(final ? { tool_choice: { type: 'none' as const } } : {}),
  }
}

/** Ask one question. Never throws: errors come back as `status: 'error'` with the plain-words case. */
export async function ask(o: AskOptions): Promise<AskResult> {
  const conv = o.conversation
  const maxRounds = o.maxRounds ?? MAX_TOOL_ROUNDS
  const emit = (e: AskEvent) => {
    try {
      o.onEvent?.(e)
    } catch (err) {
      console.error('Ask Census: an event handler failed', err)
    }
  }
  if (!o.question.trim())
    return {
      status: 'error',
      text: '',
      sent: '',
      screen: null,
      calls: [],
      actions: [],
      charts: [],
      usage: { ...NO_USAGE },
      rounds: 0,
      roundLimited: false,
      truncated: false,
      stopReason: null,
      error: EMPTY_QUESTION,
      model: modelById(o.model).id,
    }
  // Manager mode needs an org of the anonymity minimum, so no answer is about one person.
  const off = askOffReason(o.env.ctx)
  if (off)
    return {
      status: 'error',
      text: '',
      sent: '',
      screen: null,
      calls: [],
      actions: [],
      charts: [],
      usage: { ...NO_USAGE },
      rounds: 0,
      roundLimited: false,
      truncated: false,
      stopReason: null,
      error: { kind: 'bad_request', title: off, detail: 'Nothing was sent.', action: null },
      model: modelById(o.model).id,
    }
  // The scope on screen: the store's filters can be a step ahead of the context the page last
  // rendered, and the tools must compute what the screen shows.
  let env = syncEnv(o.env)
  const question = conv.tokenize(o.question.trim(), env.ctx)
  const app = env.app
  const screen = app ? lineFor(env, conv) : null
  const sent = screen ? [screen, question].join('\n\n') : question
  emit({ type: 'question', sent, screen })
  // The mode's system blocks and tool definitions: the Manager line names the manager by token.
  // With the app connected, the screen tools follow (the action tools while Ask may change it).
  const access = env.ctx.access
  conv.tokens.index(env.ctx)
  const actionsOn = !!app && safeActionsOn(app)
  const mode = {
    system: systemBlocksFor(
      access?.lock ? conv.tokens.forEmployee(access.lock.managerId) : null,
      app ? { actions: actionsOn } : null,
    ),
    tools: toolDefinitionsFor(access, app ? { views: env.views, actions: actionsOn } : null),
  }
  // Results of this answer's tool calls, for make_chart's result source (kept once it completes).
  const turnResults = new Map<string, PriorResult>()
  const resultOf = (id: string) => turnResults.get(id) ?? conv.results.get(id)
  const turn: BetaMessageParam[] = [{ role: 'user', content: sent }]
  const calls: ToolCallRecord[] = []
  let usage: Usage = { ...NO_USAGE }
  let text = ''
  let rounds = 0
  let requests = 0
  let roundLimited = false
  let stopReason: string | null = null
  // The usage of the request in flight, until its whole message arrives: a stopped or failed
  // request is still billed for its input and whatever output streamed.
  let live: RawUsage | null = null
  const result = (
    status: AskResult['status'],
    error: AskError | null,
    extra: Partial<AskResult> = {},
  ): AskResult => {
    if (live) {
      usage = { ...addUsage(usage, { usage: live }), partial: true }
      live = null
    }
    conv.usage = {
      input: conv.usage.input + usage.input,
      output: conv.usage.output + usage.output,
      cacheRead: conv.usage.cacheRead + usage.cacheRead,
      cacheWrite: conv.usage.cacheWrite + usage.cacheWrite,
      requests: conv.usage.requests + usage.requests,
      ...(conv.usage.partial || usage.partial ? { partial: true } : {}),
    }
    if (status === 'done') {
      conv.history.push(...turn)
      for (const [id, r] of turnResults) conv.results.set(id, r)
    }
    return {
      status,
      text,
      sent,
      screen,
      calls,
      actions: calls.flatMap((c) => (c.action ? [c.action] : [])),
      charts: calls.flatMap((c) => (c.chart ? [c.chart] : [])),
      usage,
      rounds,
      roundLimited,
      truncated: false,
      stopReason,
      error,
      model: modelById(o.model).id,
      ...extra,
    }
  }

  try {
    // Requests: tool rounds, the final answer, and a little room for pause_turn.
    while (requests < maxRounds + 3) {
      if (o.signal?.aborted) return result('stopped', STOPPED)
      const final = rounds >= maxRounds
      requests++
      emit({ type: 'request', round: requests })
      const stream = o.client.stream(buildRequest(o.model, [...conv.history, ...turn], final, mode), {
        signal: o.signal,
      })
      live = null
      for await (const ev of stream) {
        live = streamUsage(live, ev)
        if (
          ev.type === 'content_block_start' &&
          ev.content_block.type === 'text' &&
          text &&
          !text.endsWith('\n')
        ) {
          text += '\n\n'
          emit({ type: 'text', delta: '\n\n' })
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          text += ev.delta.text
          emit({ type: 'text', delta: ev.delta.text })
        }
      }
      const msg = await stream.finalMessage()
      live = null
      usage = addUsage(usage, msg)
      emit({ type: 'usage', usage })
      stopReason = msg.stop_reason ?? null
      // After a mid-output fallback, only what follows the last fallback block is echoed and run.
      const content = echoContent(msg.content)
      const uses = content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use')

      if (msg.stop_reason === 'refusal') {
        // A decline can cut an answer off mid-sentence: the partial text is dropped.
        text = ''
        return result('error', DECLINED)
      }
      if (msg.stop_reason === 'max_tokens') {
        // A tool input cut off at the limit may still parse; never run it.
        if (uses.length) return result('error', CUT_OFF, { truncated: true })
        turn.push({ role: 'assistant', content: content as BetaContentBlockParam[] })
        return result('done', null, { truncated: true })
      }
      // Tool calls past the limit are never run; their message stays out of the history, which
      // must not hold a tool call without its result.
      if (final && uses.length) return result('done', null)
      turn.push({ role: 'assistant', content: content as BetaContentBlockParam[] })
      if (msg.stop_reason === 'pause_turn') continue
      if (msg.stop_reason !== 'tool_use' || !uses.length) return result('done', null)

      // A tool round: run every call here, then send all the results in one message.
      rounds++
      const results: BetaContentBlockParam[] = []
      for (const u of uses) {
        if (o.signal?.aborted) return result('stopped', STOPPED)
        const label = runLabel(u, env, conv)
        emit({ type: 'tool_start', id: u.id, name: u.name, label, round: requests })
        await yieldToUi()
        if (o.signal?.aborted) return result('stopped', STOPPED)
        const t = clock()
        const run: ScreenRun = isScreenTool(u.name)
          ? await runScreenTool(u.name, u.input, env, conv, { id: u.id, results: resultOf })
          : runTool(u.name, u.input, env, conv)
        // An action that changed the scope: the tools after it compute what the screen now shows.
        if (run.scope) env = withScope(env, run.scope)
        if (!run.isError) turnResults.set(u.id, { name: u.name, input: u.input, content: run.content })
        const call: ToolCallRecord = {
          id: u.id,
          name: u.name,
          input: u.input,
          result: run.content,
          isError: run.isError,
          ms: clock() - t,
          label: run.label,
          round: requests,
          ...(run.action ? { action: run.action } : {}),
          ...(run.chart ? { chart: run.chart } : {}),
        }
        calls.push(call)
        emit({ type: 'tool_end', call })
        const block: BetaToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: u.id,
          content: run.content,
          ...(run.isError ? { is_error: true } : {}),
        }
        results.push(block)
      }
      if (rounds >= maxRounds) {
        roundLimited = true
        emit({ type: 'round_limit' })
        results.push({ type: 'text', text: ROUND_LIMIT_NOTE })
      }
      turn.push({ role: 'user', content: results })
    }
    return result('done', null)
  } catch (err) {
    const aborted = !!o.signal?.aborted
    const error = classifyError(err, {
      aborted,
      online: o.online?.(),
      connection: o.client.isConnectionError?.(err),
      workspaceSent: o.client.sendsWorkspaceId,
    })
    // A summary, never the error itself: it holds the response headers (docs/ASK.md, logs).
    if (error.kind !== 'stopped') console.warn('Ask Census: the request failed', errorLog(err))
    return result(error.kind === 'stopped' ? 'stopped' : 'error', error)
  }
}

/** The progress line for a call, shown before it runs (the same line `runTool` reports). */
function runLabel(u: BetaToolUseBlock, env: ToolEnv, conv: Conversation): string {
  try {
    conv.tokens.index(env.ctx)
    return conv.tokens.scan(toolLabel(u.name, u.input, env, conv.tokens))
  } catch {
    return `Running ${u.name}`
  }
}

/** The env with its context matched to the scope on screen (the same env without an app). */
function syncEnv(env: ToolEnv): ToolEnv {
  if (!env.app) return env
  try {
    const s = env.app.screen()
    return withScope(env, { filters: s.filters, standard: s.standard })
  } catch (err) {
    console.warn('Ask Census: the screen could not be read', err)
    return env
  }
}

/** The screen line for the question, or null when the screen cannot be read. */
function lineFor(env: ToolEnv, conv: Conversation): string | null {
  try {
    conv.tokens.index(env.ctx)
    return env.app ? screenLine(env.app.screen(), env.ctx, env.views, conv.tokens) : null
  } catch (err) {
    console.warn('Ask Census: the screen line could not be built', err)
    return null
  }
}

const safeActionsOn = (app: NonNullable<ToolEnv['app']>): boolean => {
  try {
    return app.actionsOn()
  } catch {
    return false
  }
}
