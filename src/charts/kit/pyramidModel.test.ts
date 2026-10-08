import { describe, expect, it } from 'vitest'
import { stepKey } from '../core/keyboard'
import {
  BRACKET_LABEL_MAX,
  barPath,
  layoutSegments,
  PYRAMID_BAR,
  PYRAMID_MIN_BARS,
  PYRAMID_PITCH,
  pyramidBrackets,
  pyramidGutters,
  pyramidKeyPoints,
  pyramidLayout,
  rowAt,
  segmentAtX,
  twoLines,
} from './pyramidModel'

const row = (
  key: string,
  value: number,
  outline: number | null = null,
  segments: [string, number][] = [],
) => ({
  key,
  value,
  outline,
  segments: segments.map(([k, v]) => ({ key: k, value: v })),
  datum: { key },
})

/** L1 at the bottom: the data runs bottom row first. */
const rows = [row('L1', 50, 60), row('L2', 100, 80), row('L3', 200, 150), row('M1', 0, 10)]
const opts = { width: 500, left: 100, right: 100 }

describe('pyramidLayout', () => {
  const lay = pyramidLayout(rows, opts)

  it('draws the last data row on top and keeps reading order top first', () => {
    expect(lay.rows.map((r) => r.key)).toEqual(['M1', 'L3', 'L2', 'L1'])
    expect(lay.rows.map((r) => r.index)).toEqual([3, 2, 1, 0])
    // 16px bars, 6px between rows.
    expect(lay.rows[1].y - lay.rows[0].y).toBe(PYRAMID_PITCH)
    expect(lay.rows[0].cy - lay.rows[0].y).toBe(PYRAMID_BAR / 2)
  })

  it('centers every bar on one axis with one scale for bars and outlines', () => {
    expect(lay.cx).toBe(250)
    for (const r of lay.rows) {
      if (!r.bar) continue
      expect((r.bar.x0 + r.bar.x1) / 2).toBeCloseTo(lay.cx, 9)
      expect(r.bar.x1 - r.bar.x0).toBeCloseTo(r.value * lay.unit, 9)
    }
    // The widest value (200) fills the bar area less a pixel each side.
    const l3 = lay.rows.find((r) => r.key === 'L3')!
    expect(l3.bar!.x1 - l3.bar!.x0).toBeCloseTo(298, 9)
    // An outline is on the same scale and 4px taller than its bar.
    const l1 = lay.rows.find((r) => r.key === 'L1')!
    expect(l1.ring!.x1 - l1.ring!.x0).toBeCloseTo(60 * lay.unit, 9)
    expect(l1.ring!.y1 - l1.ring!.y0).toBe(PYRAMID_BAR + 4)
  })

  it('scales to the outline when an outline is the largest value', () => {
    const big = pyramidLayout([row('A', 10, 40)], opts)
    expect(big.rows[0].ring!.x1 - big.rows[0].ring!.x0).toBeCloseTo(298, 9)
    expect(big.rows[0].bar!.x1 - big.rows[0].bar!.x0).toBeCloseTo(298 / 4, 9)
  })

  it('leaves a row with nothing in it without a bar, but keeps its outline', () => {
    const m1 = lay.rows.find((r) => r.key === 'M1')!
    expect(m1.bar).toBeNull()
    expect(m1.segments).toEqual([])
    expect(m1.ring).not.toBeNull()
  })

  it('handles no rows and all zeros', () => {
    expect(pyramidLayout([], opts).rows).toEqual([])
    const zero = pyramidLayout([row('A', 0)], opts)
    expect(zero.unit).toBe(0)
    expect(zero.rows[0].bar).toBeNull()
  })
})

