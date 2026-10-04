import { describe, expect, it } from 'vitest'
import { describeRelativeDay, readMonth, readRelativeDay, resolveRelativeDay } from './relative'

describe('relative due days', () => {
  it.each([
    ['Day -3', -3, false],
    ['day −3', -3, false],
    ['D-1', -1, false],
    ['T-2', -2, false],
    ['Day 0', 0, false],
    ['Day +30', 30, false],
    ['Day 30', 30, false],
    ['Day 3 BD', 3, true],
    ['+3 BD', 3, true],
    ['-2 days', -2, false],
    ['5 business days', 5, true],
    ['3 business days after start', 3, true],
    ['2 days before the start date', -2, false],
  ])('reads %s', (text, offset, business) => {
    expect(readRelativeDay(text)).toMatchObject({ offset, business, text })
  })

  it('leaves dates, bare numbers and other text alone', () => {
    for (const v of ['2026-10-09', '46000', '3', 'Laptop', '', 46000, null])
      expect(readRelativeDay(v)).toBeNull()
  })

  it('counts calendar or working days from the start', () => {
    // Monday 12 Oct 2026
    expect(resolveRelativeDay('2026-10-12', { offset: -3, business: false })).toBe('2026-10-09')
    expect(resolveRelativeDay('2026-10-12', { offset: 3, business: true })).toBe('2026-10-15')
    expect(resolveRelativeDay('2026-10-16', { offset: 3, business: true })).toBe('2026-10-21')
    expect(describeRelativeDay({ offset: -3, business: false })).toBe('3 days before the start')
    expect(describeRelativeDay({ offset: 1, business: true })).toBe('1 business day after the start')
    expect(describeRelativeDay({ offset: 0, business: false })).toBe('on the start date')
  })
})

describe('months', () => {
  it.each([
    ['2026-11', '2026-11-01'],
    ['2026/11', '2026-11-01'],
    ['202611', '2026-11-01'],
    [202611, '2026-11-01'],
    ['11/2026', '2026-11-01'],
    ['Nov 2026', '2026-11-01'],
    ['November-26', '2026-11-01'],
    ["Sept '26", '2026-09-01'],
    ['2026 Dec', '2026-12-01'],
    ['2026-11-17', '2026-11-01'],
    ['17-Nov-2026', '2026-11-01'],
  ])('reads %s as the first of its month', (v, want) => {
    expect(readMonth(v)).toBe(want)
  })

  it('refuses what names no month', () => {
    for (const v of ['Q4 2026', 'soon', '2026-13', '', null]) expect(readMonth(v)).toBeNull()
  })
})
