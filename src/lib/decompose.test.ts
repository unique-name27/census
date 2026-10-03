import { describe, expect, it } from 'vitest'
import { decomposeMedian, decomposeRate } from './decompose'

interface Row {
  site: string
  dept: string
  left: boolean
  days: number
}

const rows: Row[] = [
  // Bengaluru: 6 of 20 left; everyone else: 4 of 80.
  ...Array.from({ length: 20 }, (_, i) => ({
    site: 'Bengaluru',
    dept: i % 2 ? 'A' : 'B',
    left: i < 6,
    days: 40,
  })),
  ...Array.from({ length: 80 }, (_, i) => ({
    site: i % 2 ? 'San Jose' : 'Austin',
    dept: i % 2 ? 'A' : 'B',
    left: i < 4,
    days: 20,
  })),
]
const dims = [
  { key: 'site', label: 'Location', get: (r: Row) => r.site },
  { key: 'dept', label: 'Department', get: (r: Row) => r.dept },
]

describe('decomposeRate', () => {
  it('finds the segment where the problem concentrates', () => {
    const top = decomposeRate(rows, dims, (r) => r.left)[0]
    expect(top).toMatchObject({ dim: 'site', value: 'Bengaluru', affected: 6, population: 20 })
    expect(top.segValue).toBeCloseTo(0.3)
    expect(top.compValue).toBeCloseTo(4 / 80)
    expect(top.share).toBeCloseTo(0.6)
  })
  it('ignores dimensions with one value and tiny segments', () => {
    const one = rows.map((r) => ({ ...r, dept: 'Only' }))
    expect(decomposeRate(one, dims, (r) => r.left).every((s) => s.dim !== 'dept')).toBe(true)
  })
  it('returns nothing when nobody is affected', () => {
    expect(decomposeRate(rows, dims, () => false)).toEqual([])
  })
})

describe('decomposeMedian', () => {
  it('flags the slow segment', () => {
    const top = decomposeMedian(rows, dims, (r) => r.days)[0]
    expect(top).toMatchObject({ dim: 'site', value: 'Bengaluru' })
    expect(top.segValue).toBe(40)
    expect(top.compValue).toBe(20)
  })
})
