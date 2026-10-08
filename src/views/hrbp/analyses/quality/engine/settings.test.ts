/**
 * Quality of hire's settings on the sample (docs/ANALYSES.md, 2.4 and 7.3): each one changes the
 * number it says it changes, a changed setting is named in the definitions that depend on it, and
 * the metrics pass the catalog checks with their lineage, windows and owners.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { sampleCtx } from '@/views/hrbp/engine/fixtures'
import { analysisModel } from '../../registry'
import { QID, QSET, QUALITY_METRICS } from './metrics'
import type { QualityModel } from './model'

const run = (metrics?: MetricsApi, filters = {}) =>
  analysisModel<QualityModel>(sampleCtx(filters, metrics), 'quality')
const base = run()

describe('the entries', () => {
  it('pass the catalog checks, with a formula, population, window and owner each', () => {
    expect(validateCatalog(CATALOG.list).filter((x) => x.startsWith('hrbp.quality.'))).toEqual([])
    for (const d of QUALITY_METRICS) {
      expect(CATALOG.byId.get(d.id), d.id).toEqual(d)
      expect(d.views[0]).toBe('hrbp')
      for (const f of [d.formula, d.population, d.window, d.owner]) expect(f, d.id).toBeTruthy()
      expect(invalidRefs(d.uses), d.id).toEqual([])
      if (d.id !== QID.score) expect(d.dependsOn, d.id).toEqual([QID.score, 'hrbp.attrition.regretted'])
    }
    expect(Object.values(QID).sort()).toEqual(QUALITY_METRICS.map((d) => d.id).sort())
  })

  it('reads every setting through the dictionary', () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    analysisModel(sampleCtx({}, metrics), 'quality')
    for (const r of Object.values(QSET)) expect(reads.has(paramRef(r.metricId, r.key)), r.key).toBe(true)
  })
})

describe('changing a setting changes the numbers built on it', () => {
  it('the weights, and the definitions say so', () => {
    const m = run(metricsWith({ [QID.score]: { performanceWeight: 0.7, retentionWeight: 0.3 } }))
    const P = base.scope.p as number
    expect(m.scope.q).not.toBeCloseTo(base.scope.q as number, 3)
    // Every hire scored, so the mean is the weighted mean of the means of the scored parts.
    expect(m.scope.p).toBe(P)
    const note =
      'Changed settings: Weight of the first review 70% (default 50%); Weight of staying a year 30% (default 50%).'
    expect(m.kpis.find((k) => k.id === 'quality-score')?.definition).toContain(note)
    expect(m.kpis.find((k) => k.id === 'quality-retention')?.definition).toContain(note)
  })

  it('the regretted rule on People stats', () => {
    const m = run(metricsWith({ 'hrbp.attrition.regretted': { rule: 'anyFlagged' } }))
    expect(m.kpis.find((k) => k.id === 'quality-retention')?.definition).toContain(
      'Changed setting: What counts as regretted',
    )
  })

  it('the review rule, the retention rules and the scoring', () => {
    const changed = (params: Parameters<typeof metricsWith>[0]) => run(metricsWith(params))
    expect(changed({ [QID.score]: { firstReviewMinDays: 120 } }).scope.p).not.toBe(base.scope.p)
    expect(changed({ [QID.score]: { scoring: 'percentile' } }).scope.p).not.toBe(base.scope.p)
    expect(changed({ [QID.score]: { regrettedSecondYear: false } }).scope.r as number).toBeGreaterThan(
      base.scope.r as number,
    )
    expect(changed({ [QID.score]: { rifExcluded: false } }).counts.retained).toBe(base.counts.retained + 2)
    expect(changed({ [QID.score]: { cohortMonths: 12 } }).counts.cohort).toBeLessThan(base.counts.cohort)
    expect(changed({ [QID.score]: { retentionMonths: 6 } }).window.end).toBe('2026-03-31')
  })

  it('the minimums, the interval and the mix cells', () => {
    const shown = (m: QualityModel) => m.cuts.university.filter((g) => g.kind === 'value').length
    expect(shown(run(metricsWith({ [QID.score]: { minUniversityHires: 20 } })))).toBeLessThan(shown(base))
    const cells = (m: QualityModel) => m.cells.filter((c) => c.q != null).length
    expect(cells(run(metricsWith({ [QID.score]: { minCellHires: 30 } })))).toBeLessThan(cells(base))
    const wide = run(metricsWith({ [QID.score]: { interval: '0.95' } }))
    expect((wide.scope.high as number) - (wide.scope.low as number)).toBeGreaterThan(
      (base.scope.high as number) - (base.scope.low as number),
    )
    const coarse = run(metricsWith({ [QID.expected]: { minCell: 100 } }))
    const coyote = (m: QualityModel) =>
      m.cuts.university.find((g) => g.label === 'Coyote Valley University')?.expected
    expect(coyote(coarse)).not.toBeCloseTo(coyote(base) as number, 3)
    // A higher anonymity minimum floors every minimum.
    const strict = run(metricsWith({ 'privacy.anonymity': { minGroup: 12 } }))
    expect(strict.s.minUniversityHires).toBe(12)
    expect(strict.cuts.degree.find((g) => g.label === 'Associate')?.q).toBeNull()
  })

  it('the gap worth a finding and the education coverage target', () => {
    const ids = (m: QualityModel) => m.findings.map((f) => f.id)
    expect(ids(base)).toContain('hrbp-quality-education-coverage')
    const lower = metricsWithEdits([
      { metricId: QID.education, field: 'target', value: { value: 0.6, comparator: '>=' } },
    ])
    expect(ids(run(lower))).not.toContain('hrbp-quality-education-coverage')
    expect(ids(run(metricsWith({ [QID.findings]: { minGap: 20 } })))).not.toContain(
      'hrbp-quality-above-university-Coyote Valley University',
    )
    expect(ids(base)).toContain('hrbp-quality-above-university-Coyote Valley University')
  })
})
