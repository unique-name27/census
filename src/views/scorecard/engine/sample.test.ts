/**
 * The People scorecard over the generated sample, with every view's real summary: every practice
 * is there, every measure is registered and drills to its records, statuses follow the targets in
 * force, the top findings take turns across practices, and it fits its load budget.
 */
import { describe, expect, it } from 'vitest'
import { isFieldRef } from '@/data/quality/fieldRef'
import { resolveDrill } from '@/drill/Drill'
import { bestCostMs } from '@/lib/testBudget'
import { CATALOG } from '@/metrics/catalog'
import { VIEWS } from '@/views/registry'
import { M, MEASURE_IDS } from '../metrics'
import { buildScorecard } from './model'
import { computeScorecard, practiceViews, runSummary } from './schedule'
import { sampleContext, tieredSampleContext } from './testkit'

const ctx = sampleContext()
const m = computeScorecard(ctx, VIEWS)
const row = (metricId: string) => m.rows.find((r) => r.metricId === metricId)

describe('the scorecard on the sample', () => {
  it('reads every practice with a summary, in folder-tab order, and none fails', () => {
    expect(m.practices.map((p) => p.view)).toEqual(practiceViews(VIEWS).map((v) => v.key))
    expect(m.practices.map((p) => p.view)).toEqual([
      'recruiting',
      'onboarding',
      'hrbp',
      'services',
      'talent',
      'comp',
      'compliance',
      'listening',
    ])
    for (const p of m.practices) {
      expect(p.failed, p.view).toBe(false)
      expect(p.rows.length, p.view).toBeGreaterThanOrEqual(2)
      expect(p.rows.length, p.view).toBeLessThanOrEqual(3)
    }
  })

  it('shows only registered measures, listed in the dictionary lineage, each with fields and a drill', () => {
    for (const r of m.rows) {
      expect(r.metricId, r.id).toBeTruthy()
      expect(CATALOG.byId.has(r.metricId as string), r.id).toBe(true)
      expect(MEASURE_IDS, `${r.id} ${r.metricId}: add it to MEASURE_IDS in scorecard/metrics.ts`).toContain(
        r.metricId,
      )
      expect(r.kpi.uses?.length, r.id).toBeGreaterThan(0)
      for (const ref of r.kpi.uses ?? []) expect(isFieldRef(ref), `${r.id} ${ref}`).toBe(true)
      if (r.kpi.value != null && !r.kpi.suppressed) {
        expect(resolveDrill(r.kpi.drill)?.rows.length, r.id).toBeGreaterThan(0)
        expect(Number.isFinite(r.kpi.value), r.id).toBe(true)
      }
    }
  })

  it('judges each measure against its target in force', () => {
    // 52 d against at most 45 d: 7 d over, beyond the 4.5 d margin.
    expect(row('recruiting.reqs.timeToFill')).toMatchObject({ status: 'missed', targetText: 'At most 45 d' })
    // 9.4% voluntary attrition against at most 10%.
    expect(row('hrbp.attrition.voluntary')?.status).toBe('met')
    // I-9 Section 2 at 95.8% against 100%: 4.2 pts short, inside the 5 pt margin.
    expect(row('compliance.i9.section2OnTime')?.status).toBe('watch')
    // One engineer working without a license in force: a zero target leaves no margin.
    expect(row('compliance.export.withoutLicense')).toMatchObject({ status: 'missed', valueText: '1' })
    // Key talent at risk is a count with no target.
    expect(row('talent.retention.keyTalent')).toMatchObject({ status: 'none', targetText: 'No target' })
    expect(m.counts.judged).toBe(m.counts.met + m.counts.watch + m.counts.missed)
    expect(m.headline.value).toBe(`${m.counts.met} of ${m.counts.judged}`)
  })

  it("lists the most serious findings, one practice's first before any second", () => {
    const top = m.findings.top
    expect(top).toHaveLength(9)
    expect(top[0].finding.id).toBe('scorecard:missed-targets')
    expect(m.own?.title).toMatch(/^\d+ of \d+ measures miss their target/)
    // Eight critical findings follow, one from each practice.
    const rest = top.slice(1)
    expect(rest.every((s) => s.finding.severity === 'critical')).toBe(true)
    expect(new Set(rest.map((s) => s.view)).size).toBe(rest.length)
    for (const s of rest) {
      expect(s.finding.metricId && CATALOG.byId.has(s.finding.metricId), s.finding.id).toBe(true)
      expect(s.opens?.view, s.finding.id).toBe(s.view)
    }
    expect(new Set(m.findings.all.map((s) => s.finding.id)).size).toBe(m.findings.all.length)
  })

  it('under Production hides what is not gold and counts only what it shows', () => {
    const gold = computeScorecard(tieredSampleContext('gold'), VIEWS)
    const hidden = gold.rows.filter((r) => !r.shown)
    const shown = gold.rows.filter((r) => r.shown)
    expect(hidden.length).toBeGreaterThan(0)
    expect(shown.length).toBeGreaterThan(0)
    for (const r of hidden) {
      expect(r.status, r.id).toBe('unknown')
      expect(r.valueText, r.id).toBe('—')
      expect(r.hiddenReason, r.id).toBeTruthy()
    }
    for (const r of shown) expect(r.gate?.tier, r.id).toBe('gold')
    // The folder tab counts only what the page shows, and declares only those fields.
    const judged = shown.filter((r) => ['met', 'watch', 'missed'].includes(r.status))
    expect(gold.headline.value).toBe(`${judged.filter((r) => r.status === 'met').length} of ${judged.length}`)
    for (const ref of gold.headline.uses)
      expect(
        judged.some((r) => r.kpi.uses?.includes(ref)),
        ref,
      ).toBe(true)
  })

  it('computes every summary within the 400 ms load budget, and adds almost nothing itself', () => {
    // A fresh context each run, so every view computes its model from scratch. Best of five after
    // a warm-up, counting work rather than waiting, so a busy machine passes.
    const contexts = Array.from({ length: 6 }, () => sampleContext())
    let i = 0
    expect(bestCostMs(() => computeScorecard(contexts[i++], VIEWS), 5)).toBeLessThan(400)
    // The scorecard's own share: judging, gating and ranking the summaries already computed.
    const inputs = practiceViews(VIEWS).map((v) => runSummary(v, ctx))
    expect(bestCostMs(() => buildScorecard(ctx, inputs))).toBeLessThan(25)
  }, 30_000)

  it('registers the folder-tab metric the headline links to', () => {
    expect(CATALOG.byId.get(M.targetsMet)?.uses.length).toBeGreaterThan(0)
  })
})
