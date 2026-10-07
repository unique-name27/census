/**
 * Ask in Manager mode (docs/ROLES.md, 4.7 and 6.8 test 5), on the sample: every tool with a matrix
 * of arguments keeps to the manager's org (no token for anyone outside it except owners and the
 * manager's own reporting line); `explain_quality` is neither offered nor run; hidden views and
 * datasets are refused; a leader outside the org and leaving a leader out are refused; an org under
 * the anonymity minimum turns Ask off; and the request carries the Manager mode line.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import type { AnalyticsContext } from '@/data/context'
import { DEFAULT_FILTERS, scopeDatasets } from '@/data/scope'
import { collectActions } from '@/views/actions/engine'
import { VIEWS } from '@/views/registry'
import { ACTION_OWNER_ROLES } from '@/views/types'
import { groupableFields, QUERY_DATASETS } from './allowlist'
import { Conversation } from './conversation'
import { fakeClient } from './fakeApi'
import { ask } from './loop'
import { TOKEN_RE } from './privacy'
import { managerPromptLine } from './prompt'
import { call, envOf, leaks, sampleCtx } from './testkit'
import { TOOL_DEFINITIONS, toolDefinitionsFor } from './tools'
import { COMPARE_BY } from './tools/summary'

const company = sampleCtx()
const leaders = leaderOptions(company.org, company.asOf)
const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && company.org.byId.get(l.id)?.managerId)!
const small = leaders.find((l) => l.size < 5)

const managerCtx = (managerId: string): AnalyticsContext =>
  sampleCtx({
    access: { mode: 'manager', managerId },
    showPay: true,
    showImmigration: true,
    engagement: true,
  })

let ctx: AnalyticsContext

/**
 * Who may appear by token though outside the org: the manager's own reporting line, and owners of
 * the org's work (recruiters, coordinators and hiring managers of its reqs and candidates, its
 * employees' HRBPs, the owners of the items Manager mode lists).
 */
function allowedOutside(c: AnalyticsContext): { ids: Set<string>; names: Set<string> } {
  const ids = new Set<string>()
  const names = new Set<string>()
  let m = c.org.byId.get(mid.id)?.managerId
  while (m && !ids.has(m)) {
    ids.add(m)
    m = c.org.byId.get(m)?.managerId
  }
  const scoped = scopeDatasets(c.all, { ...DEFAULT_FILTERS, leaderId: mid.id }, c.org)
  const add = (v: string | null | undefined) => {
    if (!v) return
    names.add(v)
    if (c.org.byId.has(v)) ids.add(v)
  }
  for (const r of scoped.requisitions) {
    add(r.recruiter)
    add(r.hiringManager)
    add(r.hiringManagerId)
  }
  for (const k of scoped.candidates) {
    add(k.recruiter)
    add(k.coordinator)
  }
  for (const e of scoped.employees) add(e.hrbp)
  for (const a of collectActions(c, VIEWS).items) {
    add(a.ownerId)
    add(a.ownerName)
  }
  return { ids, names }
}

