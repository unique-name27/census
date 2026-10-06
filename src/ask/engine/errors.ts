/**
 * What went wrong, in plain words with what to do (docs/ASK.md, Errors). The SDK's typed API
 * errors carry the HTTP `status`; a request that never got an answer has none (offline, or blocked
 * by the browser or the page's host). Rate limits and overloads that came back as an HTTP status have
 * already been retried twice by the SDK by the time they reach here; one that arrives inside a stream
 * after the answer started has not (the SDK retries only before a response starts).
 *
 * Every error Anthropic sends back keeps its own message and request ID (`apiMessage`,
 * `requestId`), so the sheet can say exactly why a request was turned down; the plain-words title
 * alone hid reasons such as an account with no API credits behind "could not read this request".
 */

export type AskErrorKind =
  | 'no_key'
  | 'key'
  | 'workspace'
  | 'billing'
  | 'permission'
  | 'model'
  | 'rate_limited'
  | 'overloaded'
  | 'offline'
  | 'blocked'
  | 'stopped'
  | 'declined'
  | 'too_long'
  | 'bad_request'
  | 'unknown'

export interface AskError {
  kind: AskErrorKind
  /** One short sentence: "Your API key was not accepted." */
  title: string
  /** What to do, in a sentence or two. */
  detail: string
  /** Where the fix is: Settings > Ask Census, or trying again. */
  action: 'settings' | 'retry' | null
  /** The HTTP status, when there was one. */
  status?: number
  /** Anthropic's own explanation, as it sent it ("Your credit balance is too low …"). */
  apiMessage?: string
  /** Anthropic's request ID, for its support team. */
  requestId?: string
}

const E = (
  kind: AskErrorKind,
  title: string,
  detail: string,
  action: AskError['action'],
  status?: number,
): AskError => ({
  kind,
  title,
  detail,
  action,
  ...(status != null ? { status } : {}),
})

export const NO_KEY: AskError = E(
  'no_key',
  'Ask uses your own Claude API key.',
  'Add a key in Settings, Ask Census. Nothing is sent until you do.',
  'settings',
)

export const STOPPED: AskError = E(
  'stopped',
  'Stopped.',
  'You stopped this answer. Ask again when you are ready.',
  null,
)

export const EMPTY_QUESTION: AskError = E('bad_request', 'Type a question first.', 'Nothing was sent.', null)

export const DECLINED: AskError = E(
  'declined',
  'Claude declined to answer this question.',
  'Try asking it another way, or look at the view that covers it.',
  null,
)

export const CUT_OFF: AskError = E(
  'too_long',
  'The answer was cut off at its length limit.',
  'Ask for a shorter answer, or split the question in two.',
  'retry',
)

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status
  return typeof s === 'number' ? s : undefined
}

/** The API's error type ("overloaded_error"), for errors that arrive inside a stream with no status. */
function typeOf(err: unknown): string | undefined {
  const e = err as { type?: unknown; error?: { error?: { type?: unknown } } } | null
  const t = e?.type ?? e?.error?.error?.type
  return typeof t === 'string' ? t : undefined
}

const isAbort = (err: unknown): boolean => (err as { name?: unknown } | null)?.name === 'AbortError'

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/**
 * Anthropic's explanation and request ID from an SDK error. The SDK's `APIError` keeps the response
 * body in `error` (`{ type: 'error', error: { type, message }, request_id }`) and the request ID in
 * `requestID`; an error that arrives inside a stream carries the same body. The message is cut to a
 * readable length; it never holds people data, since every request is tokenized before it is sent.
 */
