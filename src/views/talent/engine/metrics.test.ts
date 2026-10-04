/**
 * The Talent view's metric dictionary entries: every KPI, figure and finding links to a registered
 * metric, its popover and datasheet read the registry wording, every registered setting is read
 * by the engine through `ctx.metrics`, and changing a setting changes the numbers it drives.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { defaultMetrics, kpiTarget } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { metrics as TALENT_METRICS } from '../metrics'
import { computeTalent, type TalentModel, talentHeadline } from './index'
import { TALENT_FIGURE_IDS } from './lineage'
import { DEFAULTS, FIGURE_METRIC, KPI_METRIC, TALENT_METRIC as M, TALENT_PARAM as P } from './settings'
import { sourcesFor } from './test-fixtures'
import { figureDefinitions } from './wording'

/** The view's UI source, to check that every Figure names its metric and reads its definitions. */
const UI_SOURCES = import.meta.glob<string>('../ui/*.tsx', { query: '?raw', import: 'default', eager: true })

let data: Datasets
let ctx: AnalyticsContext
let m: TalentModel

const ctxWith = (metrics?: MetricsApi, asOf: string | null = null) =>
  buildContext({
    data,
    sources: sourcesFor(data, 'sample'),
    filters: DEFAULT_FILTERS,
    asOfOverride: asOf,
    showPay: false,
    metrics,
  })

/** The model with some settings changed: `{ metricId: { key: value } }`. */
const withSettings = (params: Parameters<typeof metricsWith>[0]) =>
  computeTalent(ctxWith(metricsWith(params)))

const kpi = (t: TalentModel, id: string) => t.kpis.find((k) => k.id === id)!
const finding = (t: TalentModel, id: string) => t.findings.find((f) => f.id === id)

beforeAll(() => {
  data = generateSample()
  ctx = ctxWith()
  m = computeTalent(ctx)
})