describe('Ask in Manager mode', () => {
  beforeAll(() => {
    ctx = managerCtx(mid.id)
  }, 60_000)

  it('keeps every tool and argument inside the org: no outsider by token but owners and the reporting line', () => {
    const lock = ctx.access.lock!
    const allowed = allowedOutside(ctx)
    const conv = new Conversation()
    const problems: string[] = []
    const check = (name: string, input: unknown) => {
      const r = call(conv, envOf(ctx), name, input)
      const l = leaks(r.content)
      if (l.length) problems.push(`${name} ${JSON.stringify(input)} leaks ${l.slice(0, 3).join(', ')}`)
      for (const t of r.content.match(new RegExp(TOKEN_RE.source, 'g')) ?? []) {
        const p = conv.tokens.resolve(t)
        if (!p) continue
        const inside = p.employeeId ? lock.orgIds.has(p.employeeId) : false
        const owner = (p.employeeId && allowed.ids.has(p.employeeId)) || allowed.names.has(p.name)
        if (!inside && !owner) problems.push(`${name} ${JSON.stringify(input)}: ${p.name} is outside the org`)
      }
      return r
    }
    const context = check('get_context', {}).json
    const views = (context.views as { view: string }[]).map((v) => v.view)
    expect(views).toEqual(['team', 'recruiting', 'onboarding', 'hrbp', 'org', 'talent'])
    expect((context.datasets as unknown[]).length).toBe(8)
    for (const v of views) check('view_summary', { view: v })
    for (const v of views.filter((x) => x !== 'org' && x !== 'team'))
      for (const by of COMPARE_BY) {
        const s = call(conv, envOf(ctx), 'view_summary', { view: v }).json
        const kpi = (s.key_figures as { id: string }[] | undefined)?.[0]?.id
        if (kpi) check('compare_groups', { view: v, kpi, by })
      }
    for (const d of QUERY_DATASETS) {
      if (!ctx.access.can(`dataset:${d.key}`)) continue
      check('query_records', { dataset: d.key })
      for (const f of groupableFields(d))
        check('query_records', { dataset: d.key, group_by: [{ field: f.name }] })
    }
    check('find_metrics', { query: 'attrition' })
    for (const g of ACTION_OWNER_ROLES) check('open_items', { owner_group: g })
    expect(problems).toEqual([])
  })

  it('neither offers nor runs explain_quality', () => {
    const tools = toolDefinitionsFor(ctx.access)
    expect(tools.map((t) => t.name)).not.toContain('explain_quality')
    expect(tools.length).toBe(TOOL_DEFINITIONS.length - 1)
    // The last tool keeps the cache breakpoint.
    expect(tools[tools.length - 1].cache_control).toEqual({ type: 'ephemeral' })
    const r = call(new Conversation(), envOf(ctx), 'explain_quality', {})
    expect(r.isError).toBe(true)
    expect(r.json.error).toMatch(/not available in Manager mode/)
    // HR mode offers every tool.
    expect(toolDefinitionsFor(company.access)).toBe(TOOL_DEFINITIONS)
  })

  it('refuses the views and datasets Manager mode hides', () => {
    const conv = new Conversation()
    for (const view of ['scorecard', 'comp', 'services', 'compliance', 'listening']) {
      const r = call(conv, envOf(ctx), 'view_summary', { view })
      expect(r.isError, view).toBe(true)
      expect(String(r.json.error), view).toMatch(/not shown in Manager mode/)
    }
    expect(call(conv, envOf(ctx), 'view_summary', { view: 'scorecard' }).json.error).toBe(
      'The scorecard is not shown in Manager mode.',
    )
    for (const dataset of [
      'cases',
      'transactions',
      'comp',
      'hiringPlan',
      'rightToWork',
      'surveyResponses',
      'surveyItems',
    ]) {
      const r = call(conv, envOf(ctx), 'query_records', { dataset })
      expect(r.isError, dataset).toBe(true)
    }
    // The enums Claude sees list only what Manager mode shows.
    const q = toolDefinitionsFor(ctx.access).find((t) => t.name === 'query_records')!
    const enumOf = (q.input_schema.properties as Record<string, { enum?: string[] }>).dataset.enum
    expect(enumOf).not.toContain('comp')
    expect(enumOf).toContain('employees')
  })

  it('refuses a leader outside the org and leaving a leader out', () => {
    const conv = new Conversation()
    conv.tokens.index(ctx)
    const lock = ctx.access.lock!
    const outside = leaders.find((l) => !lock.orgIds.has(l.id))!
    const out = call(conv, envOf(ctx), 'view_summary', {
      view: 'hrbp',
      filters: { leader: conv.tokens.forEmployee(outside.id) },
    })
    expect(out.isError).toBe(true)
    expect(out.json.error).toMatch(/In Manager mode a leader filter must be someone in/)
    const excl = call(conv, envOf(ctx), 'view_summary', {
      view: 'hrbp',
      filters: { leader: conv.tokens.forEmployee(mid.id), exclude: ['leader'] },
    })
    expect(excl.isError).toBe(true)
    // Without a leader, a tool call is the manager's org, never the whole company.
    const own = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { period: 't6m' } })
    expect(own.isError).toBe(false)
    expect(String(own.json.scope)).toMatch(/^\{\{P\d+\}\}'s org/)
  })

  it('turns Ask off for an org under the anonymity minimum, sending nothing', async () => {
    if (!small) return
    const tiny = managerCtx(small.id)
    const r = call(new Conversation(), envOf(tiny), 'get_context', {})
    expect(r.isError).toBe(true)
    expect(r.json.error).toBe(
      'Ask needs an org of 5 or more employees in Manager mode, so that no answer is about one person.',
    )
    const client = fakeClient(() => {
      throw new Error('Nothing may be sent')
    })
    const res = await ask({
      client,
      conversation: new Conversation(),
      question: 'How many people?',
      env: envOf(tiny),
    })
    expect(res.status).toBe('error')
    expect(client.log.bodies).toHaveLength(0)
  })

  it('sends the Manager mode line after the system prompt, with the manager as a token', async () => {
    const client = fakeClient([{ blocks: [{ type: 'text', text: 'Hello.' }] }])
    const conversation = new Conversation()
    await ask({ client, conversation, question: 'Hi', env: envOf(ctx) })
    const body = client.log.bodies[0] as unknown as { system: { text: string }[]; tools: { name: string }[] }
    const token = conversation.tokens.forEmployee(mid.id)
    expect(body.system.at(-1)?.text).toBe(managerPromptLine(token))
    expect(body.tools.map((t) => t.name)).not.toContain('explain_quality')
    expect(leaks(JSON.stringify(body.system))).toEqual([])
  })
})
