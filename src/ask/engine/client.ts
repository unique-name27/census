/**
 * The real Claude client: `@anthropic-ai/sdk`, loaded with a dynamic import on first use (so it
 * is its own chunk and costs nothing until someone asks), created with `dangerouslyAllowBrowser`
 * because requests go straight from this browser to the Anthropic API under the user's own key.
 * With the team relay (docs/ASK-RELAY.md) they go to the relay instead: the SDK's `baseURL` is the
 * relay, the passcode rides in `defaultHeaders`, and the key the SDK sends is a placeholder the
 * relay drops before it adds the team's key. The SDK retries rate limits, overloads and server
 * errors twice before giving up (the relay's own refusals tell it not to).
 */
import type { AskClient, AskRequest, AskStream } from './loop'
import { type ModelId, modelById } from './models'
import { type AskCredential, PASSCODE_HEADER, RELAY_PLACEHOLDER_KEY } from './relay'

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
  /**
   * The team relay and its passcode: requests go there, with the passcode in the
   * `x-census-passcode` header, and no key or workspace ID of the person's own.
   */
  relay?: { url: string; passcode: string } | null
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
 * A client for this key (and workspace, when one is given), or for the team relay and its passcode
 * (`opts.relay`). The key stays in this object and the request headers, nowhere else; so do the
 * workspace ID and the passcode.
 */
export async function createAnthropicClient(
  apiKey: string,
  opts: ClientOptions = {},
): Promise<AnthropicAskClient> {
  const mod = await loadSdk()
  const Anthropic = mod.default
  const relay = opts.relay ?? null
  // The relay holds the team's key: no key or workspace ID of the person's own goes there.
  const workspace = relay ? undefined : opts.workspaceId?.trim()
  const headers = relay
    ? { [PASSCODE_HEADER]: relay.passcode.trim() }
    : workspace
      ? { 'anthropic-workspace-id': workspace }
      : null
  const baseURL = relay?.url ?? opts.baseURL
  const sdk = new Anthropic({
    apiKey: relay ? RELAY_PLACEHOLDER_KEY : apiKey.trim(),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    ...(headers ? { defaultHeaders: headers } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(baseURL ? { baseURL } : {}),
  })
  return {
    stream: (body: AskRequest, o: { signal?: AbortSignal }): AskStream =>
      sdk.beta.messages.stream(body, o.signal ? { signal: o.signal } : undefined),
    isConnectionError: (err: unknown) => err instanceof mod.APIConnectionError,
    sendsWorkspaceId: !!workspace,
    viaRelay: !!relay,
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

export type CheckResult =
  | { ok: true }
  | { ok: false; error: unknown; connection: boolean; workspaceSent: boolean; relay: boolean }

/**
 * Settings > Check key: `ok` when the key works with the model, else the error (classify it with
 * `classifyError`, passing `connection`, `workspaceSent` and `relay`). Pass the saved
 * `workspaceId`, so the check sends what a question would; with `opts.relay` it checks the
 * passcode through the relay instead (`checkPasscode`).
 */
export async function checkKey(
  apiKey: string,
  model: ModelId,
  opts: ClientOptions = {},
): Promise<CheckResult> {
  let client: AnthropicAskClient
  try {
    client = await createAnthropicClient(apiKey, opts)
  } catch (error) {
    return { ok: false, error, connection: true, workspaceSent: false, relay: !!opts.relay }
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
      relay: !!client.viaRelay,
    }
  }
}

/**
 * Settings > Check passcode: the same tiny request as Check key, through the team relay with the
 * passcode, so it proves the passcode, the relay, the team's key and the model together.
 */
export function checkPasscode(
  passcode: string,
  relayUrl: string,
  model: ModelId,
  opts: Omit<ClientOptions, 'relay' | 'workspaceId'> = {},
): Promise<CheckResult> {
  return checkKey(RELAY_PLACEHOLDER_KEY, model, { ...opts, relay: { url: relayUrl, passcode } })
}

/** The client for a credential: the person's own key (with the saved workspace ID), or the team relay. */
export function clientForCredential(
  cred: AskCredential,
  opts: Omit<ClientOptions, 'relay'> = {},
): Promise<AnthropicAskClient> {
  return cred.kind === 'team'
    ? createAnthropicClient(RELAY_PLACEHOLDER_KEY, {
        ...opts,
        workspaceId: null,
        relay: { url: cred.relayUrl, passcode: cred.passcode },
      })
    : createAnthropicClient(cred.key, opts)
}
