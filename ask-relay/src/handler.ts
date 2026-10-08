/**
 * The Census Ask relay's request rules (docs/ASK-RELAY.md). The relay holds the team's Claude API key
 * so that nobody's browser needs one: Census sends Ask's requests here with the team passcode, and
 * the relay passes them on to Anthropic under the key.
 *
 * What it accepts, in the order it checks:
 *
 *  1. Only `/v1/messages` (with `?beta=true` or no query, as the SDK sends it). Anything else: 404.
 *  2. Only POST, and the CORS preflight (OPTIONS) before it. Any other method: 405.
 *  3. Only the Census origins (`ALLOWED_ORIGINS`, http and https origins only: "null", "*" and
 *     file addresses are never allowed). Any other origin, or none: 403 with no CORS headers.
 *  4. Only when its secrets are set (`ANTHROPIC_API_KEY`, and `CENSUS_PASSCODE` of at least 12
 *     characters). Otherwise: 500, saying which is missing and never what either holds.
 *  5. At most `ADDRESS_REQUESTS_PER_MINUTE` requests a minute from one client address (an IPv6
 *     address counted by its /64 network), before the passcode is looked at, so guessing it is slow
 *     too. Over: 429.
 *  6. The team passcode in the `x-census-passcode` header, compared in constant time (both sides are
 *     hashed first, so the length does not show either). Missing or wrong: 401.
 *  7. At most `REQUESTS_PER_MINUTE` requests a minute per passcode and client address. Over: 429.
 *  8. `anthropic-version` as a date, and only the betas Ask uses in `anthropic-beta`. Else: 400.
 *  9. A JSON body of at most `MAX_BODY_BYTES` (413), with only the fields Ask sends, a model Ask
 *     offers (`ALLOWED_MODELS`), `max_tokens` from 1 to `MAX_TOKENS`, Census's own tools (no
 *     server tools), and only the content blocks Ask sends (`BLOCK_TYPES`: no images, documents or
 *     anything else Anthropic would fetch from an address or a file). Else: 400.
 *
 * Then it sends the body it checked, written out again from the parsed object (never the text as it
 * came, so a key given twice cannot carry a value the checks did not see), with `x-api-key` set from
 * the secret. No header the browser sent goes on but `anthropic-version` and `anthropic-beta`: a
 * key, an authorization, a workspace ID, cookies and the passcode all stay here. Anthropic's answer
 * streams back as it comes, with CORS headers for the Census origin and only the response headers
 * the SDK reads; any copy of the key or the passcode in it is hidden as it passes (only a few
 * characters that could start one wait for the next chunk). An error answer is small, so it is read
 * whole, and copies of the secrets and organization IDs in it are hidden. Anthropic does not echo
 * the secrets; this is a second guard.
 *
 * The relay's own errors are shaped like Anthropic's (`{ type: 'error', error: { type, message } }`),
 * with types that start `relay_`, so Census can tell them apart and say what to do in plain words.
 * It logs one line per request (what happened, the status, the model), never a body, a key, a
 * passcode or an address.
 *
 * Pure but for `crypto.subtle`: the fetch, the rate limiters and the log are passed in, so the
 * Census test suite runs it with fakes (ask-relay/test/handler.test.ts).
 */

/** A rate limiter: Cloudflare's rate limiting binding has this shape, and so does `memoryLimiter`. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** The relay's settings: secrets (`wrangler secret put`) and vars (wrangler.toml). */
export interface RelayEnv {
  /** Secret: the team's Claude API key. */
  ANTHROPIC_API_KEY?: string
  /** Secret: the team passcode. */
  CENSUS_PASSCODE?: string
  /** Comma-separated origins that may call the relay. */
  ALLOWED_ORIGINS?: string
  /** Comma-separated model IDs the relay passes on. */
  ALLOWED_MODELS?: string
  /** Comma-separated `anthropic-beta` values the relay passes on. */
  ALLOWED_BETAS?: string
  /** The largest `max_tokens` the relay passes on. */
  MAX_TOKENS?: string
  /** The largest request body, in bytes. */
  MAX_BODY_BYTES?: string
}

