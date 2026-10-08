/**
 * The Compensation view and the metric dictionary (docs/METRICS.md): every KPI, figure and finding
 * links to a registered metric and shows its wording, every registered setting is read through
 * `ctx.metrics`, changing a setting changes the numbers, and the defaults reproduce the view as it
 * was before the settings moved into the dictionary.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { fmt } from '@/lib/format'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { computeHrbp } from '@/views/hrbp/engine'
import { view } from '../index'
import { metrics as COMP_METRICS, M } from '../metrics'
import { FIGURE_METRIC, figureDefinitions, metricText } from './definitions'
import { FIGURE_IDS } from './lineage'
import { type CompModel, computeComp } from './model'
import { compRulesOf } from './rules'
import { DEFAULT_SETTINGS } from './settings'
import { AS_OF, dataset, team, sources as uploadSources } from './test-fixtures'

let data: Datasets

function sampleContext(metrics?: MetricsApi, filters: Partial<Filters> = {}): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay: false,
    metrics,
  })
}

function fixtureContext(d: Datasets, metrics?: MetricsApi): AnalyticsContext {
  return buildContext({
    data: d,
    sources: uploadSources(d),
    filters: DEFAULT_FILTERS,
    asOfOverride: AS_OF,
    showPay: false,
    metrics,
  })
}

const run = (metrics?: MetricsApi, filters: Partial<Filters> = {}): CompModel =>
  computeComp(sampleContext(metrics, filters))
const kpisOf = (m: CompModel): Kpi[] => [...m.kpis, ...m.cycle.kpis]
const kpi = (m: CompModel, id: string): Kpi => kpisOf(m).find((k) => k.id === id)!
const finding = (m: CompModel, id: string): Finding | undefined => m.findings.find((f) => f.id === id)

let base: CompModel

beforeAll(() => {
  data = generateSample()
  base = run()
})

describe('compensation metric dictionary entries', () => {
  it('are sound and all registered under Compensation', () => {
    expect(validateCatalog(COMP_METRICS)).toEqual([])
    for (const id of Object.values(M)) {
      const d = CATALOG.byId.get(id)
      expect(d, id).toBeTruthy()
      expect(d!.views[0], id).toBe('comp')
      expect(d!.uses.length, `${id} declares its fields`).toBeGreaterThan(0)
      expect(d!.owner, id).toBeTruthy()
    }
    expect(COMP_METRICS.map((d) => d.id).sort()).toEqual(Object.values(M).sort())
  })

  it('keep the cycle settings on the metrics the rest of Census expects', () => {
    const keys = (id: string) => CATALOG.byId.get(id)!.params.map((p) => p.key)
    expect(keys('comp.merit.spend')).toContain('meritBudget')
    expect(keys('comp.compa.inBand')).toContain('healthyBand')
    expect(keys('comp.merit.guidelineSpend')).toContain('guideline')
  })

  it('every metric shows somewhere: a tile, a finding, a figure or a figure definitions row', () => {
    const shown = new Set<string>([
      ...kpisOf(base).map((k) => k.metricId!),
      ...base.findings.map((f) => f.metricId!),
      ...Object.values(FIGURE_METRIC),
    ])
    const rowTerms = new Set(Object.values(base.definitions).flatMap((rows) => rows.map((r) => r.term)))
    for (const d of COMP_METRICS) expect(shown.has(d.id) || rowTerms.has(d.name), d.id).toBe(true)
  })
})

describe('every number links to a registered metric', () => {
  it('every KPI tile, with the registry wording in its popover', () => {
    const m = base.metrics
    expect(kpisOf(base)).toHaveLength(12)
    for (const k of kpisOf(base)) {
      expect(k.metricId, k.id).toBeTruthy()
      const d = m.def(k.metricId!)
      expect(d, k.id).toBeTruthy()
      expect(d!.views).toContain('comp')
      expect(k.definition!.startsWith(d!.definition), k.id).toBe(true)
    }
  })

  it('every finding, across scopes and settings that raise each kind', () => {
    const models = [
      base,
      run(undefined, { location: ['Bengaluru'] }),
      run(undefined, { businessUnit: ['Go-to-Market'] }),
      // Over budget across the whole scope.
      run(metricsWith({ 'comp.merit.spend': { meritBudget: 0.03 } })),
      // No good news about differentiation, so the band can be the good news.
      computeComp(fixtureContext(dataset(team(10, {}, () => ({ compa: 0.93 }))))),
    ]
    const kinds = new Set<string>()
    for (const m of models)
      for (const f of m.findings) {
        expect(f.metricId, f.id).toBeTruthy()
        expect(CATALOG.byId.get(f.metricId!)?.views[0], f.id).toBe('comp')
        kinds.add(f.id.replace(/^(comp-[a-z-]+?)(-[A-Z].*)?$/, '$1'))
      }
    for (const k of [
      'comp-low-compa-location',
      'comp-below-min',
      'comp-above-max',
      'comp-compression',
      'comp-over-budget',
      'comp-over-budget-total',
      'comp-exceptions',
      'comp-below-market',
      'comp-no-differentiation',
      'comp-good-differentiation',
      'comp-good-band',
    ])
      expect(kinds, k).toContain(k)
  })

  it('every finding the readout can raise sets its metric in the source', async () => {
    const src = (await import('./findings.ts?raw')).default as string
    const ids = [...src.matchAll(/\bid: [`']comp-[^`']+[`'],\n\s+([^\n]+)/g)]
    expect(ids.length).toBeGreaterThanOrEqual(10)
    for (const [whole, next] of ids) expect(next, whole).toMatch(/^metricId: M\.\w+,$/)
  })

  it('every figure, with its definitions panel led by the registry wording', () => {
    expect(Object.keys(FIGURE_METRIC).sort()).toEqual([...FIGURE_IDS].sort())
    for (const id of FIGURE_IDS) {
      const d = base.metrics.def(FIGURE_METRIC[id])
      expect(d, id).toBeTruthy()
      const [lead] = base.definitions[id]
      expect(lead.term, id).toBe(d!.name)
      expect(lead.text.startsWith(d!.definition), id).toBe(true)
      if (d!.formula) expect(lead.formula, id).toBe(d!.formula)
    }
  })

  it('the folder-tab headline', () => {
    const h = view.headline(sampleContext())
    expect(h.metricId).toBe(M.compaMedian)
    expect(h.value).toBe('0.98')
  })
})

/** The tab sources, to check each <Figure> passes its metric and the registry definitions. */
const TABS = import.meta.glob('../tabs/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('compensation figures in the tabs', () => {
  it('pass the metric and the dictionary definitions for their own id', () => {
    const seen: string[] = []
    for (const [path, src] of Object.entries(TABS)) {
      for (const b of src.split('<Figure').slice(1)) {
        const id = /^\s+id="([^"]+)"/.exec(b)?.[1]
        expect(id, `${path}: a Figure without a literal id`).toBeTruthy()
        const props = b.slice(0, b.indexOf('>'))
        expect(props, `${path}: ${id}`).toContain(`metric={FIGURE_METRIC['${id}']}`)
        expect(props, `${path}: ${id}`).toContain(`definitions={m.definitions['${id}']}`)
        seen.push(id!)
      }
    }
    expect(seen.sort()).toEqual([...FIGURE_IDS].sort())
  })
})

