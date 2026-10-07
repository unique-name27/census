/**
 * The loop with Ask connected to the screen (docs/ASK-ACTIONS.md, parts 2 to 5), with a fake
 * client and a fake app: the screen line on every question, the screen tools and prompt section
 * (cached), chained actions and answers computing for the new scope, action records and charts on
 * the calls and the result, earlier results kept for charts, and "Let Ask change the screen" off.
 */
import type { BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { DEFAULT_FILTERS } from '@/data/scope'
import { Conversation } from './conversation'
import { fakeClient } from './fakeApi'
import { type AskEvent, ask } from './loop'
import { envOf, fakeApp, leaks, sampleCtx } from './testkit'
import { ACTIONS_OFF } from './tools/screenActions'

const ctx = sampleCtx()

const systemText = (body: { system?: unknown }) =>
  ((body.system ?? []) as BetaTextBlockParam[]).map((b) => b.text).join('\n')

describe('Ask on the screen', () => {
  it('sends the screen line with each question, the screen tools and the screen prompt, cached', async () => {
    const f = fakeApp(ctx, { route: { view: 'hrbp', tab: 'attrition' } })
    const client = fakeClient([{ blocks: [{ type: 'text', text: 'You are on People stats.' }] }])
    const events: AskEvent[] = []
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'What am I looking at?',
      env: envOf(ctx, { app: f.app }),
      onEvent: (e) => events.push(e),
    })
    expect(r.status).toBe('done')
    const line = 'On screen: People stats, Attrition; the whole company; last 12 months.'
    expect(r.screen).toBe(line)
    expect(r.sent).toBe(`${line}\n\nWhat am I looking at?`)
    expect(events[0]).toEqual({ type: 'question', sent: r.sent, screen: line })
    const body = client.log.bodies[0]!
    expect(body.messages[0]).toEqual({ role: 'user', content: r.sent })
    const names = (body.tools ?? []).map((t) => (t as { name: string }).name)
    for (const n of ['get_context', 'get_screen', 'set_filters', 'open_view', 'show_figure', 'make_chart'])
      expect(names).toContain(n)
    expect((body.tools ?? []).filter((t) => (t as { cache_control?: unknown }).cache_control)).toHaveLength(1)
    const system = body.system as BetaTextBlockParam[]
    expect(system[0]?.cache_control).toEqual({ type: 'ephemeral' })
    expect(systemText(body)).toMatch(/Prefer an existing figure/)
    expect(systemText(body)).toMatch(/Never say an action happened unless its tool succeeded/)
  })

  it('chains an action and an answer: the tools after set_filters compute for the new scope', async () => {
    const f = fakeApp(ctx)
    const client = fakeClient([
      {
        blocks: [
          { type: 'tool_use', name: 'set_filters', input: { location: ['Bengaluru'] }, id: 'toolu_a' },
          { type: 'tool_use', name: 'view_summary', input: { view: 'hrbp' }, id: 'toolu_b' },
        ],
      },
      { blocks: [{ type: 'text', text: 'Filtered to Bengaluru. Voluntary attrition there is high.' }] },
    ])
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Show me Bengaluru',
      env: envOf(ctx, { app: f.app }),
    })
    expect(r.status).toBe('done')
    expect(f.app.screen().filters.location).toEqual(['Bengaluru'])
    expect(r.actions?.map((a) => a.line)).toEqual(['Filtered to Bengaluru'])
    expect(r.calls[0]?.action?.tool).toBe('set_filters')
    const summary = JSON.parse(r.calls[1]?.result ?? '{}')
    expect(summary.scope).toBe('Bengaluru')
    for (const c of r.calls) expect(leaks(c.result)).toEqual([])
  })

  it('computes for the store’s scope when the page has not caught up yet', async () => {
    // The app shows Bengaluru; the context handed in was rendered for the whole company.
    const f = fakeApp(ctx, { filters: { ...DEFAULT_FILTERS, location: ['Bengaluru'], modes: {} } })
    const client = fakeClient([
      { blocks: [{ type: 'tool_use', name: 'view_summary', input: { view: 'hrbp' } }] },
      { blocks: [{ type: 'text', text: 'Done.' }] },
    ])
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Numbers?',
      env: envOf(ctx, { app: f.app }),
    })
    expect(r.screen).toMatch(/; "Bengaluru"; /)
    expect(JSON.parse(r.calls[0]?.result ?? '{}').scope).toBe('Bengaluru')
  })

  it('puts charts on the calls and the result, and keeps results for later charts', async () => {
    const f = fakeApp(ctx)
    const conversation = new Conversation()
    const query = {
      dataset: 'employees',
      where: [{ field: 'active', op: 'eq', value: true }],
      group_by: [{ field: 'location' }],
    }
    const first = await ask({
      client: fakeClient([
        { blocks: [{ type: 'tool_use', name: 'query_records', input: query, id: 'toolu_q1' }] },
        { blocks: [{ type: 'text', text: 'Counted.' }] },
      ]),
      conversation,
      question: 'Headcount by location',
      env: envOf(ctx, { app: f.app }),
    })
    expect(first.status).toBe('done')
    expect(conversation.results.has('toolu_q1')).toBe(true)
    const second = await ask({
      client: fakeClient([
        {
          blocks: [
            {
              type: 'tool_use',
              name: 'make_chart',
              input: { source: { result: 'toolu_q1' }, form: 'bars', title: 'Headcount by location' },
            },
          ],
        },
        { blocks: [{ type: 'text', text: 'Here it is.' }] },
      ]),
      conversation,
      question: 'Chart that',
      env: envOf(ctx, { app: f.app }),
    })
    expect(second.status).toBe('done')
    expect(second.charts).toHaveLength(1)
    expect(second.calls[0]?.chart?.id).toBe('ask-chart-1')
    expect(second.calls[0]?.isError).toBe(false)
    const counts = JSON.parse(first.calls[0]?.result ?? '{}').rows.map((x: { count: number }) => x.count)
    expect(second.charts?.[0]?.rows.map((x) => x.count)).toEqual([...counts].sort((a, b) => b - a))
  })

  it('with "Let Ask change the screen" off: no action tools, Claude is told, and a call anyway changes nothing', async () => {
    const f = fakeApp(ctx, { actions: false })
    const client = fakeClient([
      { blocks: [{ type: 'tool_use', name: 'set_filters', input: { location: ['Bengaluru'] } }] },
      { blocks: [{ type: 'text', text: 'Changing the screen is off.' }] },
    ])
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Filter to Bengaluru',
      env: envOf(ctx, { app: f.app }),
    })
    const body = client.log.bodies[0]!
    const names = (body.tools ?? []).map((t) => (t as { name: string }).name)
    expect(names).toContain('get_screen')
    expect(names).toContain('make_chart')
    for (const n of [
      'set_filters',
      'reset_filters',
      'open_view',
      'show_figure',
      'open_records',
      'apply_saved_view',
    ])
      expect(names).not.toContain(n)
    expect(systemText(body)).toMatch(/Changing the screen is turned off in Settings > Ask Census/)
    expect(JSON.parse(r.calls[0]?.result ?? '{}').error).toBe(ACTIONS_OFF)
    expect(r.actions).toEqual([])
    expect(f.history).toHaveLength(1)
  })

  it('in Manager mode sends the screen section and the Manager line, and keeps the org', async () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf)
    const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && ctx.org.byId.get(l.id)?.managerId)!
    const m = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })
    const f = fakeApp(m, { route: { view: 'team', tab: '' } })
    const client = fakeClient([
      { blocks: [{ type: 'tool_use', name: 'open_view', input: { view: 'comp' } }] },
      { blocks: [{ type: 'text', text: 'Compensation is not shown in Manager mode.' }] },
    ])
    const r = await ask({
      client,
      conversation: new Conversation(),
      question: 'Open compensation',
      env: envOf(m, { app: f.app }),
    })
    const body = client.log.bodies[0]!
    expect(systemText(body)).toMatch(/Census is in Manager mode for \{\{P\d+\}\}'s org/)
    expect(systemText(body)).toMatch(/The screen/)
    expect(r.screen).toMatch(/^On screen: My team; "\{\{P\d+\}\}'s org"; last 12 months\.$/)
    expect(JSON.parse(r.calls[0]?.result ?? '{}').error).toMatch(
      /^Compensation is not shown in Manager mode\./,
    )
    expect(f.history).toHaveLength(1)
  })

  it('without the app it is the chat it was: no screen line, data tools only', async () => {
    const client = fakeClient([{ blocks: [{ type: 'text', text: 'Hi.' }] }])
    const r = await ask({ client, conversation: new Conversation(), question: 'Hello', env: envOf(ctx) })
    expect(r.screen).toBeNull()
    expect(r.sent).toBe('Hello')
    const names = (client.log.bodies[0]?.tools ?? []).map((t) => (t as { name: string }).name)
    expect(names).not.toContain('get_screen')
    expect(systemText(client.log.bodies[0]!)).not.toMatch(/The screen/)
  })
})
