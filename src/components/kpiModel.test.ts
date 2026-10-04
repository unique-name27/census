import { describe, expect, it } from 'vitest'
import { visibleColumns } from '@/lib/export/columns'
import type { Format } from '@/lib/format'
import {
  deltaDirection,
  deltaTone,
  kpiColumns,
  kpiDeltaText,
  kpiRows,
  kpiValueText,
  SUPPRESSED_NOTE,
  tileTarget,
  unitOf,
} from './kpiModel'
import type { TierGate } from './tier/tierModel'
import type { Kpi } from './types'

const kpi = (patch: Partial<Kpi>): Kpi => ({
  id: 'k',
  label: 'Time to fill',
  value: 42,
  format: 'days',
  ...patch,
})

describe('deltaTone', () => {
  it('colors a material change by whether its direction is good', () => {
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'down', deltaMaterial: true }))).toBe('bad')
    expect(deltaTone(kpi({ delta: -4, goodDirection: 'down', deltaMaterial: true }))).toBe('good')
    expect(deltaTone(kpi({ delta: 0.02, goodDirection: 'up' }))).toBe('good')
  })

  it('stays neutral without a direction, when immaterial, flat, missing or suppressed', () => {
    expect(deltaTone(kpi({ delta: 4 }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: null }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'up', deltaMaterial: false }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 0, goodDirection: 'up' }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: null, goodDirection: 'up' }))).toBe('neutral')
    expect(deltaTone(kpi({ delta: 4, goodDirection: 'up', suppressed: true }))).toBe('neutral')
  })

  it('reads the direction of a delta', () => {
    expect(deltaDirection(3)).toBe('up')
    expect(deltaDirection(-0.1)).toBe('down')
    expect(deltaDirection(0)).toBe('flat')
    expect(deltaDirection(undefined)).toBeNull()
    expect(deltaDirection(Number.NaN)).toBeNull()
  })
})

describe('tile text', () => {
  it('formats values and deltas in the KPI unit', () => {
    expect(kpiValueText(kpi({}))).toBe('42 d')
    expect(kpiDeltaText(kpi({ delta: 4 }))).toBe('+4 d')
    expect(kpiValueText(kpi({ value: 0.142, format: 'pct' }))).toBe('14.2%')
    expect(kpiDeltaText(kpi({ value: 0.142, format: 'pct', delta: -0.012 }))).toBe('−1.2 pts')
  })

  it('shows a dash for missing or suppressed values, never 0', () => {
    expect(kpiValueText(kpi({ value: null }))).toBe('—')
    expect(kpiValueText(kpi({ value: 3, suppressed: true }))).toBe('—')
    expect(kpiDeltaText(kpi({ delta: 2, suppressed: true }))).toBeNull()
    expect(kpiDeltaText(kpi({}))).toBeNull()
  })
})

describe('kpiRows', () => {
  it('exports numbers with their unit and the change in its unit', () => {
    const rows = kpiRows([
      kpi({ delta: 4, deltaLabel: 'vs prior 12 months', note: '62 reqs filled' }),
      kpi({ id: 'r', label: 'Regretted attrition', value: null, format: 'pct', suppressed: true }),
    ])
    expect(rows[0]).toMatchObject({
      measure: 'Time to fill',
      value: 42,
      valueText: '42 d',
      unit: 'd',
      change: 4,
      changeText: '+4 d',
      changeUnit: 'd',
      comparedWith: 'vs prior 12 months',
      note: '62 reqs filled',
    })
    expect(rows[1]).toMatchObject({
      measure: 'Regretted attrition',
      value: null,
      valueText: '—',
      unit: '%',
      change: null,
      changeText: '',
      changeUnit: '',
      comparedWith: '',
      note: SUPPRESSED_NOTE,
    })
    expect(SUPPRESSED_NOTE).toBe('Hidden to protect anonymity (n < 5)')
  })

  it('keeps rates as fractions with a percent format and states their change in points', () => {
    const [row] = kpiRows([kpi({ value: 0.142, format: 'pct', delta: -0.012, deltaLabel: 'vs prior' })])
    const cols = kpiColumns([kpi({ value: 0.142, format: 'pct' })])
    const fmtOf = (key: string) => cols.find((c) => c.key === key)?.format as (r: object) => Format
    expect(row).toMatchObject({ value: 0.142, unit: '%', changeUnit: 'pts', changeText: '−1.2 pts' })
    expect(row.change).toBeCloseTo(-1.2, 10)
    expect(fmtOf('value')(row)).toBe('pct')
    expect(fmtOf('change')(row)).toBe('num1')
    // Points as a value are stored as a number of points.
    const [gap] = kpiRows([kpi({ value: 0.021, format: 'pts' })])
    expect(gap.value).toBeCloseTo(2.1, 10)
    expect(gap.unit).toBe('pts')
  })

  it('writes the trend points as numbers, the latest lined up across tiles', () => {
    const kpis = [
      kpi({ spark: [40, 41, 42] }),
      kpi({ id: 'b', label: 'Open reqs', format: 'int', value: 58, spark: [32, 58] }),
      kpi({ id: 'c', label: 'Hidden', spark: [1, 2, 3], suppressed: true }),
    ]
    const cols = kpiColumns(kpis)
    const trend = cols.filter((c) => c.key.startsWith('trend'))
    expect(trend.map((c) => c.label)).toEqual([
      'Trend, 2 periods back',
      'Trend, 1 period back',
      'Trend, latest',
    ])
    expect(trend.every((c) => c.only === 'sheets')).toBe(true)
    const rows = kpiRows(kpis)
    expect(trend.map((c) => rows[0][c.key])).toEqual([40, 41, 42])
    expect(trend.map((c) => rows[1][c.key] ?? null)).toEqual([null, 32, 58])
    expect(trend.map((c) => rows[2][c.key] ?? null)).toEqual([null, null, null])
  })

  it('sends numbers and units to sheets and the tile text to slides', () => {
    const cols = kpiColumns([kpi({})], { tiered: true })
    expect(visibleColumns(cols, false, 'sheets').map((c) => c.key)).toEqual([
      'measure',
      'value',
      'unit',
      'tier',
      'change',
      'changeUnit',
      'comparedWith',
      'note',
    ])
    expect(visibleColumns(cols, false, 'slides').map((c) => c.key)).toEqual([
      'measure',
      'valueText',
      'tier',
      'changeText',
      'comparedWith',
      'note',
    ])
  })

  it('names the unit of every format', () => {
    expect(unitOf('pct')).toBe('%')
    expect(unitOf('pts2')).toBe('pts')
    expect(unitOf('days')).toBe('d')
    expect(unitOf('years')).toBe('yrs')
    expect(unitOf('int')).toBe('count')
    expect(unitOf('num1')).toBe('')
  })
})

