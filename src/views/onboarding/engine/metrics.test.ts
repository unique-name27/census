/**
 * The onboarding metric dictionary (docs/METRICS.md): every entry passes the catalog checks,
 * every KPI, figure and finding links to a registered metric and declares the fields it reads,
 * every registered setting is read through the registry, changing a setting or target changes the
 * numbers it governs, and the wording follows the copy rules.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality/fieldRef'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG, METRICS } from '@/metrics/catalog'
import { formatParamNumber } from '@/metrics/params'
import { ANONYMITY } from '@/metrics/privacy'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramRef, paramsOfView, recordParamReads } from '@/metrics/testing'
import { M, metrics } from '../metrics'
import { actions, computeOnboardingUncached, type OnboardingModel } from './index'
import { sampleContext } from './testkit'

const base = computeOnboardingUncached(sampleContext())
const withParams = (params: Parameters<typeof metricsWith>[0]): OnboardingModel =>
  computeOnboardingUncached(sampleContext({}, metricsWith(params)))
const withTarget = (metricId: string, value: number): OnboardingModel => {
  const comparator = CATALOG.byId.get(metricId)?.target?.comparator ?? '>='
  return computeOnboardingUncached(
    sampleContext({}, metricsWithEdits([{ metricId, field: 'target', value: { value, comparator } }])),
  )
}
const kpi = (m: OnboardingModel, id: string) =>
  [...m.kpis.upcoming, ...m.kpis.first90, ...m.kpis.plan].find((k) => k.id === id)!
const has = (m: OnboardingModel, id: string) => m.findings.some((f) => f.id === id)

const UI_DIR = new URL('../ui/', import.meta.url)
const uiSources = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, UI_DIR), 'utf8') }))

describe('the registry', () => {
  it('passes the catalog checks, every entry at home in Onboarding with valid lineage', () => {
    const own = new Set(metrics.map((d) => d.id))
    expect(validateCatalog(METRICS).filter((p) => [...own].some((id) => p.startsWith(id)))).toEqual([])
    expect(new Set(Object.values(M))).toEqual(own)
    for (const d of metrics) {
      expect(d.views[0], d.id).toBe('onboarding')
      expect(d.uses.length, d.id).toBeGreaterThan(0)
      expect(invalidRefs(d.uses), d.id).toEqual([])
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
    }
  })

  it('holds the Atlas and spec targets as the metrics own targets', () => {
    const api = defaultMetrics()
    expect(api.target(M.dayOne)).toEqual({ value: 0.95, comparator: '>=' })
    expect(api.target(M.i9)).toEqual({ value: 1, comparator: '>=' })
    expect(api.target(M.training)).toEqual({ value: 0.95, comparator: '>=' })
    expect(api.target(M.checkIns)).toEqual({ value: 0.9, comparator: '>=' })
    expect(api.target(M.attrition90)).toEqual({ value: 0.02, comparator: '<' })
    expect(api.target(M.renege)).toEqual({ value: 0.03, comparator: '<' })
    expect(api.num(M.i9, 'businessDays')).toBe(3)
    expect(api.num(M.training, 'days')).toBe(30)
    expect(api.num(M.probation, 'leadBusinessDays')).toBe(10)
    expect(api.num(M.vsPlan, 'onPlanBand')).toBe(0.1)
    for (const d of metrics)
      expect(
        d.params.some((p) => p.key === 'target'),
        d.id,
      ).toBe(false)
  })

  it('keeps the numbers its settings govern out of its wording', () => {
    for (const d of metrics) {
      const text = [d.name, d.definition, d.formula, d.population].join(' ')
      expect(text, d.id).not.toMatch(/—|!/)
      for (const p of d.params) {
        if (typeof p.default !== 'number' || p.type === 'months') continue
        expect(text, `${d.id} ${p.key}`).not.toContain(formatParamNumber(p.default, p))
      }
    }
  })
})

describe('every number names its metric and fields', () => {
  it('links every KPI and finding to a registered metric with valid fields', () => {
    for (const k of [...base.kpis.upcoming, ...base.kpis.first90, ...base.kpis.plan]) {
      expect(CATALOG.byId.has(k.metricId ?? ''), k.id).toBe(true)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
    }
    for (const f of base.findings) {
      expect(CATALOG.byId.has(f.metricId ?? ''), f.id).toBe(true)
      expect(invalidRefs(f.uses ?? []), f.id).toEqual([])
    }
  })

  it('wraps every chart in a Figure that names its metric and its fields', () => {
    let figures = 0
    for (const { file, text } of uiSources) {
      const blocks = text.split('<Figure').slice(1)
      figures += blocks.length
      for (const block of blocks) {
        const head = block.slice(0, block.indexOf('>\n') > 0 ? block.indexOf('>\n') + 1 : 400)
        const id = /id="([^"]+)"/.exec(head)?.[1]
        expect(id, file).toMatch(/^onboarding-/)
        expect(head, `${file} ${id}`).toMatch(/\bmetric=\{M\./)
        expect(head, `${file} ${id}`).toMatch(/\buses=\{/)
      }
      for (const chart of ['<BarList', '<Columns', '<Lines', '<HBars'])
        expect(text.split(chart).length - 1, `${file} ${chart}`).toBeLessThanOrEqual(blocks.length)
    }
    expect(figures).toBeGreaterThanOrEqual(18)
  })
})

describe('every setting is read through the registry', () => {
  it('reads each registered setting, and the anonymity minimum, on the sample', () => {
    const { metrics: api, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleContext({}, api)
    computeOnboardingUncached(ctx)
    actions(ctx)
    for (const ref of paramsOfView('onboarding')) expect(reads.has(ref), ref).toBe(true)
    expect(reads.has(paramRef(ANONYMITY.metricId, ANONYMITY.key))).toBe(true)
  })
})

describe('changing a setting changes the number it governs', () => {
  it('the contingency look-ahead', () => {
    expect(kpi(withParams({ [M.contingencies]: { businessDays: 3 } }), 'contingencies').value).toBe(3)
  })

  it('the I-9 allowed business days', () => {
    expect(kpi(withParams({ [M.i9]: { businessDays: 10 } }), 'i9').value).toBeGreaterThan(
      kpi(base, 'i9').value!,
    )
  })

  it('the Day -3 look-ahead', () => {
    expect(kpi(withParams({ [M.dayMinus3]: { days: 6 } }), 'day-minus-3').value).toBeLessThan(
      kpi(base, 'day-minus-3').value!,
    )
  })

  it('the tracked renege country', () => {
    const m = withParams({ [M.renege]: { trackedCountry: 'United States' } })
    expect(kpi(m, 'renege').note).toMatch(/^United States: 0\.0%/)
  })

  it('the on-plan band and the readout minimum for the quarter', () => {
    const wide = withParams({ [M.vsPlan]: { onPlanBand: 0.2 } })
    expect(wide.plan?.byUnit.find((r) => r.businessUnit === 'Silicon Engineering')?.status).toBe('On plan')
    expect(
      has(withParams({ [M.quarter]: { minBehind: 20 } }), 'onboarding-plan-behind-silicon-engineering'),
    ).toBe(false)
  })

  it('the probation due-soon window', () => {
    const soon = (m: OnboardingModel) => m.first90.probation.filter((x) => x.state === 'Due soon').length
    expect(soon(withParams({ [M.probation]: { dueSoonDays: 7 } }))).toBeLessThan(soon(base))
  })

  it('the late-task rule and the concentration rule', () => {
    expect(has(withParams({ [M.lateTask]: { minGap: 0.5 } }), 'onboarding-late-laptop-shipped')).toBe(false)
    // Without a department far enough behind, the check-in finding falls back to the target.
    const flat = withParams({ [M.concentration]: { minGap: 0.5 } }).findings.find(
      (f) => f.id === 'onboarding-check-ins',
    )
    expect(flat?.metricId).toBe(M.checkIns)
    expect(flat?.title).toBe('Check-ins were on time for 84%, against a 90% target.')
  })

  it('a target', () => {
    expect(has(withTarget(M.dayOne, 0.8), 'onboarding-day-one')).toBe(false)
    expect(has(withTarget(M.i9, 0.9), 'onboarding-i9')).toBe(false)
  })
})

describe('copy', () => {
  it('writes findings in sentence case with numbers, no em dashes or nagging verbs', () => {
    for (const f of base.findings) {
      const text = [f.title, f.detail, f.action].filter(Boolean).join(' ')
      expect(text, f.id).not.toMatch(/—|!/)
      expect(text, f.id).not.toMatch(/\b(chase|push|nag|ping|hound|unblock)\b/i)
      expect(f.title, f.id).toMatch(/\d/)
      expect(f.title[0], f.id).toBe(f.title[0].toUpperCase())
    }
  })

  it('writes no em dashes in the view text', () => {
    for (const { file, text } of uiSources) {
      const strings = text.match(/(['`"])(?:(?!\1).)*\1/g) ?? []
      for (const s of strings) expect(s, file).not.toMatch(/\w\s?—\s?\w/)
    }
  })
})
