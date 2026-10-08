/**
 * Asking one question from the sheet: read the key, workspace ID and model, make the client (the
 * real SDK, or in a development build the scripted client for the test key), run the engine's
 * `ask` with the app's live context, and turn its events into the turn the sheet shows. Stop
 * aborts the request in flight; New chat and a change of mode stop it and start a fresh
 * conversation (`inflight.ts`).
 */
import {
  type AskClient,
  ask,
  checkKey,
  classifyError,
  createAnthropicClient,
  type ModelId,
  NO_KEY,
  readKey,
  readModelChoice,
  readWorkspaceId,
  type ToolEnv,
} from '@/ask/engine'
import { abortAnswer, beginAnswer, endAnswer } from './inflight'
import { applyEvent, askedScope, failTurn, finishTurn, newTurn } from './model'
import { askAllowed, useAsk } from './store'

export { stopAnswer } from './inflight'

let nextId = 1

const online = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/**
 * The client for a key, with the workspace ID saved in Settings (read for every question). A
 * development build answers the test key from a scripted Claude, with no network.
 */
async function clientFor(key: string): Promise<AskClient & { online?: () => boolean }> {
  if (import.meta.env.DEV && key === 'sk-ant-test-fake-0000') {
    const { createDevClient } = await import('./devClient')
    return createDevClient()
  }
  return createAnthropicClient(key, { workspaceId: readWorkspaceId() })
}

/**
 * Settings > Check key: null when the key works, else the error in plain words. It sends the saved
 * workspace ID, as a question would. The test key of a development build always works and sends
 * nothing.
 */
export async function checkAskKey(key: string, model: ModelId) {
  if (import.meta.env.DEV && key.trim() === 'sk-ant-test-fake-0000') return null
  const r = await checkKey(key, model, { workspaceId: readWorkspaceId() })
  return r.ok
    ? null
    : classifyError(r.error, { connection: r.connection, workspaceSent: r.workspaceSent, online: online() })
}

/** Ask a question in the current chat. Does nothing while another answer is coming. */
export async function askQuestion(question: string, env: ToolEnv): Promise<void> {
  const store = useAsk.getState()
  const q = question.trim()
  // Ask off in this mode: nothing is asked (the engine refuses too, `askOff`).
  if (!q || store.busy || !askAllowed() || !env.ctx.access.can('ask')) return
  const chat = store.chat
  const conversation = store.conversation
  const model = readModelChoice()
  const id = nextId++
  // The scope, period and standard in force now: what the answer's exports are stamped with.
  store.addTurn(newTurn(id, q, model, askedScope(env.ctx)))
  store.setDraft('')
  const update = (fn: Parameters<typeof store.updateTurn>[2]) => useAsk.getState().updateTurn(chat, id, fn)
  const stored = readKey()
  if (!stored) {
    update((t) => failTurn(t, NO_KEY))
    return
  }
  store.setBusy(true)
  const abort = beginAnswer()
  try {
    let client: AskClient & { online?: () => boolean }
    try {
      client = await clientFor(stored.key)
    } catch (err) {
      // The SDK could not be loaded: the page's host or the network blocked it.
      update((t) => failTurn(t, classifyError(err, { connection: true, online: online() })))
      return
    }
    const result = await ask({
      client,
      conversation,
      question: q,
      env,
      model,
      signal: abort.signal,
      online: client.online ?? online,
      onEvent: (e) => update((t) => applyEvent(t, e)),
    })
    update((t) => finishTurn(t, result))
  } finally {
    endAnswer(abort)
    if (useAsk.getState().chat === chat) {
      useAsk.getState().setBusy(false)
      useAsk.getState().answered()
    }
  }
}

/** New chat: stop any answer and forget the conversation (its tokens, refs and history). */
export function newChat(): void {
  abortAnswer()
  useAsk.getState().reset()
}
