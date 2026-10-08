/**
 * Ask through the team relay, end to end in the process: the real SDK as Census creates it (the
 * relay as its base URL, the passcode header, a placeholder key), the relay's own handler
 * (ask-relay/src/handler.ts) in place of the network, and a scripted Anthropic behind it. Checks
 * what each hop carries, that every request Ask builds passes the relay's rules, Check passcode,
 * and every error in plain words. Every key and passcode is fake; no request leaves the process.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { errorFacts, settingsErrorDetail, settingsFieldFor } from '@/ask/ui/model'
import type { AnalyticsContext } from '@/data/context'
import { checkBody, handleRelay, type Limiter, type RelayEnv, rulesOf } from '../../../ask-relay/src/handler'
import { memoryLimiter } from '../../../ask-relay/src/limiter'
import { checkKey, checkPasscode, clientForCredential, createAnthropicClient } from './client'
import { Conversation } from './conversation'
import { classifyError, errorLog, NO_PASSCODE } from './errors'
import { FAKE_KEY, type FakeFetchCall, fakeFetch, type Reply } from './fakeApi'
import { ask, buildRequest, MAX_TOKENS } from './loop'
import { MODELS } from './models'
import { PASSCODE_HEADER, RELAY_PLACEHOLDER_KEY } from './relay'
import { envOf, sampleCtx } from './testkit'
import { TOOL_DEFINITIONS } from './tools'

const TEAM_KEY = 'sk-ant-fake-team-key-0000'
const PASSCODE = 'fake-team-passcode-0000'
const RELAY = 'https://census-ask-relay.example.workers.dev'
const ORIGIN = 'https://unique-name27.github.io'
const ENV: RelayEnv = { ANTHROPIC_API_KEY: TEAM_KEY, CENSUS_PASSCODE: PASSCODE }

let ctx: AnalyticsContext
beforeAll(() => {
  ctx = sampleCtx()
}, 60_000)

const toolCall = (name: string, input: unknown): Reply => ({ blocks: [{ type: 'tool_use', name, input }] })
const answer = (text: string): Reply => ({ blocks: [{ type: 'text', text }] })

const allowAll: Limiter = { limit: async () => ({ success: true }) }

/**
 * A browser fetch whose network is the relay: each request the SDK makes goes to `handleRelay` with
 * the page's origin, and the relay's fetch is the scripted Anthropic. Records both hops.
 */
function throughRelay(
  anthropic: ReturnType<typeof fakeFetch>,
  o: { env?: RelayEnv; team?: Limiter; down?: boolean } = {},
) {
  const browser: FakeFetchCall[] = []
  const handled: Response[] = []
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v
    })
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    browser.push({ url, method: init?.method ?? 'GET', headers, body })
    if (o.down || !url.startsWith(`${RELAY}/`)) throw new TypeError('Failed to fetch')
    const h = new Headers(init?.headers)
    h.set('origin', ORIGIN)
    h.set('cf-connecting-ip', '203.0.113.9')
    const res = await handleRelay(new Request(url, { ...init, headers: h }), o.env ?? ENV, {
      fetch: anthropic,
      addressLimiter: allowAll,
      teamLimiter: o.team ?? allowAll,
    })
    handled.push(res)
    return res
  }
  return Object.assign(f, { browser, handled }) as typeof fetch & {
    browser: FakeFetchCall[]
    handled: Response[]
  }
}

const teamCred = { kind: 'team' as const, passcode: PASSCODE, kept: false, relayUrl: RELAY }

