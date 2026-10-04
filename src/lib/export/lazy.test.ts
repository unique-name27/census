/**
 * The export library loads on demand (ExportMenu, the drill panel and the Data room import it with
 * `import()`). One static value import of the barrel pulls it all into the main chunk, so app code
 * imports single modules (e.g. '@/lib/export/clipboard') when it needs one up front.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('the export library stays lazy', () => {
  it('has no static value import of the @/lib/export barrel in app code', () => {
    const offenders = sources(SRC)
      .filter((f) => !relative(SRC, f).replace(/\\/g, '/').startsWith('lib/export/'))
      .filter((f) =>
        [
          ...readFileSync(f, 'utf8').matchAll(
            /^(?:import|export)\s+(type\s+)?[^'";]*?from\s+'@\/lib\/export'/gm,
          ),
        ].some((m) => !m[1]),
      )
      .map((f) => relative(SRC, f).replace(/\\/g, '/'))
    expect(offenders).toEqual([])
  })
})
