import { describe, expect, it } from 'vitest'
import { clearOfRules, groupIndexAt, groupLayout, nearestBy, segmentAt } from './hit'

describe('grouped bar hit-testing', () => {
  it('lays bars out centered in the band, at most 24px thick', () => {
    const g = groupLayout(100, 3, 80)
    expect(g.size).toBeCloseTo(24)
    expect(g.gap).toBe(2)
    // 3 bars of 24 + 2 gaps of 2 = 76, centered in 100.
    expect(g.start).toBeCloseTo(12)
    expect(groupLayout(10, 4, 8).size).toBe(2)
  })

  it('finds the bar under an offset, splitting gaps between neighbors', () => {
    const g = groupLayout(100, 3, 80) // bars at [12,36], [38,62], [64,88]
    expect(groupIndexAt(12, g, 3)).toBe(0)
    expect(groupIndexAt(35, g, 3)).toBe(0)
    expect(groupIndexAt(37.5, g, 3)).toBe(1)
    expect(groupIndexAt(50, g, 3)).toBe(1)
    expect(groupIndexAt(87, g, 3)).toBe(2)
  })

  it('returns null outside the group (beyond the slack) and for bad input', () => {
    const g = groupLayout(100, 3, 80)
    expect(groupIndexAt(9, g, 3)).toBe(0) // within 4px slack
    expect(groupIndexAt(5, g, 3)).toBeNull()
    expect(groupIndexAt(95, g, 3)).toBeNull()
    expect(groupIndexAt(Number.NaN, g, 3)).toBeNull()
    expect(groupIndexAt(50, g, 0)).toBeNull()
  })
})

describe('stacked segment hit-testing', () => {
  const segs = [
    { cat: 'Jan', series: 'Referral', lo: 0, hi: 3 },
    { cat: 'Jan', series: 'Agency', lo: 3, hi: 7 },
    { cat: 'Feb', series: 'Referral', lo: 0, hi: 5 },
  ]

  it('finds the segment of the category that holds the value', () => {
    expect(segmentAt(segs, 'Jan', 1)?.series).toBe('Referral')
    expect(segmentAt(segs, 'Jan', 5)?.series).toBe('Agency')
    expect(segmentAt(segs, 'Feb', 4)?.series).toBe('Referral')
  })

  it('is null above the stack, below zero, or in another category', () => {
    expect(segmentAt(segs, 'Jan', 7.5)).toBeNull()
    expect(segmentAt(segs, 'Jan', -1)).toBeNull()
    expect(segmentAt(segs, 'Mar', 1)).toBeNull()
    expect(segmentAt(segs, 'Jan', Number.NaN)).toBeNull()
  })
})

describe('nearest series', () => {
  it('picks the item nearest the pointer, first on ties, skipping missing positions', () => {
    const pts = [
      { s: 'A', px: 40 },
      { s: 'B', px: 100 },
      { s: 'C', px: Number.NaN },
      { s: 'D', px: 60 },
    ]
    expect(nearestBy(pts, (p) => p.px, 95)?.s).toBe('B')
    expect(nearestBy(pts, (p) => p.px, 50)?.s).toBe('A')
    expect(nearestBy(pts, (p) => p.px, 52)?.s).toBe('D')
    expect(nearestBy([], (p: { px: number }) => p.px, 0)).toBeNull()
  })
})

describe('labels clear of reference rules', () => {
  it('keeps the label where it is when no rule touches it', () => {
    expect(clearOfRules(100, 40, [50, 200])).toBe(100)
    expect(clearOfRules(100, 40, [])).toBe(100)
  })

  it('moves the label past a rule that runs through it or hugs it', () => {
    // Rule through the label: start just past the rule.
    expect(clearOfRules(100, 40, [120], 3)).toBe(124)
    // Rule within the gap before the label.
    expect(clearOfRules(100, 40, [98], 3)).toBe(102)
    // Rule just after the label's end, within the gap.
    expect(clearOfRules(100, 40, [142], 3)).toBe(146)
  })

  it('steps past several rules in order and ignores non-finite ones', () => {
    // After skipping 120 the label spans [124, 164], which 150 crosses.
    expect(clearOfRules(100, 40, [150, 120, Number.NaN], 3)).toBe(154)
    // A rule behind the label never pulls it back.
    expect(clearOfRules(100, 40, [10], 3)).toBe(100)
  })
})
