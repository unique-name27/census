/**
 * The type scale and radius tokens are the only sizes and radii in the app (docs/DESIGN-REFRESH.md
 * 2.2 and 2.4). Text takes a named size (text-label, text-meta, text-small, text-body, text-title,
 * text-section, text-page-title, text-display, text-hero) and corners a named radius
 * (rounded-mark, rounded-chip, rounded-control, rounded-sheet, rounded-full). This test fails on
 * any arbitrary `text-[Npx]` or `rounded-[Npx]` class in a component, with one exception: the
 * wordmark (18px bold).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** The one allowed arbitrary size: the Census wordmark in the masthead and the loading frame. */
const ALLOW = ['cut-head text-[18px] leading-none font-bold tracking-[-0.02em]']

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

interface Hit {
  file: string
  line: number
  match: string
}

/** Every arbitrary pixel size or radius class outside the allowlist. */
function offScale(text: string): string[] {
  let rest = text
  for (const allowed of ALLOW) rest = rest.split(allowed).join(' ')
  return [...rest.matchAll(/\b(?:text|rounded(?:-[trblse]{1,2})?)-\[\d+(?:\.\d+)?px\]/g)].map((m) => m[0])
}

/** `text-page` is the page color as text; the 28px step is `text-page-title`. */
function pageAsSize(line: string): boolean {
  return /\btext-page\b(?!-)/.test(line) && !/<svg|<path|fill/.test(line)
}

describe('type scale', () => {
  const files = sources(SRC)

  it('finds the component sources', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('uses no arbitrary text size or radius outside the wordmark', () => {
    const hits: Hit[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const match of offScale(line)) hits.push({ file: relative(SRC, file), line: i + 1, match })
      })
    }
    expect(hits).toEqual([])
  })

  it('never uses text-page as a size (the 28px step is text-page-title)', () => {
    const hits: Hit[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (pageAsSize(line)) hits.push({ file: relative(SRC, file), line: i + 1, match: 'text-page' })
        })
    }
    expect(hits).toEqual([])
  })

  it('flags off-scale classes and keeps the wordmark', () => {
    const side = ['rounded-t', '[2px]'].join('-')
    expect(offScale(`a text-[15px] b rounded-[3px] ${side}`)).toEqual(['text-[15px]', 'rounded-[3px]', side])
    expect(offScale(`<span className="${ALLOW[0]}">Census</span>`)).toEqual([])
    expect(offScale('text-meta rounded-chip text-[var(--x)]')).toEqual([])
  })
})
