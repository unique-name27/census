/**
 * Where a finding's hires work (docs/ANALYSES.md, 2.7 rule 3): "Most work in" only when it is
 * true, and never one of several tied job functions.
 */
import { describe, expect, it } from 'vitest'
import type { Hire } from './cohort'
import { functionMix } from './findings'

const hires = (counts: Record<string, number>): Hire[] =>
  Object.entries(counts).flatMap(([fn, k]) =>
    Array.from({ length: k }, () => ({ e: { jobFunction: fn, department: 'Dept' } }) as unknown as Hire),
  )

describe('functionMix', () => {
  it('names two functions when they hold more than half and the second is not tied', () => {
    expect(functionMix(hires({ 'Design RTL': 9, 'Design Verification': 6, Firmware: 2 }))).toEqual({
      sentence: 'Most work in Design RTL and Design Verification.',
      most: ['Design RTL', 'Design Verification'],
    })
  })

  it('names one function when it alone holds more than half', () => {
    expect(functionMix(hires({ 'Design RTL': 8, Firmware: 1, IT: 1 }))).toEqual({
      sentence: 'Most work in Design RTL.',
      most: ['Design RTL'],
    })
  })

  it('gives the largest with its count when no one or two hold most, and never a tied second', () => {
    // The sample's company-wide computer science bachelor's: 9, then three tied at 6.
    const mix = functionMix(
      hires({
        'Design RTL': 9,
        Software: 6,
        Firmware: 6,
        'Design Verification': 6,
        IT: 3,
        'Physical Design': 1,
        'Analog & Mixed-Signal': 1,
      }),
    )
    expect(mix).toEqual({ sentence: '9 of them work in Design RTL, more than anywhere else.', most: [] })
  })

  it('names two tied functions together when they hold most', () => {
    expect(functionMix(hires({ Software: 4, Firmware: 4, IT: 3 })).most).toEqual(['Firmware', 'Software'])
  })

  it('says nothing when the largest is tied', () => {
    expect(functionMix(hires({ Software: 3, Firmware: 3, IT: 3, HR: 2 }))).toEqual({
      sentence: null,
      most: [],
    })
    expect(functionMix([])).toEqual({ sentence: null, most: [] })
  })

  it('does not name a second function that is tied with the third', () => {
    // 10 + 5 of 20 is more than half, but Firmware ties Software at 5.
    const mix = functionMix(hires({ 'Design RTL': 10, Software: 5, Firmware: 5 }))
    expect(mix.most).toEqual([])
    expect(mix.sentence).toBe('10 of them work in Design RTL, more than anywhere else.')
  })
})