describe('layoutSegments', () => {
  it('splits the bar in proportion with 2px gaps and rounds only the outer ends', () => {
    const s = layoutSegments(
      [
        { key: 'a', value: 1 },
        { key: 'b', value: 3 },
        { key: 'zero', value: 0 },
      ],
      0,
      102,
    )
    expect(s.map((x) => x.key)).toEqual(['a', 'b'])
    expect(s[0].x0).toBe(0)
    expect(s[0].x1).toBeCloseTo(25, 9)
    expect(s[1].x0).toBeCloseTo(27, 9)
    expect(s[1].x1).toBe(102)
    expect([s[0].first, s[0].last, s[1].first, s[1].last]).toEqual([true, false, false, true])
  })

  it('drops the gaps when the bar is too thin to keep a pixel per segment', () => {
    const s = layoutSegments(
      [
        { key: 'a', value: 1 },
        { key: 'b', value: 1 },
        { key: 'c', value: 1 },
      ],
      0,
      5,
    )
    expect(s[1].x0).toBeCloseTo(s[0].x1, 9)
    expect(s[2].x1).toBe(5)
  })

  it('lays an unsplit bar out as one segment rounded at both ends', () => {
    const lay = pyramidLayout([row('A', 10)], opts)
    expect(lay.rows[0].segments).toHaveLength(1)
    expect(lay.rows[0].segments[0]).toMatchObject({ first: true, last: true })
  })
})

describe('barPath', () => {
  it('rounds the ends asked for, at most 4px and half the height', () => {
    expect(barPath(0, 100, 0, 16, true, true)).toBe(
      'M4,0H96A4,4 0 0 1 100,4V12A4,4 0 0 1 96,16H4A4,4 0 0 1 0,12V4A4,4 0 0 1 4,0Z',
    )
    expect(barPath(0, 100, 0, 16, false, false)).toBe('M0,0H100V16H0V0Z')
    expect(barPath(10, 20, 0, 16, true, false)).toBe('M14,0H20V16H14A4,4 0 0 1 10,12V4A4,4 0 0 1 14,0Z')
    // A 4px sliver rounds by 2px at each end.
    expect(barPath(0, 4, 0, 16, true, true)).toContain('A2,2')
  })
})

describe('hit-testing', () => {
  const split = pyramidLayout(
    [
      row('L1', 40, null, [
        ['A', 10],
        ['B', 30],
      ]),
      row('L2', 80, null, [['A', 80]]),
    ],
    opts,
  )
  const l1 = split.rows.find((r) => r.key === 'L1')!

  it('finds the row under the pointer, gaps split halfway', () => {
    expect(rowAt(split, l1.cy)?.key).toBe('L1')
    expect(rowAt(split, split.rows[0].y - 2)?.key).toBe('L2')
    expect(rowAt(split, 1000)).toBeNull()
  })

  it('finds the segment under the pointer, the nearer one in a gap, none off the bar', () => {
    const [a, b] = l1.segments
    expect(segmentAtX(l1, (a.x0 + a.x1) / 2)?.key).toBe('A')
    expect(segmentAtX(l1, (b.x0 + b.x1) / 2)?.key).toBe('B')
    expect(segmentAtX(l1, a.x1 + 0.5)?.key).toBe('A')
    expect(segmentAtX(l1, b.x0 - 0.5)?.key).toBe('B')
    expect(segmentAtX(l1, l1.bar!.x0 - 10)).toBeNull()
  })
})

describe('the keyboard layer', () => {
  it('steps through the rows top first when the bars are not split', () => {
    const lay = pyramidLayout(rows, opts)
    const pts = pyramidKeyPoints(lay, false)
    expect(pts.map((p) => p.datum.key)).toEqual(['M1', 'L3', 'L2', 'L1'])
    expect(pts.every((p) => p.group === undefined && p.part === null)).toBe(true)
    expect(stepKey(pts, -1, 'ArrowDown')).toBe(0)
    expect(stepKey(pts, 0, 'ArrowDown')).toBe(1)
    expect(stepKey(pts, 1, 'ArrowUp')).toBe(0)
    expect(stepKey(pts, 3, 'ArrowDown')).toBe(3)
  })

  it('moves between rows with Up and Down and through segments with Left and Right', () => {
    const lay = pyramidLayout(
      [
        row('L1', 30, null, [
          ['A', 10],
          ['B', 20],
        ]),
        row('L2', 40, null, [
          ['A', 25],
          ['B', 15],
        ]),
      ],
      opts,
    )
    const pts = pyramidKeyPoints(lay, true)
    expect(pts.map((p) => `${p.datum.key}:${p.part ?? 'row'}`)).toEqual([
      'L2:row',
      'L2:A',
      'L2:B',
      'L1:row',
      'L1:A',
      'L1:B',
    ])
    const at = (k: string) => pts.findIndex((p) => `${p.datum.key}:${p.part ?? 'row'}` === k)
    expect(stepKey(pts, at('L2:row'), 'ArrowRight')).toBe(at('L2:A'))
    expect(stepKey(pts, at('L2:A'), 'ArrowRight')).toBe(at('L2:B'))
    // Down keeps to the same segment in the row below; Up comes back.
    expect(stepKey(pts, at('L2:B'), 'ArrowDown')).toBe(at('L1:B'))
    expect(stepKey(pts, at('L1:row'), 'ArrowUp')).toBe(at('L2:row'))
    // The points sit on their marks.
    const seg = lay.rows[0].segments[1]
    expect(pts[at('L2:B')].x).toBeCloseTo((seg.x0 + seg.x1) / 2, 9)
    expect(pts[at('L2:B')].w).toBeCloseTo(seg.x1 - seg.x0, 9)
  })
})