export interface RelayLogLine {
  outcome:
    | 'forwarded'
    | 'preflight'
    | 'not_found'
    | 'method'
    | 'origin'
    | 'config'
    | 'rate_limited'
    | 'passcode'
    | 'invalid'
    | 'too_large'
    | 'upstream_unreachable'
    | 'limiter_failed'
  status: number
  model?: string
}

export interface RelayDeps {
  /** The fetch that reaches Anthropic. */
  fetch: typeof fetch
  /** Every POST from one client address, counted before the passcode is checked. */
  addressLimiter: Limiter
  /** Requests with the right passcode, per passcode and client address. */
  teamLimiter: Limiter
  /** One line per request; the worker passes console.log. */
  log?: (line: RelayLogLine) => void
  /** Counts wrong passcodes and locks guessing out (per address, and for everyone). */
  lockout?: Lockout
}

/** Wrong-passcode lockout: `locked` is read before the passcode is checked, `fail` after a wrong one. */
export interface Lockout {
  locked(key: string): boolean
  fail(key: string): void
}

export const PASSCODE_HEADER = 'x-census-passcode'
export const UPSTREAM_URL = 'https://api.anthropic.com/v1/messages'
/**
 * The team chooses the passcode; a short one is allowed (the user chose a 4-digit one knowingly).
 * Guessing is slowed by the address limit and stopped by the wrong-passcode lockout, and the spend
 * limit on the Claude Console workspace is the backstop.
 */
export const MIN_PASSCODE_LENGTH = 4
/** Wrong passcodes from one address before it is locked out, and for how long. */
export const WRONG_PER_ADDRESS = 10
/** Wrong passcodes from every address together before the relay stops checking any, and for how long. */
export const WRONG_FOR_ALL = 50
export const LOCKOUT_MS = 15 * 60_000
const LOCKED = 'Too many wrong passcodes. Try again in 15 minutes.'
/** The longest Anthropic error body the relay reads; a longer one is cut. */
const ERROR_BODY_LIMIT = 64 * 1024

/**
 * What wrangler.toml sets too; used when a var is missing or blank. The deployed relay allows only
 * the published site: the dev server is allowed only by a relay run on this computer
 * (`npx wrangler dev --env local`, docs/ASK-RELAY.md).
 */
export const DEFAULTS = {
  origins: ['https://unique-name27.github.io'],
  models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001'],
  betas: ['server-side-fallback-2026-07-01'],
  maxTokens: 4096,
  maxBodyBytes: 2_000_000,
} as const

/** The fields of a request body Ask sends; any other is refused (`speed`, `mcp_servers`, ...). */
export const BODY_FIELDS: readonly string[] = [
  'model',
  'max_tokens',
  'messages',
  'system',
  'tools',
  'tool_choice',
  'stream',
  'cache_control',
  'output_config',
  'fallbacks',
]

/**
 * The content block types Ask sends and sends back: its question and notes, the model's tool calls
 * and Census's results, the model's own thinking, and the markers a server-side fallback leaves.
 * Any other (an image, a document, a search result, a file) is refused: Ask never sends one, and a
 * block whose source is an address or a file would let a request cost far more than its size.
 */
export const BLOCK_TYPES: readonly string[] = [
  'text',
  'tool_use',
  'tool_result',
  'thinking',
  'redacted_thinking',
  'fallback',
]

/** The response headers that go back to the browser (the SDK reads these). */
export const RESPONSE_HEADERS: readonly string[] = [
  'content-type',
  'request-id',
  'retry-after',
  'retry-after-ms',
  'x-should-retry',
]

export interface RelayRules {
  origins: ReadonlySet<string>
  models: ReadonlySet<string>
  betas: ReadonlySet<string>
  maxTokens: number
  maxBodyBytes: number
}

