/**
 * Ask Census about quality of hire (docs/ANALYSES.md, 1.8 and 2.9): `view_summary` with
 * `tab: 'analyses:quality'` returns the analysis's own tiles and findings, never a name, an ID or
 * a score per person; Manager mode refuses it; `query_records` groups hires by education with
 * small groups hidden; and the system prompt keeps Ask from ranking people by education.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { suggestionsFor } from '@/ask/engine/copy'
import { SYSTEM_PROMPT } from '@/ask/engine/prompt'
import { call, envOf, expectClean, sampleCtx } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { analysisModel } from '../../registry'
import type { QualityModel } from './model'

let ctx: AnalyticsContext
let conv: Conversation
beforeAll(() => {
  ctx = sampleCtx()
  conv = new Conversation()
}, 60_000)

type Fig = { id: string; metric: string; value: number | null; ref: string | null; opens: string }
type Found = { id: string; title: string; metric: string; people: number | null; ref: string | null }

describe('view_summary, tab analyses:quality', () => {
  it('returns the analysis’s key figures and findings, value for value, with refs and nothing personal', () => {
    const m = analysisModel<QualityModel>(ctx, 'quality')
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:quality' })
    expect(r.isError).toBe(false)
    const figs = r.json.key_figures as Fig[]
    expect(figs.map((f) => f.id)).toEqual(m.kpis.map((k) => k.id))
    expect(figs.map((f) => f.metric)).toEqual(m.kpis.map((k) => k.metricId))
    expect(figs.find((f) => f.id === 'quality-score')?.value).toBeCloseTo(m.scope.q as number, 4)
    for (const f of figs) expect(f.ref, f.id).toBeTruthy()
    const found = r.json.findings as Found[]
    expect(found.map((f) => f.title)).toEqual(m.findings.map((f) => f.title))
    for (const f of found) expect(f.people, f.id).toBeNull()
    expect(r.json.analysis).toBe('Education and quality of hire')
    expectClean(r.content, 'view_summary analyses:quality')
  })

  it('states the hire window, which the period picked does not change, and no comparison', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:quality' })
    expect(r.json.analysis_window).toMatchObject({
      start: '2023-10-01',
      end: '2025-09-30',
      label: 'Hires 1 Oct 2023 to 30 Sep 2025',
      ignores_period: true,
    })
    expect(r.json).not.toHaveProperty('comparison')
    // Offer declines follows the period, so its comparison stays.
    const d = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:declines' })
    expect(d.json.analysis_window).toMatchObject({ ignores_period: false, end: ctx.window.end })
    expect(d.json).toHaveProperty('comparison')
  })

  it('follows the scope it is given', () => {
    const r = call(conv, envOf(ctx), 'view_summary', {
      view: 'hrbp',
      tab: 'analyses:quality',
      filters: { business_unit: ['Silicon Engineering'] },
    })
    const titles = (r.json.findings as Found[]).map((f) => f.title)
    // In Silicon Engineering the computer science bachelor's cell is withheld (it would give away
    // the row's 3 master's hires), so finding 3 names electrical engineering.
    expect(titles).toContain(
      "Bachelor's hires in electrical engineering score 56 in this scope, against 67 for the company.",
    )
    expectClean(r.content, 'view_summary analyses:quality, Silicon Engineering')
  })

  it('is refused in Manager mode, like any hidden number', () => {
    const mid = leaderOptions(ctx.org, ctx.asOf, 3).find((l) => l.size >= 25 && l.size <= 90)
    const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid?.id ?? null } })
    const r = call(new Conversation(), envOf(mgr), 'view_summary', { view: 'hrbp', tab: 'analyses:quality' })
    expect(r.isError).toBe(true)
    expect(r.content).toContain('Quality of hire is not shown in Manager mode')
    expect(r.content).not.toMatch(/\d{2}\.\d/)
  })
})

describe('query_records on education', () => {
  it('groups employees by university with small groups hidden', () => {
    const r = call(conv, envOf(ctx), 'query_records', {
      dataset: 'employees',
      where: [{ field: 'hireDate', op: 'between', value: ['2023-10-01', '2025-09-30'] }],
      group_by: [{ field: 'university' }],
      limit: 60,
    })
    expect(r.isError).toBe(false)
    const rows = r.json.rows as { group?: Record<string, unknown>; count: number | null }[]
    expect(rows.length).toBeGreaterThan(5)
    for (const row of rows)
      expect(row.count == null || row.count >= 5, String(row.group?.university)).toBe(true)
    expectClean(r.content, 'query_records by university')
  })
})

describe('what Ask is told and offers', () => {
  it('never ranks a person by education, and suggests the analysis questions on the tab', () => {
    expect(SYSTEM_PROMPT).toContain(
      'Never rank, score or single out a person or candidate by their education',
    )
    expect(suggestionsFor('hrbp', 'analyses:quality')[0]).toBe('What drives quality of hire here?')
    expect(suggestionsFor('hrbp', 'analyses:stages', (k) => k !== 'quality' && k !== 'declines')).toEqual([
      'How many verification engineers do we have per RTL designer?',
      'Which levels grew fastest in the last year?',
    ])
    expect(suggestionsFor('hrbp', 'attrition')).toEqual(suggestionsFor('hrbp'))
  })
})
