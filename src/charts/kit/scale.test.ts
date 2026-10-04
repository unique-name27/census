import { describe, expect, it } from 'vitest'
import { numericAxis } from './scale'

const unique = (xs: string[]) => new Set(xs).size === xs.length

describe('numericAxis count formats', () => {
  it('only ticks whole numbers for small counts', () => {
    const a = numericAxis(0, 3, 'int', 5)
    expect(a.ticks.every(Number.isInteger)).toBe(true)
    expect(a.ticks).toEqual([0, 1, 2, 3])
    expect(unique(a.ticks.map(a.format))).toBe(true)
  })

  it('widens a domain too narrow for two whole ticks to the integers around it', () => {
    const a = numericAxis(0, 0.4, 'int', 5)
    expect(a.domain).toEqual([0, 1])
    expect(a.ticks).toEqual([0, 1])
    const b = numericAxis(0.2, 0.7, 'compact', 4)
    expect(b.ticks.length).toBeGreaterThanOrEqual(2)
    expect(b.ticks.every(Number.isInteger)).toBe(true)
  })

  it('pads a flat count series to [max(0, n - 1), n + 1]', () => {
    expect(numericAxis(3, 3, 'int').domain).toEqual([2, 4])
    expect(numericAxis(3, 3, 'int').ticks).toEqual([2, 3, 4])
    expect(numericAxis(0, 0, 'int').domain).toEqual([0, 1])
    expect(numericAxis(0, 0, 'int').ticks).toEqual([0, 1])
    expect(numericAxis(0.5, 0.5, 'compact').domain[0]).toBe(0)
    // Negative flat values stay below zero.
    expect(numericAxis(-2, -2, 'int').domain).toEqual([-3, -1])
  })

  it('leaves large counts on their usual nice ticks', () => {
    const a = numericAxis(0, 4800, 'int', 5)
    expect(a.ticks).toEqual([0, 1000, 2000, 3000, 4000, 5000])
    expect(unique(a.ticks.map(a.format))).toBe(true)
  })

  it('keeps a fixed domain as given', () => {
    const a = numericAxis(0, 1, 'int', 5, [0, 10])
    expect(a.domain).toEqual([0, 10])
    expect(a.ticks.every(Number.isInteger)).toBe(true)
  })
})

describe('numericAxis tick labels', () => {
  it('never repeats a label when the format rounds neighbors together', () => {
    // pct0 prints 0.002 and 0.004 both as "0%": the axis must coarsen instead.
    const a = numericAxis(0, 0.012, 'pct0', 6)
    expect(unique(a.ticks.map(a.format))).toBe(true)
    const b = numericAxis(0, 4, 'days', 8)
    expect(unique(b.ticks.map(b.format))).toBe(true)
  })

  it('keeps fractional ticks for non-count formats', () => {
    const a = numericAxis(0, 1.5, 'num1', 5)
    expect(a.ticks.some((v) => !Number.isInteger(v))).toBe(true)
    // A flat rate keeps the proportional pad.
    const flat = numericAxis(0.2, 0.2, 'pct')
    expect(flat.domain[0]).toBeLessThan(0.2)
    expect(flat.domain[1]).toBeGreaterThan(0.2)
  })
})