const list = (v: string | undefined, fallback: readonly string[]): Set<string> => {
  const items = (v ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return new Set(items.length ? items : fallback)
}

const whole = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return v?.trim() && Number.isInteger(n) && n > 0 ? n : fallback
}

/**
 * An allowed origin as a browser sends it (`https://host[:port]`), or null for anything that is not
 * an http or https origin: "null" (sent by sandboxed frames on any site and by files opened from a
 * computer), "*", a file address, or an address with a path, user name, query or fragment.
 */
export function originOf(item: string): string | null {
  let u: URL
  try {
    u = new URL(item.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null
  return u.origin
}

/** The allowed origins: the valid ones of the setting, or the defaults when it has none. */
function originList(v: string | undefined): Set<string> {
  const items = (v ?? '')
    .split(',')
    .map((s) => (s.trim() ? originOf(s) : null))
    .filter((o): o is string => o !== null)
  return new Set(items.length ? items : DEFAULTS.origins)
}

/** The rules in force for these settings. */
export function rulesOf(env: RelayEnv): RelayRules {
  return {
    origins: originList(env.ALLOWED_ORIGINS),
    models: list(env.ALLOWED_MODELS, DEFAULTS.models),
    betas: list(env.ALLOWED_BETAS, DEFAULTS.betas),
    maxTokens: whole(env.MAX_TOKENS, DEFAULTS.maxTokens),
    maxBodyBytes: whole(env.MAX_BODY_BYTES, DEFAULTS.maxBodyBytes),
  }
}

export type RelayErrorType =
  | 'relay_not_found_error'
  | 'relay_method_error'
  | 'relay_origin_error'
  | 'relay_config_error'
  | 'relay_rate_limit_error'
  | 'relay_passcode_error'
  | 'relay_request_error'
  | 'relay_model_error'
  | 'relay_too_large_error'
  | 'relay_upstream_error'

/** The CORS headers on every answer to an allowed origin. */
function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-expose-headers': RESPONSE_HEADERS.filter((h) => h !== 'content-type').join(', '),
    vary: 'Origin',
  }
}

/** An error the relay answers itself, shaped like Anthropic's so the SDK reads it. */
function relayError(
  status: number,
  type: RelayErrorType,
  message: string,
  cors: Record<string, string> | null,
  extra: Record<string, string> = {},
): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...(cors ?? {}),
    ...extra,
  })
  // The SDK would retry a 429 or a 5xx; trying again at once does not help with any of these, except
  // when Anthropic could not be reached.
  if (type !== 'relay_upstream_error') headers.set('x-should-retry', 'false')
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers })
}

const ONLY = 'The relay accepts only Ask Census requests: POST /v1/messages.'

/** Header names the preflight may allow: the browser lists them; a name with odd characters is left out. */
function allowedHeaderNames(requested: string | null): string {
  return (requested ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(h))
    .slice(0, 50)
    .join(', ')
}

const bytes = (s: string) => new TextEncoder().encode(s)

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(s)))
}

type TimingSafe = SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean }

/**
 * Whether the passcode sent is the team's, in constant time: both are hashed to 32 bytes first, so
 * the comparison takes as long whatever was sent, and Cloudflare's `timingSafeEqual` compares the
 * hashes where it exists (a loop that never stops early elsewhere). Also gives the passcode's
 * fingerprint (the first 8 bytes of its hash, in hex) for the rate limit key.
 */
