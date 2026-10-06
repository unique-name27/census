/**
 * The real Claude client: `@anthropic-ai/sdk`, loaded with a dynamic import on first use (so it
 * is its own chunk and costs nothing until someone asks), created with `dangerouslyAllowBrowser`
 * because requests go straight from this browser to the Anthropic API under the user's own key.
 * The SDK retries rate limits, overloads and server errors twice before giving up.
 */
import type { AskClient, AskRequest, AskStream } from './loop'
import { type ModelId, modelById } from './models'

export interface ClientOptions {
  /** A fetch to use instead of the browser's (tests pass a scripted one). */
  fetch?: typeof fetch
  /** Another API host (tests). */
  baseURL?: string
  /**
   * The Claude Console workspace for a key that belongs to none (Settings > Ask Census). Sent as
   * the `anthropic-workspace-id` header on every request; blank sends no header.
   */
  workspaceId?: string | null
}

export interface AnthropicAskClient extends AskClient {
  /** Settings > Check key: one tiny request (a few tokens) to the model, throws on failure. */
  check(model: ModelId): Promise<void>
}

type Sdk = typeof import('@anthropic-ai/sdk')
let sdkPromise: Promise<Sdk> | null = null

/** The SDK module, imported once. */
export function loadSdk(): Promise<Sdk> {
  sdkPromise ??= import('@anthropic-ai/sdk').catch((err) => {
    sdkPromise = null
    throw err
  })
  return sdkPromise
}

/**
 * A client for this key (and workspace, when one is given). The key stays in this object and the
 * request headers, nowhere else; so does the workspace ID.
 */
export async function createAnthropicClient(
  apiKey: string,
  opts: ClientOptions = {},
): Promise<AnthropicAskClient> {
  const mod = await loadSdk()
  const Anthropic = mod.default
  const workspace = opts.workspaceId?.trim()
  const sdk = new Anthropic({
    apiKey: apiKey.trim(),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
  })
  return {
    stream: (body: AskRequest, o: { signal?: AbortSignal }): AskStream =>
      sdk.beta.messages.stream(body, o.signal ? { signal: o.signal } : undefined),
    isConnectionError: (err: unknown) => err instanceof mod.APIConnectionError,
    sendsWorkspaceId: !!workspace,
    // One tiny request (a few tokens): it proves the key, the model and the account's API credits
    // together. Looking the model up alone succeeds on an account with no credits left.
    check: async (model: ModelId) => {
      const { effort } = modelById(model)
      await sdk.messages.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        ...(effort ? { output_config: { effort: 'low' as const } } : {}),
      })
    },
  }
}

/**
 * Settings > Check key: `ok` when the key works with the model, else the error (classify it with
 * `classifyError`, passing `connection` and `workspaceSent`). Pass the saved `workspaceId`, so
 * the check sends what a question would.
 */
export async function checkKey(
  apiKey: string,
  model: ModelId,
  opts: ClientOptions = {},
): Promise<{ ok: true } | { ok: false; error: unknown; connection: boolean; workspaceSent: boolean }> {
  let client: AnthropicAskClient
  try {
    client = await createAnthropicClient(apiKey, opts)
  } catch (error) {
    return { ok: false, error, connection: true, workspaceSent: false }
  }
  try {
    await client.check(model)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error,
      connection: client.isConnectionError?.(error) ?? false,
      workspaceSent: !!client.sendsWorkspaceId,
    }
  }
}
