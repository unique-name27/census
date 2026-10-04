import { describe, expect, it } from 'vitest'
import { GRID_CLASS, type Span, spanClass } from './spans'

const SPANS: Span[] = [3, 4, 5, 6, 7, 8, 9, 12]

describe('spanClass', () => {
  it('is one full-width column on phones for every span (no implicit tracks)', () => {
    for (const s of SPANS) {
      const c = spanClass(s).split(' ')
      expect(c).toContain('col-span-full')
      expect(c.filter((x) => /^col-span-/.test(x))).toEqual(['col-span-full'])
      expect(c).toContain('min-w-0')
    }
  })
  it('is half width on tablets for spans 3-6 and full width for the rest', () => {
    for (const s of SPANS) {
      const half = spanClass(s).includes('md:col-span-6')
      expect(half, String(s)).toBe(s <= 6)
    }
  })
  it('takes the exact span from lg', () => {
    for (const s of [3, 4, 5, 7, 8, 9] as Span[]) expect(spanClass(s)).toContain(`lg:col-span-${s}`)
    expect(spanClass(6)).toContain('md:col-span-6')
    expect(spanClass()).toBe('min-w-0 col-span-full')
    expect(spanClass(10 as Span)).toBe('min-w-0 col-span-full')
  })
  it('keeps the grid to one column on phones', () => {
    expect(GRID_CLASS).toContain('grid-cols-1')
    expect(GRID_CLASS).toContain('md:grid-cols-12')
    expect(GRID_CLASS).toContain('max-md:*:col-span-full')
  })
})