describe('settings are read through the dictionary', () => {
  it('every registered setting is read by the engine, and the anonymity minimum too', () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleContext(metrics)
    // Only what the engine reads: the context itself reads the data quality rules.
    reads.clear()
    computeComp(ctx)
    const registered = paramsOfView('comp')
    expect(registered.length).toBeGreaterThanOrEqual(25)
    for (const p of registered) expect(reads, p).toContain(p)
    expect(reads).toContain(paramRef(ANONYMITY.metricId, ANONYMITY.key))
  })

  it("reads another view's settings only where a comp metric declares it depends on them", () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleContext(metrics)
    reads.clear()
    computeComp(ctx)
    const own = new Set([...paramsOfView('comp'), paramRef(ANONYMITY.metricId, ANONYMITY.key)])
    const declared = new Set(
      CATALOG.list
        .filter((d) => d.views[0] === 'comp')
        .flatMap((d) => defaultMetrics().sourcesOf(d.id))
        .flatMap((id) => (CATALOG.byId.get(id)?.params ?? []).map((p) => paramRef(id, p.key))),
    )
    const foreign = [...reads].filter((r) => !own.has(r))
    for (const r of foreign) expect(declared, r).toContain(r)
    // Voluntary attrition in the readout is measured as on People stats.
    expect(foreign.sort()).toEqual(
      [
        paramRef('hrbp.attrition.all', 'annualize'),
        paramRef('hrbp.headcount.employees', 'countContractors'),
      ].sort(),
    )
  })

  it('the defaults are the thresholds the view used before they moved into the dictionary', () => {
    const r = compRulesOf(defaultMetrics())
    expect(r.cycle).toEqual({
      meritBudget: 0.035,
      bandLow: 0.9,
      bandHigh: 1.1,
      guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
    })
    expect(r).toMatchObject({
      minGroup: 5,
      compaMedian: { material: 0.03 },
      inBand: { material: 0.05, goodShare: 0.75 },
      lowCompa: { threshold: 0.92, attritionGap: 0.03 },
      belowMin: { material: 0.02, criticalShare: 0.05, criticalCount: 10 },
      aboveMax: { material: 0.02 },
      increaseToMin: { largeGap: 0.1 },
      compression: { minGroup: 5, gap: 0.05, findingMin: 10 },
      overBudget: { material: 0.001, flag: 0.002, critical: 0.01 },
      exceptions: { topRatingFloor: 0.02, lowRatingCap: 0.03, outlierZ: 3.5, outlierMinPeers: 10 },
      differentiation: { floor: 1.15, strong: 1.3, material: 0.15 },
      marketMedian: { material: 0.03 },
      marketGap: { minFunction: 10, jobWatch: 0.1 },
      belowMarket: { threshold: 0.05, rangeGap: 0.05 },
    })
  })

  it('the defaults reproduce the view computed with the engine defaults', () => {
    const legacy = computeComp(sampleContext(), DEFAULT_SETTINGS)
    const pick = (m: CompModel) => ({
      kpis: kpisOf(m).map((k) => [k.id, k.value, k.delta ?? null, k.note, k.suppressed ?? false]),
      findings: m.findings.map((f) => [f.id, f.severity, f.title, f.detail ?? '', f.action ?? '']),
      exceptions: m.cycle.exceptions.map((e) => [e.id, e.kind, e.rule]),
      compression: m.ranges.compression.map((c) => [c.group, c.gap, c.flagged]),
      market: m.market.jobChart.map((r) => [r.group, r.median]),
    })
    expect(pick(base)).toEqual(pick(legacy))
    expect(kpi(base, 'merit-spend').value!).toBeCloseTo(0.03544, 5)
    expect(finding(base, 'comp-below-min')!.title).toBe(
      '78 people are paid below range minimum, 5.4% of 1,450.',
    )
  })
})

