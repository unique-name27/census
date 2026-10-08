/**
 * The Scorecard in each mode: a mode never shows numbers from a practice it hides. A practice whose
 * view the mode hides is left out (and its summary is never computed), and so is a measure or a
 * finding whose metric the mode hides; a practice the mode leaves with no measure goes too. Ask's
 * `view_summary` for the Scorecard reads the same model, so it lists the same practices and
 * measures as the page.
 */
import { describe, expect, it } from 'vitest'
import type { AccessContext } from '@/access/context'
import { MODES, type Mode } from '@/access/modes'
import { Conversation } from '@/ask/engine/conversation'
import { call, envOf } from '@/ask/engine/testkit'
import type { AnalyticsContext } from '@/data/context'
import { modeCtx } from '@/views/actions/engine/roleKit'
import { OTHER_VIEWS } from '../views'
import { buildScorecard, type ScorecardModel } from './model'
import { computeScorecard, practiceViews, runSummary } from './schedule'
import { finding, kpi, practice, sampleContext } from './testkit'

/** A mode that hides the practices and metrics named, and shows everything else. */
const hiding = (views: readonly string[], metrics: readonly string[] = []): Pick<AccessContext, 'can'> => ({
  can: (s: string) => !views.some((v) => s === `view:${v}`) && !metrics.some((m) => s === `metric:${m}`),
})

describe('the Scorecard model under a mode', () => {
  const ctx = sampleContext()
  const recruiting = practice('recruiting', {
    kpis: [
      kpi({
        id: 'ttf',
        label: 'Median time to fill',
        metricId: 'recruiting.reqs.timeToFill',
        value: 52,
        format: 'days',
      }),
      kpi({ id: 'open', label: 'Open reqs', metricId: 'recruiting.reqs.open', value: 40, format: 'int' }),
    ],
    findings: [
      finding({ id: 'slow', severity: 'critical', metricId: 'recruiting.reqs.timeToFill' }),
      finding({ id: 'open', severity: 'critical', metricId: 'recruiting.reqs.open' }),
    ],
  })
  const services = practice('services', {
    kpis: [
      kpi({ id: 'sla', label: 'Resolution SLA met', metricId: 'services.cases.resolutionSla', value: 0.9 }),
    ],
    findings: [finding({ id: 'late', severity: 'critical', metricId: 'services.cases.resolutionSla' })],
  })
  const inputs = [recruiting, services].map((v) => runSummary(v, ctx))
  const viewsOf = (m: ScorecardModel) => m.practices.map((p) => p.view)
  const findingsOf = (m: ScorecardModel) => m.findings.all.map((s) => s.finding.id)

  it('leaves out a practice whose view the mode hides, with its measures and findings', () => {
    const m = buildScorecard({ ...ctx, access: hiding(['services']) }, inputs)
    expect(viewsOf(m)).toEqual(['recruiting'])
    expect(m.rows.map((r) => r.id)).toEqual(['recruiting:ttf', 'recruiting:open'])
    expect(findingsOf(m).some((id) => id.startsWith('services:'))).toBe(false)
    expect(m.counts.measures).toBe(2)
  })

  it('leaves out a measure and a finding whose metric the mode hides', () => {
    const m = buildScorecard({ ...ctx, access: hiding([], ['recruiting.reqs.timeToFill']) }, inputs)
    expect(m.rows.map((r) => r.id)).toEqual(['recruiting:open', 'services:sla'])
    expect(findingsOf(m)).not.toContain('recruiting:slow')
    expect(findingsOf(m)).toContain('recruiting:open')
  })

  it('leaves out a practice when the mode hides every one of its measures', () => {
    const m = buildScorecard({ ...ctx, access: hiding([], ['services.cases.resolutionSla']) }, inputs)
    expect(viewsOf(m)).toEqual(['recruiting'])
  })

  it('keeps every practice without a mode, and a practice with no measures yet', () => {
    expect(viewsOf(buildScorecard(ctx, inputs))).toEqual(['recruiting', 'services'])
    const empty = runSummary(practice('talent', { kpis: [], findings: [] }), ctx)
    const m = buildScorecard({ ...ctx, access: hiding(['services']) }, [...inputs, empty])
    expect(viewsOf(m)).toEqual(['recruiting', 'talent'])
    expect(m.practices[1].empty).toBe('No measures for this practice yet.')
  })

  it('computes only the summaries of practices the mode shows', () => {
    const access = hiding(['recruiting', 'services']) as AnalyticsContext['access']
    const keys = practiceViews(OTHER_VIEWS, access).map((v) => v.key)
    expect(keys).not.toContain('recruiting')
    expect(keys).not.toContain('services')
    expect(practiceViews(OTHER_VIEWS).map((v) => v.key)).toEqual(
      expect.arrayContaining(['recruiting', 'services']),
    )
  })
})

