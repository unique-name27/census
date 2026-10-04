import { describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import {
  defaultMetrics,
  definitionOf,
  definitionsStamp,
  kpiTarget,
  metricIdOf,
  metricsApi,
  targetStatus,
} from './api'
import { CATALOG } from './catalog'
import { COMP_CYCLE, cycleSettingsOf } from './compCycle'
import { defineMetrics } from './define'
import { applyEdit, applyEdits, EMPTY_METRICS } from './overrides'
import { ANONYMITY, minGroupOf, PRIVACY_METRICS } from './privacy'
import { QUALITY_METRICS, QUALITY_RULES } from './quality'
import { catalogOf, validateCatalog } from './registry'
import { FIXTURE, FIXTURE_DEFS } from './test-fixtures'
import { metricsWith, paramRef, recordParamReads } from './testing'
import type { MetricEdit, MetricsState } from './types'

const VOL = 'hrbp.attrition.voluntary'
const SPEND = 'comp.merit.spend'

const data = generateSample()
const sources = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
) as Record<DatasetKey, SourceMeta>
const base = { data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false }

const withEdits = (...edits: Parameters<typeof applyEdits>[2]): MetricsState => {
  const r = applyEdits(EMPTY_METRICS, FIXTURE, edits)
  if (r.rejected.length) throw new Error(r.rejected[0].error)
  return r.state
}

describe('ctx.metrics', () => {
  it('returns the defaults when nothing was changed', () => {
    const ctx = buildContext(base)
    expect(ctx.metrics).toBe(defaultMetrics())
    expect(ctx.metrics.num(ANONYMITY.metricId, ANONYMITY.key)).toBe(5)
    expect(minGroupOf(ctx.metrics)).toBe(5)
    expect(ctx.metrics.param(COMP_CYCLE.meritBudget.metricId, COMP_CYCLE.meritBudget.key)).toBe(0.035)
    expect(ctx.metrics.range(COMP_CYCLE.healthyBand.metricId, COMP_CYCLE.healthyBand.key)).toEqual([0.9, 1.1])
    expect(ctx.metrics.num(QUALITY_RULES.fill.metricId, QUALITY_RULES.fill.key)).toBe(0.95)
    expect(ctx.metrics.num(QUALITY_RULES.freshness.metricId, 'cases')).toBe(45)
    expect(ctx.metrics.changedCount).toBe(0)
    expect(ctx.metrics.changes).toEqual([])
    expect(cycleSettingsOf(ctx.metrics)).toEqual({
      meritBudget: 0.035,
      bandLow: 0.9,
      bandHigh: 1.1,
      guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
    })
    // Every registered setting reads back as its default.
    for (const d of CATALOG.list)
      for (const p of d.params) expect(ctx.metrics.param(d.id, p.key)).toEqual(p.default)
  })

  it('gives the same object for the same state, and a new one only when the state changes', () => {
    const s = withEdits({ metricId: SPEND, field: 'params.meritBudget', value: 0.04 })
    const a = metricsApi(s, FIXTURE)
    expect(metricsApi(s, FIXTURE)).toBe(a)
    expect(a.param(SPEND, 'meritBudget')).toBe(0.04)
    expect(a.param(SPEND, 'meritBudget')).toBe(a.param(SPEND, 'meritBudget'))
    const noop = applyEdit(s, FIXTURE, { metricId: SPEND, field: 'params.meritBudget', value: 0.04 })
    expect(noop.ok && metricsApi(noop.state, FIXTURE)).toBe(a)
    // The cycle settings object stays put for one dictionary state.
    const cm = metricsWith({ [COMP_CYCLE.meritBudget.metricId]: { [COMP_CYCLE.meritBudget.key]: 0.04 } })
    expect(cycleSettingsOf(cm)).toBe(cycleSettingsOf(cm))
    expect(cycleSettingsOf(cm).meritBudget).toBe(0.04)
  })

  it('merges your wording and target over the default definition', () => {
    const s = withEdits(
      { metricId: VOL, field: 'definition', value: 'Resignations as a share of headcount.' },
      { metricId: VOL, field: 'formula', value: '' },
      { metricId: VOL, field: 'target', value: { value: 0.07, comparator: '<=' } },
    )
    const m = metricsApi(s, FIXTURE)
    const d = m.def(VOL)!
    expect(d.definition).toBe('Resignations as a share of headcount.')
    expect(d).not.toHaveProperty('formula')
    expect(d.population).toBe('Employees only; contractors and interns excluded.')
    expect(m.target(VOL)).toEqual({ value: 0.07, comparator: '<=' })
    expect(m.defaultDef(VOL)!.definition).toContain('Employees who resigned')
    expect(m.isChanged(VOL)).toBe(true)
    expect(m.isChanged(SPEND)).toBe(false)
    expect(m.changedFields(VOL)).toEqual(['definition', 'formula', 'target'])
    expect(m.changedCount).toBe(1)
    expect(m.list.find((x) => x.id === VOL)).toBe(d)
    expect(m.def('missing')).toBeUndefined()
    const removed = metricsApi(withEdits({ metricId: VOL, field: 'target', value: null }), FIXTURE)
    expect(removed.target(VOL)).toBeNull()
    expect(removed.def(VOL)).not.toHaveProperty('target')
  })

  it('types its settings and throws for unknown ones', () => {
    const m = metricsApi(EMPTY_METRICS, FIXTURE)
    expect(m.flag(VOL, 'annualize')).toBe(true)
    expect(m.choice(VOL, 'regretted')).toBe('flagged')
    expect(m.ratings(SPEND, 'guideline')[5]).toBe(0.06)
    expect(() => m.num(VOL, 'annualize')).toThrow('is not a number')
    expect(() => m.param('missing', 'x')).toThrow('Unknown metric "missing"')
    expect(() => m.param(VOL, 'missing')).toThrow('has no setting "missing"')
    // Values handed out can't be changed by an engine.
    expect(Object.isFrozen(m.ratings(SPEND, 'guideline'))).toBe(true)
  })

  it('records which settings an engine reads', () => {
    const { metrics, reads } = recordParamReads(metricsApi(EMPTY_METRICS, FIXTURE))
    metrics.num(SPEND, 'meritBudget')
    metrics.param(VOL, 'firstYearDays')
    expect([...reads]).toEqual([paramRef(SPEND, 'meritBudget'), paramRef(VOL, 'firstYearDays')])
    expect(() => metricsWith({ [SPEND]: { meritBudget: 2 } }, FIXTURE)).toThrow('Merit budget')
  })
})

