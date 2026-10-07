import { describe, expect, it } from 'vitest'
import { focusBox, isStepKey, type KeyPoint, readingOrder, stepKey } from './keyboard'
import { spokenTip } from './tooltip'

const list: KeyPoint<string>[] = ['a', 'b', 'c'].map((d, i) => ({ datum: d, x: 10, y: 10 + i * 28 }))

describe('stepKey, one group', () => {
  it('focuses the first point on the first key and the last on End', () => {
    expect(stepKey(list, -1, 'ArrowDown')).toBe(0)
    expect(stepKey(list, -1, 'ArrowLeft')).toBe(0)
    expect(stepKey(list, -1, 'End')).toBe(2)
  })

  it('steps forward on Right and Down, back on Left and Up, and never wraps', () => {
    expect(stepKey(list, 0, 'ArrowRight')).toBe(1)
    expect(stepKey(list, 1, 'ArrowDown')).toBe(2)
    expect(stepKey(list, 2, 'ArrowDown')).toBe(2)
    expect(stepKey(list, 2, 'ArrowUp')).toBe(1)
    expect(stepKey(list, 0, 'ArrowLeft')).toBe(0)
    expect(stepKey(list, 1, 'Home')).toBe(0)
  })

  it('leaves other keys and empty charts alone', () => {
    expect(stepKey(list, 0, 'Enter')).toBeNull()
    expect(stepKey(list, 0, 'Tab')).toBeNull()
    expect(stepKey([], -1, 'ArrowDown')).toBeNull()
    expect(isStepKey('Escape')).toBe(false)
    expect(isStepKey('Home')).toBe(true)
  })
})

describe('stepKey, several groups (series)', () => {
  // Two series over three months: Left/Right along time, Up/Down across series.
  const pts: KeyPoint<string>[] = [
    { datum: 'h1', x: 0, y: 50, group: 'Hires' },
    { datum: 'h2', x: 100, y: 40, group: 'Hires' },
    { datum: 'h3', x: 200, y: 30, group: 'Hires' },
    { datum: 'e1', x: 0, y: 80, group: 'Exits' },
    { datum: 'e2', x: 100, y: 70, group: 'Exits' },
    { datum: 'e3', x: 200, y: 90, group: 'Exits' },
  ]

  it('moves along the group and stops at its ends', () => {
    expect(stepKey(pts, 0, 'ArrowRight')).toBe(1)
    expect(stepKey(pts, 2, 'ArrowRight')).toBe(2)
    expect(stepKey(pts, 3, 'ArrowLeft')).toBe(3)
    expect(stepKey(pts, 4, 'End')).toBe(5)
    expect(stepKey(pts, 5, 'Home')).toBe(3)
  })

  it('moves to the nearest point across in the next or previous group', () => {
    expect(stepKey(pts, 1, 'ArrowDown')).toBe(4)
    expect(stepKey(pts, 5, 'ArrowUp')).toBe(2)
    expect(stepKey(pts, 0, 'ArrowUp')).toBe(0)
    expect(stepKey(pts, 4, 'ArrowDown')).toBe(4)
  })
})

describe('readingOrder and focusBox', () => {
  it('sorts by row, then left to right', () => {
    const scrambled: KeyPoint<string>[] = [
      { datum: 'b2', x: 50, y: 30 },
      { datum: 'a1', x: 0, y: 10 },
      { datum: 'b1', x: 0, y: 31 },
      { datum: 'a2', x: 50, y: 9 },
    ]
    expect(readingOrder(scrambled).map((p) => p.datum)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('pads a mark box and rings a bare point', () => {
    expect(focusBox({ datum: 1, x: 50, y: 20, w: 100, h: 14 })).toEqual({
      x: -3,
      y: 10,
      w: 106,
      h: 20,
      round: false,
    })
    expect(focusBox({ datum: 1, x: 50, y: 20 })).toEqual({ x: 43, y: 13, w: 14, h: 14, round: true })
  })
})

describe('stepKey, rows of segments', () => {
  // Two rows of a stacked bar chart, each row a group, parts are the series.
  const rows: KeyPoint<string>[] = [
    { datum: 'a-over', part: 'Overdue', x: 20, y: 10, group: 'A' },
    { datum: 'a-soon', part: 'Soon', x: 60, y: 10, group: 'A' },
    { datum: 'b-soon', part: 'Soon', x: 15, y: 40, group: 'B' },
    { datum: 'c-over', part: 'Overdue', x: 10, y: 70, group: 'C' },
    { datum: 'c-soon', part: 'Soon', x: 40, y: 70, group: 'C' },
  ]

  it('moves one row at a time, keeping to the same series when the next row has it', () => {
    expect(stepKey(rows, 1, 'ArrowDown')).toBe(2)
    expect(stepKey(rows, 2, 'ArrowDown')).toBe(4)
    expect(stepKey(rows, 0, 'ArrowDown')).toBe(2)
    expect(stepKey(rows, 3, 'ArrowUp')).toBe(2)
    expect(stepKey(rows, 0, 'ArrowRight')).toBe(1)
  })

  it('End before anything is focused lands on the end of the first group', () => {
    expect(stepKey(rows, -1, 'End')).toBe(1)
    expect(stepKey(list, -1, 'End')).toBe(2)
  })
})

describe('spokenTip', () => {
  it('leads with the focused series, with the total when there is one', () => {
    expect(
      spokenTip({
        title: 'Managers',
        rows: [
          { value: '181', label: 'Overdue', strong: true },
          { value: '48', label: 'Due within 7 d' },
          { value: '235', label: 'Total' },
        ],
      }),
    ).toBe('Overdue, Managers: 181 of 235. Due within 7 d: 48')
    expect(
      spokenTip({
        title: '30 Sep 2026',
        rows: [
          { value: '1,450', label: 'Last 12 months', strong: true },
          { value: '1,347', label: 'A year earlier' },
        ],
      }),
    ).toBe('Last 12 months, 30 Sep 2026: 1,450. A year earlier: 1,347')
  })

  it('reads a single value plainly and prefers a chart’s own sentence', () => {
    expect(spokenTip({ title: 'Sep 2026', rows: [{ value: '1,450' }] })).toBe('Sep 2026. 1,450')
    expect(
      spokenTip({ title: 'x', rows: [{ value: '7', label: '3 overdue' }], spoken: 'Shreya: 7 items' }),
    ).toBe('Shreya: 7 items')
  })
})
