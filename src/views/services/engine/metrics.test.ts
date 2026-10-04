/**
 * The HR ops metric dictionary (docs/METRICS.md, build step 2): every KPI, figure and finding
 * links to a registered metric whose wording it shows, every registered setting is read through
 * the registry, and changing a setting changes the numbers it governs. The defaults reproduce the
 * numbers the other engine tests pin down.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { CASE_CATEGORIES, MIN_GROUP } from '@/data/schema'
import { defaultMetrics, kpiTarget } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { formatParamNumber } from '@/metrics/params'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { categoryKey, FIGURE_METRIC, levelMetric, M, metrics } from '../metrics'
import { SERVICE_LEVELS } from './catalog'
import { servicesDefinitions } from './definitions'
import { canDrill } from './drills'
import { compute, headline, type ServicesModel } from './index'
import { levelStatus } from './levels'
import { FIGURE_IDS } from './lineage'
import { defaultSettings, levelTargetText, servicesSettings } from './settings'
import { fixtureContext, kase, sampleContext } from './testkit'

const base = compute(sampleContext())
const withSettings = (params: Parameters<typeof metricsWith>[0]): ServicesModel =>
  compute(sampleContext({}, metricsWith(params)))
/** The model with one metric's target changed (the dictionary's Target field). */
const targetOf = (metricId: string, value: number): MetricsApi => {
  const comparator = CATALOG.byId.get(metricId)?.target?.comparator ?? '>='
  return metricsWithEdits([{ metricId, field: 'target', value: { value, comparator } }])
}
const withTarget = (metricId: string, value: number): ServicesModel =>
  compute(sampleContext({}, targetOf(metricId, value)))
const kpi = (m: ServicesModel, id: string): Kpi => {
  const k = m.kpis.find((x) => x.id === id)
  if (!k) throw new Error(`No KPI ${id}`)
  return k
}
const category = (m: ServicesModel, name: string) => m.categories.find((r) => r.category === name)
const level = (m: ServicesModel, id: string) => m.levels.find((r) => r.id === id)

const UI_DIR = new URL('../ui/', import.meta.url)
const uiSources = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, UI_DIR), 'utf8') }))

describe('the registry', () => {
  it('passes the catalog checks, every entry at home in HR ops', () => {
    expect(validateCatalog(metrics)).toEqual([])
    expect(metrics.length).toBeGreaterThan(30)
    for (const d of metrics) {
      expect(d.id.startsWith('services.'), d.id).toBe(true)
      expect(d.views[0], d.id).toBe('services')
      expect(d.owner, d.id).toBe('People analytics')
      expect(d.uses.length, d.id).toBeGreaterThan(0)
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
    }
  })

  it('holds a response and a resolution target for every case category, at the schema defaults', () => {
    const api = defaultMetrics()
    for (const c of CASE_CATEGORIES) {
      expect(api.num(M.responseSla, categoryKey(c.category)), c.category).toBe(c.responseHours)
      expect(api.num(M.resolutionSla, categoryKey(c.category)), c.category).toBe(c.resolutionHours)
    }
    expect(categoryKey('Leave & accommodation')).toBe('leaveAccommodation')
    expect(categoryKey('HR data & records')).toBe('hrDataRecords')
  })

  it("holds every scorecard target at its Atlas or Census default, as the metric's own target", () => {
    for (const d of SERVICE_LEVELS) {
      const t = defaultMetrics().target(levelMetric(d.id))
      expect(t?.value, d.id).toBe(d.target)
      expect(t?.comparator, d.id).toBe(d.direction === 'min' ? '>=' : d.strict ? '<' : '<=')
      expect(CATALOG.byId.get(levelMetric(d.id))?.targetRequired, d.id).toBe(true)
      expect(levelTargetText(d, d.target), d.id).toBe(d.targetText)
    }
  })

  it('has one target per measure: the dictionary Target field, never a setting', () => {
    expect(defaultMetrics().target(M.resolutionSla)).toEqual({ value: 0.9, comparator: '>=' })
    expect(defaultMetrics().target(M.onTime)).toEqual({ value: 0.98, comparator: '>=' })
    for (const d of metrics)
      expect(
        d.params.some((p) => p.key === 'target'),
        d.id,
      ).toBe(false)
  })

  it('words each category in its setting descriptions with the right article', () => {
    const texts = CATALOG.byId.get(M.resolutionSla)!.params.map((p) => p.description)
    expect(texts).toContain(
      'Calendar hours from opened to resolved for an onboarding case. A case whose file gives it a different target of its own keeps that one.',
    )
    expect(texts.some((t) => t.includes('for an HR data & records case'))).toBe(true)
    expect(texts.some((t) => t.includes('for a payroll case'))).toBe(true)
    expect(texts.some((t) => / a [aeiou]/.test(t) || t.includes('hr data'))).toBe(false)
  })

  it('keeps the numbers its settings govern out of its wording', () => {
    for (const d of metrics) {
      // Quoted Atlas wording is the source's own and stays as written.
      const text = [d.definition.split('Atlas wording:')[0], d.formula, d.population].join(' ')
      for (const p of d.params) {
        if (typeof p.default !== 'number' || !p.format || p.format === 'int') continue
        expect(text, `${d.id} ${p.key}`).not.toContain(formatParamNumber(p.default, p))
      }
    }
  })
})

