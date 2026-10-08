/**
 * The Special analyses shell (docs/ANALYSES.md, part 1 and 7.5): the four analyses in order with
 * figure ids unique across them, which the mode shows, which are ready on the sample and on
 * thinner data, the empty-state messages, the cached model, and Manager mode's addresses.
 */
import { describe, expect, it, vi } from 'vitest'
import { decide, routeDecision } from '@/access/policy'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx } from '@/ask/engine/testkit'
import { buildContext } from '@/data/context'
import { emp, emptyDatasets } from '@/data/quality/test-fixtures'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { ANALYSES, analysisModel, analysisSummary, isReady, openingAnalysis, shownAnalyses } from './registry'
import { ANALYSIS_KEYS, ANALYSIS_LABEL, analysisSurface } from './tab'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

const hr = sampleCtx()

function ownCtx(data: ReturnType<typeof emptyDatasets>) {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'upload', rowCount: data[k].length }]),
  ) as unknown as Record<DatasetKey, SourceMeta>
  return buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: '2026-09-30', showPay: false })
}

describe('the four analyses', () => {
  it('name themselves the same everywhere, and say which window their numbers cover', () => {
    for (const a of ANALYSES) expect(a.label, a.key).toBe(ANALYSIS_LABEL[a.key])
    expect(ANALYSES.map((a) => a.short)).toEqual(['Quality', 'Declines', 'Stages', 'Pyramid'])
    const w = Object.fromEntries(ANALYSES.map((a) => [a.key, a.window(hr)]))
    expect(w.quality).toEqual({
      start: '2023-10-01',
      end: '2025-09-30',
      label: 'Hires 1 Oct 2023 to 30 Sep 2025',
      ignoresPeriod: true,
    })
    expect(w.declines).toMatchObject({ start: hr.window.start, end: hr.window.end, ignoresPeriod: false })
    expect(w.stages).toEqual({
      start: null,
      end: '2026-09-30',
      label: 'People on 30 Sep 2026',
      ignoresPeriod: true,
    })
    expect(w.pyramid).toMatchObject({ end: '2026-09-30', ignoresPeriod: true })
  })

  it('are in picker order with a lead figure and figure ids unique across them', () => {
    expect(ANALYSES.map((a) => a.key)).toEqual([...ANALYSIS_KEYS])
    expect(ANALYSES.map((a) => a.label)).toEqual([
      'Quality of hire',
      'Offer declines',
      'Engineering by stage',
      'Level pyramid',
    ])
    const ids = ANALYSES.flatMap((a) => a.figures)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ANALYSES) {
      expect(a.figures[0], a.key).toBe(a.leadFigure)
      for (const id of a.figures) expect(id.startsWith('hrbp-'), id).toBe(true)
      expect(hr.metrics.def(a.leadMetric), a.key).toBeTruthy()
    }
  })

  it('are all ready on the sample, with nothing missing, and the bare address opens Quality of hire', () => {
    for (const k of ANALYSIS_KEYS) {
      expect(isReady(hr, k), k).toBe(true)
      const missing = ANALYSES.find((a) => a.key === k)?.missing(hr) ?? []
      expect(
        missing.map((m) => m.id),
        k,
      ).toEqual([])
    }
    expect(shownAnalyses(hr)).toEqual([...ANALYSIS_KEYS])
    expect(openingAnalysis(hr)).toBe('quality')
  })

  it('say what to add on a roster without the columns they need', () => {
    const d = emptyDatasets()
    d.employees = [emp(1, { level: null, jobFunction: null }), emp(2, { level: null, jobFunction: null })]
    const ctx = ownCtx(d)
    const reason = (k: (typeof ANALYSIS_KEYS)[number]) => {
      const r = ANALYSES.find((a) => a.key === k)!.ready(ctx)
      return r.ready ? null : r.message
    }
    expect(reason('quality')).toBe('Add leavers (Termination date) to Employees to see who stayed a year.')
    expect(reason('declines')).toBe('Upload Candidates and Requisitions to see why offers are declined.')
    expect(reason('stages')).toBe(
      'Add Job function to Employees, and give each job function a stage in Settings, Official lists, to see engineering by stage.',
    )
    expect(reason('pyramid')).toBe('Add Level to Employees to see the pyramid.')
    expect(openingAnalysis(ctx)).toBe('quality')
    const quality = ANALYSES[0].missing(ctx)
    expect(quality.map((m) => m.id)).toEqual(['reviews', 'education', 'candidates'])
    expect(quality[1].message).toBe(
      'Add University, Degree level or Field of study to Employees to compare by education.',
    )
  })

  it('names the one education field that is missing, and the offer fields declines need', () => {
    const d = emptyDatasets()
    d.employees = [emp(1, { university: 'Coyote Valley University', degreeLevel: "Bachelor's" })]
    const ctx = ownCtx(d)
    const quality = ANALYSES[0].missing(ctx)
    expect(quality.find((m) => m.id === 'fieldOfStudy')?.message).toBe(
      'Add Field of study to Employees to see this.',
    )
    expect(quality.some((m) => m.id === 'education')).toBe(false)
    const declines = ANALYSES[1].missing(hr)
    expect(declines).toEqual([])
  })

  it('computes a model once per context', () => {
    const a = analysisModel(hr, 'stages')
    expect(analysisModel(hr, 'stages')).toBe(a)
    expect(analysisSummary(hr, 'stages')).toEqual({ kpis: a.kpis, findings: a.findings, tables: a.tables })
  })
})