describe('changing a setting changes the numbers', () => {
  it('healthy band: the in-band share, its note and its popover', () => {
    const m = run(metricsWith({ 'comp.compa.inBand': { healthyBand: [0.95, 1.05] } }))
    expect(kpi(m, 'in-band').value!).toBeLessThan(kpi(base, 'in-band').value!)
    expect(kpi(m, 'in-band').note).toBe('Compa-ratio 0.95 to 1.05')
    expect(kpi(m, 'in-band').definition).toContain('The healthy band is 0.95 to 1.05.')
    expect(m.settings).toMatchObject({ bandLow: 0.95, bandHigh: 1.05 })
  })

  it('merit budget: the gap on the tiles, the business unit flags and the whole-scope finding', () => {
    expect(finding(base, 'comp-over-budget-total')).toBeUndefined()
    const m = run(metricsWith({ 'comp.merit.spend': { meritBudget: 0.03 } }))
    expect(m.cycle.spend.delta!).toBeCloseTo(0.0054, 4)
    expect(kpi(m, 'merit-spend').deltaLabel).toBe('vs 3.00% budget')
    const total = finding(m, 'comp-over-budget-total')!
    expect(total.title).toBe('Merit proposals cost 3.54% of eligible base, 0.54 pts over the 3.00% budget.')
    expect(total.metricId).toBe(M.overBudget)
  })

  it('merit guideline: the guideline spend and the merit-by-rating gaps', () => {
    const m = run(
      metricsWith({
        'comp.merit.guidelineSpend': { guideline: { 5: 0.08, 4: 0.06, 3: 0.04, 2: 0.02, 1: 0 } },
      }),
    )
    expect(m.cycle.spend.guidelinePct!).toBeGreaterThan(base.cycle.spend.guidelinePct! + 0.005)
    const r3 = m.performance.meritByRating.find((r) => r.rating.startsWith('3'))!
    expect(r3.guideline).toBe(0.04)
  })

  it('low compa-ratio threshold: which locations the readout raises', () => {
    expect(finding(base, 'comp-low-compa-location-Bengaluru')).toBeTruthy()
    const lower = run(metricsWith({ 'comp.compa.lowGroup': { threshold: 0.87 } }))
    expect(finding(lower, 'comp-low-compa-location-Bengaluru')).toBeUndefined()
    // The escalation gap decides critical against warning.
    const calmer = run(metricsWith({ 'comp.compa.lowGroup': { attritionGap: 0.2 } }))
    expect(finding(calmer, 'comp-low-compa-location-Bengaluru')!.severity).toBe('warning')
  })

  it('differentiation floor and good-news ratio', () => {
    expect(finding(base, 'comp-no-differentiation-Firmware')).toBeTruthy()
    const lax = run(metricsWith({ 'comp.merit.differentiation': { floor: 1 } }))
    expect(lax.findings.some((f) => f.id.startsWith('comp-no-differentiation'))).toBe(false)
    expect(kpi(lax, 'p4p').definition).toContain('Below 1.00× ratings make little difference to pay.')
    const strict = run(metricsWith({ 'comp.merit.differentiation': { strong: 2 } }))
    expect(finding(strict, 'comp-good-differentiation')).toBeUndefined()
  })

  it('compression: the smallest side compared, the gap flagged and the readout minimum', () => {
    expect(finding(base, 'comp-compression-Design Verification')).toBeTruthy()
    const big = run(metricsWith({ 'comp.compression.gap': { minGroup: 34 } }))
    expect(big.ranges.compression.every((c) => c.newN >= 34 && c.incN >= 34)).toBe(true)
    expect(finding(big, 'comp-compression-Design Verification')).toBeUndefined()
    const wide = run(metricsWith({ 'comp.compression.gap': { gap: 0.2 } }))
    expect(wide.ranges.compression.some((c) => c.flagged)).toBe(false)
    const strict = run(metricsWith({ 'comp.compression.gap': { findingMin: 34 } }))
    expect(strict.ranges.compression.length).toBe(base.ranges.compression.length)
    expect(finding(strict, 'comp-compression-Design Verification')).toBeUndefined()
  })

  it('guideline rules: the exceptions counted and how the readout names them', () => {
    const m = run(metricsWith({ 'comp.merit.exceptions': { topRatingFloor: 0.025, outlierZ: 2.5 } }))
    const kinds = (x: CompModel, k: string) => x.cycle.exceptions.filter((e) => e.kind === k).length
    expect(kinds(m, 'top-low')).toBeGreaterThanOrEqual(kinds(base, 'top-low'))
    expect(kinds(m, 'outlier')).toBeGreaterThan(kinds(base, 'outlier'))
    expect(finding(m, 'comp-exceptions')!.title).toContain('rated 5 below 2.5%')
    expect(m.cycle.exceptions.find((e) => e.kind === 'top-low')!.rule).toBe('Rating 5 below 2.5%')
  })

  it('below market: the threshold and where the gap comes from', () => {
    const analog = 'comp-below-market-Analog & Mixed-Signal'
    expect(finding(base, analog)!.severity).toBe('warning')
    const deeper = run(metricsWith({ 'comp.market.belowMarket': { threshold: 0.1 } }))
    expect(finding(deeper, analog)).toBeUndefined()
    // With a wider range gap no function's ranges trail the market: every gap is pay position.
    const trail = run(metricsWith({ 'comp.market.belowMarket': { rangeGap: 0.2 } }))
    const below = trail.findings.filter((f) => f.id.startsWith('comp-below-market'))
    expect(below.length).toBeGreaterThan(0)
    expect(below.every((f) => f.severity === 'info')).toBe(true)
  })

  it('below minimum: when the finding is critical', () => {
    expect(finding(base, 'comp-below-min')!.severity).toBe('critical')
    const m = run(metricsWith({ 'comp.position.belowMin': { criticalShare: 0.1 } }))
    expect(finding(m, 'comp-below-min')!.severity).toBe('warning')
  })

  it('raising the anonymity minimum hides smaller groups everywhere', () => {
    const m = run(metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 40 } }))
    expect(m.rules.minGroup).toBe(40)
    expect(m.rules.compression.minGroup).toBe(40)
    for (const rows of [m.overview.byLocation, m.overview.byDepartment, m.market.byJob])
      for (const r of rows)
        if (!r.group.startsWith('Other (')) expect(r.n, r.group).toBeGreaterThanOrEqual(40)
    expect(m.ranges.compression).toEqual([])
    expect(m.definitions['comp-position-by-bu'].at(-1)!.text).toContain('Groups under 40 people')
  })

  it('the anonymity minimum and the compression minimum cannot be lowered', () => {
    expect(() => metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 4 } })).toThrow()
    expect(() => metricsWith({ 'comp.compression.gap': { minGroup: 4 } })).toThrow()
  })
})