export function apiDetails(err: unknown): { apiMessage?: string; requestId?: string } {
  const e = err as {
    requestID?: unknown
    error?: { message?: unknown; request_id?: unknown; error?: { message?: unknown } }
  } | null
  const message = text(e?.error?.error?.message) ?? text(e?.error?.message)
  const requestId = text(e?.requestID) ?? text(e?.error?.request_id)
  return {
    ...(message ? { apiMessage: message.length > 400 ? `${message.slice(0, 399)}…` : message } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

/** A workspace ID in a message, cut to its prefix. */
const redact = (s: string): string => s.replace(/wrkspc_[A-Za-z0-9]+/g, 'wrkspc_…')

/**
 * What the console gets for a failed request: the error's name, HTTP status, API error type,
 * request ID and message, with any workspace ID cut to "wrkspc_…" (and the stack, cut the same
 * way, for an error that is not Anthropic's answer). Never the error object itself: the SDK's
 * error keeps the response headers and the workspace ID it reads from them.
 */
export function errorLog(err: unknown): Record<string, unknown> {
  const status = statusOf(err)
  const type = typeOf(err)
  const { apiMessage, requestId } = apiDetails(err)
  const e = err as { name?: unknown; message?: unknown; stack?: unknown } | null
  const message = apiMessage ?? (typeof e?.message === 'string' ? e.message : String(err))
  const fromApi = status != null || type != null
  return {
    ...(typeof e?.name === 'string' ? { name: e.name } : {}),
    ...(status != null ? { status } : {}),
    ...(type ? { type } : {}),
    ...(requestId ? { requestId } : {}),
    message: redact(message),
    ...(!fromApi && typeof e?.stack === 'string' ? { stack: redact(e.stack) } : {}),
  }
}

/** A 400 that is about the account's API credits, not the request. */
const BILLING = /credit balance|purchase credits|plans\s*&\s*billing|billing/i

/** About the credits themselves: this wins over a message that also names the workspace. */
const CREDITS = /credit balance|purchase credits|\bcredits?\b/i

/** The key belongs to no workspace and no workspace ID was sent. */
const NEEDS_WORKSPACE =
  /not scoped to a workspace|must include the anthropic-workspace-id|anthropic-workspace-id header is (?:required|missing)|missing (?:the )?anthropic-workspace-id/i

/** Names the workspace: about the ID itself only when one was sent and nothing below applies. */
const WORKSPACE = /workspace/i

/**
 * About something the workspace has or lacks rather than its ID: a model (by name or ID), usage,
 * spend, quotas, limits, credits, a region or a feature. Such an error keeps its own case.
 */
const NOT_THE_ID =
  /\bmodels?\b|\bclaude-[a-z0-9]|usage|spend|quota|\blimits?\b|\bcaps?\b|\bcredits?\b|inference_geo|\bgeo\b|\bregions?\b|\bfeatures?\b/i

export const WORKSPACE_NEEDED: AskError = E(
  'workspace',
  'This key needs a workspace ID.',
  'Add the workspace ID in Settings, Ask Census, or create a key inside a workspace in the Claude Console.',
  'settings',
)

export const WORKSPACE_REJECTED: AskError = E(
  'workspace',
  'Anthropic did not accept this workspace ID.',
  'Check the workspace ID in Settings, Ask Census. Find it in the Claude Console under Settings, Workspaces, or clear it if the key belongs to a workspace.',
  'settings',
)

/**
 * The workspace case for a 400, 403 or 404, or null when it is not about the workspace ID. Only a
 * request that carried an ID (`sent`) can have it turned down; with none, a message that mentions
 * the workspace keeps its own case, unless it asks for an ID.
 */
function workspaceError(message: string, status: number, sent: boolean): AskError | null {
  if (status !== 400 && status !== 403 && status !== 404) return null
  if (NEEDS_WORKSPACE.test(message)) return { ...WORKSPACE_NEEDED, status }
  if (sent && WORKSPACE.test(message) && !NOT_THE_ID.test(message)) return { ...WORKSPACE_REJECTED, status }
  return null
}

/** The HTTP status an API error type stands for, when an error arrives mid-stream. */
const TYPE_STATUS: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  overloaded_error: 529,
}

/** What `classifyError` is told about the request, all passed in so it stays pure. */
export interface ClassifyOptions {
  /** The Stop button's signal fired. */
  aborted?: boolean
  /** `navigator.onLine`, for telling "offline" from "blocked". */
  online?: boolean
  /** The request never reached the API (the real client checks the SDK's connection error classes). */
  connection?: boolean
  /** The request carried a workspace ID (the `anthropic-workspace-id` header). */
  workspaceSent?: boolean
}

/** The plain-words case for an error thrown while asking. */
export function classifyError(err: unknown, opts: ClassifyOptions = {}): AskError {
  if (opts.aborted || isAbort(err)) return STOPPED
  const found = classify(err, opts)
  return found.status != null ? { ...found, ...apiDetails(err) } : found
}

function classify(err: unknown, opts: ClassifyOptions): AskError {
  const type = typeOf(err)
  const http = statusOf(err)
  const status = http ?? (type ? TYPE_STATUS[type] : undefined)
  // The SDK retried only errors that came back as an HTTP status, not one inside a stream.
  const later = http != null ? 'Census tried again twice. Try again in a minute.' : 'Try again in a minute.'
  const message = apiDetails(err).apiMessage ?? ''
  // No credits left says so first; a request turned down over the workspace comes next, ahead of
  // a message that only mentions billing in passing.
  const credits = status === 400 && CREDITS.test(message)
  const ws = status != null && !credits ? workspaceError(message, status, !!opts.workspaceSent) : null
  if (ws) return ws
  if (status === 400 && BILLING.test(message))
    return E(
      'billing',
      'Your Anthropic account has no API credits left.',
      'Add credits under Plans & Billing in the Claude Console, then ask again. API use is billed separately from a Claude.ai subscription.',
      null,
      status,
    )
  if (status === 401)
    return E(
      'key',
      'Your API key was not accepted.',
      'Check the key in Settings, Ask Census, or create a new one in the Claude Console.',
      'settings',
      status,
    )
  if (status === 403)
    // A working key can lack access to a model or feature, so the key itself is not blamed.
    return E(
      'permission',
      'This key is not allowed to use this model or feature.',
      'Pick another model in Settings, Ask Census, or check the key’s permissions in the Claude Console.',
      'settings',
      status,
    )
  if (status === 404)
    return E(
      'model',
      'This model is not available to your API key.',
      'Pick another model in Settings, Ask Census.',
      'settings',
      status,
    )
  if (status === 413)
    return E(
      'too_long',
      'This conversation is too long to send.',
      'Start a new chat and ask again.',
      null,
      status,
    )
  if (status === 429)
    return E('rate_limited', 'Claude is getting too many requests from this key.', later, 'retry', status)
  if (status === 529 || (status != null && status >= 500))
    return E('overloaded', 'Claude is busy right now.', later, 'retry', status)
  if (status === 400)
    return E(
      'bad_request',
      'Anthropic turned down this request.',
      'Its reason is below. Start a new chat and ask again; if it keeps happening, use Report a problem.',
      null,
      status,
    )
  if (status != null)
    return E('unknown', 'Something went wrong asking Claude.', 'Try again in a minute.', 'retry', status)
  // No status: the request never got an answer, or something failed here.
  const connection = opts.connection ?? err instanceof TypeError
  if (!connection && opts.online !== false)
    return E(
      'unknown',
      'Something went wrong asking Claude.',
      'Try again. If it keeps happening, use Report a problem.',
      'retry',
    )
  if (opts.online === false)
    return E('offline', 'You are offline.', 'Ask again when this computer is back online.', 'retry')
  return E(
    'blocked',
    'The request did not reach Claude.',
    'The browser or the page’s host blocked it (for example when Census runs as a claude.ai artifact). Open Census in its own browser tab and try again.',
    'retry',
  )
}