describe('every setting is read through the registry', () => {
  const view = paramsOfView('services')
  const anonymity = paramRef(ANONYMITY.metricId, ANONYMITY.key)

  it('reads each registered setting, and the anonymity minimum, on the sample', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleContext({}, recorded)
    // Building the context reads the data quality rules; count only what the engine reads.
    reads.clear()
    compute(ctx)
    expect(view.length).toBeGreaterThan(50)
    for (const ref of view) expect(reads.has(ref), ref).toBe(true)
    expect(reads.has(anonymity)).toBe(true)
    // Nothing else: no setting of another view.
    for (const ref of reads) expect(ref === anonymity || view.includes(ref), ref).toBe(true)
  })

  it('reads them even with no data loaded', () => {
    const { metrics: recorded, reads } = recordParamReads(defaultMetrics())
    const ctx = fixtureContext({}, '2026-09-30', recorded)
    reads.clear()
    compute(ctx)
    for (const ref of view) expect(reads.has(ref), ref).toBe(true)
  })

  it('reproduces the defaults the engine had as constants', () => {
    const s = servicesSettings(defaultMetrics())
    expect(s).toEqual(defaultSettings())
    expect(s).toMatchObject({
      minGroup: MIN_GROUP,
      resolutionTarget: 0.9,
      onTimeTarget: 0.98,
      agedDays: 14,
      spike: { factor: 1.8, minExtra: 15, baselineMonths: 6, minBase: 5, seasonalFactor: 1.5, slaFloor: 0.8 },
      slow: { floor: 0.8, critical: 0.7, minCases: 20 },
      finalPay: { floor: 0.95, minExits: 5, minLate: 2 },
      newHire: { regionFloor: 0.95, regionGap: 0.03, siteFloor: 0.9, siteMinStarts: 10, minLate: 3 },
      csatGap: { gap: 0.5, minResponses: 20 },
      reopen: { multiple: 2, minResolved: 20, minReopens: 5 },
      agedBacklog: { days: 30, minCases: 3 },
      retro: { minChanges: 20, warning: 0.04 },
      strongest: { floor: 0.95, minCases: 50 },
      atRisk: { pts: 0.05, daysShare: 0.1, ceilingShare: 0.25 },
    })
    expect(s.spike.slaDrop).toBeCloseTo(0.1)
    expect(defaultSettings().resolutionTarget).toBe(0.9)
    expect(defaultSettings().onTimeTarget).toBe(0.98)
    expect(kpi(base, 'open-backlog').note).toMatch(/older than 14 d$/)
  })
})

