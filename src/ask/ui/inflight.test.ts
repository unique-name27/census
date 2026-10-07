/**
 * The answer in flight (inflight.ts): a change of mode stops it before the chat is cleared, so an
 * answer asked in one mode never goes on in another; New chat and Stop stop it too.
 */
import { describe, expect, it } from 'vitest'
import { useMode } from '@/access/store'
import { ask, Conversation } from '@/ask/engine'
import { envOf, fakeApp, sampleCtx } from '@/ask/engine/testkit'
import { createDevClient } from './devClient'
import { abortAnswer, answerInFlight, beginAnswer, endAnswer, stopAnswer } from './inflight'
import { useAsk } from './store'

describe('the answer in flight', () => {
  it('is aborted when the mode or the manager changes, and the chat starts again', () => {
    const before = useAsk.getState().chat
    const a = beginAnswer()
    useMode.setState({ mode: 'manager', managerId: 'E10427' })
    expect(a.signal.aborted).toBe(true)
    expect(answerInFlight()).toBeNull()
    expect(useAsk.getState().chat).toBe(before + 1)
    const b = beginAnswer()
    useMode.setState({ managerId: 'E10428' })
    expect(b.signal.aborted).toBe(true)
    const c = beginAnswer()
    useMode.setState({ mode: 'hr' })
    expect(c.signal.aborted).toBe(true)
  })

  it('is aborted by Stop and New chat, and forgotten when it ends', () => {
    const a = beginAnswer()
    stopAnswer()
    expect(a.signal.aborted).toBe(true)
    endAnswer(a)
    expect(answerInFlight()).toBeNull()
    const b = beginAnswer()
    abortAnswer()
    expect(b.signal.aborted).toBe(true)
    expect(answerInFlight()).toBeNull()
    // A newer answer replaces an older one, which is stopped.
    const c = beginAnswer()
    const d = beginAnswer()
    expect(c.signal.aborted).toBe(true)
    endAnswer(c)
    expect(answerInFlight()).toBe(d)
    endAnswer(d)
  })

  it('stops an answer whose mode changed before it acted: nothing changes on screen', async () => {
    useMode.setState({ mode: 'hr', managerId: null })
    const ctx = sampleCtx()
    const f = fakeApp(ctx)
    const app = {
      ...f.app,
      mode: () => ({ mode: useMode.getState().mode, managerId: useMode.getState().managerId }),
    }
    const before = f.history.length
    const answer = beginAnswer()
    let requests = 0
    const r = await ask({
      client: createDevClient({ pace: 0 }),
      conversation: new Conversation(),
      question: 'Filter to Bengaluru, last 6 months',
      env: envOf(ctx, { app }),
      signal: answer.signal,
      onEvent: (e) => {
        // The person switches to Manager mode while the first request is out.
        if (e.type === 'request' && ++requests === 1)
          useMode.setState({ mode: 'manager', managerId: 'E10427' })
      },
    })
    expect(answer.signal.aborted).toBe(true)
    expect(r.status).toBe('stopped')
    expect(r.actions).toEqual([])
    expect(f.history.length).toBe(before)
    useMode.setState({ mode: 'hr', managerId: null })
  })
})
