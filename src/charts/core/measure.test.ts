/**
 * Wrapped labels: a label that would be cut breaks onto two lines at spaces, the second shortened
 * only when the rest still does not fit. Widths here come from the fallback metric (no canvas in
 * tests): 0.56 × the font size per character.
 */
import { describe, expect, it } from 'vitest'
import { bandLabel, bandLabelLines } from './marks'
import { textWidth, wrapText } from './measure'

describe('wrapText', () => {
  it('keeps a label that fits on one line', () => {
    expect(wrapText('Laptop shipped', 150, 12)).toEqual(['Laptop shipped'])
  })

  it('breaks a long label at spaces onto two lines, each within the width', () => {
    const lines = wrapText('Export control & trade compliance', 150, 12)
    expect(lines).toEqual(['Export control & trade', 'compliance'])
    for (const l of lines) expect(textWidth(l, 12)).toBeLessThanOrEqual(150)
  })

  it('shortens the last line only when the rest does not fit', () => {
    const lines = wrapText('Semiconductor product fundamentals for new engineering hires', 150, 12)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(textWidth(lines[1], 12)).toBeLessThanOrEqual(150)
  })

  it('stays on one line, shortened, when asked for one', () => {
    expect(wrapText('Export control & trade compliance', 150, 12, 400, 1)).toHaveLength(1)
  })
})

describe('band labels', () => {
  it('wraps only in rows tall enough for two lines, and sizes the margin to the widest line', () => {
    const labels = ['Export control & trade compliance', 'IT']
    const tall = bandLabelLines(labels, 150, 28)
    expect(tall.lines[0]).toHaveLength(2)
    expect(tall.width).toBeCloseTo(textWidth('Export control & trade', 12), 6)
    const short = bandLabelLines(labels, 150, 20)
    expect(short.lines[0]).toHaveLength(1)
  })

  it('centers two lines on the row and keeps the full text as a title when cut', () => {
    const two = bandLabel(
      'Export control & trade compliance',
      ['Export control & trade', 'compliance'],
      100,
      50,
      '#000',
    )
    expect(two.map((l) => l.y)).toEqual([43.5, 56.5])
    expect(two[0].title).toBeUndefined()
    const cut = bandLabel('Semiconductor product fundamentals', ['Semiconductor…'], 100, 50, '#000')
    expect(cut[0]).toMatchObject({ y: 50, title: 'Semiconductor product fundamentals' })
  })
})