describe('helpers for the shared UI', () => {
  it('words definitions, the export stamp and target status', () => {
    const m = metricsApi(withEdits({ metricId: VOL, field: 'owner', value: 'HRBP team' }), FIXTURE)
    expect(definitionOf(m, VOL)).toEqual({
      term: 'Voluntary attrition',
      text: 'Employees who resigned in the window, as a share of average headcount, annualized.',
      formula: 'voluntary exits ÷ average headcount × (12 ÷ window months)',
      metricId: VOL,
    })
    expect(definitionOf(m, SPEND)).toEqual({
      term: 'Merit spend',
      text: 'Proposed merit as a share of eligible base.',
      metricId: SPEND,
    })
    expect(metricIdOf(definitionOf(m, SPEND)!)).toBe(SPEND)
    expect(metricIdOf({ term: 'Written by hand', text: 'x' })).toBeNull()
    expect(definitionOf(m, 'missing')).toBeNull()
    expect(definitionsStamp(m)).toBe('Definitions changed from defaults: 1 (see Metric definitions)')
    expect(definitionsStamp(defaultMetrics())).toBeNull()
    const t = m.target(VOL)
    expect(targetStatus(0.07, t)).toBe('met')
    expect(targetStatus(0.08, t)).toBe('met')
    expect(targetStatus(0.09, t)).toBe('missed')
    expect(targetStatus(0.9, { value: 0.9, comparator: '>=' })).toBe('met')
    expect(targetStatus(null, t)).toBeNull()
    expect(targetStatus(0.1, null)).toBeNull()
    // "Under" misses at the target itself.
    expect(targetStatus(0.02, { value: 0.02, comparator: '<' })).toBe('missed')
    expect(targetStatus(0.019, { value: 0.02, comparator: '<' })).toBe('met')
  })

  it("judges a KPI against its target only in the metric's own unit", () => {
    const m = metricsApi(EMPTY_METRICS, FIXTURE)
    expect(kpiTarget(m, VOL, 0.09, 'pct')).toEqual({
      target: { value: 0.08, comparator: '<=' },
      status: 'missed',
    })
    expect(kpiTarget(m, VOL, 0.07, 'pct0')?.status).toBe('met')
    // A count on a rate metric's tile, no metric, no target or no value: no status.
    expect(kpiTarget(m, VOL, 12, 'int')).toBeNull()
    expect(kpiTarget(m, null, 0.07, 'pct')).toBeNull()
    expect(kpiTarget(m, SPEND, 0.03, 'pct2')).toBeNull()
    expect(kpiTarget(m, VOL, null, 'pct')).toBeNull()
  })
})

