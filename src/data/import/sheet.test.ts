import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sheetFromRows as viaParse } from './parse'
import { sheetFromRows } from './sheet'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The file a static import specifier points at, or null for packages. */
function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(from), spec)
      : null
  if (!base) return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')])
    if (/\.tsx?$/.test(c) && statSync(c, { throwIfNoEntry: false })?.isFile()) return c
  return null
}

/** Every module a file loads up front: static value imports and re-exports, followed through. */
function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?'([^']+)'/gm)) {
      if (m[1]) continue
      const next = resolveSpec(file, m[2])
      if (next) queue.push(next)
      else if (!m[2].startsWith('.') && !m[2].startsWith('@/')) packages.add(m[2])
    }
  }
  return { files, packages }
}

describe('sheetFromRows', () => {
  it('finds the header under title rows and keeps sheet row numbers', () => {
    const sheet = sheetFromRows('Extract', [
      ['Run on', '30 Sep 2026'],
      [],
      ['Req #', 'Dept', 'Opened'],
      ['R-1', ' Design Verification ', '2026-01-05'],
      [],
      ['R-2', '', '2026-02-01'],
    ])
    expect(sheet).toEqual({
      name: 'Extract',
      headerRow: 2,
      headers: ['Req #', 'Dept', 'Opened'],
      rows: [
        { 'Req #': 'R-1', Dept: 'Design Verification', Opened: '2026-01-05' },
        { 'Req #': 'R-2', Dept: null, Opened: '2026-02-01' },
      ],
      rowNumbers: [4, 6],
    })
  })

  it('is null for an all-blank sheet', () => {
    expect(sheetFromRows('Blank', [[], ['', null]])).toBeNull()
  })

  it('is the same function the workbook reader exposes', () => {
    expect(viaParse).toBe(sheetFromRows)
  })
})

describe('the messy sample import stays off SheetJS', () => {
  it('sees SheetJS where it is loaded', () => {
    expect(staticGraph(join(SRC, 'data/import/index.ts')).packages).toContain('xlsx')
  })

  it('loads no xlsx package and not the workbook reader at start-up', () => {
    const { files, packages } = staticGraph(join(SRC, 'data/sample/raw/seed.ts'))
    expect(files.size).toBeGreaterThan(5)
    expect([...packages].filter((p) => p === 'xlsx' || p.startsWith('xlsx/'))).toEqual([])
    expect([...files].filter((f) => /[\\/]data[\\/]import[\\/](parse|index)\.ts$/.test(f))).toEqual([])
  })
})
