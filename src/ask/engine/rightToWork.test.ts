/**
 * Right to work in view summaries: the Compliance key figures and findings built on right to work
 * follow the rule query_records keeps for that dataset (grouped counts only, counts under the
 * anonymity minimum not sent). On the sample, one engineer works without an export license in
 * force and reverification has not started for a few people: none of those small counts, nor the
 * dates in the findings' details, go to Claude.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { minGroupOf } from '@/metrics/privacy'
import { VIEWS } from '@/views/registry'
import { Conversation } from './conversation'
import { call, envOf, sampleCtx } from './testkit'
import { RTW_SMALL, rtwFinding, rtwSmallCount, usesRightToWork } from './tools/rightToWork'

type Fig = {
  id: string
  value: number | null
  value_text: string
  hidden: string | null
  note: string | null
}
type Out = { id: string; title: string; detail: string | null; next_step: string | null }

let ctx: AnalyticsContext
let min: number
const compliance = () =>
  VIEWS.find((v) => v.key === 'compliance')?.summary?.(ctx) as {
    kpis: Kpi[]
    findings: Finding[]
  }

beforeAll(() => {
  ctx = sampleCtx()
  min = minGroupOf(ctx.metrics)
}, 60_000)

describe('right to work in view summaries', () => {
  it('has small right to work counts on the sample to hold back', () => {
    const own = compliance()
    expect(own.kpis.some((k) => rtwSmallCount(k, min))).toBe(true)
    expect(own.findings.some((f) => rtwFinding(f, min) === 'withhold')).toBe(true)
  })

  it('sends no right to work count under the minimum, and no right to work note', () => {
    const own = compliance()
    const r = call(new Conversation(), envOf(ctx), 'view_summary', { view: 'compliance' })
    const figs = r.json.key_figures as Fig[]
    own.kpis.forEach((k, i) => {
      const f = figs[i] as Fig
      if (rtwSmallCount(k, min)) {
        expect(f.value, k.id).toBeNull()
        expect(f.value_text, k.id).toBe('—')
        expect(f.hidden, k.id).toBe(RTW_SMALL(min))
      }
      if (usesRightToWork(k.uses)) expect(f.note, k.id).toBeNull()
    })
    expect(r.content).not.toMatch(/1 person is working without an export license/)
  })

  it('sends right to work findings as their titles, and none about fewer people than the minimum', () => {
    const own = compliance()
    const r = call(new Conversation(), envOf(ctx), 'view_summary', { view: 'compliance' })
    const sent = r.json.findings as Out[]
    const ids = new Set(sent.map((f) => f.id))
    for (const f of own.findings) {
      const how = rtwFinding(f, min)
      expect(ids.has(f.id), f.id).toBe(how !== 'withhold')
      if (how === 'withhold') expect(r.content).not.toContain(f.title)
      if (how === 'title') {
        const out = sent.find((x) => x.id === f.id) as Out
        expect(out.detail).toBeNull()
        expect(out.next_step).toBeNull()
      }
    }
    const withheld = own.findings.filter((f) => rtwFinding(f, min) === 'withhold').length
    expect(r.json.withheld_findings).toMatch(new RegExp(`fewer than ${min} people`))
    expect(r.json.withheld_findings).toMatch(new RegExp(`^${withheld} finding`))
  })

  it('holds the same line by group and on the scorecard', () => {
    const conv = new Conversation()
    const g = call(conv, envOf(ctx), 'compare_groups', {
      view: 'compliance',
      kpi: 'compliance-without-license',
      by: 'location',
    })
    for (const row of [...(g.json.groups as Fig[]), g.json.overall as Fig])
      if (row.value != null) expect(row.value === 0 || row.value >= min).toBe(true)
    const sc = call(conv, envOf(ctx), 'view_summary', { view: 'scorecard' })
    expect(sc.content).not.toMatch(/1 person is working without an export license/)
    const measures = (sc.json.practices as { measures: (Fig & { label: string })[] }[]).flatMap(
      (p) => p.measures,
    )
    const license = measures.find((m) => m.label === 'Working without a license in force')
    if (license) expect(license.value === null || license.value === 0 || license.value >= min).toBe(true)
  })

  it('leaves views without right to work as they are', () => {
    const r = call(new Conversation(), envOf(ctx), 'view_summary', { view: 'hrbp' })
    expect(r.json.withheld_findings).toBeUndefined()
    expect((r.json.findings as Out[]).some((f) => f.detail)).toBe(true)
  })
})