describe('Ask through the team relay', () => {
  it('runs the tool loop through the relay, which adds the team key and keeps the passcode', async () => {
    const anthropic = fakeFetch([toolCall('get_context', {}), answer('There are [1,450](ref:r1) people.')])
    const f = throughRelay(anthropic)
    const client = await clientForCredential(teamCred, { fetch: f, workspaceId: 'wrkspc_01ShouldNotGo' })
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'How many people?',
      env: envOf(ctx),
    })
    expect(r.status).toBe('done')
    expect(r.text).toBe('There are [1,450](ref:r1) people.')
    expect(f.browser).toHaveLength(2)
    expect(anthropic.calls).toHaveLength(2)
    for (const c of f.browser) {
      // Browser to relay: the relay's address, the passcode, a placeholder for a key, no workspace.
      expect(c.url).toBe(`${RELAY}/v1/messages?beta=true`)
      expect(c.headers[PASSCODE_HEADER]).toBe(PASSCODE)
      expect(c.headers['x-api-key']).toBe(RELAY_PLACEHOLDER_KEY)
      expect(c.headers).not.toHaveProperty('anthropic-workspace-id')
      expect(JSON.stringify(c)).not.toContain(TEAM_KEY)
      expect(JSON.stringify(c.body)).not.toContain(PASSCODE)
      expect(c.url).not.toContain(PASSCODE)
    }
    for (const c of anthropic.calls) {
      // Relay to Anthropic: the team key, the version and beta, and nothing else from the browser.
      expect(c.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
      expect(Object.keys(c.headers).sort()).toEqual([
        'anthropic-beta',
        'anthropic-version',
        'content-type',
        'x-api-key',
      ])
      expect(c.headers['x-api-key']).toBe(TEAM_KEY)
      expect(JSON.stringify(c)).not.toContain(PASSCODE)
      expect(JSON.stringify(c)).not.toContain('wrkspc_')
    }
    // The body reaches Anthropic exactly as the SDK sent it.
    expect(anthropic.calls.map((c) => c.body)).toEqual(f.browser.map((c) => c.body))
    expect(client.viaRelay).toBe(true)
    expect(client.sendsWorkspaceId).toBe(false)
  })

  it('without a relay, works as it always has: the own key and workspace ID, straight to Anthropic', async () => {
    const anthropic = fakeFetch([answer('Done.')])
    const client = await clientForCredential(
      { kind: 'own', key: FAKE_KEY, kept: false },
      { fetch: anthropic, workspaceId: 'wrkspc_01TestFake' },
    )
    await ask({ client, conversation: new Conversation(), question: 'Q', env: envOf(ctx) })
    expect(anthropic.calls[0]?.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(anthropic.calls[0]?.headers['x-api-key']).toBe(FAKE_KEY)
    expect(anthropic.calls[0]?.headers['anthropic-workspace-id']).toBe('wrkspc_01TestFake')
    expect(anthropic.calls[0]?.headers).not.toHaveProperty(PASSCODE_HEADER)
    expect(client.viaRelay).toBe(false)
  })

  it('builds only requests the relay passes on, for every model, with tools or the final answer', () => {
    const rules = rulesOf({})
    const messages = [{ role: 'user' as const, content: 'Q' }]
    for (const m of MODELS)
      for (const final of [false, true]) {
        // The SDK moves `betas` to the anthropic-beta header and adds `stream`.
        const { betas: _betas, ...body } = buildRequest(m.id, messages, final)
        expect(checkBody({ ...body, stream: true }, rules), `${m.id} ${final}`).toBeNull()
      }
    expect(MAX_TOKENS).toBeLessThanOrEqual(rules.maxTokens)
    for (const t of TOOL_DEFINITIONS) expect(t.type ?? 'custom').toBe('custom')
  })

  it('checks the passcode with one tiny request through the relay', async () => {
    const anthropic = fakeFetch([])
    const f = throughRelay(anthropic)
    expect(await checkPasscode(PASSCODE, RELAY, 'claude-opus-5-5', { fetch: f })).toEqual({ ok: true })
    expect(f.browser).toHaveLength(1)
    expect(f.browser[0]?.url).toBe(`${RELAY}/v1/messages`)
    expect(f.browser[0]?.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 1 })
    expect(anthropic.calls[0]?.headers['x-api-key']).toBe(TEAM_KEY)
    for (const m of MODELS) {
      const g = throughRelay(fakeFetch([]))
      expect(await checkPasscode(PASSCODE, RELAY, m.id, { fetch: g })).toEqual({ ok: true })
    }
  })
})

