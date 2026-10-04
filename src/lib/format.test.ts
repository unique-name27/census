import { describe, expect, it } from 'vitest'
import { DASH, excelNumFmt, fmt, fmtDelta, MINUS } from './format'

describe('fmt', () => {
  it('formats the new pct2 and times formats', () => {
    expect(fmt(0.0354, 'pct2')).toBe('3.54%')
    expect(fmt(0.1, 'pct2')).toBe('10.00%')
    expect(fmt(1.58, 'times')).toBe('1.58×')
    expect(fmt(12, 'times')).toBe('12.00×')
    expect(fmt(null, 'pct2')).toBe(DASH)
    expect(fmt(Number.NaN, 'times')).toBe(DASH)
  })

  it('writes negatives with the true minus sign (U+2212) in every display format', () => {
    expect(MINUS).toBe('−')
    const cases: [Parameters<typeof fmt>[1], number, string][] = [
      ['int', -1284, '−1,284'],
      ['compact', -12_900, '−12.9K'],
      ['compact', -42, '−42'],
      ['num1', -4.25, '−4.3'],
      ['num2', -0.98, '−0.98'],
      ['ratio', -0.5, '−0.50'],
      ['pct', -0.124, '−12.4%'],
      ['pct0', -0.12, '−12%'],
      ['pct2', -0.0354, '−3.54%'],
      ['money', -1_200_000, '−$1.2M'],
      ['money', -950, '−$950'],
      ['moneyFull', -123_456, '−$123,456'],
      ['days', -12, '−12 d'],
      ['days', -2.5, '−2.5 d'],
      ['hours', -6.5, '−6.5 h'],
      ['years', -4.2, '−4.2 yrs'],
      ['times', -1.58, '−1.58×'],
      ['pts', -0.021, '−2.1 pts'],
    ]
    for (const [format, v, out] of cases) {
      expect(fmt(v, format), format).toBe(out)
      expect(fmt(v, format), format).not.toContain('-')
    }
  })

  it('drops the sign when a negative value rounds to zero', () => {
    expect(fmt(-0.0004, 'pct')).toBe('0.0%')
    expect(fmt(-0.2, 'int')).toBe('0')
    expect(fmt(-0.004, 'num2')).toBe('0.00')
    expect(fmt(-0.0001, 'pts')).toBe('0.0 pts')
  })

  it('keeps positive values unsigned and points signed', () => {
    expect(fmt(1284, 'int')).toBe('1,284')
    expect(fmt(0.124, 'pct')).toBe('12.4%')
    expect(fmt(12_900, 'money')).toBe('$12.9K')
    expect(fmt(0.021, 'pts')).toBe('+2.1 pts')
  })
})

describe('fmtDelta', () => {
  it('signs deltas with + and the true minus, in the unit of the format', () => {
    expect(fmtDelta(3, 'int')).toBe('+3')
    expect(fmtDelta(-3, 'int')).toBe('−3')
    expect(fmtDelta(-1.25, 'days')).toBe('−1.3 d')
    expect(fmtDelta(-0.012, 'pct')).toBe('−1.2 pts')
    expect(fmtDelta(0.0123, 'pct2')).toBe('+1.2 pts')
    expect(fmtDelta(-0.12, 'times')).toBe('−0.12×')
    expect(fmtDelta(-12_000, 'money')).toBe('−$12K')
  })
  it('shows ± for no change, including changes that round to zero', () => {
    expect(fmtDelta(0, 'int')).toBe('±0')
    expect(fmtDelta(-0.2, 'int')).toBe('±0')
    expect(fmtDelta(null, 'int')).toBe(DASH)
  })
})

describe('excelNumFmt', () => {
  it('maps the new formats', () => {
    expect(excelNumFmt('pct2')).toBe('0.00%')
    expect(excelNumFmt('times')).toBe('0.00"×"')
    expect(excelNumFmt('pct')).toBe('0.0%')
    expect(excelNumFmt('text')).toBeUndefined()
  })
})
