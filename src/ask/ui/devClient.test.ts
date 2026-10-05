/**
 * The development build's scripted Claude: which tools a question calls, the answer it writes
 * from their real results (refs that open records, people as tokens, nothing private), and every
 * error state it can bring up, all through the engine's real loop on the sample company.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { ask, Conversation, parseAnswer, type ToolEnv } from '@/ask/engine'
import { envOf, expectClean, sampleCtx } from '@/ask/engine/testkit'
import { composeAnswer, createDevClient, fieldLabel, md, planFor } from './devClient'

let env: ToolEnv
beforeAll(() => {
  env = envOf(sampleCtx())
}, 60_000)

const names = (q: string) => planFor(q).rounds.map((r) => r.map((c) => c.name))

describe('planFor', () => {
  it('picks tools by the words in the question', () => {
    expect(names('Where is voluntary attrition highest?')).toEqual([['view_summary'], ['compare_groups']])
    expect(names('How many open reqs does each recruiter have?')).toEqual([['view_summary', 'query_records']])
    expect(names('Which datasets are below silver?')).toEqual([['explain_quality']])
    expect(names('How is voluntary attrition defined?')).toEqual([
      ['view_summary', 'find_metrics'],
      ['compare_groups'],
    ])
    expect(names('Hello')).toEqual([['get_context'], ['view_summary']])
  })

  it('scopes to a leader named by a token, and brings up faults on request', () => {
    const p = planFor('How is attrition in {{P12}}’s org?')
    expect(p.rounds[0]?.[0]?.input).toEqual({ view: 'hrbp', filters: { leader: '{{P12}}' } })
    expect(planFor('fake 401').fault).toBe(401)
    expect(planFor('fake offline please').fault).toBe('offline')
    expect(planFor('fake cut off').fault).toBe('cut-off')
    expect(planFor('fake slow').slow).toBe(true)
    expect(planFor('fake rounds').rounds).toHaveLength(11)
  })

  it('labels fields and escapes Markdown', () => {
    expect(fieldLabel('businessUnit')).toBe('Business unit')
    expect(fieldLabel('org.manager')).toBe('Manager')
    expect(md('a|b *c* [d]')).toBe('a\\|b \\*c\\* \\[d\\]')
  })
})

describe('the scripted answer', () => {
  it('runs real tools through the real loop and links every number to records', async () => {
    const conv = new Conversation()
    const r = await ask({
      client: createDevClient({ pace: 0 }),
      conversation: conv,
      question: 'Where is voluntary attrition highest, and how has it changed?',
      env,
    })
    expect(r.status).toBe('done')
    expect(r.calls.map((c) => c.name)).toEqual(['view_summary', 'compare_groups'])
    expect(r.rounds).toBe(2)
    const blocks = parseAnswer(r.text, { isRef: (x) => conv.hasRef(x) })
    expect(blocks.some((b) => b.type === 'table')).toBe(true)
    // Every ref it wrote is one the tools handed out.
    const refs = [...r.text.matchAll(/\(ref:(r\d+)\)/g)].map((m) => m[1] as string)
    expect(refs.length).toBeGreaterThan(5)
    for (const ref of refs) expect(conv.hasRef(ref), ref).toBe(true)
    expect(r.text).toContain('(metric:hrbp.attrition.voluntary)')
    expect(r.text).toContain('(view:hrbp.attrition)')
    expect(r.text).toContain('Claude was not asked')
    expectClean(r.text, 'scripted answer')
    expect(r.usage.requests).toBe(3)
  })

  it('copies person tokens from the results, never names', async () => {
    const conv = new Conversation()
    const r = await ask({
      client: createDevClient({ pace: 0 }),
      conversation: conv,
      question: 'How many open reqs does each recruiter have?',
      env,
    })
    expect(r.status).toBe('done')
    const tokens = r.text.match(/\{\{P\d+\}\}/g) ?? []
    expect(tokens.length).toBeGreaterThan(3)
    for (const t of tokens) expect(conv.person(t)?.name, t).toBeTruthy()
    expectClean(r.text, 'scripted answer')
  })

  it('writes something for every tool, and says when a tool failed', () => {
    const text = composeAnswer([
      { name: 'find_metrics', input: {}, content: '{"metrics":[]}' },
      { name: 'view_summary', input: {}, content: '{"error":"Unknown view \\"x\\"."}' },
      { name: 'get_context', input: {}, content: 'not json' },
    ])
    expect(text).toContain('No metric definition matches that.')
    expect(text).toContain('Census could not work this out: Unknown view "x".')
  })
})

describe('error states', () => {
  const run = (question: string, opts: { pace?: number; signal?: AbortSignal } = {}) =>
    ask({
      client: createDevClient({ pace: opts.pace ?? 0 }),
      conversation: new Conversation(),
      question,
      env,
      signal: opts.signal,
      online: () => true,
    })

  it('key, model, rate limit and overload come back in plain words', async () => {
    expect((await run('fake 401')).error?.kind).toBe('key')
    expect((await run('fake 404')).error?.kind).toBe('model')
    expect((await run('fake 429')).error?.kind).toBe('rate_limited')
    expect((await run('fake 529')).error?.kind).toBe('overloaded')
  })

  it('offline and blocked tell themselves apart', async () => {
    const client = createDevClient({ pace: 0 })
    const off = await ask({
      client,
      conversation: new Conversation(),
      question: 'fake offline',
      env,
      online: () => client.online(),
    })
    expect(off.error?.kind).toBe('offline')
    expect((await run('fake blocked')).error?.kind).toBe('blocked')
  })

  it('a decline, a cut-off answer and the round limit', async () => {
    const declined = await run('fake declined')
    expect(declined.error?.kind).toBe('declined')
    expect(declined.text).toBe('')
    const cut = await run('attrition fake cut off')
    expect(cut.status).toBe('done')
    expect(cut.truncated).toBe(true)
    const rounds = await run('fake rounds')
    expect(rounds.status).toBe('done')
    expect(rounds.roundLimited).toBe(true)
    expect(rounds.rounds).toBe(10)
    expect(rounds.text).toContain('Scope:')
  })

  it('Stop aborts mid-answer', async () => {
    const stop = new AbortController()
    const pending = run('attrition fake slow', { pace: 0.2, signal: stop.signal })
    setTimeout(() => stop.abort(), 250)
    const r = await pending
    expect(r.status).toBe('stopped')
    expect(r.error?.kind).toBe('stopped')
  })
})