describe('kpiRows with tiers', () => {
  const gate = (tier: TierGate['tier'], shown: boolean, reason: string | null = null): TierGate => ({
    tier,
    standard: 'gold',
    limiting: { tier, dataset: 'employees', ref: null },
    shown,
    explain: '',
    reason,
  })

  it('adds each tier and exports a hidden number blank with its reason', () => {
    const rows = kpiRows(
      [
        kpi({ delta: 4, deltaLabel: 'vs prior 12 months', note: '62 reqs filled', spark: [40, 42] }),
        kpi({ id: 'b', label: 'Offer acceptance', delta: 0.1, spark: [40, 42] }),
        kpi({ id: 'c', label: 'Open reqs' }),
        kpi({ id: 'd', label: 'Exit reasons' }),
      ],
      [
        gate('gold', true),
        gate('silver', false, 'Not yet confirmed for production'),
        null,
        gate('none', false, 'No data: Employees termination reason is missing'),
      ],
    )
    expect(rows[0]).toMatchObject({ value: 42, change: 4, tier: 'Gold', note: '62 reqs filled', trend0: 42 })
    expect(rows[1]).toMatchObject({
      measure: 'Offer acceptance',
      value: null,
      valueText: '—',
      change: null,
      changeText: '',
      comparedWith: '',
      note: 'Not yet confirmed for production',
      tier: 'Silver',
    })
    expect(rows[1].trend0).toBeUndefined()
    expect(rows[2]).toMatchObject({ value: 42, valueText: '42 d', tier: '' })
    expect(rows[3]).toMatchObject({
      value: null,
      tier: 'No data',
      note: 'No data: Employees termination reason is missing',
    })
  })
})

describe('tileTarget', () => {
  const view = {
    key: 'recruiting' as const,
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'pipeline', label: 'Pipeline' },
    ],
  }

  it('opens a tab of the view showing the tile, named by its label', () => {
    expect(tileTarget(kpi({ tab: 'pipeline' }), view)).toEqual({
      view: 'recruiting',
      tab: 'pipeline',
      label: 'Pipeline',
    })
    expect(tileTarget(kpi({ tab: 'pipeline' }), null)).toBeNull()
    expect(tileTarget(kpi({}), view)).toBeNull()
  })

  it('opens nothing when the tile sits on the tab it would open', () => {
    expect(tileTarget(kpi({ tab: 'pipeline' }), { ...view, tab: 'pipeline' })).toBeNull()
    expect(tileTarget(kpi({ tab: 'pipeline' }), { ...view, tab: 'overview' })?.tab).toBe('pipeline')
    const link = { view: 'recruiting' as const, tab: 'pipeline', label: 'Recruiting, Pipeline' }
    expect(tileTarget(kpi({ link }), { ...view, tab: 'pipeline' })).toBeNull()
  })

  it('opens a tab of another view when the tile carries a link, outside a view too', () => {
    const link = { view: 'onboarding' as const, tab: 'plan', label: 'Onboarding, Hiring plan' }
    expect(tileTarget(kpi({ tab: 'pipeline', link }), view)).toEqual(link)
    expect(tileTarget(kpi({ link: { view: 'listening', label: 'Listening' } }), null)).toEqual({
      view: 'listening',
      tab: '',
      label: 'Listening',
    })
  })
})
