import { describe, expect, it } from 'vitest'
import type { ChartTheme } from '../theme'
import { isOtherSeries, ordinalColors, otherLast, seriesPalette } from './series'

const SEQ = {
  100: '#cde2fb',
  200: '#9ec5f4',
  250: '#86b6ef',
  300: '#6da7ec',
  400: '#3987e5',
  450: '#2a78d6',
  500: '#256abf',
  600: '#184f95',
  700: '#0d366b',
}
const theme = {
  series: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
  deemph: 'gray',
  seq: SEQ,
} as unknown as ChartTheme

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('Other series', () => {
  it('recognizes Other and folded Other (k)', () => {
    expect(isOtherSeries('Other')).toBe(true)
    expect(isOtherSeries('Other (4)')).toBe(true)
    expect(isOtherSeries('Others')).toBe(false)
    expect(isOtherSeries('Other income')).toBe(false)
  })
  it('moves Other series to the end, keeping the rest in order', () => {
    expect(otherLast(['Other (3)', 'Fab', 'Other', 'Test'])).toEqual(['Fab', 'Test', 'Other (3)', 'Other'])
  })
})

describe('seriesPalette', () => {
  it('gives categorical slots in order, never a slot to Other', () => {
    expect(seriesPalette(theme, ['Fab', 'Other (2)', 'Test'])).toEqual(['s1', 'gray', 's2'])
    expect(seriesPalette(theme, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])[8]).toBe('gray')
  })

  it('maps seriesOrder onto the sequential ramp for ordinal series', () => {
    const order = ['1', '2', '3', '4', '5']
    const all = seriesPalette(theme, order, { scheme: 'ordinal', order })
    expect(all[0]).toBe(rgb(SEQ[250]))
    expect(all[4]).toBe(rgb(SEQ[700]))
    expect(new Set(all).size).toBe(5)
    for (const c of all) expect(theme.series).not.toContain(c)
    // A rating keeps its color when others are filtered out.
    expect(seriesPalette(theme, ['4', '5'], { scheme: 'ordinal', order })).toEqual([all[3], all[4]])
    // Other stays gray and outside the ramp.
    expect(seriesPalette(theme, ['1', '2', 'Other'], { scheme: 'ordinal' })).toEqual([
      rgb(SEQ[250]),
      rgb(SEQ[700]),
      'gray',
    ])
  })

  it('uses explicit colors first, by map or function', () => {
    expect(seriesPalette(theme, ['Fab', 'Test'], { colors: { Test: 'red' } })).toEqual(['s1', 'red'])
    expect(seriesPalette(theme, ['Fab', 'Other', 'Test'], { colors: (s, i) => `${s}:${i}` })).toEqual([
      'Fab:0',
      'gray',
      'Test:1',
    ])
    expect(seriesPalette(theme, ['Other'], { colors: { Other: 'black' } })).toEqual(['black'])
  })

  it('spaces ordinal steps from seq-250 to seq-700', () => {
    expect(ordinalColors(theme, 0)).toEqual([])
    expect(ordinalColors(theme, 1)).toEqual([SEQ[500]])
    expect(ordinalColors(theme, 2)).toEqual([rgb(SEQ[250]), rgb(SEQ[700])])
    expect(ordinalColors(theme, 7)[3]).toBe(rgb(SEQ[450]))
  })
})
