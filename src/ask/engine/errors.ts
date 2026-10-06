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

/** A 400 that is about the account's API credits, not the request. */
const BILLING = /credit balance|purchase credits|plans\s*&\s*billing|billing/i

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

/**
 * The plain-words case for an error thrown while asking. `aborted` is the Stop button's signal;
 * `online` is `navigator.onLine`; `connection` says the request never reached the API (the real
 * client checks the SDK's connection error classes). All passed in so this stays pure.
 */
export function classifyError(
  err: unknown,
  opts: { aborted?: boolean; online?: boolean; connection?: boolean } = {},
): AskError {
  if (opts.aborted || isAbort(err)) return STOPPED
  const found = classify(err, opts)
  return found.status != null ? { ...found, ...apiDetails(err) } : found
}

function classify(err: unknown, opts: { online?: boolean; connection?: boolean }): AskError {
  const type = typeOf(err)
  const http = statusOf(err)
  const status = http ?? (type ? TYPE_STATUS[type] : undefined)
  // The SDK retried only errors that came back as an HTTP status, not one inside a stream.
  const later = http != null ? 'Census tried again twice. Try again in a minute.' : 'Try again in a minute.'
  if (status === 400 && BILLING.test(apiDetails(err).apiMessage ?? ''))
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