describe('the Scorecard on the sample, in the modes that show it', () => {
  /** Modes whose Scorecard leaves out practices, and HR, which keeps every practice it shows. */
  const MODES_CHECKED: readonly Mode[] = ['compensation', 'talent-management', 'hr-ops', 'hr']

  const check = (mode: Mode) => {
    const c = modeCtx(mode)
    const m = computeScorecard(c, OTHER_VIEWS)
    // Every practice the mode shows that has a summary, and no other.
    const expected = OTHER_VIEWS.filter(
      (v) => v.key !== 'ai' && typeof v.summary === 'function' && c.access.can(`view:${v.key}`),
    ).map((v) => v.key)
    expect(
      m.practices.map((p) => p.view),
      mode,
    ).toEqual(expected.filter((k) => m.practices.some((p) => p.view === k)))
    for (const p of m.practices) expect(c.access.can(`view:${p.view}`), `${mode} ${p.view}`).toBe(true)
    for (const r of m.rows)
      if (r.metricId) expect(c.access.can(`metric:${r.metricId}`), `${mode} ${r.metricId}`).toBe(true)
    for (const s of m.findings.all) {
      if (s.view !== 'scorecard') expect(c.access.can(`view:${s.view}`), `${mode} ${s.finding.id}`).toBe(true)
      if (s.finding.metricId)
        expect(c.access.can(`metric:${s.finding.metricId}`), `${mode} ${s.finding.id}`).toBe(true)
    }
    return { c, m }
  }

  it('leaves out the practices each role mode hides', () => {
    const hidden: Partial<Record<Mode, readonly string[]>> = {
      compensation: ['recruiting', 'onboarding', 'services', 'compliance'],
      'talent-management': ['recruiting', 'services', 'comp', 'compliance'],
      'hr-ops': ['recruiting', 'talent', 'comp'],
    }
    for (const mode of MODES_CHECKED) {
      const { m } = check(mode)
      const views = m.practices.map((p) => p.view)
      for (const v of hidden[mode] ?? []) expect(views, `${mode} ${v}`).not.toContain(v)
      expect(views.length, mode).toBeGreaterThan(0)
    }
    // HR shows every practice.
    expect(check('hr').m.practices.map((p) => p.view)).toEqual(
      expect.arrayContaining([
        'recruiting',
        'onboarding',
        'hrbp',
        'services',
        'talent',
        'comp',
        'compliance',
      ]),
    )
  }, 120_000)

  it("matches Ask's view_summary for the Scorecard", () => {
    for (const mode of ['compensation', 'hr-ops'] as const) {
      const { c, m } = check(mode)
      const r = call(new Conversation(), envOf(c), 'view_summary', { view: 'scorecard' })
      const practices = r.json.practices as { view: string; measures: { metric: string | null }[] }[]
      expect(
        practices.map((p) => p.view),
        mode,
      ).toEqual(m.practices.map((p) => p.view))
      expect(
        practices.flatMap((p) => p.measures.map((x) => x.metric)),
        mode,
      ).toEqual(m.rows.map((x) => x.metricId))
    }
  }, 120_000)

  it('is a mode the Scorecard shows in', () => {
    for (const mode of MODES_CHECKED) expect(modeCtx(mode).access.can('view:scorecard'), mode).toBe(true)
    expect(MODES.length).toBe(11)
  })
})
