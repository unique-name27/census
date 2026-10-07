import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { svgEl } from './marks'

/** Just enough of a Document for svgEl: elements that remember their attributes. */
function fakeDoc(): Document {
  return {
    createElementNS: (_ns: string, tag: string) => {
      const attrs = new Map<string, string>()
      return {
        tagName: tag,
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
      }
    },
  } as unknown as Document
}

describe('svgEl', () => {
  it('anchors text at its start, since Plot centres text on its root svg', () => {
    const t = svgEl(fakeDoc(), 'text', { x: 12, y: 4 })
    expect(t.getAttribute('text-anchor')).toBe('start')
  })

  it('keeps an anchor the caller asks for', () => {
    const t = svgEl(fakeDoc(), 'text', { x: 12, 'text-anchor': 'end' })
    expect(t.getAttribute('text-anchor')).toBe('end')
  })

  it('leaves other elements alone', () => {
    const g = svgEl(fakeDoc(), 'g')
    expect(g.getAttribute('text-anchor')).toBeNull()
  })
})

describe('kit labels placed by their left edge', () => {
  // StatusSplit draws "4 Met" to the right of its glyph, and TrendGrid's cell headers start at the
  // cell's left edge. Both must say so, so the label never centres over the glyph.
  for (const file of ['StatusSplit.tsx', 'TrendGrid.tsx']) {
    it(`${file} anchors its text at the start`, () => {
      const src = readFileSync(join(__dirname, '..', 'kit', file), 'utf8')
      const texts = src.match(/svgEl\(doc, 'text', \{[^}]*\}/g) ?? []
      expect(texts.length).toBeGreaterThan(0)
      for (const t of texts) expect(t).toContain("'text-anchor': 'start'")
    })
  }
})
