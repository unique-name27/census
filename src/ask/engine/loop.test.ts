/**
 * The agent loop with a fake client (scripted tool calls, then text), and with the real SDK
 * reading scripted Server-Sent Events from a fake fetch: tool rounds, the 10-round cap, Stop,
 * error mapping, usage, the append-only history and what the requests carry. Every key here is
 * fake and no request leaves the process.
 */
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { checkKey, createAnthropicClient } from './client'
import { Conversation } from './conversation'
import { classifyError } from './errors'
import { FAKE_KEY, fakeClient, fakeFetch, type Reply, sseOf } from './fakeApi'
import { type AskEvent, ask, echoContent, FALLBACK_BETA, MAX_TOKENS } from './loop'
import { ROUND_LIMIT_NOTE, SYSTEM_PROMPT } from './prompt'
import { envOf, expectClean, sampleCtx } from './testkit'

let ctx: AnalyticsContext
beforeAll(() => {
  ctx = sampleCtx()
}, 60_000)

const toolCall = (name: string, input: unknown): Reply => ({ blocks: [{ type: 'tool_use', name, input }] })
const answer = (text: string, usage?: Reply['usage']): Reply => ({ blocks: [{ type: 'text', text }], usage })

const lastUser = (body: { messages: BetaMessageParam[] }) =>
  body.messages[body.messages.length - 1] as BetaMessageParam

