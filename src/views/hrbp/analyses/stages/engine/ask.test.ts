/**
 * Ask on Engineering by stage (docs/ANALYSES.md, 1.8 and 4.9): `view_summary` with `tab:
 * 'analyses:stages'` returns the tab's own tiles, findings and stage tables; `query_records`
 * groups employees and requisitions by the derived `chipStage`, counting exactly what the
 * analysis counts; Manager mode leaves planned starts out.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, expectClean, sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { SID } from './metrics'
import { stagesModel } from './model'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

type Row = { group?: Record<string, unknown>; count: number | null } & Record<string, unknown>

let ctx: AnalyticsContext
let conv: Conversation
beforeAll(() => {
  ctx = sampleCtx()
  conv = new Conversation()
}, 60_000)

const q = (input: Record<string, unknown>, c: AnalyticsContext = ctx) =>
  call(conv, envOf(c), 'query_records', input)

describe('query_records by chip development stage', () => {
  it('counts engineering employees per stage as the capacity figure does', () => {
    const r = q({
      dataset: 'employees',
      where: [{ field: 'inHeadcount', op: 'eq', value: true }],
      group_by: ['chipStage'],
      limit: 50,
    })
    expectClean(r.content, 'employees by stage')
    const m = stagesModel(ctx)
    const got = new Map((r.json.rows as Row[]).map((x) => [x.group?.chipStage, x.count]))
    for (const c of m.capacity) expect(got.get(c.stage) ?? 0, c.stage).toBe(c.employees)
  })

  it('places a req by its department’s most common job function, as hiring in flight does', () => {
    const r = q({
      dataset: 'requisitions',
      where: [{ field: 'status', op: 'eq', value: 'Open' }],
      group_by: ['chipStage'],
      measures: [{ op: 'sum', field: 'openings' }],
      limit: 50,
    })
    expectClean(r.content, 'reqs by stage')
    const m = stagesModel(ctx)
    const got = new Map((r.json.rows as Row[]).map((x) => [x.group?.chipStage, x.sum_openings]))
    for (const h of m.hiring) if (h.open) expect(got.get(h.stage), h.stage).toBe(h.open)
  })
})

describe('view_summary of the analysis', () => {
  it('returns the tab’s tiles, findings and stage tables', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:stages' })
    expectClean(r.content, 'view_summary of the analysis')
    const m = stagesModel(ctx)
    const figures = r.json.key_figures as { id: string; value: number | null }[]
    expect(figures.map((k) => k.id)).toEqual(m.kpis.map((k) => k.id))
    const ratio = figures.find((k) => k.id === 'stages-verification-ratio')
    expect(ratio?.value).toBeCloseTo(149 / 128, 2)
    const findings = r.json.findings as { title: string }[]
    expect(findings.map((f) => f.title)).toEqual(m.findings.map((f) => f.title))
    const tables = r.json.tables as { id: string; rows: Record<string, unknown>[] }[]
    expect(tables.map((t) => t.id)).toEqual(['capacity', 'hiring', 'ratios'])
    const dv = tables[0].rows.find((x) => x.stage === 'Design verification')
    expect(dv).toMatchObject({ employees: 149, contractors: 21, topSite: 'Bengaluru' })
  })

  it('leaves planned starts out in Manager mode', () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf, 3)
    const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && ctx.org.byId.get(l.id)?.managerId)!
    const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })
    const r = call(new Conversation(), envOf(mgr), 'view_summary', { view: 'hrbp', tab: 'analyses:stages' })
    const figures = r.json.key_figures as { metric: string }[]
    expect(figures.length).toBeGreaterThan(0)
    expect(figures.some((k) => k.metric === SID.planned)).toBe(false)
    const hiring = (r.json.tables as { id: string; rows: Record<string, unknown>[] }[]).find(
      (t) => t.id === 'hiring',
    )
    expect(hiring?.rows.every((x) => !('planned' in x))).toBe(true)
  })
})