export async function checkPasscode(
  given: string | null,
  secret: string,
): Promise<{ ok: boolean; fingerprint: string }> {
  const [a, b] = await Promise.all([sha256(given ?? ''), sha256(secret)])
  const subtle = crypto.subtle as TimingSafe
  let same: boolean
  if (typeof subtle.timingSafeEqual === 'function') same = subtle.timingSafeEqual(a, b)
  else {
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
    same = diff === 0
  }
  const fingerprint = [...b.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('')
  return { ok: same && !!given, fingerprint }
}

export interface Problem {
  status: number
  type: RelayErrorType
  message: string
}

const bad = (message: string, type: RelayErrorType = 'relay_request_error'): Problem => ({
  status: 400,
  type,
  message,
})

/** A value from the request, safe to repeat in an error message. */
const shown = (v: unknown): string =>
  String(v)
    .replace(/[^\w.:-]/g, '')
    .slice(0, 60) || 'that value'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The request headers the relay passes on, or why it refuses them. */
export function checkHeaders(
  headers: Headers,
  rules: RelayRules,
): { version: string; beta: string | null } | Problem {
  const version = headers.get('anthropic-version')?.trim() || '2023-06-01'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return bad('The anthropic-version header is not a date.')
  const betas = (headers.get('anthropic-beta') ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean)
  const other = betas.find((b) => !rules.betas.has(b))
  if (other) return bad(`The relay does not pass on the beta ${shown(other)}.`)
  return { version, beta: betas.length ? betas.join(',') : null }
}

const NOT_CONTENT = 'Message content must be text or a list of blocks.'

/** Why the relay refuses a message's content (text, or blocks of the types allowed), or null. */
function contentProblem(content: unknown, types: readonly string[]): Problem | null {
  if (typeof content === 'string') return null
  if (!Array.isArray(content)) return bad(NOT_CONTENT)
  for (const block of content) {
    if (!isObject(block)) return bad(NOT_CONTENT)
    if (typeof block.type !== 'string') return bad('Each block of content needs a type.')
    if (!types.includes(block.type))
      return bad(`The relay does not pass on content of the type ${shown(block.type)}.`)
    // A tool result holds Census's own text: never an image or a document.
    if (block.type === 'tool_result' && 'content' in block) {
      const inner = contentProblem(block.content, ['text'])
      if (inner) return inner
    }
  }
  return null
}

/** Why the relay refuses the messages (a user or assistant role and content, nothing else), or null. */
function messagesProblem(messages: unknown): Problem | null {
  if (!Array.isArray(messages) || !messages.length) return bad('messages must be a list of messages.')
  for (const m of messages) {
    if (!isObject(m) || Object.keys(m).some((k) => k !== 'role' && k !== 'content'))
      return bad('messages must be a list of messages.')
    if (m.role !== 'user' && m.role !== 'assistant')
      return bad('A message must be from the user or the assistant.')
    const p = contentProblem(m.content, BLOCK_TYPES)
    if (p) return p
  }
  return null
}

/** Why the relay refuses a request body, or null when it passes it on. */
export function checkBody(body: unknown, rules: RelayRules): Problem | null {
  if (!isObject(body)) return bad('The request body is not a JSON object.')
  const extra = Object.keys(body).find((k) => !BODY_FIELDS.includes(k))
  if (extra) return bad(`The relay does not pass on the field ${shown(extra)}.`)
  if (typeof body.model !== 'string' || !rules.models.has(body.model))
    return bad(`The relay does not offer the model ${shown(body.model)}.`, 'relay_model_error')
  const max = body.max_tokens
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > rules.maxTokens)
    return bad(`max_tokens must be a whole number from 1 to ${rules.maxTokens}.`)
  const messages = messagesProblem(body.messages)
  if (messages) return messages
  if ('stream' in body && typeof body.stream !== 'boolean') return bad('stream must be true or false.')
  if (
    'system' in body &&
    typeof body.system !== 'string' &&
    !(Array.isArray(body.system) && body.system.every((b) => isObject(b) && b.type === 'text'))
  )
    return bad('system must be text or a list of text blocks.')
  if ('tools' in body) {
    if (!Array.isArray(body.tools)) return bad('tools must be a list.')
    // Census's own tools only: a server tool (web search, code execution, ...) costs extra.
    if (!body.tools.every((t) => isObject(t) && (t.type === undefined || t.type === 'custom')))
      return bad('The relay passes on only Census’s own tools.')
  }
  if ('tool_choice' in body) {
    const c = body.tool_choice
    if (!isObject(c) || (c.type !== 'auto' && c.type !== 'none'))
      return bad('tool_choice must be auto or none.')
  }
  if ('output_config' in body) {
    const o = body.output_config
    if (!isObject(o) || Object.keys(o).some((k) => k !== 'effort'))
      return bad('output_config may only set effort.')
    if ('effort' in o && !['low', 'medium', 'high'].includes(o.effort as string))
      return bad('effort must be low, medium or high.')
  }
  if ('fallbacks' in body && body.fallbacks !== 'default') return bad('fallbacks must be default.')
  if ('cache_control' in body) {
    const c = body.cache_control
    if (!isObject(c) || c.type !== 'ephemeral' || Object.keys(c).length !== 1)
      return bad('cache_control must be ephemeral.')
  }
  return null
}

