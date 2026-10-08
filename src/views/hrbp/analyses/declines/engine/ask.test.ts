/**
 * Ask on Offer declines (docs/ANALYSES.md, 1.8 and 3.9): `view_summary` with `tab:
 * 'analyses:declines'` returns the analysis's own tiles and findings, Manager mode refuses it like
 * any hidden number, and `query_records` reads the new Candidate fields: competing offer and offer
 * revised as groupings, position in range as a ratio with small groups hidden.
 */
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf, sampleCtx } from '@/ask/engine/testkit'
import { analysisModel } from '../../registry'
import type { DeclinesModel } from './model'

const ctx = sampleCtx()
const m = analysisModel<DeclinesModel>(ctx, 'declines')

type Json = Record<string, unknown>
const list = (v: unknown) => v as Json[]

describe('view_summary on Offer declines', () => {
  const r = call(new Conversation(), envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:declines' })

  it('returns the tiles and findings the tab shows', () => {
    expect(r.isError).toBe(false)
    expect(r.json.tab).toBe('analyses:declines')
    expect(r.json.analysis).toBe('Why offers are declined')
    const figures = list(r.json.key_figures)
    expect(figures.map((k) => k.id)).toEqual(m.kpis.map((k) => k.id))
    // Values are rounded to 4 decimals for Claude.
    for (const [i, k] of figures.entries())
      expect(k.value as number).toBeCloseTo(m.kpis[i].value as number, 4)
    expect(figures[0]).toMatchObject({ metric: 'hrbp.declines.rate', value_text: '21.9%' })
    expect(figures.every((k) => typeof k.ref === 'string')).toBe(true)
    expect(list(r.json.findings).map((f) => f.title)).toEqual(m.findings.map((f) => f.title))
    expect((figures[0].opens as Json).tab ?? figures[0].opens).toBeTruthy()
  })

  it('refuses an unknown tab or another view', () => {
    const bad = call(new Conversation(), envOf(ctx), 'view_summary', { view: 'hrbp', tab: 'analyses:nope' })
    expect(bad.isError).toBe(true)
    expect(String(bad.json.error)).toContain('analyses:declines')
    expect(
      call(new Conversation(), envOf(ctx), 'view_summary', { view: 'recruiting', tab: 'analyses:declines' })
        .isError,
    ).toBe(true)
  })

  it('is refused in Manager mode, like any hidden number', () => {
    const leaders = leaderOptions(ctx.org, ctx.asOf, 3)
    const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && ctx.org.byId.get(l.id)?.managerId)!
    const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })
    const out = call(new Conversation(), envOf(mgr), 'view_summary', {
      view: 'hrbp',
      tab: 'analyses:declines',
    })
    expect(out.isError).toBe(true)
    expect(String(out.json.error)).toBe(
      'Offer declines is not shown in Manager mode, so Ask does not answer about it. Say so, and do not estimate it.',
    )
  })
})

describe('query_records on the offer fields', () => {
  const q = (input: Json) => call(new Conversation(), envOf(ctx), 'query_records', input)

  it('groups declined offers by competing offer and offer revised', () => {
    for (const field of ['competingOffer', 'offerRevised'] as const) {
      const r = q({
        dataset: 'candidates',
        group_by: [field],
        where: [{ field: 'status', op: 'eq', value: 'Declined' }],
      })
      expect(r.isError, field).toBe(false)
      const rows = list(r.json.rows)
      const want = new Map<string, number>()
      for (const c of ctx.data.candidates)
        if (c.status === 'Declined' && c[field] != null)
          want.set(String(c[field]), (want.get(String(c[field])) ?? 0) + 1)
      for (const row of rows) {
        const g = (row.group as Json)[field]
        if (g == null) continue
        expect(row.count, `${field} ${g}`).toBe(want.get(String(g)))
      }
    }
  })

  it('reads position in range as a ratio, grouped, with small groups hidden', () => {
    const r = q({
      dataset: 'candidates',
      group_by: ['status'],
      measures: [{ op: 'median', field: 'offerPositionInRange' }],
      where: [{ field: 'status', op: 'in', value: ['Hired', 'Declined'] }],
    })
    expect(r.isError).toBe(false)
    const rows = list(r.json.rows)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const v = Object.entries(row).find(([k]) => k.includes('offerPositionInRange'))?.[1]
      if (v != null) {
        expect(typeof v).toBe('number')
        expect(v as number).toBeLessThanOrEqual(1.5)
      }
    }
  })
})
