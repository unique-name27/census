/**
 * Smoke test on the generated sample (whole company, last 12 months, as of 30 Sep 2026): the
 * planted Leave & return stories in src/data/sample/README.md are detected, every number is
 * finite or null, and the Return to work survey number degrades gracefully.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import { resolveDrill } from '@/drill/Drill'
import { buildDrillTable } from '@/drill/records'
import { CATALOG } from '@/metrics/catalog'
import { FIGURE_METRIC } from '../metrics'
import { compute } from './index'
import { LEAVE_FIGURE_IDS } from './lineage'
import { RETURN_SURVEY, returnSurvey } from './survey'
import { sampleContext } from './testkit'

const ctx = sampleContext()
const m = compute(ctx)
const l = m.leave
const kpi = (id: string) => {
  const k = l.kpis.find((x) => x.id === id)
  if (!k) throw new Error(`No KPI ${id}`)
  return k
}

describe('Leave & return on the sample company', () => {
  it('story 1: 20 people on leave now, with reasons loaded', () => {
    expect(l.hasReasons).toBe(true)
    expect(l.now).toHaveLength(20)
    expect(kpi('leave-on-leave').value).toBe(20)
    // Every on-leave person still employed and not back by the as-of date.
    for (const f of l.now) {
      expect(f.exit).toBeNull()
      expect(f.returned).toBeNull()
    }
    expect(l.onLeave.reduce((a, r) => a + r.people, 0)).toBe(20)
    expect(l.byReason.reduce((a, r) => a + r.people, 0)).toBe(20)
    // Every named reason group has at least the anonymity minimum.
    for (const r of l.byReason) expect(r.people).toBeGreaterThanOrEqual(5)
  })

  it('story 2: retention after parental leave 85% (17 of 20) against 94.6% (70 of 74)', () => {
    const r = l.retention
    expect([r.from, r.to]).toEqual(['2024-10-01', '2025-09-30'])
    expect(r.parental).toMatchObject({ retained: 17, returners: 20 })
    expect(r.parental?.rate).toBeCloseTo(0.85)
    expect(r.others).toMatchObject({ retained: 70, returners: 74 })
    expect(r.others?.rate).toBeCloseTo(0.946, 3)
    const f = l.findings.find((x) => x.id === 'services-leave-retention-parental')
    expect(f?.severity).toBe('warning')
    expect(f?.title).toBe('Retention 12 months after parental leave is 85.0%, under the 90% target.')
    expect(f?.detail).toContain('against 94.6% after other leaves')
    expect(kpi('leave-retention').note).toBe('Parental 85.0% (17 of 20)')
  })

  it('story 3: two people left within six months of returning, both resignations after parental leave', () => {
    const soon = l.exits.soon
    expect(soon).toHaveLength(2)
    for (const s of soon) {
      expect(s.exitType).toBe('Voluntary')
      expect(s.fact.reason).toBe('Parental')
      expect(s.daysAfter).toBeLessThanOrEqual(183)
    }
    // Count only: no finding names them, and with two leavers no department stands out.
    expect(l.findings.some((x) => x.id === 'services-leave-exit-cluster')).toBe(false)
    for (const f of l.findings)
      for (const s of soon) expect(JSON.stringify(f)).not.toContain(s.fact.name ?? '—')
  })

  it('story 4: resignations during a leave, nobody dismissed', () => {
    const during = l.facts.filter((f) => f.end === 'left')
    expect(during).toHaveLength(6)
    for (const f of during) expect(f.exitType).toBe('Voluntary')
    expect(l.exits.during.length).toBeLessThanOrEqual(6)
  })

  it('story 5: 9 returns in the next 30 days, 2 not entered and 1 not processed (LV-03)', () => {
    expect(l.upcoming).toHaveLength(9)
    const by = (s: string) => l.upcoming.filter((u) => u.status === s).length
    expect([by('Ready'), by('Entered, not processed'), by('Not entered')]).toEqual([6, 1, 2])
    expect(kpi('leave-returns-soon').value).toBe(9)
    expect(kpi('leave-returns-soon').note).toBe('3 without systems ready (LV-03)')
    const f = l.findings.find((x) => x.id === 'services-leave-returns-not-ready')
    expect(f?.title).toBe(
      '3 of the 9 people due back from leave in the next 30 days do not have systems ready.',
    )
    expect(f?.people).toHaveLength(3)
  })

  it('returns finite or null numbers and valid fields everywhere', () => {
    for (const k of l.kpis) {
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
      expect(k.delta == null || Number.isFinite(k.delta), k.id).toBe(true)
      for (const v of k.spark ?? []) expect(v === null || Number.isFinite(v), k.id).toBe(true)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
      expect(k.definition, k.id).toBe(CATALOG.byId.get(k.metricId ?? '')?.definition)
    }
    for (const f of l.findings) {
      expect(f.metricId?.startsWith('services.readout.'), f.id).toBe(true)
      expect(invalidRefs(f.uses ?? []), f.id).toEqual([])
      expect(f.title).not.toMatch(/—|!/)
    }
    for (const id of LEAVE_FIGURE_IDS) {
      expect(m.uses[id].length, id).toBeGreaterThan(0)
      expect(CATALOG.byId.has(FIGURE_METRIC[id]), id).toBe(true)
    }
    expect(l.length.median).toBeGreaterThan(30)
    expect(l.returnRate.rate).toBeGreaterThan(0.9)
    for (const q of l.quarters) expect(q.rate === null || (q.rate >= 0 && q.rate <= 1)).toBe(true)
  })

  it('opens the records behind every KPI, without the leave reason', () => {
    const dctx = { org: ctx.org, asOf: ctx.asOf, all: ctx.all, showPay: false }
    for (const k of l.kpis) {
      const spec = resolveDrill(k.drill)
      expect(spec, k.id).not.toBeNull()
      const table = buildDrillTable(spec!, dctx)
      expect(table.rows.length, k.id).toBeGreaterThan(0)
      if (spec!.kind === 'transactions')
        expect(JSON.stringify(table), k.id).not.toMatch(/Parental|Medical|Family care|Workers/)
    }
    // The parental cut in the retention note opens groups, not people.
    expect(resolveDrill(kpi('leave-retention').noteDrill)?.kind).toBe('leaveGroups')
  })

  it('shows the Return to work survey number from Listening, or nothing when it is not there', () => {
    expect(returnSurvey(ctx, null)).toBeNull()
    expect(
      returnSurvey(ctx, () => {
        throw new Error('not yet')
      }),
    ).toBeNull()
    const seen: string[] = []
    const h = returnSurvey(ctx, (_c, survey) => {
      seen.push(survey)
      return {
        value: 3.9,
        format: 'num1',
        label: 'Return was smooth',
        metricId: 'listening.x.y',
        uses: [],
        drill: null,
      }
    })
    expect(seen).toEqual([RETURN_SURVEY])
    expect(h?.value).toBe(3.9)
    // Whatever Listening has today, the call never throws.
    expect(() => returnSurvey(ctx)).not.toThrow()
  })
})
