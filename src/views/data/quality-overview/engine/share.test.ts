import { describe, expect, it } from 'vitest'
import { fmt } from '@/lib/format'
import { shareCell, shareFormat, shareText, withShare } from './share'

describe('one share format across the Data quality tab and its workbook', () => {
  it('writes whole percents away from the edges and thresholds', () => {
    expect(shareText(0.72)).toBe('72%')
    expect(shareText(0.975)).toBe('98%')
    expect(shareText(1)).toBe('100%')
    expect(shareText(0)).toBe('0%')
    expect(shareText(null)).toBe('—')
  })

  it('keeps one decimal under 1%, as the Datasets tab writes an import error share', () => {
    expect(shareText(0.0054)).toBe('0.5%')
    expect(shareText(3 / 597)).toBe('0.5%')
    expect(shareText(3 / 312)).toBe('1.0%')
    expect(shareText(0.012)).toBe('1%')
  })

  it('never rounds a gap away', () => {
    // 3 blanks in 694 rows; 5 in 10,984.
    expect(shareText(1 - 3 / 694)).toBe('99.5%')
    expect(shareText(1 - 5 / 10_984)).toBe('99.9%')
    expect(shareText(5 / 10_984)).toBe('0.05%')
    expect(shareText(0.0045)).toBe('0.5%')
    expect(shareText(0.999_999)).toBe('99.9%')
    expect(shareText(0.000_001)).toBe('0.01%')
  })

  it('never rounds across the threshold it is judged by', () => {
    const min = { threshold: 0.95, side: 'min' as const }
    expect(shareText(0.9496, min)).toBe('94.9%')
    expect(shareText(0.946, min)).toBe('94.6%')
    expect(shareText(0.72, min)).toBe('72%')
    expect(shareText(0.0247, { threshold: 0.02, side: 'max' })).toBe('2.5%')
    expect(shareText(0.0201, { threshold: 0.02, side: 'max' })).toBe('2.1%')
  })

  it('gives a table or Excel cell the value and format that show the same text', () => {
    for (const share of [0.72, 1 - 3 / 694, 1 - 5 / 10_984, 5 / 10_984, 0.9496, 0, 1]) {
      const c = shareCell(share, { threshold: 0.95, side: 'min' })
      expect(fmt(c.value as number, c.format)).toBe(shareText(share, { threshold: 0.95, side: 'min' }))
    }
    const row = withShare('coverage', 1 - 5 / 10_984)
    expect(row).toEqual({ coverage: 0.999, coverageFormat: 'pct' })
    expect(shareFormat('coverage')(row)).toBe('pct')
    expect(shareFormat('coverage')({ coverage: 0.5 })).toBe('pct0')
  })
})
