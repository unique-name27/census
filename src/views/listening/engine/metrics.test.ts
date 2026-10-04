/**
 * The Listening metric dictionary: every setting is read through the registry, editing one
 * changes the number it governs, and every figure, KPI and finding links to a registered metric.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultMetrics } from '@/metrics/api'
import { CATALOG, metricsOfView } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, metricsWithEdits, paramsOfView, recordParamReads } from '@/metrics/testing'
import { M, metrics } from '../metrics'
import { actionsOf } from './actions'
import { compute } from './index'
import { sampleContext } from './testkit'

describe('the Listening metrics', () => {
  it('pass the catalog checks and are all registered under Listening', () => {
    expect(validateCatalog(metrics)).toEqual([])
    const own = metricsOfView('listening').filter((d) => d.views[0] === 'listening')
    expect(own.map((d) => d.id)).toEqual(metrics.map((d) => d.id))
    for (const id of Object.values(M)) expect(CATALOG.byId.has(id), id).toBe(true)
  })

  it('register a target and a minimum for every survey program', () => {
    const scores = metrics.filter((d) => d.id.startsWith('listening.score.'))
    expect(scores).toHaveLength(11)
    for (const d of scores) {
      expect(d.target, d.id).toBeTruthy()
      expect(
        d.params.map((p) => p.key),
        d.id,
      ).toEqual(['minRespondents'])
      expect(d.params[0].locked, d.id).toBe('raiseOnly')
    }
  })

  it('reads every registered setting through the registry', () => {
    const { metrics: rec, reads } = recordParamReads(defaultMetrics())
    const ctx = sampleContext({ metrics: rec })
    actionsOf(ctx, compute(ctx))
    for (const ref of paramsOfView('listening')) expect(reads, ref).toContain(ref)
  })
})

describe('settings change the numbers', () => {
  it('a wider stage gap drops the onsite finding', () => {
    const ctx = sampleContext({ metrics: metricsWith({ [M.stageNps]: { gap: 60 } }) })
    expect(compute(ctx).findings.some((f) => f.id === 'listening-stage')).toBe(false)
  })

  it('a lower low score drops the manager finding and its action', () => {
    const ctx = sampleContext({ metrics: metricsWith({ [M.upward]: { lowScore: 2 } }) })
    const m = compute(ctx)
    expect(m.findings.some((f) => f.id === 'listening-manager-low')).toBe(false)
    expect(
      actionsOf(ctx, m).some((a) => a.ownerRole === 'hrbp' && a.id.startsWith('listening:manager')),
    ).toBe(false)
  })

  it('a higher dominant-reason share drops the stay risk finding', () => {
    const ctx = sampleContext({ metrics: metricsWith({ [M.topRisk]: { share: 0.75 } }) })
    expect(compute(ctx).findings.some((f) => f.id === 'listening-stay-risk')).toBe(false)
  })

  it('raising the anonymity minimum hides the 10-respondent manager cut', () => {
    const ctx = sampleContext({
      metrics: metricsWith({ 'privacy.surveyManagerCuts': { minRespondents: 11 } }),
    })
    const m = compute(ctx)
    expect(m.managers?.rows.some((r) => r.managerId === 'E10599')).toBe(false)
    expect(m.managers?.rows.every((r) => r.respondents >= 11)).toBe(true)
  })

  it('an edited response-rate target changes how many programs miss it', () => {
    const low = compute(sampleContext({ metrics: metricsWithTarget(M.responseRate, 0.2) }))
    expect(low.findings.some((f) => f.id === 'listening-response-rate')).toBe(false)
  })
})

function metricsWithTarget(id: string, value: number) {
  return metricsWithEdits([{ metricId: id, field: 'target', value: { value, comparator: '>=' } }])
}

describe('every figure and KPI in the UI links to a registered metric and declares its fields', () => {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'ui')
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))

  it('has UI files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const file of files) {
    it(file, () => {
      const src = readFileSync(join(dir, file), 'utf8')
      const figures = src.split('<Figure').slice(1)
      for (const fig of figures) {
        // The Figure's own props and children, up to its closing tag (children never take
        // metric or uses), so arrow functions in props can't cut the check short.
        const end = fig.indexOf('</Figure>')
        const own = end < 0 ? fig : fig.slice(0, end)
        expect(own, `${file}: a Figure without metric`).toMatch(/\bmetric=\{/)
        expect(own, `${file}: a Figure without uses`).toMatch(/\buses=\{/)
      }
    })
  }
})