describe('brackets and hairlines', () => {
  it('spans each run of rows and puts a hairline in the gap between runs', () => {
    const lay = pyramidLayout(rows, opts)
    const { brackets, dividers } = pyramidBrackets(lay, [
      { label: 'Individual contributor', keys: ['L1', 'L2', 'L3'] },
      { label: 'Manager', keys: ['M1', 'M2'] },
      { label: 'Executive', keys: ['E1'] },
    ])
    expect(brackets.map((b) => b.label)).toEqual(['Manager', 'Individual contributor'])
    const m1 = lay.rows[0]
    const l3 = lay.rows[1]
    expect(brackets[0]).toEqual({ label: 'Manager', y0: m1.y, y1: m1.y + PYRAMID_BAR })
    expect(dividers).toEqual([(m1.y + PYRAMID_BAR + l3.y) / 2])
  })
})

describe('pyramidGutters', () => {
  const measure = (t: string, size: number) => t.length * size * 0.5
  const input = {
    labels: ['L6 Principal', 'L1 Entry'],
    shortLabels: ['L6', 'L1'],
    bracketLabels: ['Individual contributor', 'Manager'],
    columns: [
      { texts: ['1,450', '65'], narrow: true, weight: 600 },
      { texts: ['+103', '−8'], narrow: true },
      { texts: ['span 6', null], narrow: false },
    ],
    notes: ['+31% in a year'],
    measure,
  }

  it('keeps everything when the bars have room', () => {
    const g = pyramidGutters({ ...input, width: 1000 })
    expect(g.compact).toBe(false)
    expect(g.notes).toBeGreaterThan(0)
    expect(g.columns.every((w) => w > 0)).toBe(true)
    expect(g.left).toBe(g.bracket + g.label)
    expect(g.bracketLines[0]).toEqual(
      twoLines('Individual contributor', BRACKET_LABEL_MAX, (t) => measure(t, 11)),
    )
    // Columns end where their right-aligned text ends, left to right.
    expect(g.columnEnds[0]).toBeLessThan(g.columnEnds[1])
    expect(g.columnEnds[1]).toBeLessThan(g.columnEnds[2])
  })

  it('drops the notes first, then goes compact on a phone', () => {
    const full = pyramidGutters({ ...input, width: 1000 })
    const mid = pyramidGutters({ ...input, width: full.left + full.right + PYRAMID_MIN_BARS + 40 })
    expect(mid.compact).toBe(false)
    const phone = pyramidGutters({ ...input, width: 300 })
    expect(phone.compact).toBe(true)
    expect(phone.notes).toBe(0)
    expect(phone.bracket).toBe(0)
    expect(phone.columns[2]).toBe(0)
    expect(phone.columns[0]).toBeGreaterThan(0)
    expect(phone.label).toBeLessThan(full.label)
  })

  it('breaks a long bracket label onto two lines', () => {
    expect(twoLines('Individual contributor', 70, (t) => t.length * 5)).toEqual(['Individual', 'contributor'])
    expect(twoLines('Manager', 70, (t) => t.length * 5)).toEqual(['Manager'])
  })
})
