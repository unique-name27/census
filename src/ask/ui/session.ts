/**
 * Asking one question from the sheet: read the key and model, make the client (the real SDK, or
 * in a development build the scripted client for the test key), run the engine's `ask` with the
 * app's live context, and turn its events into the turn the sheet shows. Stop aborts the request
 * in flight; New chat stops it and starts a fresh conversation.
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
  type ToolEnv,
} from '@/ask/engine'
import { applyEvent, askedScope, failTurn, finishTurn, newTurn } from './model'
import { useAsk } from './store'

let controller: AbortController | null = null
let nextId = 1

const online = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/** The client for a key. A development build answers the test key from a scripted Claude, with no network. */
async function clientFor(key: string): Promise<AskClient & { online?: () => boolean }> {
  if (import.meta.env.DEV && key === 'sk-ant-test-fake-0000') {
    const { createDevClient } = await import('./devClient')
    return createDevClient()
  }
  return createAnthropicClient(key)
}

/**
 * Settings > Check key: null when the key works, else the error in plain words. The test key of a
 * development build always works and sends nothing.
 */
export async function checkAskKey(key: string, model: ModelId) {
  if (import.meta.env.DEV && key.trim() === 'sk-ant-test-fake-0000') return null
  const r = await checkKey(key, model)
  return r.ok ? null : classifyError(r.error, { connection: r.connection, online: online() })
}

/** Ask a question in the current chat. Does nothing while another answer is coming. */
export async function askQuestion(question: string, env: ToolEnv): Promise<void> {
  const store = useAsk.getState()
  const q = question.trim()
  if (!q || store.busy) return
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
  const abort = new AbortController()
  controller = abort
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
    if (controller === abort) controller = null
    if (useAsk.getState().chat === chat) {
      useAsk.getState().setBusy(false)
      useAsk.getState().answered()
    }
  }
}

/** The Stop button. */
export function stopAnswer(): void {
  controller?.abort()
}

/** New chat: stop any answer and forget the conversation (its tokens, refs and history). */
export function newChat(): void {
  controller?.abort()
  controller = null
  useAsk.getState().reset()
}
