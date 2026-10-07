/**
 * My team's house rules, read from its source: every Figure names its metric and fields, no em dash
 * sits in a sentence, nothing reads as a nagging ask, and the page never draws on the views and
 * records Manager mode leaves out (pay, surveys, HR ops cases, compliance, exit reasons, flight risk).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('./', import.meta.url)
const files = [
  'index.tsx',
  ...readdirSync(new URL('./ui/', dir)).map((f) => `ui/${f}`),
  ...readdirSync(new URL('./engine/', dir)).map((f) => `engine/${f}`),
].filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
const text = (f: string) => readFileSync(new URL(f, dir), 'utf8')

describe('My team source', () => {
  it('declares a metric and its lineage on every Figure, before any arrow in its props', () => {
    let count = 0
    for (const file of files.filter((f) => f.endsWith('.tsx'))) {
      for (const f of text(file).split('<Figure').slice(1)) {
        if (!/^\s/.test(f)) continue
        count++
        const props = f.slice(0, f.indexOf('>'))
        expect(props, file).toMatch(/\bmetric=\{/)
        expect(props, file).toMatch(/\buses=\{/)
      }
    }
    expect(count).toBeGreaterThanOrEqual(15)
  })

  it('writes no em dash into a sentence and no exclamation mark', () => {
    for (const f of files) {
      expect(text(f), f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(text(f), f).not.toMatch(/'[^'\n]*!'/)
    }
  })

  it('reads none of the views or measures Manager mode leaves out', () => {
    for (const f of files) {
      const t = text(f)
      for (const banned of [
        '@/views/comp',
        '@/views/services',
        '@/views/compliance',
        '@/views/listening',
        'exitReasons',
        'flightRisk',
        'riskBand',
        'modelRisk',
        'riskOfLoss',
        'showPay',
      ])
        expect(t.includes(banned), `${f}: ${banned}`).toBe(false)
    }
  })
})
