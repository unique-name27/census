import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { buildSampleState } from '@/data/quality/seed'
import type { Limiting } from '@/data/quality/types'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { DASH } from '@/lib/format'
import { SAMPLE_AGENTS } from '@/views/ai/catalog/sample'
import type { Agent } from '@/views/ai/catalog/types'
import { VIEWS } from '@/views/registry'
import { folderHeadlines, gateHeadline } from './headlineGate'

/** Just enough of a quality index: every number gets this tier. */
const fixed = (tier: Limiting['tier'], dataset: DatasetKey = 'requisitions') => ({
  limitingOf: (): Limiting => ({ tier, dataset, ref: null }),
  explainOf: () => `${tier}: test`,
})

describe('gateHeadline', () => {
  const h = { value: '114', label: 'open reqs', spark: [1, 2, 3] }

  it('passes a headline that meets the standard through', () => {
    const out = gateHeadline(h, fixed('gold'), 'gold', ['requisitions'])
    expect(out).toMatchObject({ value: '114', label: 'open reqs', spark: [1, 2, 3], hidden: null })
  })

  it('hides a headline below the standard: a dash, no spark, and why', () => {
    const out = gateHeadline(h, fixed('silver'), 'gold', ['requisitions'])
    expect(out.value).toBe(DASH)
    expect(out.spark).toBeUndefined()
    expect(out.label).toBe('open reqs')
    expect(out.hidden).toBe('Not yet confirmed for production')
    expect(gateHeadline(h, fixed('silver'), 'silver', ['requisitions']).hidden).toBeNull()
  })

  it('never shows a headline with no data behind it', () => {
    const out = gateHeadline(h, fixed('none'), 'bronze', ['requisitions'])
    expect(out.value).toBe(DASH)
    expect(out.hidden).toBe('No data: Requisitions is missing')
  })
})

describe('folder-tab headlines on the messy sample', () => {
  let ctx: (standard: 'gold' | 'silver' | 'bronze') => AnalyticsContext

  beforeAll(() => {
    const base = generateSample()
    const state = buildSampleState(base, starterSample(base).seed, SAMPLE_AS_OF)
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: state.data[k].length }]),
    ) as Record<DatasetKey, SourceMeta>
    ctx = (standard) =>
      buildContext({
        data: state.data,
        sources,
        filters: DEFAULT_FILTERS,
        asOfOverride: null,
        showPay: false,
        versions: state.versions,
        standard,
      })
  })

  const shown = (c: AnalyticsContext) =>
    Object.fromEntries(
      VIEWS.map((v) => [
        v.key,
        gateHeadline(v.headline(c), c.quality, c.standard, v.datasets).hidden == null,
      ]),
    )

  it('every headline over people data declares the fields it is computed from', () => {
    // A view that reads no datasets (AI in HR counts its agent catalog) has no fields to declare.
    for (const v of VIEWS.filter((x) => x.datasets.length > 0))
      expect(v.headline(ctx('bronze')).uses?.length, v.key).toBeGreaterThan(0)
  })

  it('never gates a headline that reads no people data', () => {
    const noData = VIEWS.filter((v) => v.datasets.length === 0)
    expect(noData.map((v) => v.key)).toEqual(['ai'])
    for (const standard of ['gold', 'silver', 'bronze'] as const)
      for (const v of noData) expect(shown(ctx(standard))[v.key], `${v.key} ${standard}`).toBe(true)
  })

  it('counts the AI agent catalog it is given, so the tab follows edits, removals and imports', () => {
    const c = ctx('bronze')
    const ai = (agents: readonly Agent[]) =>
      folderHeadlines(VIEWS, c, agents).find((_, i) => VIEWS[i].key === 'ai')
    expect(ai(SAMPLE_AGENTS)).toMatchObject({ value: '20', label: 'sample agents', hidden: null })
    expect(ai(SAMPLE_AGENTS.slice(1))).toMatchObject({ value: '19', label: 'sample agents' })
    expect(ai([{ ...SAMPLE_AGENTS[0], status: 'Pilot' }, ...SAMPLE_AGENTS.slice(1)])?.label).toBe('agents')
    // The other tabs are the views' own headlines.
    const other = folderHeadlines(VIEWS, c, [])
    for (const [i, v] of VIEWS.entries())
      if (v.key !== 'ai')
        expect(other[i].value, v.key).toBe(
          gateHeadline(v.headline(c), c.quality, c.standard, v.datasets).value,
        )
  })

  it('under Production shows only the gold headlines, as the tiles on each page do', () => {
    expect(shown(ctx('gold'))).toEqual({
      home: true, // HR's context: People stats' headline, Employees is gold
      team: true, // People stats' headline: Employees is gold
      scorecard: true, // Employees is gold
      recruiting: false, // Requisitions is silver
      onboarding: false, // Upcoming starts read accepted offers; Candidates is bronze
      hrbp: true,
      org: true,
      services: false, // HR cases is bronze
      talent: false, // Succession is bronze
      comp: true,
      compliance: false, // Right to work is silver
      listening: false, // Survey responses are silver
      ai: true, // The agent catalog reads no datasets
    })
  })

  it('under Validated hides only the bronze ones, and Everything shows them all', () => {
    expect(shown(ctx('silver'))).toMatchObject({ recruiting: true, services: false, talent: false })
    // The sample has rows in every dataset, so nothing reads No data under Everything.
    expect(Object.values(shown(ctx('bronze'))).every(Boolean)).toBe(true)
  })
})
