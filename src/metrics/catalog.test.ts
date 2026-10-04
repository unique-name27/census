import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import {
  DEFAULT_QUALITY_RULES,
  DEFAULT_TOLERANCE,
  FRESHNESS,
  MAX_PROBLEM_SHARE,
  MIN_COVERAGE,
  SNAPSHOT_FRESHNESS,
} from '@/data/quality/rules'
import { confirmVersion, makeVersion } from '@/data/quality/versions'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, MIN_GROUP } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { DEFAULT_COMP_CYCLE } from '@/data/settings'
import type { SourceMeta } from '@/data/store'
import { defaultMetrics } from './api'
import { CATALOG, METRICS, metricsOfView } from './catalog'
import { COMP_CYCLE, compCycleOf } from './compCycle'
import { defineMetrics } from './define'
import { ANONYMITY } from './privacy'
import { QUALITY_RULES, qualityRulesOf } from './quality'
import { validateCatalog, withRequired } from './registry'
import { FIXTURE_DEFS } from './test-fixtures'
import { metricsWith } from './testing'

describe('the catalog', () => {
  it('passes every check: ids, wording, views, lineage, settings and targets', () => {
    expect(validateCatalog(METRICS)).toEqual([])
    expect(validateCatalog(FIXTURE_DEFS)).toEqual([])
  })

  it('gives every metric, rule and setting a formula (the Settings formula index lists them all)', () => {
    expect(METRICS.filter((d) => !d.formula?.trim()).map((d) => d.id)).toEqual([])
  })

  it('reports what is wrong with an entry', () => {
    const [good] = FIXTURE_DEFS
    const problems = validateCatalog([
      good,
      { ...good },
      {
        ...good,
        id: 'talent.x',
        definition: 'Ready now — or soon!',
        uses: ['employees.gender' as never],
        params: [
          { key: 'Bad key', label: '', description: 'x', type: 'days', default: 2.5, min: 10, max: 5 },
        ],
      },
    ])
    expect(problems).toEqual([
      'hrbp.attrition.voluntary: the id is registered twice.',
      'talent.x: the id must start with its home view (hrbp).',
      'talent.x: uses employees.gender, which is not in the schema.',
      'talent.x setting Bad key: the key must be camelCase.',
      'talent.x setting Bad key: needs a label.',
      'talent.x setting Bad key: min is above max.',
      'talent.x setting Bad key: the default is not valid (: enter a whole number of days.)',
      'talent.x: definition uses an em dash; write two sentences instead.',
      'talent.x: definition has an exclamation mark.',
    ])
  })

  it('always holds the comp cycle settings, the privacy rules and the quality rules', () => {
    for (const c of Object.values(COMP_CYCLE))
      expect(CATALOG.byId.get(c.metricId)?.params.some((p) => p.key === c.key)).toBe(true)
    expect(compCycleOf(defaultMetrics())).toEqual(DEFAULT_COMP_CYCLE)
    const anon = CATALOG.byId.get(ANONYMITY.metricId)!
    expect(anon.locked).toBe(true)
    expect(anon.params[0]).toMatchObject({ default: MIN_GROUP, locked: 'raiseOnly' })
    expect(metricsOfView('data').map((d) => d.id)).toEqual(
      Object.values(QUALITY_RULES).map((r) => r.metricId),
    )
  })

  it("adds a required setting the view's own entry leaves out, keeping the view's wording", () => {
    const own = defineMetrics('comp', [
      {
        id: COMP_CYCLE.meritBudget.metricId,
        name: 'Merit spend',
        definition: 'Ours.',
        unit: 'pct2',
        goodDirection: null,
        uses: [],
      },
    ])
    const out = withRequired(
      own,
      CATALOG.list.filter((d) => d.id === COMP_CYCLE.meritBudget.metricId),
    )
    expect(out).toHaveLength(1)
    expect(out[0].definition).toBe('Ours.')
    expect(out[0].params.map((p) => p.key)).toEqual([COMP_CYCLE.meritBudget.key])
  })

  it('puts the defining view first', () => {
    const [d] = defineMetrics('talent', [
      {
        id: 'talent.a.b',
        name: 'A',
        definition: 'B.',
        unit: 'int',
        goodDirection: null,
        uses: [],
        views: ['hrbp', 'talent'],
      },
    ])
    expect(d.views).toEqual(['talent', 'hrbp'])
    expect(d.params).toEqual([])
  })
})

