/**
 * The tier medal colors must read on every surface a badge sits on: at least 3:1 (WCAG non-text
 * contrast) against the sheet, the second sheet tone and the page, in light and in both dark blocks.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

/** The token blocks in file order: light :root, dark under the OS preference, dark pinned. */
function blocks(): Record<'light' | 'darkOs' | 'darkPinned', string> {
  const os = css.indexOf('@media (prefers-color-scheme: dark)')
  const pinned = css.indexOf(':root[data-theme="dark"]')
  return { light: css.slice(0, os), darkOs: css.slice(os, pinned), darkPinned: css.slice(pinned) }
}

function token(block: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block)
  if (!m) throw new Error(`--${name} is missing or not a 6-digit hex color`)
  return m[1]
}

const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('tier tokens', () => {
  const all = blocks()
  for (const [mode, block] of Object.entries(all)) {
    // The pinned dark block defines every surface itself; the OS block does too.
    const surfaces = ['sheet', 'sheet-2', 'page'].map((s) => token(block, s))
    for (const tier of ['gold', 'silver', 'bronze']) {
      it(`${tier} is at least 3:1 against the surfaces in ${mode}`, () => {
        const glyph = token(block, `tier-${tier}`)
        for (const bg of surfaces) expect(contrast(glyph, bg)).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('defines a wash for each tier in every block', () => {
    for (const block of Object.values(all))
      for (const tier of ['gold', 'silver', 'bronze'])
        expect(block).toMatch(new RegExp(`--tier-${tier}-wash:\\s*rgba\\(`))
  })

  it('keeps the dark blocks in step', () => {
    for (const tier of ['gold', 'silver', 'bronze'])
      expect(token(all.darkOs, `tier-${tier}`)).toBe(token(all.darkPinned, `tier-${tier}`))
  })
})
