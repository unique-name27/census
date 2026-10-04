import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUPPRESSED_NOTE } from '@/components/kpiModel'
import type { FieldRef } from '@/data/quality/fieldRef'
import { metricsWith, metricsWithEdits } from '@/metrics/testing'
import { M } from '../metrics'
import { buildScorecard, missedFinding, rankFindings, scoreRow, sourced } from './model'
import { computeScorecard, practiceViews, runSummary } from './schedule'
import { finding, fixtureContext, kpi, practice, sampleContext, tieredSampleContext } from './testkit'

const HIRE: readonly FieldRef[] = ['employees.hireDate']
const LEVEL: readonly FieldRef[] = ['employees.level']
const ctx = sampleContext()

afterEach(() => vi.restoreAllMocks())

describe('a measure row', () => {
  const recruiting = practice('recruiting', { kpis: [], findings: [] })
  const ttf = kpi({
    id: 'ttf',
    label: 'Median time to fill',
    metricId: 'recruiting.reqs.timeToFill',
    value: 52,
    format: 'days',
    uses: HIRE,
    tab: 'detail',
  })

  it('is judged against the target in force, worded with its unit', () => {
    const r = scoreRow(ctx, recruiting, ttf)
    expect(r).toMatchObject({
      id: 'recruiting:ttf',
      practice: 'Recruiting',
      target: { value: 45, comparator: '<=' },
      targetText: 'At most 45 d',
      status: 'missed',
      valueText: '52 d',
      shown: true,
      hiddenReason: null,
      // The KPI names no direction, so its metric's is used.
      goodDirection: 'down',
      opens: { view: 'recruiting', tab: 'detail', label: 'Recruiting, Detail' },
    })
  })

  it('follows a target edited in Metric definitions, and a target removed there', () => {
    const looser = metricsWithEdits([
      { metricId: 'recruiting.reqs.timeToFill', field: 'target', value: { value: 60, comparator: '<=' } },
    ])
    const r = scoreRow(sampleContext({ metrics: looser }), recruiting, ttf)
    expect(r).toMatchObject({ status: 'met', targetText: 'At most 60 d' })
    const none = metricsWithEdits([{ metricId: 'recruiting.reqs.timeToFill', field: 'target', value: null }])
    expect(scoreRow(sampleContext({ metrics: none }), recruiting, ttf)).toMatchObject({
      status: 'none',
      target: null,
      targetText: 'No target',
    })
  })

  it('reads the watch margin from the dictionary', () => {
    const wide = metricsWith({ [M.watch]: { relativeMargin: 0.2 } })
    expect(scoreRow(sampleContext({ metrics: wide }), recruiting, ttf).status).toBe('watch')
  })

  it('has no target when the measure is shown in another unit than its metric', () => {
    const r = scoreRow(ctx, recruiting, { ...ttf, format: 'int' })
    expect(r).toMatchObject({ status: 'none', target: null })
  })

  it("opens the KPI's own link when it points at another view", () => {
    const r = scoreRow(ctx, recruiting, {
      ...ttf,
      link: { view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' },
    })
    expect(r.opens).toEqual({ view: 'onboarding', tab: 'plan', label: 'Onboarding, Hiring plan' })
    expect(scoreRow(ctx, recruiting, { ...ttf, tab: undefined }).opens).toEqual({
      view: 'recruiting',
      tab: 'overview',
      label: 'Recruiting, Overview',
    })
  })

  it('says why a value is hidden, and judges nothing it hides', () => {
    const small = scoreRow(ctx, recruiting, { ...ttf, suppressed: true })
    expect(small).toMatchObject({
      status: 'unknown',
      valueText: '—',
      hiddenReason: SUPPRESSED_NOTE,
      shown: true,
    })
    // An empty upload: the field has no data, so no standard shows the value.
    const empty = scoreRow(fixtureContext(), recruiting, ttf)
    expect(empty.shown).toBe(false)
    expect(empty.status).toBe('unknown')
    expect(empty.valueText).toBe('—')
    expect(empty.hiddenReason).toMatch(/^No data/)
  })
})

describe('ranking findings', () => {
  const a = sourced(practice('recruiting', { kpis: [], findings: [] }), [
    finding({ id: 'a1', severity: 'critical' }),
    finding({ id: 'a2', severity: 'critical' }),
    finding({ id: 'a3' }),
  ])
  const b = sourced(practice('hrbp', { kpis: [], findings: [] }), [
    finding({ id: 'b1' }),
    finding({ id: 'b2', severity: 'critical' }),
  ])
  const c = sourced(
    practice('comp', { kpis: [], findings: [] }, { tabs: [{ key: 'ranges', label: 'Ranges' }] }),
    [finding({ id: 'c1', severity: 'info' }), finding({ id: 'c2', severity: 'critical', tab: 'ranges' })],
  )

  it("puts every practice's most serious finding before any practice's second, critical first", () => {
    expect(rankFindings([a, b, c]).map((s) => s.finding.id)).toEqual([
      'recruiting:a1',
      'hrbp:b2',
      'comp:c2',
      'recruiting:a2',
      'recruiting:a3',
      'hrbp:b1',
      'comp:c1',
    ])
  })

  it('keeps the practice and where to open it', () => {
    const top = rankFindings([a, b, c])[2]
    expect(top).toMatchObject({ view: 'comp', practice: 'Comp', opens: { view: 'comp', tab: 'ranges' } })
    // The original finding is untouched; only the id is made unique across practices.
    expect(top.finding.title).toBe('Finding c2.')
  })
})

/** Three practices with 7 measures with a target, 4 of them missed, and one without a target. */
function threePractices() {
  return [
    practice(
      'recruiting',
      {
        kpis: [
          kpi({ id: 'ttf', metricId: 'recruiting.reqs.timeToFill', value: 52, format: 'days', uses: HIRE }),
          kpi({ id: 'acc', metricId: 'recruiting.offers.acceptance', value: 0.6, uses: HIRE }),
          kpi({ id: 'tx', metricId: 'services.tx.onTime', value: 0.99, uses: HIRE }),
        ],
        findings: [
          finding({ id: 'r1', severity: 'critical', uses: HIRE }),
          finding({ id: 'r2', uses: HIRE }),
        ],
      },
      { label: 'Recruiting' },
    ),
    practice(
      'hrbp',
      {
        kpis: [
          kpi({ id: 'vol', metricId: 'hrbp.attrition.voluntary', value: 0.05, uses: HIRE }),
          kpi({ id: 'reg', metricId: 'hrbp.attrition.regretted', value: 0.2, uses: HIRE }),
          kpi({ id: 'risk', metricId: 'talent.retention.keyTalent', value: 31, format: 'int', uses: LEVEL }),
        ],
        findings: [finding({ id: 'h1', uses: HIRE }), finding({ id: 'h2', severity: 'good', uses: HIRE })],
      },
      { label: 'People stats' },
    ),
    practice(
      'compliance',
      {
        kpis: [
          kpi({
            id: 'lic',
            label: 'Working without a license in force',
            metricId: 'compliance.export.withoutLicense',
            value: 1,
            format: 'int',
            uses: HIRE,
          }),
          kpi({ id: 'rev', metricId: 'compliance.work.reverificationOnTime', value: 1, uses: HIRE }),
        ],
        findings: [finding({ id: 'c1', severity: 'critical', uses: HIRE })],
      },
      { label: 'Compliance' },
    ),
  ]
}

describe('the scorecard', () => {
  it('counts statuses and gives the folder tab "met of judged" with the judged measures\' fields', () => {
    const m = computeScorecard(ctx, threePractices())
    expect(m.counts).toEqual({ measures: 8, judged: 7, met: 3, watch: 0, missed: 4, noTarget: 1, unknown: 0 })
    expect(m.headline).toEqual({ value: '3 of 7', uses: HIRE })
    expect(m.uses).toEqual([...HIRE, ...LEVEL])
    expect(m.practices.map((p) => [p.label, p.met, p.judged])).toEqual([
      ['Recruiting', 1, 3],
      ['People stats', 1, 2],
      ['Compliance', 1, 2],
    ])
  })

  it('writes one finding when several practices miss target, naming where most misses sit', () => {
    const m = computeScorecard(ctx, threePractices())
    expect(m.own).toMatchObject({
      metricId: M.missed,
      severity: 'warning',
      title: '4 of 7 measures miss their target; 3 are in Recruiting and People stats.',
      detail:
        'Furthest from its target is Working without a license in force in Compliance: 1 against a target of at most 0.',
      action: 'Review the missed measures with each practice lead this month.',
      uses: HIRE,
    })
    // It leads the list; the practices' findings follow, critical first and one practice at a time.
    expect(m.findings.top.map((s) => s.finding.id)).toEqual([
      'scorecard:missed-targets',
      'recruiting:r1',
      'compliance:c1',
      'recruiting:r2',
      'hrbp:h1',
    ])
    expect(m.findings.all.map((s) => s.finding.id)).toContain('hrbp:h2')
  })

  it('words the finding for one practice, two practices and a spread', () => {
    const rows = computeScorecard(ctx, threePractices()).rows
    const practices = threePractices().map((v) => ({ view: v.key, label: v.label }))
    const only = rows.filter((r) => r.view === 'recruiting')
    expect(missedFinding(only, practices, 1)?.title).toBe(
      '2 of 3 measures miss their target, all in Recruiting.',
    )
    const two = rows.filter((r) => r.view !== 'hrbp')
    expect(missedFinding(two, practices, 2)?.title).toBe(
      '3 of 5 measures miss their target, all in Recruiting and Compliance.',
    )
    const spread = rows.filter((r) => r.id !== 'recruiting:acc')
    expect(missedFinding(spread, practices, 2)?.title).toBe(
      '3 of 6 measures miss their target, across 3 practices.',
    )
    expect(
      missedFinding(
        rows.filter((r) => r.status !== 'missed'),
        practices,
        1,
      ),
    ).toBeNull()
  })

  it('reads how many practices must miss, and how many findings to list, from the dictionary', () => {
    const strict = metricsWith({ [M.missed]: { minPractices: 4 }, [M.top]: { limit: 3 } })
    const m = computeScorecard(sampleContext({ metrics: strict }), threePractices())
    expect(m.own).toBeNull()
    expect(m.limit).toBe(3)
    expect(m.findings.top.map((s) => s.finding.id)).toEqual([
      'recruiting:r1',
      'compliance:c1',
      'recruiting:r2',
    ])
  })

  it('keeps going when a practice fails, and says so on its row', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = practice('talent', () => {
      throw new Error('boom')
    })
    const m = computeScorecard(ctx, [...threePractices(), broken])
    expect(err).toHaveBeenCalledOnce()
    const talent = m.practices.find((p) => p.view === 'talent')
    expect(talent).toMatchObject({ failed: true, rows: [] })
    expect(talent?.empty).toMatch(/^Could not be computed/)
    expect(m.counts.measures).toBe(8)
    expect(runSummary(broken, ctx)).toMatchObject({ summary: null })
  })

  it('reads only views with a summary, never itself or AI in HR', () => {
    const own = practice('scorecard', { kpis: [], findings: [] })
    const ai = practice('ai', { kpis: [], findings: [] })
    const org = { ...practice('org', { kpis: [], findings: [] }), summary: undefined }
    expect(practiceViews([own, ...threePractices(), org, ai]).map((v) => v.key)).toEqual([
      'recruiting',
      'hrbp',
      'compliance',
    ])
  })

  it('says why a practice shows no measure', () => {
    const empty = practice('talent', { kpis: [], findings: [] })
    const m = computeScorecard(ctx, [empty])
    expect(m.practices[0].empty).toBe('No measures for this practice yet.')
    expect(m.headline.value).toBe('')
  })
})