describe('Talent metric registry', () => {
  it('passes the catalog checks and lives in the assembled catalog', () => {
    expect(validateCatalog(TALENT_METRICS)).toEqual([])
    for (const d of TALENT_METRICS) {
      expect(d.id.startsWith('talent.'), d.id).toBe(true)
      expect(d.views[0]).toBe('talent')
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      expect(d.uses.length, d.id).toBeGreaterThan(0)
      expect(d.owner, d.id).toBeTruthy()
    }
    // Every id the engines name is registered, once.
    const ids = Object.values(M)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual(TALENT_METRICS.map((d) => d.id).sort())
  })

  it('links every KPI to a registered metric and reads its popover from the registry', () => {
    expect(m.kpis).toHaveLength(Object.keys(KPI_METRIC).length)
    for (const k of m.kpis) {
      expect(k.metricId, k.id).toBe(KPI_METRIC[k.id as keyof typeof KPI_METRIC])
      const def = ctx.metrics.def(k.metricId!)
      expect(def, k.id).toBeDefined()
      expect(k.definition?.startsWith(def!.definition), k.id).toBe(true)
    }
    expect(talentHeadline(ctx).metricId).toBe(M.criticalCoverage)
  })

  it('links every finding to its rule in the registry', () => {
    // Today's findings plus a month with a different mix of them.
    const early = computeTalent(ctxWith(undefined, '2025-03-31'))
    const findings = [...m.findings, ...early.findings]
    expect(findings.length).toBeGreaterThan(8)
    for (const f of findings) {
      const def = f.metricId ? ctx.metrics.def(f.metricId) : undefined
      expect(def, f.id).toBeDefined()
      expect(def!.name.startsWith('Readout: '), f.id).toBe(true)
    }
  })

  it('names a registered metric for every figure, and every Figure passes it', () => {
    expect(Object.keys(FIGURE_METRIC).sort()).toEqual([...TALENT_FIGURE_IDS].sort())
    for (const id of TALENT_FIGURE_IDS) expect(ctx.metrics.def(FIGURE_METRIC[id]), id).toBeDefined()
    const seen: string[] = []
    for (const [file, src] of Object.entries(UI_SOURCES)) {
      const opened = src.match(/<Figure\s/g)?.length ?? 0
      const wired = [
        ...src.matchAll(
          /<Figure\s+id="([^"]+)"\s+uses=\{m\.uses\['[^']+'\]\}\s+metric=\{FIGURE_METRIC\['([^']+)'\]\}/g,
        ),
      ]
      expect(wired.length, `${file}: every <Figure> passes metric right after uses`).toBe(opened)
      for (const [, id, key] of wired) {
        expect(key, file).toBe(id)
        seen.push(id)
      }
      // The datasheet reads the registry, starting with the figure's own metric.
      const defs = [
        ...src.matchAll(
          /<Figure\s+id="([^"]+)"[\s\S]*?definitions=\{defsFor\(\s*ctx\.metrics,\s*\[M\.(\w+)/g,
        ),
      ]
      expect(defs.length, `${file}: every <Figure> reads its definitions with defsFor`).toBe(opened)
      for (const [, id, name] of defs)
        expect(M[name as keyof typeof M], id).toBe(FIGURE_METRIC[id as keyof typeof FIGURE_METRIC])
    }
    expect(seen.sort()).toEqual([...TALENT_FIGURE_IDS].sort())
  })

  it('shows edited wording everywhere: KPI popovers and figure datasheets', () => {
    const edited = metricsWithEdits([
      { metricId: M.highPerformers, field: 'definition', value: 'Our own wording for high performers.' },
    ])
    const t = computeTalent(ctxWith(edited))
    expect(kpi(t, 'talent-high-performers').definition).toMatch(/^Our own wording for high performers\./)
    const sheet = figureDefinitions(edited, [M.highPerformers, M.ratingDistribution])
    expect(sheet[0]).toMatchObject({ term: 'High performers', text: 'Our own wording for high performers.' })
    // Nothing else changed: the numbers are the defaults'.
    expect(t.kpis.map((k) => k.value)).toEqual(m.kpis.map((k) => k.value))
  })

  it('says which settings differ from the defaults, and only then', () => {
    expect(kpi(m, 'talent-high-performers').definition).not.toMatch(/Changed from the defaults/)
    expect(figureDefinitions(ctx.metrics, [M.riskBands]).map((d) => d.term)).toEqual(['Flight-risk bands'])
    const t = withSettings({ [P.highRating.metricId]: { [P.highRating.key]: 5 } })
    expect(kpi(t, 'talent-high-performers').definition).toMatch(
      /Changed from the defaults: high performer rating 5 \(default 4\)\.$/,
    )
    const bands = metricsWith({ [M.riskBands]: { highShare: 0.2 } })
    expect(figureDefinitions(bands, [M.riskBands]).at(-1)).toEqual({
      term: 'Settings in force',
      text: 'Changed from the defaults: high band share 20% (default 10%).',
    })
  })
})

describe('Talent settings are read through the dictionary', () => {
  it('reads every registered Talent setting while computing the view', () => {
    const { metrics, reads } = recordParamReads(defaultMetrics())
    computeTalent(ctxWith(metrics))
    talentHeadline(ctxWith(metrics))
    const registered = paramsOfView('talent')
    expect(registered.length).toBeGreaterThanOrEqual(20)
    for (const p of registered) expect(reads, p).toContain(p)
    // The anonymity minimum comes from the privacy rule, not a constant.
    expect(reads).toContain(`${ANONYMITY.metricId}#${ANONYMITY.key}`)
  })

  it('reproduces the default numbers with an empty dictionary', () => {
    const t = computeTalent(ctxWith(metricsWith({})))
    expect(t.kpis.map((k) => [k.id, k.value, k.delta, k.note])).toEqual(
      m.kpis.map((k) => [k.id, k.value, k.delta, k.note]),
    )
    expect(t.findings.map((f) => f.title)).toEqual(m.findings.map((f) => f.title))
    expect(m.settings.highGuideline).toBeCloseTo(0.35, 12)
    expect(m.settings.onTimeTarget).toEqual({ value: 0.95, comparator: '>=' })
  })
})

