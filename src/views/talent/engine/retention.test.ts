import { describe, expect, it } from 'vitest'
import { reasonsFor } from './retention'
import type { FactorHit } from './risk'

describe('reasonsFor', () => {
  const tenure: FactorHit = { key: 'tenurePeak', points: 55, reason: '2.1 yrs at the company' }
  const drop: FactorHit = { key: 'ratingDrop', points: 15, reason: 'Rating fell from 5 to 4' }
  const dept: FactorHit = { key: 'deptAttrition', points: 10, reason: 'Voluntary attrition in Software' }
  const common = new Set(['tenurePeak'] as const)

  it('names the factor that sets the person apart first, and the shared one under Also', () => {
    expect(reasonsFor([tenure, drop, dept], common)).toEqual([drop, tenure])
  })
  it('falls back to the shared factor when it is the only one', () => {
    expect(reasonsFor([tenure], common)).toEqual([tenure, null])
  })
  it('keeps points order when no factor is shared by most of the band', () => {
    expect(reasonsFor([tenure, drop], new Set())).toEqual([tenure, drop])
    expect(reasonsFor([], common)).toEqual([null, null])
  })
})
