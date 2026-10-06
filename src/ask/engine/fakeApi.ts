/**
 * A scripted Claude for the Ask tests: replies as content blocks, turned into the Messages API's
 * streaming events, served either straight to the loop (a fake client) or as Server-Sent Events
 * from a fake `fetch`, so the real SDK parses them and the real tool loop runs. Not imported by
 * the app. Keys used with it are fake ("sk-ant-test-fake-0000"); nothing leaves the process.
 */
import type {
  BetaMessage,
  BetaRawMessageStreamEvent,
  MessageCreateParamsBase,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AskClient, AskStream } from './loop'

export const FAKE_KEY = 'sk-ant-test-fake-0000'

export type Scripted =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown; id?: string }
  | { type: 'thinking' }
  /** A server-side fallback boundary: the model before it declined and `to` carried on. */
  | { type: 'fallback'; from: string; to: string }

export interface Reply {
  blocks: Scripted[]
  stop?: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn'
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
}

let ids = 0

/** The reply with an id on every tool call, so its events and its message agree. */
export function withIds(reply: Reply): Reply {
  return {
    ...reply,
    blocks: reply.blocks.map((b) =>
      b.type === 'tool_use' && !b.id ? { ...b, id: `toolu_test_${++ids}` } : b,
    ),
  }
}

const fallbackBlock = (b: { from: string; to: string }) => ({
  type: 'fallback',
  from: { model: b.from },
  to: { model: b.to },
  trigger: { type: 'refusal' },
})