describe('Changing a Talent setting changes the numbers', () => {
  it('high performer rating: 5 counts only people rated 5, against the guideline at 5', () => {
    const t = withSettings({ [P.highRating.metricId]: { [P.highRating.key]: 5 } })
    const p = t.performance
    expect(p.highShare).toBeCloseTo(p.distribution[4].people / p.rated, 12)
    expect(p.highShare!).toBeLessThan(m.performance.highShare!)
    const tile = kpi(t, 'talent-high-performers')
    expect(tile.value).toBe(p.highShare)
    expect(tile.delta).toBeCloseTo(p.highShare! - 0.1, 12)
    expect(kpi(t, 'talent-regretted-high').label).toBe('Regretted exits, rated 5')
    // Key talent, the 9-box and promotion readiness follow the same rating.
    expect(t.retention.keyTalent.every((k) => k.rating === 5)).toBe(true)
    expect(t.retention.highPerformers).toBeLessThan(m.retention.highPerformers)
    const high = t.nineBox.cells.filter((c) => c.performance === 'High').flatMap((c) => c.people)
    expect(high.every((x) => x.rating === 5)).toBe(true)
    expect(t.overdue.rows.length).toBeLessThan(m.overdue.rows.length)
  })

  it('rating guideline: the guideline share and the inflation gap move with it', () => {
    const guideline = { 1: 0.05, 2: 0.15, 3: 0.5, 4: 0.2, 5: 0.1 }
    const t = withSettings({ [P.guideline.metricId]: { [P.guideline.key]: guideline } })
    expect(t.settings.highGuideline).toBeCloseTo(0.3, 12)
    expect(t.performance.distribution.map((d) => d.guideline)).toEqual([0.05, 0.15, 0.5, 0.2, 0.1])
    expect(kpi(t, 'talent-high-performers').delta).toBeCloseTo(t.performance.highShare! - 0.3, 12)
    expect(finding(t, 'talent-inflation-Go-to-Market')?.title).toBe(
      'Go-to-Market rated 45.5% of people 4 or 5 in 2026 Mid-year, 15.5 pts above the 30% guideline.',
    )
  })

  it('flight-risk bands: a 20% high band puts about 20% of scores in it', () => {
    const t = withSettings({ [M.riskBands]: { highShare: 0.2, mediumShare: 0.3 } })
    expect(t.risk.highShare!).toBeGreaterThan(0.16)
    expect(t.risk.highShare!).toBeLessThan(0.24)
    expect(t.risk.highShare! + t.risk.mediumShare!).toBeGreaterThan(0.45)
    expect(t.retention.keyTalent.length).toBeGreaterThan(m.retention.keyTalent.length)
    expect(kpi(t, 'talent-key-talent-risk').value).toBe(t.retention.keyTalent.length)
    // The default model is still cached and unchanged.
    expect(computeTalent(ctx).risk.highShare).toBe(m.risk.highShare)
  })

  it('rating inflation threshold: 12 pts no longer flags Go-to-Market (10.5 pts above)', () => {
    expect(finding(m, 'talent-inflation-Go-to-Market')).toBeDefined()
    const t = withSettings({ [M.inflationRule]: { abovePts: 0.12 } })
    expect(t.performance.inflation).toEqual([])
    expect(finding(t, 'talent-inflation-Go-to-Market')).toBeUndefined()
  })

  it('calibration shift threshold: 0.5 no longer flags Silicon Engineering (about 0.42)', () => {
    expect(m.performance.calibrationFlags.map((c) => c.row.businessUnit)).toEqual(['Silicon Engineering'])
    const t = withSettings({ [M.calibrationRule]: { minShift: 0.5 } })
    expect(t.performance.calibrationFlags).toEqual([])
    expect(t.findings.some((f) => f.id.startsWith('talent-calibration-'))).toBe(false)
    const lower = withSettings({ [M.calibrationRule]: { minShift: 0.1 } })
    expect(lower.performance.calibrationFlags.length).toBeGreaterThanOrEqual(1)
  })

  it('overdue-for-promotion years: 2 years finds everyone 3 years finds, and more', () => {
    const t = withSettings({ [M.promotionOverdue]: { years: 2 } })
    const ids = new Set(t.overdue.rows.map((r) => r.employeeId))
    expect(m.overdue.rows.every((r) => ids.has(r.employeeId))).toBe(true)
    expect(t.overdue.rows.length).toBeGreaterThan(m.overdue.rows.length)
    expect(finding(t, 'talent-promotion-overdue')?.title).toMatch(
      /^\d+ consistent high performers have had no promotion in 2 or more years/,
    )
  })

  it('required training target: met at 90%, so the readout calls it out', () => {
    expect(m.learning.current.rate!).toBeLessThan(0.95)
    expect(finding(m, 'talent-good-training')).toBeUndefined()
    const t = computeTalent(
      ctxWith(
        metricsWithEdits([
          { metricId: M.requiredOnTime, field: 'target', value: { value: 0.9, comparator: '>=' } },
        ]),
      ),
    )
    expect(finding(t, 'talent-good-training')?.title).toBe(
      '91.9% of required training due in this period was completed on time, above the 90% target.',
    )
    // The tile judges its value against the target (KpiStrip shows "Met · target at least 90.0%").
    const tile = kpi(t, 'talent-training-on-time')
    expect(tile.note).toBe('7,487 assignments due')
    const edited = metricsWithEdits([
      { metricId: M.requiredOnTime, field: 'target', value: { value: 0.9, comparator: '>=' } },
    ])
    expect(kpiTarget(edited, tile.metricId, tile.value, tile.format)?.status).toBe('met')
    expect(kpiTarget(defaultMetrics(), tile.metricId, tile.value, tile.format)?.status).toBe('missed')
    // Without a target, the tile and the good-news finding drop it.
    const none = computeTalent(
      ctxWith(metricsWithEdits([{ metricId: M.requiredOnTime, field: 'target', value: null }])),
    )
    expect(kpi(none, 'talent-training-on-time').note).toBe('7,487 assignments due')
  })

  it('readout thresholds: severity and inclusion follow their settings', () => {
    // 8 of 28 critical roles not ready (28.6%) is a warning at 40%, critical at 20%.
    expect(finding(m, 'talent-critical-not-ready')?.severity).toBe('warning')
    const notReady = withSettings({ [M.criticalNotReadyRule]: { criticalShare: 0.2 } })
    expect(finding(notReady, 'talent-critical-not-ready')?.severity).toBe('critical')
    // Export control: 54 people overdue in Operations is critical, not with a 100-person bar.
    expect(finding(m, 'talent-training-overdue')?.severity).toBe('critical')
    const overdue = withSettings({ [M.trainingOverdueRule]: { criticalPeople: 100 } })
    expect(finding(overdue, 'talent-training-overdue')?.severity).toBe('warning')
    // 25 people overdue for promotion are named from 3, not from 30.
    const promo = withSettings({ [M.promotionOverdueRule]: { minPeople: 30 } })
    expect(finding(promo, 'talent-promotion-overdue')).toBeUndefined()
    // A longer look-back finds at least the same high-potential exits.
    const hipo = withSettings({ [M.hipoExitsRule]: { months: 12 } })
    expect(hipo.retention.hipoExits.people.length).toBeGreaterThanOrEqual(3)
    expect(finding(hipo, 'talent-hipo-exits')?.title).toMatch(/in the last 12 months\.$/)
  })

  it('anonymity minimum: raising it hides more groups', () => {
    const t = computeTalent(ctxWith(metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 40 } })))
    expect(t.settings.minGroup).toBe(40)
    for (const r of [...t.performance.byDepartment, ...t.performance.byLevel])
      expect(r.rated >= 40 || r.high == null, r.group).toBe(true)
    expect(t.performance.byDepartment.length).toBeLessThan(m.performance.byDepartment.length)
    // It can't go below 5.
    expect(() => metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 3 } })).toThrow()
  })

  it('shared factor share: at 50% more factors are set aside as too common to be a main reason', () => {
    // Every person in the sample's high band has tenure of 1-3 years; half have high department
    // attrition and two thirds a rating drop.
    expect(m.retention.commonFactors).toEqual(['tenurePeak'])
    const t = withSettings({ [M.riskDrivers]: { sharedShare: 0.5 } })
    expect([...t.retention.commonFactors].sort()).toEqual(['deptAttrition', 'ratingDrop', 'tenurePeak'])
    expect(t.retention.drivers.find((d) => d.key === 'ratingDrop')?.common).toBe(true)
    expect(DEFAULTS.sharedFactor).toBe(0.8)
  })
})