/** The request body as text, or null when it is larger than `cap` bytes. */
async function readCapped(request: Request, cap: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > cap) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

/** The start of an error body (at most `ERROR_BODY_LIMIT` bytes). */
async function errorText(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    if (text.length > ERROR_BODY_LIMIT) {
      await reader.cancel().catch(() => {})
      return text.slice(0, ERROR_BODY_LIMIT)
    }
  }
  return text + decoder.decode()
}

const HIDDEN = '[hidden]'

/** The secrets worth hiding: set, and long enough that hiding them cannot garble an answer. */
const hideable = (secrets: readonly (string | undefined)[]): string[] =>
  secrets.filter((s): s is string => !!s && s.length >= 4)

/** The text with every copy of each secret replaced. */
export function hideSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text
  for (const s of hideable(secrets)) out = out.split(s).join(HIDDEN)
  return out
}

/** Anthropic's organization IDs (UUIDs) in an error, such as a rate limit message names. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/** An error body as it goes back: secrets and organization IDs hidden. */
export function hideInError(text: string, secrets: readonly (string | undefined)[]): string {
  return hideSecrets(text, secrets).replace(UUID, HIDDEN)
}

/** How many characters at the end of the text could be the start of the secret (0 when none). */
function startOfSecretAtEnd(text: string, secret: string): number {
  const first = secret.charCodeAt(0)
  for (let i = Math.max(0, text.length - secret.length + 1); i < text.length; i++)
    if (text.charCodeAt(i) === first && secret.startsWith(text.slice(i))) return text.length - i
  return 0
}

/**
 * A stream that hides every copy of the secrets in the bytes that pass through it, even one split
 * between chunks. Everything goes on at once except the few characters at the end of a chunk that
 * could start a secret, which wait for the next chunk (an event of the answer ends with a blank
 * line, which starts no secret, so events are not held up).
 */
export function hidingStream(
  secrets: readonly (string | undefined)[],
): TransformStream<Uint8Array, Uint8Array> {
  const list = hideable(secrets)
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let held = ''
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = hideSecrets(held + decoder.decode(chunk, { stream: true }), list)
      const keep = Math.max(0, ...list.map((s) => startOfSecretAtEnd(text, s)))
      held = text.slice(text.length - keep)
      const out = text.slice(0, text.length - keep)
      if (out) controller.enqueue(encoder.encode(out))
    },
    flush(controller) {
      const text = hideSecrets(held + decoder.decode(), list)
      if (text) controller.enqueue(encoder.encode(text))
    },
  })
}

/** An IPv6 address as its eight 16-bit groups, or null when it is not one. */
function ipv6Groups(ip: string): number[] | null {
  const halves = (ip.split('%')[0] ?? '').split('::')
  if (halves.length > 2) return null
  const groups = (part: string): number[] | null => {
    if (!part) return []
    const out: number[] = []
    const items = part.split(':')
    for (let i = 0; i < items.length; i++) {
      const item = items[i] ?? ''
      if (i === items.length - 1 && item.includes('.')) {
        const q = item.split('.')
        if (q.length !== 4 || !q.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)) return null
        const [a, b, c, d] = q.map(Number) as [number, number, number, number]
        out.push((a << 8) | b, (c << 8) | d)
      } else if (/^[0-9a-f]{1,4}$/.test(item)) out.push(Number.parseInt(item, 16))
      else return null
    }
    return out
  }
  const head = groups(halves[0] ?? '')
  const tail = groups(halves[1] ?? '')
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  return fill >= 1 ? [...head, ...new Array<number>(fill).fill(0), ...tail] : null
}

