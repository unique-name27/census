/**
 * Ask on the Level pyramid (docs/ANALYSES.md, 5.8): `view_summary` with `tab: 'analyses:pyramid'`
 * returns the tiles and findings the tab shows (refs open the same records, nothing personal goes
 * out, Manager mode answers inside the org), and `query_records` recounts headcount by level and
 * business unit to the pyramid's numbers.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, expectClean, sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/Drill'
import { analysisModel } from '../../registry'
import type { PyramidModel } from '.'

let ctx: AnalyticsContext
let conv: Conversation

beforeAll(() => {
  ctx = sampleCtx()
  conv = new Conversation()
}, 60_000)

type Fig = { id: string; metric: string; value: number | null; ref: string | null; opens: unknown }
type Out = { id: string; metric: string; title: string; ref: string | null; concentrates_in: string | null }

describe('view_summary on the pyramid', () => {
  it('returns the tab’s tiles and findings, with refs to the same records', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:pyramid' })
    expect(r.json.tab).toBe('analyses:pyramid')
    expect(r.json.analysis).toBe('Workforce pyramid by level')
    const m = analysisModel<PyramidModel>(ctx, 'pyramid')
    const figs = r.json.key_figures as Fig[]
    expect(figs.map((f) => f.id)).toEqual(m.kpis.map((k) => k.id))
    expect(figs[0]).toMatchObject({ metric: 'hrbp.headcount.employees', value: 1450 })
    expect(figs.find((f) => f.id === 'pyramid-entry')?.value).toBeCloseTo(256 / 1450, 3)
    const employees = resolveDrill(conv.records(figs[0].ref as string))
    expect(employees?.rows).toHaveLength(1450)
    const findings = r.json.findings as Out[]
    expect(findings.map((f) => f.title)).toEqual([
      'L3 grew 31% in 12 months, from 240 to 314, while the workforce grew 8%.',
      'L1 is the thinnest individual level: 65 people, a third of L2 (191).',
    ])
    expect(findings[0].metric).toBe('hrbp.pyramid.findings')
    expect(findings[0].concentrates_in).toContain('L3')
    expect(resolveDrill(conv.records(findings[0].ref as string))?.rows).toHaveLength(314)
    // The flow by level, so Ask can say which levels grew fastest.
    const tables = r.json.tables as { id: string; rows: Record<string, unknown>[] }[]
    expect(tables.map((t) => t.id)).toEqual(['levels', 'flow'])
    expect(tables[1].rows.find((x) => x.level === 'L3 Career')).toMatchObject({
      a_year_ago: 240,
      hired: 108,
      promoted_in: 47,
      promoted_out: 31,
      left: 50,
      other_changes: 0,
      today: 314,
    })
    const fastest = [...tables[0].rows].sort((a, b) => Number(b.growth ?? -1) - Number(a.growth ?? -1))[0]
    expect(fastest.level).toBe('L3 Career')
    expectClean(r.content, 'view_summary analyses:pyramid')
  })

  it('holds the flow back when Job changes fall below the data standard', () => {
    const strict = { ...sampleCtx(), standard: 'gold' as const }
    const r = call(new Conversation(), envOf(strict), 'view_summary', {
      view: 'hrbp',
      tab: 'analyses:pyramid',
    })
    const tables = r.json.tables as { id: string; rows: unknown[]; hidden?: string }[]
    const flow = tables.find((t) => t.id === 'flow')!
    expect(flow.rows).toEqual([])
    expect(flow.hidden).toMatch(/data standard/)
  })

  it('answers in Manager mode, inside the org', () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf, 3)
    const mid = leaders.find((l) => l.size >= 60 && l.size <= 200 && ctx.org.byId.get(l.id)?.managerId)!
    const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })
    const r = call(new Conversation(), envOf(mgr), 'view_summary', { view: 'hrbp', tab: 'analyses:pyramid' })
    expect(r.json.error).toBeUndefined()
    const figs = r.json.key_figures as Fig[]
    const m = analysisModel<PyramidModel>(mgr, 'pyramid')
    expect(figs[0].value).toBe(m.kpis[0].value)
    expect(m.kpis[0].value).toBeLessThan(1450)
  })
})

describe('query_records on levels', () => {
  it('recounts active employees by level to the pyramid', () => {
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'employees',
      where: [
        { field: 'active', op: 'eq', value: true },
        { field: 'employmentType', op: 'eq', value: 'Employee' },
      ],
      group_by: [{ field: 'level' }],
      limit: 50,
    })
    const rows = r.json.rows as { group: { level: string }; count: number }[]
    const m = analysisModel<PyramidModel>(ctx, 'pyramid')
    for (const row of m.data.main.rows)
      expect(rows.find((x) => x.group.level === row.level)?.count ?? 0, row.level).toBe(row.today)
  })

  it('recounts a level by business unit to the pyramid’s segments', () => {
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'employees',
      where: [
        { field: 'active', op: 'eq', value: true },
        { field: 'employmentType', op: 'eq', value: 'Employee' },
        { field: 'level', op: 'eq', value: 'L3' },
      ],
      group_by: [{ field: 'businessUnit' }],
      limit: 50,
    })
    const rows = r.json.rows as { group: { businessUnit: string }; count: number }[]
    const m = analysisModel<PyramidModel>(ctx, 'pyramid')
    for (const s of m.data.segments.businessUnit.filter((x) => x.level === 'L3' && x.unit))
      expect(rows.find((x) => x.group.businessUnit === s.segment)?.count, s.segment).toBe(s.today)
  })
})