describe('data quality rules', () => {
  it('default to the quality constants', () => {
    expect(qualityRulesOf(defaultMetrics())).toBe(DEFAULT_QUALITY_RULES)
    expect(DEFAULT_QUALITY_RULES).toMatchObject({
      minCoverage: MIN_COVERAGE,
      maxProblemShare: MAX_PROBLEM_SHARE,
      tolerance: DEFAULT_TOLERANCE,
    })
    for (const [k, r] of Object.entries({ ...FRESHNESS, ...SNAPSHOT_FRESHNESS }))
      expect(defaultMetrics().num(QUALITY_RULES.freshness.metricId, k)).toBe(r!.maxDays)
  })

  it('reach the quality index: fill threshold, problem rate and freshness limits', () => {
    const sample = generateSample()
    // Job title blank for every tenth person: 90% filled.
    const data = {
      ...sample,
      employees: sample.employees.map((e, i) => (i % 10 === 0 ? { ...e, jobTitle: '' } : e)),
    }
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    const versions = Object.fromEntries(
      DATASET_KEYS.map((k) => [
        k,
        confirmVersion(makeVersion({ dataset: k, source: 'sample', rows: data[k] }), 'x'),
      ]),
    )
    const base = { data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false, versions }
    const ref = 'employees.jobTitle' as const
    const before = buildContext(base)
    expect(before.quality.fieldStats(ref).coverage).toBeCloseTo(0.9, 2)
    expect(before.quality.fieldTier(ref)).toBe('bronze')
    expect(before.quality.explain(ref)).toContain('silver needs 95%.')

    const loose = metricsWith({ [QUALITY_RULES.fill.metricId]: { minCoverage: 0.85 } })
    const after = buildContext({ ...base, metrics: loose })
    expect(after.quality.rules.minCoverage).toBe(0.85)
    expect(after.quality.fieldTier(ref)).toBe(before.quality.datasetTier('employees'))
    // Same rule values, same index.
    expect(
      buildContext({
        ...base,
        metrics: metricsWith({ [QUALITY_RULES.fill.metricId]: { minCoverage: 0.85 } }),
      }).quality,
    ).toBe(after.quality)
    const strict = buildContext({
      ...base,
      metrics: metricsWith({ [QUALITY_RULES.fill.metricId]: { minCoverage: 0.975 } }),
    })
    expect(strict.quality.explain(ref)).toContain('silver needs 97.5%.')

    const issueLabel = (ctx: typeof before) =>
      ctx.quality.checks('employees').find((r) => r.id === 'issue-rate')!.label
    expect(issueLabel(before)).toBe('Issue rate within 2%')
    const lenient = metricsWith({ [QUALITY_RULES.problems.metricId]: { maxProblemShare: 0.035 } })
    expect(issueLabel(buildContext({ ...base, metrics: lenient }))).toBe('Issue rate within 3.5%')

    // Reviews are dated by cycle, months before the as-of date: fresh at 400 d, stale at 30 d.
    const fresh = (ctx: typeof before) => ctx.quality.checks('reviews').find((r) => r.id === 'fresh')!
    expect(fresh(before).pass).toBe(true)
    const stale = buildContext({
      ...base,
      metrics: metricsWith({ [QUALITY_RULES.freshness.metricId]: { reviews: 30 } }),
    })
    expect(fresh(stale).pass).toBe(false)
    expect(fresh(stale).detail).toContain('30 d is the limit')
  })
})