describe('Manager mode', () => {
  const leaders = leaderOptions(hr.org, hr.asOf, 3)
  const mid = leaders.find((l) => l.size >= 25 && l.size <= 90 && hr.org.byId.get(l.id)?.managerId)!
  const mgr = sampleCtx({ access: { mode: 'manager', managerId: mid.id } })

  it('shows Engineering by stage and the pyramid only, and opens Engineering by stage', () => {
    expect(shownAnalyses(mgr)).toEqual(['stages', 'pyramid'])
    expect(openingAnalysis(mgr)).toBe('stages')
    expect(decide('manager', 'tab:hrbp.analyses').access).toBe('limited')
    expect(decide('manager', analysisSurface('quality')).access).toBe('hidden')
    expect(decide('manager', analysisSurface('declines')).access).toBe('hidden')
    expect(decide('manager', analysisSurface('stages')).access).toBe('limited')
    expect(decide('hr', analysisSurface('quality')).access).toBe('shown')
    expect(decide('manager', 'metric:hrbp.quality.score').access).toBe('hidden')
    expect(decide('manager', 'metric:hrbp.declines.rate').access).toBe('hidden')
    expect(decide('manager', 'metric:hrbp.stages.planned').access).toBe('hidden')
    expect(decide('manager', 'metric:hrbp.stages.capacity').access).toBe('shown')
    expect(decide('manager', 'figure:hrbp-declines-candidate-survey').access).toBe('hidden')
    expect(
      decide('manager', 'figure:hrbp-quality-university', { view: 'hrbp', tab: 'analyses:quality' }).access,
    ).toBe('hidden')
  })

  it('sends Quality of hire and Offer declines to Engineering by stage, saying why', () => {
    for (const [k, label] of [
      ['quality', 'Quality of hire'],
      ['declines', 'Offer declines'],
    ] as const) {
      const d = routeDecision('manager', { view: 'hrbp', tab: `analyses:${k}` })
      expect(d.redirected, k).toBe(true)
      expect(d.route).toEqual({ view: 'hrbp', tab: 'analyses:stages' })
      expect(d.reason).toEqual({
        title: `People stats, ${label} is not shown in Manager mode`,
        description: 'Census opened Engineering by stage instead.',
      })
      expect(routeDecision('hr', { view: 'hrbp', tab: `analyses:${k}` }).redirected).toBe(false)
      expect(routeDecision('developer', { view: 'hrbp', tab: `analyses:${k}` }).redirected).toBe(false)
    }
    for (const tab of ['analyses', 'analyses:stages', 'analyses:pyramid'])
      expect(routeDecision('manager', { view: 'hrbp', tab }).redirected, tab).toBe(false)
  })
})
