import { describe, expect, it } from 'vitest'
import { deltaDirection, deltaTone, kpiDeltaText, kpiRows, kpiValueText, SUPPRESSED_NOTE } from './kpiModel'
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
  it('exports formatted values with the comparison and notes', () => {
    const rows = kpiRows([
      kpi({ delta: 4, deltaLabel: 'vs prior 12 months', note: '62 reqs filled' }),
      kpi({ id: 'r', label: 'Regretted attrition', value: null, format: 'pct', suppressed: true }),
    ])
    expect(rows).toEqual([
      {
        measure: 'Time to fill',
        value: '42 d',
        change: '+4 d',
        comparedWith: 'vs prior 12 months',
        note: '62 reqs filled',
      },
      { measure: 'Regretted attrition', value: '—', change: '', comparedWith: '', note: SUPPRESSED_NOTE },
    ])
    expect(SUPPRESSED_NOTE).toBe('Hidden to protect anonymity (n < 5)')
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

  it('adds each tier and exports a hidden number as a dash with its reason', () => {
    const rows = kpiRows(
      [
        kpi({ delta: 4, deltaLabel: 'vs prior 12 months', note: '62 reqs filled' }),
        kpi({ id: 'b', label: 'Offer acceptance', delta: 0.1 }),
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
    expect(rows[0]).toMatchObject({ value: '42 d', change: '+4 d', tier: 'Gold', note: '62 reqs filled' })
    expect(rows[1]).toEqual({
      measure: 'Offer acceptance',
      value: '—',
      change: '',
      comparedWith: '',
      note: 'Not yet confirmed for production',
      tier: 'Silver',
    })
    expect(rows[2]).toMatchObject({ value: '42 d', tier: '' })
    expect(rows[3]).toMatchObject({
      value: '—',
      tier: 'No data',
      note: 'No data: Employees termination reason is missing',
    })
  })
})