describe('the data standard', () => {
  const gold = tieredSampleContext('gold')
  const views = [
    practice(
      'hrbp',
      {
        kpis: [
          kpi({ id: 'vol', metricId: 'hrbp.attrition.voluntary', value: 0.05, uses: HIRE }),
          kpi({ id: 'sla', metricId: 'services.cases.resolutionSla', value: 0.5, uses: ['cases.category'] }),
        ],
        findings: [
          finding({ id: 'shown', severity: 'critical', uses: HIRE }),
          finding({ id: 'held', severity: 'critical', uses: ['cases.category'] }),
        ],
      },
      { datasets: ['employees', 'cases'] },
    ),
  ]

  it('hides values below the standard with the reason, and leaves them out of every count', () => {
    const m = buildScorecard(
      gold,
      practiceViews(views).map((v) => runSummary(v, gold)),
    )
    const [vol, sla] = m.rows
    expect(vol).toMatchObject({ shown: true, status: 'met' })
    expect(sla).toMatchObject({ shown: false, status: 'unknown', valueText: '—' })
    expect(sla.hiddenReason).toBe('Not yet confirmed for production')
    expect(m.counts).toMatchObject({ judged: 1, met: 1, unknown: 1 })
    expect(m.headline).toEqual({ value: '1 of 1', uses: HIRE })
    expect(m.uses).toEqual(HIRE)
  })

  it('lists only findings the standard shows, and hands the readout the held ones to count', () => {
    const m = buildScorecard(
      gold,
      practiceViews(views).map((v) => runSummary(v, gold)),
    )
    expect(m.findings.top.map((s) => s.finding.id)).toEqual(['hrbp:shown'])
    expect(m.findings.hidden.map((s) => s.finding.id)).toEqual(['hrbp:held'])
  })
})