describe('what a number depends on', () => {
  const DEPS = catalogOf([
    ...FIXTURE_DEFS,
    ...defineMetrics('hrbp', [
      {
        id: 'hrbp.attrition.regretted',
        name: 'Regretted attrition',
        definition: 'Regretted exits over average headcount.',
        unit: 'pct',
        goodDirection: 'down',
        uses: ['employees.regrettable'],
        dependsOn: [VOL],
      },
      {
        id: 'hrbp.findings.cluster',
        name: 'Regretted exits under one manager',
        definition: 'Flags a cluster.',
        unit: 'int',
        goodDirection: 'down',
        uses: ['employees.managerId'],
        dependsOn: ['hrbp.attrition.regretted', VOL],
      },
      {
        id: 'hrbp.rules.floor',
        name: 'Material change',
        definition: 'A floor.',
        unit: 'pts',
        goodDirection: null,
        uses: [],
        kind: 'setting',
      },
    ]),
    ...PRIVACY_METRICS,
    ...QUALITY_METRICS,
  ])
  const REG = 'hrbp.attrition.regretted'
  const CLUSTER = 'hrbp.findings.cluster'
  const at = (edits: MetricEdit[]) => {
    const r = applyEdits(EMPTY_METRICS, DEPS, edits, { at: '2026-10-01T00:00:00.000Z' })
    expect(r.rejected).toEqual([])
    return metricsApi(r.state, DEPS)
  }

  it('follows dependencies through, then adds the anonymity minimum for numbers from data', () => {
    const m = metricsApi(EMPTY_METRICS, DEPS)
    expect(m.sourcesOf(CLUSTER)).toEqual([CLUSTER, REG, VOL, ANONYMITY.metricId])
    expect(m.sourcesOf(VOL)).toEqual([VOL, ANONYMITY.metricId])
    // A setting that reads no data has no anonymity minimum behind it.
    expect(m.sourcesOf('hrbp.rules.floor')).toEqual(['hrbp.rules.floor'])
    expect(m.sourcesOf('missing')).toEqual([])
    expect(m.changesBehind(CLUSTER)).toEqual([])
  })

  it('marks a number changed by a setting registered on another metric, but not by its wording', () => {
    const m = at([
      { metricId: VOL, field: 'params.annualize', value: false },
      { metricId: VOL, field: 'definition', value: 'Ours.' },
    ])
    expect(m.isChanged(CLUSTER)).toBe(false)
    expect(m.changesBehind(CLUSTER)).toEqual([
      { metricId: VOL, fields: ['params.annualize'], role: 'source' },
    ])
    expect(m.changesBehind(VOL)).toEqual([
      { metricId: VOL, fields: ['definition', 'params.annualize'], role: 'self' },
    ])
  })

  it('marks every number from data when the anonymity minimum or a quality rule changes', () => {
    const m = at([
      { metricId: ANONYMITY.metricId, field: `params.${ANONYMITY.key}`, value: 8 },
      { metricId: QUALITY_RULES.fill.metricId, field: `params.${QUALITY_RULES.fill.key}`, value: 0.9 },
    ])
    expect(m.changesBehind(REG)).toEqual([
      { metricId: ANONYMITY.metricId, fields: [`params.${ANONYMITY.key}`], role: 'source' },
      { metricId: QUALITY_RULES.fill.metricId, fields: [`params.${QUALITY_RULES.fill.key}`], role: 'rule' },
    ])
    expect(m.changesBehind('hrbp.rules.floor')).toEqual([])
  })

  it('adds the fields a setting brings in to the lineage while it has that value', () => {
    const LINE = catalogOf(
      defineMetrics('recruiting', [
        {
          id: 'recruiting.time.toFill',
          name: 'Time to fill',
          definition: 'Days to fill.',
          unit: 'days',
          goodDirection: 'down',
          uses: ['requisitions.openedDate', 'requisitions.filledDate'],
          usesWhen: [
            {
              setting: { key: 'end' },
              value: 'start',
              uses: ['employees.hireDate', 'requisitions.filledDate'],
            },
          ],
          params: [
            {
              key: 'end',
              label: 'Clock stops at',
              description: 'Where the clock stops.',
              type: 'choice',
              default: 'accepted',
              choices: [
                { value: 'accepted', label: 'Offer accepted' },
                { value: 'start', label: 'Start date' },
              ],
            },
          ],
        },
      ]),
    )
    const id = 'recruiting.time.toFill'
    expect(metricsApi(EMPTY_METRICS, LINE).usesOf(id)).toEqual([
      'requisitions.openedDate',
      'requisitions.filledDate',
    ])
    const r = applyEdit(EMPTY_METRICS, LINE, { metricId: id, field: 'params.end', value: 'start' })
    if (!r.ok) throw new Error(r.error)
    expect(metricsApi(r.state, LINE).usesOf(id)).toEqual([
      'requisitions.openedDate',
      'requisitions.filledDate',
      'employees.hireDate',
    ])
    expect(validateCatalog(LINE.list)).toEqual([])
    expect(
      validateCatalog([
        { ...LINE.list[0], usesWhen: [{ setting: { key: 'nope' }, value: 1, uses: [] }], dependsOn: [id] },
      ]),
    ).toEqual([`${id}: its lineage follows ${id} nope, which is not a setting.`, `${id}: depends on itself.`])
  })
})
