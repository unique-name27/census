import { describe, expect, it } from 'vitest'
import { rovingIndex, scrollDelta } from './keyboard'

describe('rovingIndex', () => {
  it('moves with arrows and wraps at both ends', () => {
    expect(rovingIndex('ArrowRight', 0, 5)).toBe(1)
    expect(rovingIndex('ArrowRight', 4, 5)).toBe(0)
    expect(rovingIndex('ArrowLeft', 0, 5)).toBe(4)
    expect(rovingIndex('ArrowLeft', 3, 5)).toBe(2)
  })

  it('jumps with Home and End and ignores other keys', () => {
    expect(rovingIndex('Home', 3, 5)).toBe(0)
    expect(rovingIndex('End', 1, 5)).toBe(4)
    expect(rovingIndex('Enter', 1, 5)).toBeNull()
    expect(rovingIndex('ArrowDown', 1, 5)).toBeNull()
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull()
  })
})

describe('scrollDelta', () => {
  it('is zero when the item is already in view', () => {
    expect(scrollDelta(100, 280, 0, 375)).toBe(0)
  })
  it('scrolls left or right just enough, with padding', () => {
    expect(scrollDelta(-50, 130, 0, 375)).toBe(-66)
    expect(scrollDelta(300, 484, 0, 375)).toBe(125)
  })
})