describe('ask with a fake client', () => {
  it('runs scripted tool calls here, sends tokenized results back, then streams the answer', async () => {
    const conv = new Conversation()
    const client = fakeClient([
      { blocks: [{ type: 'thinking' }, { type: 'tool_use', name: 'view_summary', input: { view: 'hrbp' } }] },
      toolCall('query_records', {
        dataset: 'requisitions',
        where: [{ field: 'status', op: 'eq', value: 'Open' }],
        group_by: ['recruiter'],
      }),
      answer('Voluntary attrition is [9.4%](ref:r1), within its target.', {
        input: 50,
        output: 30,
        cacheRead: 400,
      }),
    ])
    const events: AskEvent[] = []
    const person = ctx.all.employees[2]
    const r = await ask({
      client,
      conversation: conv,
      question: `How is attrition, and how is ${person?.name} (${person?.employeeId}) doing?`,
      env: envOf(ctx),
      onEvent: (e) => events.push(e),
    })
    expect(r.status).toBe('done')
    expect(r.error).toBeNull()
    expect(r.rounds).toBe(2)
    expect(r.text).toBe('Voluntary attrition is [9.4%](ref:r1), within its target.')
    expect(r.calls.map((c) => c.name)).toEqual(['view_summary', 'query_records'])
    expect(r.calls[0]?.label).toBe('Calculating People stats key figures')
    expect(r.calls[1]?.label).toBe('Counting requisitions by recruiter')
    // The question went out tokenized; the sheet keeps it as typed.
    expect(r.sent).not.toContain(person?.name as string)
    expect(r.sent).not.toContain(person?.employeeId as string)
    expect(r.sent).toMatch(/\{\{P\d+\}\} \(\{\{P\d+\}\}\)/)
    // Each tool result went back exactly as recorded, and is clean.
    const second = client.log.bodies[1] as { messages: BetaMessageParam[] }
    const results = lastUser(second).content as { type: string; content: string; tool_use_id: string }[]
    expect(results[0]?.type).toBe('tool_result')
    expect(results[0]?.content).toBe(r.calls[0]?.result)
    for (const body of client.log.bodies) expectClean(JSON.stringify(body), 'request body')
    // Usage summed over the three requests.
    expect(r.usage).toEqual({ input: 250, output: 70, cacheRead: 400, cacheWrite: 0, requests: 3 })
    // Progress, in order.
    expect(events.map((e) => e.type).filter((t) => t !== 'text' && t !== 'usage')).toEqual([
      'question',
      'request',
      'tool_start',
      'tool_end',
      'request',
      'tool_start',
      'tool_end',
      'request',
    ])
    expect(
      events
        .filter((e) => e.type === 'text')
        .map((e) => (e as { delta: string }).delta)
        .join(''),
    ).toBe(r.text)
    // The history holds the whole turn, thinking blocks included, for the next question.
    expect(conv.history.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    const assistant = conv.history[1] as BetaMessageParam
    expect((assistant.content as { type: string }[])[0]?.type).toBe('thinking')
    expect(conv.hasRef('r1')).toBe(true)
  })

  it('sends the model, limits, cached system prompt and tools, effort and fallback', async () => {
    const client = fakeClient([answer('Hello.')])
    await ask({ client, conversation: new Conversation(), question: 'Hi', env: envOf(ctx) })
    const body = client.log.bodies[0] as unknown as Record<string, unknown>
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.max_tokens).toBe(MAX_TOKENS)
    expect(body.system).toEqual([{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }])
    expect((body.tools as unknown[]).length).toBe(7)
    expect(body.cache_control).toEqual({ type: 'ephemeral' })
    expect(body.output_config).toEqual({ effort: 'medium' })
    expect(body.betas).toEqual([FALLBACK_BETA])
    expect(body.fallbacks).toBe('default')
    expect(body.tool_choice).toBeUndefined()
    const haiku = fakeClient([answer('Hello.')])
    await ask({
      client: haiku,
      conversation: new Conversation(),
      question: 'Hi',
      env: envOf(ctx),
      model: 'claude-haiku-4-5-20251001',
    })
    const h = haiku.log.bodies[0] as unknown as Record<string, unknown>
    expect(h.model).toBe('claude-haiku-4-5-20251001')
    expect(h.output_config).toBeUndefined()
    expect(h.betas).toBeUndefined()
  })

  it('keeps the history append-only across questions', async () => {
    const conv = new Conversation()
    const client = fakeClient([toolCall('get_context', {}), answer('First.'), answer('Second.')])
    await ask({ client, conversation: conv, question: 'One', env: envOf(ctx) })
    const before = JSON.parse(JSON.stringify(conv.history))
    await ask({ client, conversation: conv, question: 'Two', env: envOf(ctx) })
    const third = client.log.bodies[2] as { messages: BetaMessageParam[] }
    expect(third.messages.slice(0, before.length)).toEqual(before)
    expect(third.messages[before.length]).toEqual({ role: 'user', content: 'Two' })
    expect(conv.turns).toBe(2)
  })

  it('stops after 10 tool rounds and asks for an answer with what it has', async () => {
    const client = fakeClient((body, n) =>
      body.tool_choice?.type === 'none'
        ? answer('Here is what I found.')
        : toolCall('find_metrics', { query: `q${n}` }),
    )
    const events: AskEvent[] = []
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Loop',
      env: envOf(ctx),
      onEvent: (e) => events.push(e),
    })
    expect(r.status).toBe('done')
    expect(r.rounds).toBe(10)
    expect(r.roundLimited).toBe(true)
    expect(r.calls).toHaveLength(10)
    expect(client.log.bodies).toHaveLength(11)
    const last = client.log.bodies[10] as { tool_choice?: unknown; messages: BetaMessageParam[] }
    expect(last.tool_choice).toEqual({ type: 'none' })
    const blocks = lastUser(last).content as { type: string; text?: string }[]
    expect(blocks.at(-1)).toEqual({ type: 'text', text: ROUND_LIMIT_NOTE })
    expect(blocks.filter((b) => b.type === 'tool_result')).toHaveLength(1)
    expect(events.some((e) => e.type === 'round_limit')).toBe(true)
    expect(r.text).toBe('Here is what I found.')
  })

  it('never runs a tool call that comes after the limit, and keeps it out of the history', async () => {
    const conv = new Conversation()
    const client = fakeClient(() => toolCall('get_context', {}))
    const r = await ask({ client, conversation: conv, question: 'Loop', env: envOf(ctx), maxRounds: 2 })
    expect(r.status).toBe('done')
    expect(r.calls).toHaveLength(2)
    const last = conv.history.at(-1) as BetaMessageParam
    expect(last.role).toBe('user')
  })

  it('stops when Stop is pressed, leaving the history as it was', async () => {
    const conv = new Conversation()
    const stop = new AbortController()
    const client = fakeClient([answer('This answer is long enough to be cut off part way through.')], {
      pauseAfter: 4,
    })
    const events: AskEvent[] = []
    const pending = ask({
      client,
      conversation: conv,
      question: 'Long one',
      env: envOf(ctx),
      signal: stop.signal,
      onEvent: (e) => {
        events.push(e)
        if (e.type === 'text') stop.abort()
      },
    })
    const r = await pending
    expect(r.status).toBe('stopped')
    expect(r.error?.kind).toBe('stopped')
    expect(r.text.length).toBeGreaterThan(0)
    expect(conv.history).toEqual([])
    // The stopped request still counts: its input and the output streamed so far, marked partial.
    expect(r.usage).toEqual({
      input: 100,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      requests: 1,
      partial: true,
    })
    expect(conv.usage).toEqual(r.usage)
  })

  it('after a mid-output fallback, echoes and runs only what follows the boundary', async () => {
    const conv = new Conversation()
    const client = fakeClient([
      {
        blocks: [
          { type: 'thinking' },
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', name: 'get_context', input: {}, id: 'toolu_declined' },
          { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-5' },
          { type: 'tool_use', name: 'open_items', input: {}, id: 'toolu_kept' },
        ],
      },
      answer('There are open items.'),
    ])
    const r = await ask({ client, conversation: conv, question: 'What is open?', env: envOf(ctx) })
    expect(r.status).toBe('done')
    expect(r.calls.map((c) => c.id)).toEqual(['toolu_kept'])
    const second = client.log.bodies[1] as { messages: BetaMessageParam[] }
    const echoed = second.messages[1]?.content as { type: string; id?: string }[]
    expect(echoed.map((b) => b.type)).toEqual(['text', 'fallback', 'tool_use'])
    expect(echoed[2]?.id).toBe('toolu_kept')
    const results = lastUser(second).content as { type: string; tool_use_id: string }[]
    expect(results.map((b) => b.tool_use_id)).toEqual(['toolu_kept'])
    expect(conv.history).toHaveLength(4)
  })

  it('runs no further tool after Stop', async () => {
    const stop = new AbortController()
    const client = fakeClient([
      {
        blocks: [
          { type: 'tool_use', name: 'get_context', input: {} },
          { type: 'tool_use', name: 'open_items', input: {} },
        ],
      },
    ])
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Two tools',
      env: envOf(ctx),
      signal: stop.signal,
      onEvent: (e) => {
        if (e.type === 'tool_end') stop.abort()
      },
    })
    expect(r.status).toBe('stopped')
    expect(r.calls.map((c) => c.name)).toEqual(['get_context'])
  })

  it('drops a declined answer and says so in plain words', async () => {
    const conv = new Conversation()
    const client = fakeClient([{ blocks: [{ type: 'text', text: 'Partial' }], stop: 'refusal' }])
    const r = await ask({ client, conversation: conv, question: 'Something', env: envOf(ctx) })
    expect(r.status).toBe('error')
    expect(r.error?.kind).toBe('declined')
    expect(r.text).toBe('')
    expect(conv.history).toEqual([])
  })

  it('keeps an answer cut off at the length limit, and never runs a cut-off tool call', async () => {
    const cut = await ask({
      client: fakeClient([{ blocks: [{ type: 'text', text: 'Half an ans' }], stop: 'max_tokens' }]),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(cut).toMatchObject({ status: 'done', truncated: true, text: 'Half an ans' })
    const tool = await ask({
      client: fakeClient([
        { blocks: [{ type: 'tool_use', name: 'get_context', input: {} }], stop: 'max_tokens' },
      ]),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(tool.status).toBe('error')
    expect(tool.error?.kind).toBe('too_long')
    expect(tool.calls).toEqual([])
  })

  it('maps errors from the client to the plain-words cases', async () => {
    const http = (status: number) => Object.assign(new Error(`${status}`), { status })
    const cases: [Error, boolean | undefined, string][] = [
      [http(401), undefined, 'key'],
      [http(403), undefined, 'permission'],
      [http(404), undefined, 'model'],
      [http(429), undefined, 'rate_limited'],
      [http(529), undefined, 'overloaded'],
      [http(500), undefined, 'overloaded'],
      [http(400), undefined, 'bad_request'],
      [new TypeError('Failed to fetch'), true, 'blocked'],
      [new TypeError('Failed to fetch'), false, 'offline'],
      [Object.assign(new Error('mid-stream'), { type: 'overloaded_error' }), undefined, 'overloaded'],
    ]
    for (const [err, online, kind] of cases) {
      const conv = new Conversation()
      const r = await ask({
        client: fakeClient([err]),
        conversation: conv,
        question: 'Q',
        env: envOf(ctx),
        online: online == null ? undefined : () => online,
      })
      expect(r.status, kind).toBe('error')
      expect(r.error?.kind, `${err.message}`).toBe(kind)
      expect(r.error?.title).not.toMatch(/—/)
      expect(conv.history).toEqual([])
    }
  })
})

it('sends nothing for an empty question', async () => {
  const client = fakeClient([])
  const r = await ask({ client, conversation: new Conversation(), question: '   ', env: envOf(ctx) })
  expect(r.status).toBe('error')
  expect(r.error?.title).toBe('Type a question first.')
  expect(client.log.bodies).toEqual([])
})

describe('echoContent', () => {
  it('leaves out the declined part’s thinking and tool calls before the last fallback block', () => {
    const fb = (to: string) =>
      ({ type: 'fallback', from: { model: 'a' }, to: { model: to }, trigger: null }) as never
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'redacted_thinking', data: 'x' },
      { type: 'text', text: 'Partial', citations: null },
      { type: 'server_tool_use', id: 'srv_paired', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', tool_use_id: 'srv_paired', content: [] },
      { type: 'server_tool_use', id: 'srv_alone', name: 'web_search', input: {} },
      { type: 'tool_use', id: 'toolu_1', name: 'get_context', input: {} },
      fb('b'),
      { type: 'tool_use', id: 'toolu_2', name: 'get_context', input: {} },
      fb('c'),
      { type: 'thinking', thinking: '', signature: 's2' },
      { type: 'tool_use', id: 'toolu_3', name: 'open_items', input: {} },
    ] as never[]
    const out = echoContent(content) as unknown as { type: string; id?: string; signature?: string }[]
    expect(out.map((b) => b.id ?? b.signature ?? b.type)).toEqual([
      'text',
      'srv_paired',
      'web_search_tool_result',
      'fallback',
      'fallback',
      's2',
      'toolu_3',
    ])
    const plain = [{ type: 'thinking', thinking: '', signature: 's' }] as never[]
    expect(echoContent(plain)).toEqual(plain)
  })
})

describe('classifyError', () => {
  it('says what to do for each case', () => {
    expect(classifyError(new Error('x'), { aborted: true }).kind).toBe('stopped')
    expect(classifyError({ status: 401 })).toMatchObject({ kind: 'key', action: 'settings' })
    expect(classifyError({ status: 429 }).detail).toMatch(/tried again twice/)
    expect(classifyError({ status: 529 }).detail).toMatch(/tried again twice/)
    // An error inside a stream was not retried by the SDK, so it does not say so.
    const midStream = classifyError({ error: { type: 'error', error: { type: 'overloaded_error' } } })
    expect(midStream).toMatchObject({ kind: 'overloaded', title: 'Claude is busy right now.' })
    expect(midStream.detail).toBe('Try again in a minute.')
    // A 403 can be a working key without access to the model or feature: the key is not blamed.
    const denied = classifyError({ status: 403 })
    expect(denied).toMatchObject({ kind: 'permission', action: 'settings' })
    expect(denied.title).toBe('This key is not allowed to use this model or feature.')
    expect(denied.title).not.toMatch(/not accepted/)
    expect(classifyError(new Error('x'), { connection: true, online: true }).kind).toBe('blocked')
    expect(classifyError(new Error('x'), { connection: true, online: false }).kind).toBe('offline')
    expect(classifyError(new Error('bug')).kind).toBe('unknown')
    expect(classifyError({ error: { error: { type: 'authentication_error' } } }).kind).toBe('key')
  })

  it('keeps Anthropic’s own reason and request ID on every error it sent back', () => {
    const bad = classifyError({
      status: 400,
      requestID: 'req_011',
      error: {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'max_tokens: must be at least 1' },
      },
    })
    expect(bad).toMatchObject({
      kind: 'bad_request',
      status: 400,
      apiMessage: 'max_tokens: must be at least 1',
      requestId: 'req_011',
    })
    expect(bad.title).toBe('Anthropic turned down this request.')
    // A stream error carries the same body and the request ID in it.
    const mid = classifyError({
      error: {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
        request_id: 'req_022',
      },
    })
    expect(mid).toMatchObject({ kind: 'overloaded', apiMessage: 'Overloaded', requestId: 'req_022' })
    // No answer from Anthropic, no reason to show.
    const offline = classifyError(new Error('x'), { connection: true, online: false })
    expect(offline.apiMessage).toBeUndefined()
    expect(offline.status).toBeUndefined()
    // Long reasons are cut to a readable length.
    const long = classifyError({ status: 400, error: { error: { message: 'x'.repeat(900) } } })
    expect(long.apiMessage?.length).toBe(400)
  })
})

