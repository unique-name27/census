/**
 * Ask hidden by the policy in force (the Security center's "Ask: on or off"): hidden means not
 * rendered and nothing sent (docs/SECURITY-CENTER.md). The engine refuses before any request, the
 * store refuses to open the panel and drops the chat, and a question asked anyway adds no turn.
 * The masthead button, Alt+A, the phone menu item, the panel and the screen bridge read
 * `useAskOn`, which is `access.can(S.ask())` (checked in the browser).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accessFor } from '@/access/context'
import { DEFAULTS_IN_FORCE, type PolicyLine, resetPolicyState, setInForce } from '@/access/overrides'
import { S } from '@/access/surfaces'
import { Conversation } from '@/ask/engine/conversation'
import { type AskClient, ask } from '@/ask/engine/loop'
import { askOff } from '@/ask/engine/roles'
import { envOf, sampleCtx } from '@/ask/engine/testkit'
import { askQuestion } from './session'
import { askAllowed, openAsk, setAskAllowed, toggleAsk, useAsk } from './store'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const off: PolicyLine = {
  role: 'hr-ops',
  surface: 'ask',
  decision: 'hidden',
  reason: 'Not needed',
  by: 'QA',
  at: '2026-10-08T09:00:00.000Z',
}

afterEach(() => {
  resetPolicyState()
  setAskAllowed(true)
  useAsk.getState().closeAsk()
})

describe('Ask hidden by the policy in force', () => {
  it('is off for the mode, with the reason, and Ask stays on elsewhere', () => {
    setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines: [off] })
    const access = accessFor('hr-ops')
    expect(access.can(S.ask())).toBe(false)
    expect(askOff({ access, metrics: sampleCtx().metrics })).toBe('Ask is not part of HR ops mode.')
    expect(askOff({ access: accessFor('hr'), metrics: sampleCtx().metrics })).toBeNull()
  })

  it('sends nothing: the engine refuses before any request', async () => {
    setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines: [off] })
    const ctx = sampleCtx({ access: { mode: 'hr-ops' } })
    const stream = vi.fn()
    const client = { stream } as unknown as AskClient
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'How many open cases are there by category?',
      env: envOf(ctx),
    })
    expect(stream).not.toHaveBeenCalled()
    expect(r.status).toBe('error')
    expect(r.sent).toBe('')
    expect(r.calls).toEqual([])
  })

  it('the store opens no panel, keeps no chat, and a question adds no turn', async () => {
    useAsk.getState().openAsk()
    useAsk.getState().addTurn({ id: 1, question: 'Earlier' } as never)
    setAskAllowed(false)
    expect(askAllowed()).toBe(false)
    expect(useAsk.getState().panel).toBe('closed')
    expect(useAsk.getState().turns).toEqual([])
    openAsk()
    toggleAsk()
    expect(useAsk.getState().panel).toBe('closed')
    setInForce({ ...DEFAULTS_IN_FORCE, source: 'site', lines: [off] })
    await askQuestion('How many open cases?', envOf(sampleCtx({ access: { mode: 'hr-ops' } })))
    expect(useAsk.getState().turns).toEqual([])
    // Back on: the panel opens again.
    setAskAllowed(true)
    openAsk()
    expect(useAsk.getState().panel).toBe('open')
  })
})