/**
 * The client address as the rate limits count it: an IPv4 address as it is, and an IPv6 address by
 * its /64 network (one home or server line usually holds a whole /64, so a new address from it does
 * not start a new count). An IPv4 address written as IPv6 counts as that IPv4 address. Cloudflare
 * always sends the address (`CF-Connecting-IP`); without one, every such request shares one count.
 */
export function addressKey(raw: string | null | undefined): string {
  const ip = (raw ?? '').trim().toLowerCase()
  if (!ip) return 'unknown'
  if (!ip.includes(':')) return ip.slice(0, 64)
  const g = ipv6Groups(ip)
  if (!g) return ip.slice(0, 64)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const [hi = 0, lo = 0] = g.slice(6)
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`
}

/** Whether a limiter lets this one through; a limiter that fails lets it through (the spend limit is the backstop). */
async function allowed(limiter: Limiter, key: string, log: (l: RelayLogLine) => void): Promise<boolean> {
  try {
    return (await limiter.limit({ key })).success
  } catch {
    log({ outcome: 'limiter_failed', status: 0 })
    return true
  }
}

const TOO_MANY = 'Too many requests in the last minute. Wait a minute and try again.'

/** Answer one request (the worker's fetch handler, with its dependencies passed in). */
export async function handleRelay(request: Request, env: RelayEnv, deps: RelayDeps): Promise<Response> {
  const log = deps.log ?? (() => {})
  const rules = rulesOf(env)
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const cors = origin && rules.origins.has(origin) ? corsHeaders(origin) : null
  const done = (res: Response, outcome: RelayLogLine['outcome'], model?: string): Response => {
    log({ outcome, status: res.status, ...(model ? { model } : {}) })
    return res
  }

  // 1, 2: the one path and method.
  if (url.pathname !== '/v1/messages' || (url.search !== '' && url.search !== '?beta=true'))
    return done(relayError(404, 'relay_not_found_error', ONLY, cors), 'not_found')
  if (request.method !== 'POST' && request.method !== 'OPTIONS')
    return done(relayError(405, 'relay_method_error', ONLY, cors, { allow: 'POST, OPTIONS' }), 'method')

  // 3: only the Census origins, and no CORS headers for any other.
  if (!cors)
    return done(
      relayError(403, 'relay_origin_error', 'The relay does not accept requests from this address.', null),
      'origin',
    )
  if (request.method === 'OPTIONS')
    return done(
      new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': allowedHeaderNames(
            request.headers.get('access-control-request-headers'),
          ),
          'access-control-max-age': '600',
          vary: 'Origin, Access-Control-Request-Headers',
        },
      }),
      'preflight',
    )

  // 4: the secrets are set.
  const key = env.ANTHROPIC_API_KEY?.trim()
  const secret = env.CENSUS_PASSCODE?.trim()
  const unset = !key
    ? 'The relay has no API key yet. Set ANTHROPIC_API_KEY with wrangler secret put.'
    : !secret
      ? 'The relay has no passcode yet. Set CENSUS_PASSCODE with wrangler secret put.'
      : secret.length < MIN_PASSCODE_LENGTH
        ? `The relay’s passcode is too short. Set one of at least ${MIN_PASSCODE_LENGTH} characters.`
        : null
  if (unset || !key || !secret)
    return done(relayError(500, 'relay_config_error', unset ?? '', cors), 'config')

  // 5: every request from this address, before the passcode is looked at.
  const address = addressKey(request.headers.get('cf-connecting-ip'))
  const tooMany = () => relayError(429, 'relay_rate_limit_error', TOO_MANY, cors, { 'retry-after': '60' })
  if (!(await allowed(deps.addressLimiter, `address:${address}`, log))) return done(tooMany(), 'rate_limited')

  // 6: the passcode, unless guessing from this address (or from everyone) is locked out.
  const lockKey = `wrong:${address}`
  if (deps.lockout?.locked(lockKey) || deps.lockout?.locked('wrong:all'))
    return done(
      relayError(429, 'relay_rate_limit_error', LOCKED, cors, { 'retry-after': String(LOCKOUT_MS / 1000) }),
      'rate_limited',
    )
  const given = request.headers.get(PASSCODE_HEADER)?.trim() || null
  const pass = await checkPasscode(given, secret)
  if (!pass.ok && given) {
    deps.lockout?.fail(lockKey)
    deps.lockout?.fail('wrong:all')
  }
  if (!pass.ok)
    return done(
      relayError(
        401,
        'relay_passcode_error',
        given ? 'The team passcode was not accepted.' : 'Ask needs the team passcode.',
        cors,
      ),
      'passcode',
    )

  // 7: per passcode and address.
  if (!(await allowed(deps.teamLimiter, `team:${pass.fingerprint}:${address}`, log)))
    return done(tooMany(), 'rate_limited')

  // 8, 9: the headers and body Ask sends, and nothing else.
  const head = checkHeaders(request.headers, rules)
  if ('status' in head) return done(relayError(head.status, head.type, head.message, cors), 'invalid')
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json'))
    return done(relayError(415, 'relay_request_error', 'The request body must be JSON.', cors), 'invalid')
  const text = await readCapped(request, rules.maxBodyBytes)
  if (text == null)
    return done(
      relayError(
        413,
        'relay_too_large_error',
        `The request is larger than the relay accepts (${rules.maxBodyBytes} bytes).`,
        cors,
      ),
      'too_large',
    )
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return done(
      relayError(400, 'relay_request_error', 'The request body is not valid JSON.', cors),
      'invalid',
    )
  }
  const problem = checkBody(body, rules)
  if (problem) return done(relayError(problem.status, problem.type, problem.message, cors), 'invalid')
  const model = (body as { model: string }).model

  // Passed on as checked: written out again from the parsed object, never the text as it came. A
  // parser keeps the last of two copies of a key, and Anthropic's might keep the first, so text
  // with `"model"` twice could otherwise reach Anthropic with a model the check never saw.
  const checked = JSON.stringify(body)
  // Passed on with the team's key and nothing else the browser sent.
  const upstreamHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': head.version,
    'x-api-key': key,
    ...(head.beta ? { 'anthropic-beta': head.beta } : {}),
  }
  let upstream: Response
  try {
    upstream = await deps.fetch(`${UPSTREAM_URL}${url.search}`, {
      method: 'POST',
      headers: upstreamHeaders,
      body: checked,
    })
  } catch {
    return done(
      relayError(
        502,
        'relay_upstream_error',
        'The relay could not reach Anthropic. Try again in a minute.',
        cors,
      ),
      'upstream_unreachable',
      model,
    )
  }
  const headers = new Headers(cors)
  for (const name of RESPONSE_HEADERS) {
    const v = upstream.headers.get(name)
    if (v) headers.set(name, v)
  }
  headers.set('cache-control', 'no-store')
  const secrets = [key, secret, env.ANTHROPIC_API_KEY, env.CENSUS_PASSCODE]
  // An answer streams through as it comes, with any copy of a secret hidden on the way.
  if (upstream.ok)
    return done(
      new Response(upstream.body ? upstream.body.pipeThrough(hidingStream(secrets)) : null, {
        status: upstream.status,
        headers,
      }),
      'forwarded',
      model,
    )
  // An error is small: read it, and hide any copy of a secret and any organization ID before it
  // goes back.
  const errorBody = hideInError(await errorText(upstream), secrets)
  headers.delete('content-length')
  return done(new Response(errorBody, { status: upstream.status, headers }), 'forwarded', model)
}