describe('ask with the real SDK reading scripted Server-Sent Events', () => {
  it('parses the stream, runs the tool loop and sends what the API expects', async () => {
    const f = fakeFetch([
      toolCall('compare_groups', {
        view: 'hrbp',
        kpi: 'voluntary',
        by: 'location',
        values: ['Bengaluru', 'Austin'],
      }),
      answer('Bengaluru is highest at [18.8%](ref:r2).'),
    ])
    const client = await createAnthropicClient(FAKE_KEY, { fetch: f })
    const conv = new Conversation()
    const r = await ask({
      client,
      conversation: conv,
      question: 'Where is attrition highest?',
      env: envOf(ctx),
    })
    expect(r.status).toBe('done')
    expect(r.text).toBe('Bengaluru is highest at [18.8%](ref:r2).')
    expect(r.calls).toHaveLength(1)
    expect(JSON.parse(r.calls[0]?.result as string).groups).toHaveLength(2)
    expect(f.calls).toHaveLength(2)
    const req = f.calls[0]
    expect(req?.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(req?.headers['x-api-key']).toBe(FAKE_KEY)
    expect(req?.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(req?.headers['anthropic-beta']).toContain(FALLBACK_BETA)
    expect(req?.body?.stream).toBe(true)
    expect(req?.body?.fallbacks).toBe('default')
    expect(req?.body?.betas).toBeUndefined()
    const second = f.calls[1]?.body as { messages: { role: string; content: unknown }[] }
    const results = second.messages.at(-1)?.content as { type: string; content: string }[]
    expect(results[0]?.content).toBe(r.calls[0]?.result)
    // The key appears in the request header only, never in a body.
    for (const c of f.calls) expect(JSON.stringify(c.body)).not.toContain(FAKE_KEY)
  })

  it('reports a key that is not accepted, and retries rate limits twice', async () => {
    const bad = fakeFetch([{ status: 401, type: 'authentication_error' }])
    const r = await ask({
      client: await createAnthropicClient(FAKE_KEY, { fetch: bad }),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(r.error?.kind).toBe('key')
    expect(bad.calls).toHaveLength(1)
    const busy = fakeFetch(
      [1, 2, 3].map(() => ({ status: 429, type: 'rate_limit_error', headers: { 'retry-after-ms': '1' } })),
    )
    const r2 = await ask({
      client: await createAnthropicClient(FAKE_KEY, { fetch: busy }),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(r2.error?.kind).toBe('rate_limited')
    expect(busy.calls).toHaveLength(3)
  })

  it('keeps the partial answer of a stream that fails part way, without claiming retries', async () => {
    const head = sseOf(answer('Partial'))
      .split('\n\n')
      .filter((e) => /message_start|content_block_start|content_block_delta/.test(e))
      .join('\n\n')
    const error = JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    })
    let calls = 0
    const f = (async () => {
      calls++
      return new Response(`${head}\n\nevent: error\ndata: ${error}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' },
      })
    }) as unknown as typeof fetch
    const r = await ask({
      client: await createAnthropicClient(FAKE_KEY, { fetch: f }),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(calls).toBe(1)
    expect(r.status).toBe('error')
    expect(r.error?.kind).toBe('overloaded')
    expect(r.error?.detail).toBe('Try again in a minute.')
    expect(r.text).toBe('Partial')
    expect(r.usage).toMatchObject({ input: 100, requests: 1, partial: true })
  })

  it('reads a fallback block from the stream and runs only the calls after it', async () => {
    const f = fakeFetch([
      {
        blocks: [
          { type: 'tool_use', name: 'get_context', input: {} },
          { type: 'fallback', from: 'claude-opus-5-5', to: 'claude-opus-5' },
          { type: 'tool_use', name: 'open_items', input: {} },
        ],
      },
      answer('Done.'),
    ])
    const r = await ask({
      client: await createAnthropicClient(FAKE_KEY, { fetch: f }),
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
    })
    expect(r.status).toBe('done')
    expect(r.calls.map((c) => c.name)).toEqual(['open_items'])
    const second = f.calls[1]?.body as { messages: { role: string; content: { type: string }[] }[] }
    expect(second.messages[1]?.content.map((b) => b.type)).toEqual(['fallback', 'tool_use'])
  })

  it('tells a blocked request from one offline', async () => {
    const nowhere = fakeFetch([])
    const client = await createAnthropicClient(FAKE_KEY, {
      fetch: nowhere,
      baseURL: 'https://blocked.invalid',
    })
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
      online: () => true,
    })
    expect(r.error?.kind).toBe('blocked')
    const r2 = await ask({
      client,
      conversation: new Conversation(),
      question: 'Q',
      env: envOf(ctx),
      online: () => false,
    })
    expect(r2.error?.kind).toBe('offline')
  }, 30_000)

  it('checks a key with one tiny request that also proves the account has API credits', async () => {
    const f = fakeFetch([])
    expect(await checkKey(FAKE_KEY, 'claude-opus-5-5', { fetch: f })).toEqual({ ok: true })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/)
    expect(f.calls[0]?.method).toBe('POST')
    expect(f.calls[0]?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 1,
      output_config: { effort: 'low' },
    })
    // Haiku 4.5 takes no effort setting.
    const h = fakeFetch([])
    await checkKey(FAKE_KEY, 'claude-haiku-4-5-20251001', { fetch: h })
    expect(h.calls[0]?.body).not.toHaveProperty('output_config')
  })

  it('reports an account with no API credits, with Anthropic’s own reason and the request ID', async () => {
    const billing =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
    const f = fakeFetch([{ status: 400, type: 'invalid_request_error', message: billing }])
    const r = await checkKey(FAKE_KEY, 'claude-sonnet-5-5', { fetch: f })
    expect(r.ok).toBe(false)
    const e = r.ok ? null : classifyError(r.error, { connection: r.connection })
    expect(e).toMatchObject({ kind: 'billing', status: 400, apiMessage: billing, requestId: 'req_test' })
    expect(e?.title).toBe('Your Anthropic account has no API credits left.')

    // The same through a question: the answer says why, not just "could not read this request".
    const q = fakeFetch([{ status: 400, type: 'invalid_request_error', message: billing }])
    const client = await createAnthropicClient(FAKE_KEY, { fetch: q })
    const res = await ask({
      client,
      conversation: new Conversation(),
      question: 'What team hires the slowest?',
      env: envOf(ctx),
      model: 'claude-sonnet-5-5',
    })
    expect(res.status).toBe('error')
    expect(res.error).toMatchObject({ kind: 'billing', apiMessage: billing, requestId: 'req_test' })
    expect(q.calls).toHaveLength(1)
  })
})
