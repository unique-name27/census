/**
 * The tools on the sample company: they compute through the views' own engines, so Ask never
 * disagrees with the screen; refs open the same records; suppression, the data standard and the
 * pay rule hide what the app hides; scope filters and errors. Call timings are in tools.perf.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { kpiValueText } from '@/components/kpiModel'
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { fieldShortfall } from '@/data/quality/compute'
import { resolveDrill } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { kpiTarget } from '@/metrics/api'
import { minGroupOf } from '@/metrics/privacy'
import { metricsWith } from '@/metrics/testing'
import { collectActions, countActions, isOpen } from '@/views/actions/engine'
import { VIEWS } from '@/views/registry'
import type { ViewDef } from '@/views/types'
import { Conversation } from './conversation'
import { chatContext, contextFor } from './scope'
import { call, envOf, expectClean, sampleCtx, tieredCtx } from './testkit'
import { TOOL_DEFINITIONS, TOOL_NAMES } from './tools'
import { rtwFinding, rtwSmallCount } from './tools/rightToWork'
import { num } from './tools/shared'

type Fig = {
  id: string
  value: number | null
  value_text: string
  hidden: string | null
  suppressed: string | null
  note: string | null
  ref: string | null
  status: string
}

const summarized = VIEWS.filter((v) => typeof v.summary === 'function')
const viewOf = (key: string) => VIEWS.find((v) => v.key === key) as ViewDef

let ctx: AnalyticsContext
let conv: Conversation
beforeAll(() => {
  ctx = sampleCtx()
  conv = new Conversation()
}, 60_000)

const rowsOf = (spec: DrillSpec | null | undefined) => spec?.rows ?? []

describe('view_summary', () => {
  it('returns the view’s own key figures and findings, value for value', () => {
    for (const v of summarized) {
      const own = v.summary?.(ctx) as { kpis: Kpi[]; findings: unknown[] }
      const r = call(conv, envOf(ctx), 'view_summary', { view: v.key })
      expect(r.isError, v.key).toBe(false)
      const figs = r.json.key_figures as Fig[]
      expect(
        figs.map((f) => f.id),
        v.key,
      ).toEqual(own.kpis.map((k) => k.id))
      const min = minGroupOf(ctx.metrics)
      own.kpis.forEach((k, i) => {
        const f = figs[i] as Fig
        // Right to work counts under the minimum are not sent (rightToWork.test.ts).
        if (
          k.suppressed ||
          k.value == null ||
          k.format === 'money' ||
          k.format === 'moneyFull' ||
          rtwSmallCount(k, min)
        ) {
          expect(f.value, `${v.key} ${k.id}`).toBeNull()
        } else {
          expect(f.value, `${v.key} ${k.id}`).toBe(num(k.value))
          expect(f.value_text, `${v.key} ${k.id}`).toBe(kpiValueText(k))
        }
      })
      // Every finding the bronze standard shows comes through, in the view's order (but right to
      // work findings about fewer people than the minimum).
      const sent = (own.findings as Finding[]).filter((f) => rtwFinding(f, min) !== 'withhold')
      expect((r.json.findings as unknown[]).length, v.key).toBe(sent.length)
      expectClean(r.content, `view_summary ${v.key}`)
    }
  })

  it('judges each key figure as its tile does: met or missed, never watch', () => {
    const scopes = [ctx, sampleCtx({ filters: { location: ['Bengaluru'] } })]
    let missed = 0
    let watch = 0
    for (const c of scopes) {
      const conv2 = new Conversation()
      for (const v of summarized) {
        if (v.key === 'scorecard') continue
        const own = v.summary?.(c) as { kpis: Kpi[] }
        const figs = call(conv2, envOf(c), 'view_summary', { view: v.key }).json.key_figures as (Fig & {
          scorecard_status?: string
        })[]
        own.kpis.forEach((k, i) => {
          const f = figs[i] as Fig & { scorecard_status?: string }
          const metric = k.metricId && c.metrics.def(k.metricId) ? k.metricId : null
          const tile = kpiTarget(c.metrics, metric, k.value, k.format)
          if (f.value == null) expect(f.status, `${v.key} ${k.id}`).toBe('unknown')
          else expect(f.status, `${v.key} ${k.id}`).toBe(tile?.status ?? 'none')
          expect(f.status).not.toBe('watch')
          if (f.status === 'missed') missed++
          if (f.scorecard_status) {
            expect(f.status).toBe('missed')
            expect(f.scorecard_status).toBe('watch')
            watch++
          }
        })
      }
    }
    expect(missed).toBeGreaterThan(0)
    expect(watch).toBeGreaterThan(0)
    // Bengaluru regretted attrition misses its target on the tile, whatever the scorecard's margin says.
    const blr = call(new Conversation(), envOf(scopes[1] as AnalyticsContext), 'compare_groups', {
      view: 'hrbp',
      kpi: 'hrbp.attrition.regretted',
      by: 'location',
      values: ['Bengaluru'],
    })
    const g = (blr.json.groups as Fig[])[0] as Fig
    const own = viewOf('hrbp')
      .summary?.(scopes[1] as AnalyticsContext)
      .kpis.find((k) => k.metricId === 'hrbp.attrition.regretted') as Kpi
    expect(g.status).toBe(kpiTarget(ctx.metrics, own.metricId, own.value, own.format)?.status)
  })

  it('states the anonymity minimum in force when a figure is suppressed', () => {
    const raised = sampleCtx({ metrics: metricsWith({ 'privacy.anonymity': { minGroup: 7 } }) })
    const r = call(new Conversation(), envOf(raised), 'compare_groups', {
      view: 'hrbp',
      kpi: 'voluntary',
      by: 'level',
    })
    const notes = [...(r.json.groups as Fig[]), r.json.overall as Fig]
      .map((g) => g.suppressed)
      .filter((x): x is string => !!x)
    expect(notes.length).toBeGreaterThan(0)
    for (const n of notes) expect(n).toBe('Hidden to protect anonymity (n < 7)')
  })

  it('gives each shown number a ref that opens the same records as the screen', () => {
    const hrbp = viewOf('hrbp')
    const own = hrbp.summary?.(ctx) as { kpis: Kpi[] }
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp' })
    const figs = r.json.key_figures as Fig[]
    own.kpis.forEach((k, i) => {
      const ref = figs[i]?.ref as string
      expect(ref).toMatch(/^r\d+$/)
      const fromAsk = resolveDrill(conv.records(ref))
      const fromScreen = resolveDrill(k.drill)
      expect(fromAsk?.kind).toBe(fromScreen?.kind)
      expect(rowsOf(fromAsk)).toEqual(rowsOf(fromScreen))
      expect(rowsOf(fromAsk).length).toBeGreaterThan(0)
    })
    const findings = r.json.findings as { ref: string | null }[]
    expect(findings.some((f) => f.ref && conv.hasRef(f.ref))).toBe(true)
  })

  it('reads the people behind a finding as a count, never as names', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp' })
    const f = (r.json.findings as { title: string; people: number | null }[])[0]
    expect(f?.people).toBeGreaterThan(0)
    expect(r.content).not.toMatch(/"people":\[/)
  })

  it('summarizes the scorecard as the scorecard does', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'scorecard' })
    expect(r.isError).toBe(false)
    const practices = r.json.practices as { view: string; measures: { status: string }[] }[]
    expect(practices.map((p) => p.view)).toEqual([
      'recruiting',
      'onboarding',
      'hrbp',
      'services',
      'talent',
      'comp',
      'compliance',
      'listening',
    ])
    expect(String(r.json.targets_met)).toMatch(/^\d+ of \d+$/)
    expectClean(r.content, 'scorecard')
  })

  it('gives a view without a readout its folder-tab number, and refuses AI in HR', () => {
    const org = call(conv, envOf(ctx), 'view_summary', { view: 'org' })
    expect(org.isError).toBe(false)
    expect((org.json.key_figures as unknown[]).length).toBe(1)
    const ai = call(conv, envOf(ctx), 'view_summary', { view: 'ai' })
    expect(ai.isError).toBe(true)
    expect(ai.json.error).toMatch(/reads no data/)
  })

  it('computes for the scope a call asks for, and says so', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { location: ['bengaluru'] } })
    expect(r.json.scope).toBe('Bengaluru')
    const own = viewOf('hrbp').summary?.(sampleCtx({ filters: { location: ['Bengaluru'] } })) as {
      kpis: Kpi[]
    }
    expect((r.json.key_figures as Fig[])[0]?.value).toBe(num(own.kpis[0]?.value))
    expect(r.label).toBe('Calculating People stats key figures for Bengaluru')
  })

  it('takes a leader as a token, never as a name', () => {
    const g = call(conv, envOf(ctx), 'get_context')
    const leaders = (g.json.vocabularies as { leaders: { leader: string; org_size: number }[] }).leaders
    const second = leaders[1] as { leader: string }
    expect(second.leader).toMatch(/^\{\{P\d+\}\}$/)
    const id = conv.tokens.employeeIdOf(second.leader) as string
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { leader: second.leader } })
    expect(r.json.scope).toBe(`${second.leader}'s org`)
    const own = viewOf('hrbp').summary?.(sampleCtx({ filters: { leaderId: id } })) as { kpis: Kpi[] }
    expect((r.json.key_figures as Fig[])[0]?.value).toBe(
      own.kpis[0]?.suppressed ? null : num(own.kpis[0]?.value),
    )
    expectClean(r.content, 'leader scope')
    const bad = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { leader: '{{P99999}}' } })
    expect(bad.isError).toBe(true)
    const named = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { leader: 'E10001' } })
    expect(named.isError).toBe(true)
  })

  it('names the values that exist when a filter value does not', () => {
    const r = call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', filters: { location: ['Atlantis'] } })
    expect(r.isError).toBe(true)
    expect(r.json.error).toMatch(/No location "Atlantis".*Bengaluru/)
  })

  it('hides numbers below the data standard with the reason, never the value', () => {
    const gold = tieredCtx('gold')
    const c = new Conversation()
    let hiddenSeen = 0
    for (const v of summarized) {
      const r = call(c, envOf(gold), 'view_summary', { view: v.key })
      for (const f of r.json.key_figures as Fig[]) {
        if (!f.hidden) continue
        hiddenSeen++
        expect(f.value, `${v.key} ${f.id}`).toBeNull()
        expect(f.value_text).toBe('—')
        expect(f.ref).toBeNull()
        expect(f.note).toBeNull()
        expect(f.status).toBe('unknown')
      }
    }
    expect(hiddenSeen).toBeGreaterThan(0)
  })

  it('never sends pay amounts, even with Show pay amounts on', () => {
    const paid = sampleCtx({ showPay: true, showImmigration: true })
    expect(chatContext(paid).showPay).toBe(false)
    expect(chatContext(paid).showImmigration).toBe(false)
    const r = call(new Conversation(), envOf(paid), 'view_summary', { view: 'comp' })
    expectClean(r.content, 'comp with pay on')
    expect(r.content).not.toMatch(/\$\d/)
  })

  it('uses the live context itself when nothing needs switching off', () => {
    expect(chatContext(ctx)).toBe(ctx)
    expect(contextFor(ctx, ctx.filters)).toBe(ctx)
    const f = { ...ctx.filters, location: ['Austin'] }
    expect(contextFor(ctx, f)).toBe(contextFor(ctx, { ...f }))
  })
})

describe('compare_groups', () => {
  it('equals the view’s summary rescoped to each group', () => {
    const r = call(conv, envOf(ctx), 'compare_groups', { view: 'hrbp', kpi: 'voluntary', by: 'location' })
    expect(r.isError).toBe(false)
    expect(r.label).toBe('Comparing voluntary attrition by location')
    const groups = r.json.groups as (Fig & { group: string; headcount: number })[]
    expect(groups.length).toBe(12)
    expect(groups[0]?.headcount).toBeGreaterThanOrEqual(groups[1]?.headcount ?? 0)
    for (const g of groups) {
      const own = viewOf('hrbp')
        .summary?.(sampleCtx({ filters: { location: [g.group] } }))
        .kpis.find((k) => k.id === 'voluntary') as Kpi
      expect(g.value, g.group).toBe(own.suppressed ? null : num(own.value))
      if (own.suppressed) expect(g.suppressed, g.group).toMatch(/Hidden to protect anonymity/)
    }
    expect((r.json.overall as Fig).value).toBe(
      num(
        viewOf('hrbp')
          .summary?.(ctx)
          .kpis.find((k) => k.id === 'voluntary')?.value,
      ),
    )
  })

  it('follows the figure’s own suppression for small groups', () => {
    const r = call(conv, envOf(ctx), 'compare_groups', {
      view: 'hrbp',
      kpi: 'hrbp.attrition.voluntary',
      by: 'level',
      values: ['E3', 'L4'],
    })
    const [e3, l4] = r.json.groups as (Fig & { group: string })[]
    expect(e3?.group).toBe('E3')
    expect(e3?.value).toBeNull()
    expect(e3?.suppressed).toMatch(/Hidden to protect anonymity/)
    expect(l4?.value).not.toBeNull()
  })

  it('compares the leaders one level down, as tokens', () => {
    const r = call(conv, envOf(ctx), 'compare_groups', { view: 'talent', kpi: 'x', by: 'leader' })
    expect(r.isError).toBe(true)
    expect(r.json.error).toMatch(/Key figures:/)
    const talent = viewOf('talent').summary?.(ctx).kpis[0] as Kpi
    const ok = call(conv, envOf(ctx), 'compare_groups', { view: 'talent', kpi: talent.id, by: 'leader' })
    const groups = ok.json.groups as { group: string }[]
    expect(groups.length).toBeGreaterThan(1)
    for (const g of groups) expect(g.group).toMatch(/^\{\{P\d+\}\}$/)
    expectClean(ok.content, 'compare by leader')
  })
})

describe('the other tools', () => {
  it('get_context lists the scope, datasets, views and vocabularies without names', () => {
    const r = call(conv, envOf(ctx), 'get_context')
    expect(r.json.as_of).toBe(ctx.asOf)
    expect((r.json.datasets as unknown[]).length).toBe(15)
    // The views HR mode shows: every one but My team, Manager mode's home (docs/ROLES.md, 3.2).
    expect((r.json.views as { view: string }[]).map((v) => v.view)).toEqual(
      VIEWS.filter((v) => v.key !== 'team').map((v) => v.key),
    )
    expect((r.json.features as Record<string, unknown>).pay_amounts).toBe('never sent to Claude')
    expectClean(r.content, 'get_context')
  })

  it('find_metrics finds the definition in force', () => {
    const r = call(conv, envOf(ctx), 'find_metrics', { query: 'voluntary attrition' })
    const list = r.json.metrics as { metric: string; target: string | null; changed_from_default: boolean }[]
    expect(list[0]?.metric).toBe('hrbp.attrition.voluntary')
    expect(list[0]?.target).toBe('At most 10.0%')
    expect(list.length).toBeLessThanOrEqual(25)
    const byView = call(conv, envOf(ctx), 'find_metrics', { view: 'services' }).json.metrics as {
      views: string[]
    }[]
    for (const m of byView) expect(m.views).toContain('services')
    // Little words do not match everything, and a key figure with a target wins a tie.
    const ttf = call(conv, envOf(ctx), 'find_metrics', { query: 'time to fill' }).json
    const ttfList = ttf.metrics as { metric: string; target: string | null }[]
    expect(ttfList[0]?.metric).toBe('recruiting.reqs.timeToFill')
    expect(ttfList[0]?.target).not.toBeNull()
    expect(ttf.matches as number).toBeLessThan(100)
  })

  it('explain_quality explains tiers and lists only category values not on the lists', () => {
    const gold = tieredCtx('gold')
    const c = new Conversation()
    const all = call(c, envOf(gold), 'explain_quality')
    expect((all.json.datasets as { tier: string }[]).some((d) => d.tier !== 'bronze')).toBe(true)
    for (const d of all.json.datasets as { dataset: string }[]) {
      const r = call(c, envOf(gold), 'explain_quality', { dataset: d.dataset })
      expect(r.isError, d.dataset).toBe(false)
      expectClean(r.content, `explain_quality ${d.dataset}`)
      for (const v of r.json.values_not_on_official_lists as { field: string }[])
        expect(['name', 'candidateName', 'recruiter', 'hrbp', 'assignee', 'jobTitle'], v.field).not.toContain(
          v.field,
        )
    }
    const field = call(c, envOf(gold), 'explain_quality', { dataset: 'employees', field: 'department' })
    expect(field.json.field).toBe('department')
    expect(typeof field.json.explain).toBe('string')
  })

  it('explain_quality names the fields short of silver whatever the dataset’s tier, as the Data room does', () => {
    let found = 0
    for (const c of [ctx, tieredCtx('bronze')]) {
      const cv = new Conversation()
      const q = chatContext(c).quality
      for (const key of ['cases', 'candidates', 'employees', 'reviews'] as const) {
        const want = q
          .fields(key)
          .filter((f) => f.tier !== 'none')
          .map((f) => fieldShortfall(f, q.rules)?.text)
          .filter((t): t is string => !!t)
        const r = call(cv, envOf(c), 'explain_quality', { dataset: key })
        if (key === 'cases') expect(r.label).toBe('Checking data quality of HR cases')
        if (key === 'employees') expect(r.label).toBe('Checking data quality of employees')
        const reasons = (r.json.fields_held_back as { reason: string | null }[]).map((f) => f.reason)
        for (const t of want) expect(reasons, `${key}: ${t}`).toContain(t)
        found += want.length
        const one = q.fields(key).find((f) => f.tier !== 'none' && fieldShortfall(f, q.rules))
        if (one) {
          const field = call(cv, envOf(c), 'explain_quality', {
            dataset: key,
            field: one.ref.slice(one.ref.indexOf('.') + 1),
          })
          expect(field.json.held_back_because).toBe(one.capReason ?? fieldShortfall(one, q.rules)?.text)
        }
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('open_items counts what the Action center lists, marks included', () => {
    const collected = collectActions(ctx, VIEWS)
    const open = collected.items.filter((a) => isOpen(a.id, {}, Date.now()))
    const counts = countActions(open, ctx)
    const r = call(conv, envOf(ctx), 'open_items')
    expect((r.json.open as { count: number }).count).toBe(counts.open.length)
    expect((r.json.overdue as { count: number }).count).toBe(counts.overdue.length)
    expect((r.json.critical as { count: number }).count).toBe(counts.critical.length)
    const ref = (r.json.open as { ref: string }).ref
    expect(resolveDrill(conv.records(ref))?.rows.length).toBe(counts.open.length)
    for (const o of r.json.top_owners as { owner: string }[]) expect(o.owner).not.toMatch(/\s{2}/)
    expectClean(r.content, 'open_items')

    const first = open[0]?.id as string
    const marked = call(
      conv,
      envOf(ctx, { marks: { [first]: { state: 'handled', at: '2026-09-30T00:00:00Z' } } }),
      'open_items',
    )
    expect((marked.json.open as { count: number }).count).toBe(counts.open.length - 1)
    const managers = call(conv, envOf(ctx), 'open_items', { owner_group: 'manager', overdue_only: true })
    expect((managers.json.open as { count: number }).count).toBeLessThanOrEqual(counts.overdue.length)
  })

  it('reports an unknown tool, unknown arguments and broken input as errors Claude can act on', () => {
    expect(call(conv, envOf(ctx), 'drop_table').json.error).toMatch(/There is no tool/)
    expect(call(conv, envOf(ctx), 'view_summary', { view: 'hrbp', extra: 1 }).json.error).toMatch(
      /Unknown argument/,
    )
    expect(call(conv, envOf(ctx), 'open_items', { owner_group: 'ceo' }).json.error).toMatch(/owner_group/)
    expect(call(conv, envOf(ctx), 'find_metrics', 'nonsense').isError).toBe(false)
  })

  it('defines every tool once, with a schema, and caches the list', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([...TOOL_NAMES])
    for (const t of TOOL_DEFINITIONS) expect(t.input_schema.type).toBe('object')
    expect(TOOL_DEFINITIONS.at(-1)?.cache_control).toEqual({ type: 'ephemeral' })
  })
})