describe('edited wording shows everywhere', () => {
  it('a changed definition reaches the KPI popover and the figure definitions', () => {
    const edited = metricsWithEdits([
      { metricId: M.compaMedian, field: 'definition', value: 'Our own wording for the median.' },
      { metricId: M.marketGap, field: 'formula', value: 'median market ratio − 1' },
    ])
    const m = run(edited)
    expect(kpi(m, 'median-compa').definition).toBe('Our own wording for the median.')
    expect(m.definitions['comp-compa-by-location'][0].text).toBe('Our own wording for the median.')
    expect(m.definitions['comp-market-by-function'][0].formula).toBe('median market ratio − 1')
    // Numbers do not move when only wording changes.
    expect(kpi(m, 'median-compa').value).toBe(kpi(base, 'median-compa').value)
  })

  it('metric text and the figure panels come from the dictionary passed in', () => {
    const edited = metricsWithEdits([{ metricId: M.inBand, field: 'definition', value: 'Inside the band.' }])
    const r = compRulesOf(edited)
    expect(metricText(edited, r, M.inBand)).toBe('Inside the band. The healthy band is 0.90 to 1.10.')
    const rows = figureDefinitions(edited, r)['comp-compa-distribution']
    expect(rows.map((x) => x.term)).toEqual(['Compa-ratio', 'In healthy band', 'Population'])
    expect(rows[1].text).toBe('Inside the band. The healthy band is 0.90 to 1.10.')
  })
})

describe('voluntary attrition in the readout', () => {
  it('is the number People stats shows, whatever the People stats settings', () => {
    const lowCompa = (m: CompModel) => m.findings.find((f) => f.id.startsWith('comp-low-compa-location'))
    const settings: Parameters<typeof metricsWith>[0][] = [
      {},
      { 'hrbp.headcount.employees': { countContractors: true } },
      { 'hrbp.attrition.all': { annualize: false } },
    ]
    for (const edits of settings) {
      const ctx = sampleContext(metricsWith(edits), { period: 't3m' })
      const company = computeHrbp(ctx).kpi.kpis.find((k) => k.id === 'voluntary')!
      const f = lowCompa(computeComp(ctx))
      expect(f?.detail, JSON.stringify(edits)).toContain(`vs ${fmt(company.value, 'pct')} for the company`)
    }
  })
})