/** What Ask and Check passcode say for a relay's answer, in plain words. */
async function viaRelay(
  anthropicScript: Parameters<typeof fakeFetch>[0],
  o: Parameters<typeof throughRelay>[1] & { passcode?: string; model?: (typeof MODELS)[number]['id'] } = {},
) {
  const anthropic = fakeFetch(anthropicScript)
  const f = throughRelay(anthropic, o)
  const cred = { ...teamCred, passcode: o.passcode ?? PASSCODE }
  const r = await ask({
    client: await clientForCredential(cred, { fetch: f }),
    conversation: new Conversation(),
    question: 'Q',
    env: envOf(ctx),
    ...(o.model ? { model: o.model } : {}),
  })
  const g = throughRelay(fakeFetch(anthropicScript), o)
  const c = await checkPasscode(cred.passcode, RELAY, o.model ?? 'claude-opus-5-5', { fetch: g })
  const checked = c.ok ? null : classifyError(c.error, { connection: c.connection, relay: c.relay })
  return { error: r.error, checked, browser: f.browser, anthropic: anthropic.calls }
}

describe('errors through the team relay, in plain words', () => {
  it('a wrong or missing passcode: nothing reaches Anthropic, and Settings opens on the field', async () => {
    const { error, checked, anthropic } = await viaRelay([answer('x')], { passcode: 'wrong-passcode-0000' })
    expect(anthropic).toHaveLength(0)
    expect(error).toMatchObject({
      kind: 'passcode',
      title: 'The team passcode was not accepted.',
      action: 'settings',
      status: 401,
      viaRelay: true,
      byRelay: true,
    })
    expect(checked).toMatchObject({ kind: 'passcode', title: 'The team passcode was not accepted.' })
    expect(settingsFieldFor(error!)).toBe('ask-passcode')
    expect(settingsErrorDetail(error!)).toBe(
      'Check the passcode above, or ask whoever runs the relay for the current one.',
    )
    // The relay's words only repeat the title, so the facts line says where it came from.
    expect(errorFacts(error!)).toBe('From the team relay (HTTP 401).')
    expect(settingsFieldFor(NO_PASSCODE)).toBe('ask-passcode')
    const missing = await viaRelay([answer('x')], { passcode: ' ' })
    expect(missing.error).toMatchObject({ kind: 'passcode' })
    expect(errorFacts(missing.error!)).toBe('The team relay said: “Ask needs the team passcode.” (HTTP 401)')
  })

  it('the relay’s rate limit: said once, with no retries that would only count against it', async () => {
    const team = memoryLimiter(0)
    const { error, checked, browser } = await viaRelay([answer('x')], { team })
    expect(browser).toHaveLength(1)
    expect(error).toMatchObject({
      kind: 'rate_limited',
      title: 'Too many requests through the team relay.',
      detail:
        'The relay takes a set number of requests a minute from each computer. Wait a minute, then ask again.',
      action: 'retry',
      status: 429,
    })
    expect(checked?.kind).toBe('rate_limited')
  })

  it('a relay that cannot be reached, and a computer that is offline', async () => {
    const { error, checked } = await viaRelay([answer('x')], { down: true })
    expect(error).toMatchObject({
      kind: 'relay',
      title: 'The team relay could not be reached.',
      detail: 'Check your connection and try again. If it keeps happening, tell whoever runs the relay.',
      action: 'retry',
      viaRelay: true,
    })
    expect(error?.byRelay).toBeUndefined()
    expect(checked?.title).toBe('The team relay could not be reached.')
    expect(errorFacts(error!)).toBeNull()
    expect(classifyError(new TypeError('Failed to fetch'), { relay: true, online: false }).kind).toBe(
      'offline',
    )
  })

  it('the relay’s own rules: not set up, a model it does not offer, an address it does not accept', async () => {
    const unset = await viaRelay([answer('x')], { env: { ANTHROPIC_API_KEY: TEAM_KEY } })
    expect(unset.error).toMatchObject({
      kind: 'relay',
      title: 'The team relay is not set up yet.',
      action: null,
    })
    expect(errorFacts(unset.error!)).toBe(
      'The team relay said: “The relay has no passcode yet. Set CENSUS_PASSCODE with wrangler secret put.” (HTTP 500)',
    )
    // One request only: the relay says not to try again.
    expect(unset.browser).toHaveLength(1)
    const narrow = await viaRelay([answer('x')], {
      env: { ...ENV, ALLOWED_MODELS: 'claude-haiku-4-5-20251001' },
      model: 'claude-sonnet-5-5',
    })
    expect(narrow.error).toMatchObject({ kind: 'model', title: 'The team relay does not offer this model.' })
    expect(settingsErrorDetail(narrow.error!)).toBe('Pick another model below.')
    const elsewhere = await viaRelay([answer('x')], {
      env: { ...ENV, ALLOWED_ORIGINS: 'https://hr.example.com' },
    })
    // A refused origin gets no CORS headers, so a browser sees no answer at all; the test hop reads it.
    expect(elsewhere.error).toMatchObject({
      kind: 'relay',
      title: 'The team relay does not accept requests from this address.',
    })
  })

  it('Anthropic’s answers about the team’s key, credits and limits name the team, not "your key"', async () => {
    const cases: [{ status: number; type: string; message?: string }, Record<string, unknown>][] = [
      [
        { status: 401, type: 'authentication_error', message: 'invalid x-api-key' },
        { kind: 'relay', title: 'The team’s API key was not accepted.', action: null },
      ],
      [
        {
          status: 400,
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
        { kind: 'billing', title: 'The team’s Anthropic account has no API credits left.' },
      ],
      [
        {
          status: 400,
          type: 'invalid_request_error',
          message:
            'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01.',
        },
        { kind: 'billing', title: 'The team has reached its spend limit for now.' },
      ],
      [
        { status: 403, type: 'permission_error', message: 'Not allowed' },
        { kind: 'permission', title: 'The team’s key is not allowed to use this model or feature.' },
      ],
      [
        { status: 404, type: 'not_found_error', message: 'model: claude-opus-5-5' },
        { kind: 'model', title: 'This model is not available to the team’s key.' },
      ],
      [
        {
          status: 400,
          type: 'invalid_request_error',
          message: 'messages: text content blocks must be non-empty',
        },
        { kind: 'bad_request', title: 'Anthropic turned down this request.' },
      ],
      [
        {
          status: 400,
          type: 'invalid_request_error',
          message:
            'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header.',
        },
        { kind: 'bad_request', title: 'Anthropic turned down this request.' },
      ],
    ]
    for (const [step, expected] of cases) {
      const { error, checked } = await viaRelay([step])
      expect(error, step.message).toMatchObject({ ...expected, status: step.status, viaRelay: true })
      expect(error?.byRelay).toBeUndefined()
      expect(error?.apiMessage).toBe(step.message)
      expect(errorFacts(error!)).toMatch(/^Anthropic said: /)
      expect(checked, step.message).toMatchObject(expected)
    }
    const { error } = await viaRelay([{ status: 403, type: 'permission_error' }])
    expect(settingsErrorDetail(error!)).toBe('Pick another model below, or tell whoever runs the team relay.')
  })

  it('a rate limit or overload at Anthropic is retried by the SDK through the relay, then said plainly', async () => {
    const step = {
      status: 429,
      type: 'rate_limit_error',
      message: 'Rate limited',
      headers: { 'retry-after': '0' },
    }
    const { error, anthropic } = await viaRelay([step, step, step])
    expect(anthropic).toHaveLength(3)
    expect(error).toMatchObject({
      kind: 'rate_limited',
      title: 'Claude is getting too many requests from the team.',
      detail: 'Census tried again twice. Try again in a minute.',
    })
  })

  it('never puts the passcode or the team key in what the console logs', async () => {
    for (const passcode of [PASSCODE, 'wrong-passcode-0000']) {
      const anthropic = fakeFetch([
        { status: 401, type: 'authentication_error', message: 'invalid x-api-key' },
      ])
      const f = throughRelay(anthropic)
      const c = await checkKey(RELAY_PLACEHOLDER_KEY, 'claude-opus-5-5', {
        fetch: f,
        relay: { url: RELAY, passcode },
      })
      expect(c.ok).toBe(false)
      if (c.ok) continue
      const logged = JSON.stringify(errorLog(c.error))
      expect(logged).not.toContain(passcode)
      expect(logged).not.toContain(TEAM_KEY)
      const shown = JSON.stringify(classifyError(c.error, { relay: true }))
      expect(shown).not.toContain(passcode)
      expect(shown).not.toContain(TEAM_KEY)
    }
  })

  it('is told the request went through the relay by the client', async () => {
    const client = await createAnthropicClient(FAKE_KEY, {
      fetch: fakeFetch([]),
      relay: { url: RELAY, passcode: PASSCODE },
      workspaceId: 'wrkspc_01ShouldNotGo',
    })
    expect(client.viaRelay).toBe(true)
    expect(client.sendsWorkspaceId).toBe(false)
  })
})
