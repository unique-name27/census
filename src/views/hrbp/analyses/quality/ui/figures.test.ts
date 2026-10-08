/**
 * Quality of hire's panel, read as source (docs/ANALYSES.md, 2.6 and 7.6): every figure is a
 * `Figure` with a registered metric, lineage and definitions from the dictionary, drawn with an
 * id from `../engine/ids`; every id is drawn; and the copy is plain, with no em dash in a sentence,
 * no exclamation mark and nothing that tells a reader to choose or avoid a school.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATALOG } from '@/metrics/catalog'
import { QUALITY_FIGURES } from '../engine/ids'
import { QID } from '../engine/metrics'

const read = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(dir, f), 'utf8') }))
const ui = read(fileURLToPath(new URL('.', import.meta.url)))
const engine = read(fileURLToPath(new URL('../engine', import.meta.url)))

describe('the panel', () => {
  it('wraps every chart in a Figure with a metric, lineage and dictionary definitions', () => {
    const text = ui.map((u) => u.text).join('\n')
    const figures = text.split('<Figure').length - 1
    // Five Figures: the range charts share one (degree level, field of study, source).
    expect(figures).toBe(5)
    // The props of each <Figure …> element, up to its first child.
    const opened = text
      .split('<Figure')
      .slice(1)
      .map((t) => t.slice(0, t.indexOf('\n    >')))
    for (const props of opened)
      for (const prop of ['metric={', 'uses={', 'definitions={', 'id={']) expect(props, prop).toContain(prop)
    expect(text).not.toMatch(/definitions=\{\[\s*\{/)
    for (const [, key] of text.matchAll(/\bQID\.(\w+)/g)) expect(Object.keys(QID)).toContain(key)
    for (const id of Object.values(QID)) expect(CATALOG.byId.has(id), id).toBe(true)
    // Every figure id is drawn, from the ids module (never a literal).
    for (const key of Object.keys(QUALITY_FIGURES)) expect(text, key).toMatch(new RegExp(`\\bF\\.${key}\\b`))
    expect(text).not.toMatch(/id="hrbp-quality/)
  })

  it('writes plain copy, and never tells a reader to hire from or avoid a school', () => {
    for (const { file, text } of [...ui, ...engine]) {
      const strings = [...text.matchAll(/(['`"])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((x) => x[2])
      for (const s of strings) {
        expect(s, file).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
        expect(s, file).not.toMatch(/!\s*$|!\s/)
        expect(s.toLowerCase(), file).not.toMatch(
          /hire more from|avoid (hiring|this school|the school)|\bchas(e|ing)\b|\bnag(ging)?\b/,
        )
      }
    }
  })
})
