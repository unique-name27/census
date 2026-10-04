/**
 * Under the data standard, the 9-box keeps its rating and potential grid and drops the flight-risk
 * overlay when the risk fields are below the standard (docs/DATA-TIERS.md).
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
import { nineBoxColumns, nineBoxDetailColumns } from '../ui/columns'
import { computeTalent } from '.'

const VIEW_DATASETS: readonly DatasetKey[] = [
  'reviews',
  'succession',
  'learning',
  'employees',
  'jobChanges',
  'comp',
]

let ctxOf: (standard: DataStandard) => AnalyticsContext

beforeAll(() => {
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

describe('9-box under the data standard', () => {
  it('under Production keeps the grid and leaves out the flight-risk overlay', () => {
    const ctx = ctxOf('gold')
    const m = computeTalent(ctx)
    expect(m.riskOverlay).toBe(false)
    const uses = m.uses['talent-nine-box']
    expect(uses).toContain('reviews.potential')
    expect(uses).not.toContain('employees.terminationType')
    expect(gateFor(ctx.quality, ctx.standard, uses, VIEW_DATASETS)?.shown).toBe(true)
    // The risk columns leave the table and the detail export with the overlay.
    expect(nineBoxColumns(m.drill, m.riskOverlay).map((c) => c.key)).not.toContain('highRisk')
    const detail = nineBoxDetailColumns('2025 Annual', m.riskOverlay).map((c) => c.key)
    expect(detail).not.toContain('riskBand')
    expect(detail).not.toContain('riskScore')
  })

  it('under Everything draws the overlay and declares its fields', () => {
    const m = computeTalent(ctxOf('bronze'))
    expect(m.riskOverlay).toBe(true)
    expect(m.uses['talent-nine-box']).toEqual(expect.arrayContaining([...m.uses['talent-risk-bands']]))
    expect(nineBoxColumns(m.drill, m.riskOverlay).map((c) => c.key)).toContain('highRisk')
  })
})