describe('every number links to a registered metric', () => {
  it('names one on every KPI, with the registry wording in its popover', () => {
    for (const k of base.kpis) {
      const d = k.metricId ? CATALOG.byId.get(k.metricId) : undefined
      expect(d, k.id).toBeDefined()
      expect(k.definition, k.id).toBe(d?.definition)
    }
    expect(headline(sampleContext()).metricId).toBe(M.backlog)
  })

  it('names a readout rule on every finding', () => {
    expect(base.findings.length).toBeGreaterThan(5)
    for (const f of base.findings) {
      expect(f.metricId && CATALOG.byId.has(f.metricId), f.id).toBe(true)
      expect(f.metricId?.startsWith('services.readout.'), f.id).toBe(true)
    }
  })

  it('names one on every figure, and every Figure in the UI passes it', () => {
    expect(Object.keys(FIGURE_METRIC).sort()).toEqual([...FIGURE_IDS].sort())
    for (const id of FIGURE_IDS) expect(CATALOG.byId.has(FIGURE_METRIC[id]), id).toBe(true)
    for (const { file, text } of uiSources) {
      const figures = text.match(/<Figure\b/g)?.length ?? 0
      const linked = text.match(/\bmetric=\{FIGURE_METRIC\[/g)?.length ?? 0
      expect(linked, file).toBe(figures)
    }
  })

  it('takes Figure definitions from the registry rather than writing its own', () => {
    for (const { file, text } of uiSources) expect(text, file).not.toMatch(/\bDEF\.|term: '/)
    const D = servicesDefinitions(defaultMetrics(), defaultSettings())
    expect(D.resolutionSla).toEqual({
      term: 'Resolution SLA met',
      text: `${CATALOG.byId.get(M.resolutionSla)?.definition} Target 90%.`,
      formula: 'resolved within target ÷ (resolved + open past target)',
      metricId: M.resolutionSla,
    })
    expect(D.anonymity.text).toContain('at least 5 cases')
  })

  it('shows edited wording on the tile and in the figure definitions', () => {
    const edited = metricsWithEdits([
      { metricId: M.resolutionSla, field: 'definition', value: 'Our own resolution wording.' },
      { metricId: M.opened, field: 'formula', value: 'every case we logged' },
    ])
    const m = compute(sampleContext({}, edited))
    expect(kpi(m, 'resolution-sla').definition).toBe('Our own resolution wording.')
    const D = servicesDefinitions(edited, m.settings)
    expect(D.resolutionSla.text).toBe('Our own resolution wording. Target 90%.')
    expect(D.opened.formula).toBe('every case we logged')
  })
})

describe('changing a setting changes the numbers it governs', () => {
  it('judges payroll cases against an edited resolution target, keeping a case its own target', () => {
    const m = withSettings({ [M.resolutionSla]: { payroll: 96 } })
    const before = category(base, 'Payroll')?.slaRate as number
    const after = category(m, 'Payroll')?.slaRate as number
    expect(after).toBeGreaterThan(before)
    expect(kpi(m, 'resolution-sla').value as number).toBeGreaterThan(
      kpi(base, 'resolution-sla').value as number,
    )
    expect(category(m, 'Benefits')?.slaRate).toBe(category(base, 'Benefits')?.slaRate)
    expect(m.cases.filter((f) => f.category === 'Payroll').every((f) => f.resolutionTarget === 96)).toBe(true)
    expect(m.resolve.find((r) => r.category === 'Payroll')?.targetDays).toBe(4)

    // Exactly: ten payroll cases resolved in 60 hours miss a 48-hour target and meet a 96-hour one.
    const cases = Array.from({ length: 10 }, (_, i) =>
      kase({ requesterId: `R${i}`, openedAt: '2026-09-01T09:00', resolvedAt: '2026-09-03T21:00' }),
    )
    // A case whose file gives it a target of its own (not the payroll standard) keeps it.
    const own = kase({
      requesterId: 'R0',
      resolutionTargetHours: 10,
      openedAt: '2026-09-02T09:00',
      resolvedAt: '2026-09-02T12:00',
    })
    const tight = compute(fixtureContext({ cases: [...cases, own] }))
    const loose = compute(
      fixtureContext(
        { cases: [...cases, own] },
        '2026-09-30',
        metricsWith({ [M.resolutionSla]: { payroll: 96 } }),
      ),
    )
    expect(kpi(tight, 'resolution-sla').value).toBe(1 / 11)
    expect(kpi(loose, 'resolution-sla').value).toBe(11 / 11)
    expect(loose.cases.find((f) => f.caseId === own.caseId)?.resolutionTarget).toBe(10)
  })

  it('judges first replies against an edited response target', () => {
    const m = withSettings({ [M.responseSla]: { payroll: 1 } })
    expect(category(m, 'Payroll')?.responseRate as number).toBeLessThan(
      category(base, 'Payroll')?.responseRate as number,
    )
    expect(category(m, 'Benefits')?.responseRate).toBe(category(base, 'Benefits')?.responseRate)
  })

  it('lists aging cases past an edited age limit', () => {
    const m = withSettings({ [M.aged]: { days: 30 } })
    expect(m.aged.length).toBe(base.aged.filter((r) => r.ageDays > 30).length)
    expect(m.aged.length).toBeLessThan(base.aged.length)
    expect(m.aged.every((r) => r.ageDays > 30)).toBe(true)
    expect(kpi(m, 'open-backlog').note).toMatch(/older than 30 d$/)
  })

  it('writes an edited SLA target into the tile, the readout and the definitions', () => {
    const m = withTarget(M.resolutionSla, 0.95)
    // The tile judges its value against the target in force (KpiStrip shows it).
    const tile = kpi(m, 'resolution-sla')
    expect(tile.metricId).toBe(M.resolutionSla)
    expect(kpiTarget(targetOf(M.resolutionSla, 0.95), tile.metricId, tile.value, tile.format)).toEqual({
      target: { value: 0.95, comparator: '>=' },
      status: (tile.value as number) >= 0.95 ? 'met' : 'missed',
    })
    expect(tile.note).toMatch(/^[\d,]+ cases$/)
    expect(tile.value).toBe(kpi(base, 'resolution-sla').value)
    const good = m.findings.find((f) => f.severity === 'good')
    expect(good?.detail).toContain('above the 95% target')
    const sla = m.findings.find((f) => f.id === 'services-sla-leave-accommodation')
    expect(sla?.title).toMatch(/against the 95% target\.$/)
    expect(servicesDefinitions(defaultMetrics(), m.settings).resolutionSla.text).toMatch(/Target 95%\.$/)
  })

  it('raises fewer findings when a readout threshold is tightened', () => {
    const ids = (m: ServicesModel) => m.findings.map((f) => f.id)
    expect(ids(base)).toEqual(
      expect.arrayContaining([
        'services-spike-payroll',
        'services-sla-leave-accommodation',
        'services-csat-email',
        'services-reopen-hr-data-records',
        'services-final-pay-in',
      ]),
    )
    expect(ids(withSettings({ [M.spike]: { factor: 3 } }))).not.toContain('services-spike-payroll')
    expect(ids(withSettings({ [M.slow]: { floor: 0.6 } }))).not.toContain('services-sla-leave-accommodation')
    expect(ids(withSettings({ [M.csatGap]: { gap: 2 } }))).not.toContain('services-csat-email')
    expect(ids(withSettings({ [M.reopenHotspot]: { multiple: 10 } }))).not.toContain(
      'services-reopen-hr-data-records',
    )
    const pay = withSettings({ [M.finalPayLate]: { floor: 0.5 } })
    expect(ids(pay).some((id) => id.startsWith('services-final-pay'))).toBe(false)
  })

  it('scores a service level against an edited target', () => {
    const before = level(base, 'of05-final-pay')
    expect(before?.status).toBe('Missed')
    const m = withTarget(levelMetric('of05-final-pay'), 0.5)
    const after = level(m, 'of05-final-pay')
    expect(after?.actual).toBe(before?.actual)
    expect(after?.status).toBe('Met')
    expect(after?.target).toBe('≥ 50%')
    expect(after?.gap).toBeCloseTo((before?.actual as number) - 0.5)
    // The readout quotes the same target.
    expect(m.findings.find((f) => f.id === 'services-final-pay-in')?.title).toMatch(/against a 50% target\.$/)
  })

  it('applies edited at-risk bands to the status', () => {
    const d = SERVICE_LEVELS.find((x) => x.id === 'ds07-verification-2bd')!
    expect(levelStatus(d, 0.8)).toBe('Missed')
    expect(levelStatus(d, 0.8, { ...defaultSettings().atRisk, pts: 0.2 })).toBe('At risk')
    // On the sample, three 100% measures sit 5 to 10 pts short: Missed by default, at risk at 10 pts.
    const status = (m: ServicesModel) => Object.fromEntries(m.levels.map((r) => [r.id, r.status]))
    const wide = status(withSettings({ [M.levelStatus]: { atRiskPts: 0.1 } }))
    for (const id of ['on03-hire-day-minus-3', 'mv04-location-cutoff', 'mv05-job-change-cutoff']) {
      expect(status(base)[id], id).toBe('Missed')
      expect(wide[id], id).toBe('At risk')
    }
    expect(wide['of05-final-pay']).toBe('Missed')
    expect(wide['lv01-leave-designation-5bd']).toBe('Missed')
  })

  it('hides more when the anonymity minimum is raised, and refuses to lower it', () => {
    const cases = Array.from({ length: 7 }, (_, i) => kase({ requesterId: `R${i}` }))
    const at5 = compute(fixtureContext({ cases }))
    const raised = metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 10 } })
    const at10 = compute(fixtureContext({ cases }, '2026-09-30', raised))
    expect(kpi(at5, 'resolution-sla').value).toBe(1)
    expect(at5.small).toBe(false)
    expect(kpi(at10, 'resolution-sla').value).toBeNull()
    expect(at10.small).toBe(true)
    expect(at10.settings.minGroup).toBe(10)
    expect(canDrill(at10.scope, at10.cases)).toBe(false)
    expect(at10.categories.every((r) => r.slaRate == null)).toBe(true)
    expect(servicesDefinitions(raised, at10.settings).anonymity.text).toContain('at least 10 cases')
    expect(() => metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 3 } })).toThrow()
  })

  it('counts only cases past an edited aged-backlog limit', () => {
    const before = base.findings.find((f) => f.id === 'services-aged-immigration-mobility')
    expect(before?.title).toMatch(/^15 Immigration & mobility cases have been open for more than 30 days/)
    // 12 of the 15 open immigration cases are older than 60 days (63 to 131 d).
    const m = withSettings({ [M.agedBacklog]: { days: 60 } })
    const after = m.findings.find((f) => f.id === 'services-aged-immigration-mobility')
    expect(after?.title).toBe(
      '12 Immigration & mobility cases have been open for more than 60 days, the oldest for 131 d.',
    )
  })

  it('judges the on-time tile against an edited target', () => {
    const m = withTarget(M.onTime, 0.9)
    expect(m.settings.onTimeTarget).toBe(0.9)
    const tile = kpi(m, 'tx-on-time')
    expect(tile.metricId).toBe(M.onTime)
    expect(kpiTarget(targetOf(M.onTime, 0.9), tile.metricId, tile.value, tile.format)?.target.value).toBe(0.9)
    expect(tile.value).toBe(kpi(base, 'tx-on-time').value)
  })
})

describe('the dictionary as the engine sees it', () => {
  it('builds settings from any dictionary with the typed getters only', () => {
    const reads: string[] = []
    const api: Pick<MetricsApi, 'num' | 'target'> = {
      num: (id, key) => {
        reads.push(`${id}#${key}`)
        return defaultMetrics().num(id, key)
      },
      target: (id) => defaultMetrics().target(id),
    }
    servicesSettings(api)
    expect(new Set(reads).size).toBe(reads.length)
  })
})
