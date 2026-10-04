/**
 * Under the data standard, a comp finding or figure whose own number meets it stays; a side clause
 * or column that reads a lower-tier field drops out and says so (docs/DATA-TIERS.md).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { gateFor } from '@/components/tier/tierModel'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { buildSampleState } from '@/data/quality/seed'
import type { DataStandard } from '@/data/quality/tier'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { starterSample } from '@/data/sample/raw'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { PAY_REASON, PROMOTED } from './lineage'
import { type CompModel, computeComp } from './model'
import { DEFAULT_SETTINGS } from './settings'

const VIEW_DATASETS: readonly DatasetKey[] = ['comp', 'employees', 'reviews', 'jobChanges']

let ctxOf: (standard: DataStandard) => AnalyticsContext

beforeAll(() => {
  // The messy sample: Employees and Compensation gold, termination reason bronze, Job changes silver.
  const base = generateSample()
  const state = buildSampleState(base, starterSample(base).seed, SAMPLE_AS_OF)
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: state.data[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  ctxOf = (standard) =>
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

const finding = (m: CompModel, id: string) => m.findings.find((f) => f.id === id)!

describe('comp under the Production standard', () => {
  let ctx: AnalyticsContext
  let m: CompModel
  beforeAll(() => {
    ctx = ctxOf('gold')
    m = computeComp(ctx, DEFAULT_SETTINGS)
  })
  const shown = (uses: CompModel['findings'][number]['uses']) =>
    gateFor(ctx.quality, ctx.standard, uses, VIEW_DATASETS)?.shown

  it('keeps the low compa-ratio finding and leaves out the exit-reason clause', () => {
    const f = finding(m, 'comp-low-compa-location-Bengaluru')
    expect(f.title).toMatch(/^Median compa-ratio in Bengaluru is 0\.88/)
    expect(f.uses).not.toContain(PAY_REASON)
    expect(f.detail).toContain('exit reasons not shown: not yet confirmed for production')
    expect(f.detail).not.toContain('named pay as the reason')
    expect(shown(f.uses)).toBe(true)
  })

  it('keeps the below-minimum finding without the Job changes segment, and says so', () => {
    const f = finding(m, 'comp-below-min')
    expect(f.title).toMatch(/paid below range minimum, 5\.4% of/)
    for (const r of PROMOTED) expect(f.uses).not.toContain(r)
    expect(f.detail).not.toContain('promoted in the last 12 months')
    expect(f.detail).toContain('Recent promotions not shown: not yet confirmed for production.')
    expect(shown(f.uses)).toBe(true)
  })

  it('drops the promoted column from the below-minimum figure instead of hiding it', () => {
    expect(m.promotionsShown).toBe(false)
    for (const r of PROMOTED) expect(m.uses['comp-below-minimum']).not.toContain(r)
    expect(shown(m.uses['comp-below-minimum'])).toBe(true)
  })

  it('hides only findings whose own number is below the standard', () => {
    const hidden = m.findings.filter((f) => !shown(f.uses)).map((f) => f.id)
    // Market medians are 60% filled, so the market findings are bronze on their own number.
    expect(hidden.length).toBeGreaterThan(0)
    for (const id of hidden) expect(id).toMatch(/^comp-below-market-/)
  })
})

describe('comp under Everything', () => {
  it('says every clause, with the fields it reads', () => {
    const m = computeComp(ctxOf('bronze'), DEFAULT_SETTINGS)
    expect(m.promotionsShown).toBe(true)
    const blr = finding(m, 'comp-low-compa-location-Bengaluru')
    expect(blr.uses).toContain(PAY_REASON)
    expect(blr.detail).toContain('named pay as the reason')
    const below = finding(m, 'comp-below-min')
    expect(below.detail).toContain('promoted in the last 12 months')
    expect(below.uses).toEqual(expect.arrayContaining([...PROMOTED]))
  })
})