const stopOf = (reply: Reply) =>
  reply.stop ?? (reply.blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn')

/** The streaming events for one reply, with text split into small deltas and tool input in pieces. */
export function eventsOf(r: Reply, model = 'claude-opus-5-5'): BetaRawMessageStreamEvent[] {
  const reply = withIds(r)
  const u = reply.usage ?? {}
  const message = {
    id: `msg_test_${++ids}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: u.input ?? 100,
      output_tokens: 1,
      cache_read_input_tokens: u.cacheRead ?? 0,
      cache_creation_input_tokens: u.cacheWrite ?? 0,
    },
  }
  const out: Record<string, unknown>[] = [{ type: 'message_start', message }]
  reply.blocks.forEach((b, index) => {
    if (b.type === 'text') {
      out.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '', citations: null },
      })
      for (const piece of b.text.match(/.{1,7}/gs) ?? [])
        out.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } })
    } else if (b.type === 'fallback') {
      // No deltas: it arrives as a start and a stop, like a server-tool block.
      out.push({ type: 'content_block_start', index, content_block: fallbackBlock(b) })
    } else if (b.type === 'thinking') {
      out.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      })
      out.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'signature_delta', signature: 'sig-test' },
      })
    } else {
      out.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
      })
      const json = JSON.stringify(b.input ?? {})
      for (const piece of json.match(/.{1,9}/gs) ?? [])
        out.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: piece },
        })
    }
    out.push({ type: 'content_block_stop', index })
  })
  out.push({
    type: 'message_delta',
    delta: { stop_reason: stopOf(reply), stop_sequence: null, stop_details: null, container: null },
    usage: {
      output_tokens: u.output ?? 20,
      input_tokens: u.input ?? 100,
      cache_read_input_tokens: u.cacheRead ?? 0,
      cache_creation_input_tokens: u.cacheWrite ?? 0,
    },
  })
  out.push({ type: 'message_stop' })
  return out as unknown as BetaRawMessageStreamEvent[]
}

/** The message a reply adds up to (what `finalMessage()` gives); pass the reply through `withIds` first. */
export function messageOf(reply: Reply, model = 'claude-opus-5-5'): BetaMessage {
  const u = reply.usage ?? {}
  return {
    id: `msg_test_${++ids}`,
    type: 'message',
    role: 'assistant',
    model,
    content: reply.blocks.map((b) =>
      b.type === 'text'
        ? { type: 'text', text: b.text, citations: null }
        : b.type === 'thinking'
          ? { type: 'thinking', thinking: '', signature: 'sig-test' }
          : b.type === 'fallback'
            ? fallbackBlock(b)
            : { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} },
    ),
    stop_reason: stopOf(reply),
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: u.input ?? 100,
      output_tokens: u.output ?? 20,
      cache_read_input_tokens: u.cacheRead ?? 0,
      cache_creation_input_tokens: u.cacheWrite ?? 0,
    },
  } as unknown as BetaMessage
}

/** What the fake client saw. */
export interface FakeLog {
  bodies: MessageCreateParamsBase[]
  signals: (AbortSignal | undefined)[]
}

/**
 * A fake client that answers each request with the next scripted reply (or with `respond(body)`).
 * A reply may be an Error to throw instead. With `pauseAfter`, the stream waits after that many
 * events until the signal aborts (to test Stop).
 */
export function fakeClient(
  replies: (Reply | Error)[] | ((body: MessageCreateParamsBase, n: number) => Reply | Error),
  opts: { pauseAfter?: number } = {},
): AskClient & { log: FakeLog } {
  const log: FakeLog = { bodies: [], signals: [] }
  let n = 0
  return {
    log,
    stream(body, o): AskStream {
      // Snapshot the body as sent (the loop keeps appending to its own arrays).
      log.bodies.push(JSON.parse(JSON.stringify(body)))
      log.signals.push(o.signal)
      const reply = typeof replies === 'function' ? replies(body, n) : replies[n]
      n++
      if (!reply) throw new Error('No scripted reply left')
      if (reply instanceof Error) throw reply
      const scripted = withIds(reply)
      const events = eventsOf(scripted, body.model)
      const msg = messageOf(scripted, body.model)
      let done: Promise<BetaMessage> | null = null
      return {
        async *[Symbol.asyncIterator]() {
          let i = 0
          for (const e of events) {
            if (opts.pauseAfter != null && i === opts.pauseAfter) {
              await new Promise<void>((resolve, reject) => {
                const abort = () => {
                  const err = new Error('Request was aborted.')
                  err.name = 'AbortError'
                  reject(err)
                }
                if (o.signal?.aborted) abort()
                o.signal?.addEventListener('abort', abort)
                setTimeout(resolve, 5000)
              })
            }
            i++
            yield e
          }
          done = Promise.resolve(msg)
        },
        finalMessage: () => done ?? Promise.resolve(msg),
      }
    },
  }
}

/** The SSE text of one reply, as the API sends it. */
export function sseOf(reply: Reply, model?: string): string {
  return eventsOf(reply, model)
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('')
}

export interface FakeFetchCall {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}

/**
 * A `fetch` that answers api.anthropic.com: messages with the next scripted SSE stream (or a
 * status with an error body), and the models endpoint with a model.
 */
export function fakeFetch(
  script: (Reply | { status: number; type: string; message?: string; headers?: Record<string, string> })[],
): typeof fetch & { calls: FakeFetchCall[] } {
  const calls: FakeFetchCall[] = []
  let n = 0
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v
    })
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    calls.push({ url, method: init?.method ?? 'GET', headers, body })
    if (!url.startsWith('https://api.anthropic.com/')) throw new TypeError('fetch failed')
    if (url.includes('/v1/models/'))
      return new Response(JSON.stringify({ type: 'model', id: url.split('/').pop(), display_name: 'Test' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'request-id': 'req_test' },
      })
    // A request that is not streamed (Settings > Check key) gets a whole message back.
    const whole = !!body && body.stream !== true
    const step = script[n++]
    if (!step && !whole) throw new TypeError('fetch failed')
    if (step && 'status' in step)
      return new Response(
        JSON.stringify({
          type: 'error',
          error: { type: step.type, message: step.message ?? 'Scripted error' },
          request_id: 'req_test',
        }),
        {
          status: step.status,
          headers: { 'content-type': 'application/json', 'request-id': 'req_test', ...step.headers },
        },
      )
    if (whole)
      return new Response(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body?.model,
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'max_tokens',
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } },
      )
    return new Response(sseOf(step, typeof body?.model === 'string' ? body.model : undefined), {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' },
    })
  }
  return Object.assign(f, { calls }) as typeof fetch & { calls: FakeFetchCall[] }
}
