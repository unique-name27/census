/**
 * The scorecard's dictionary entries and house rules: they pass the catalog checks, their lineage
 * is the measures' fields, every setting is read through `ctx.metrics` and changes what it
 * governs, and every Figure in the UI names its metric and fields.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import { metricsWith, paramsOfView, recordParamReads } from '@/metrics/testing'
import { VIEWS } from '@/views/registry'
import { computeScorecard } from './engine/schedule'
import { sampleContext } from './engine/testkit'
import { DEFAULTS, M, MEASURE_IDS, MEASURE_USES, measureDef, metrics } from './metrics'

describe('the registry', () => {
  it('passes the catalog checks, every entry at home on the scorecard', () => {
    expect(validateCatalog(metrics)).toEqual([])
    for (const d of metrics) {
      expect(d.id.startsWith('scorecard.'), d.id).toBe(true)
      expect(d.views[0], d.id).toBe('scorecard')
      expect(CATALOG.byId.get(d.id), d.id).toBe(d)
      if (d.kind !== 'setting') expect(d.uses.length, d.id).toBeGreaterThan(0)
    }
    expect(Object.values(M).sort()).toEqual(metrics.map((d) => d.id).sort())
  })

  it("reads the measures' own entries for its lineage, so the dictionary shows what it is built from", () => {
    for (const id of MEASURE_IDS) expect(measureDef(id), id).toBeTruthy()
    for (const id of MEASURE_IDS)
      for (const ref of measureDef(id)?.uses ?? []) expect(MEASURE_USES, `${id} ${ref}`).toContain(ref)
    expect(CATALOG.byId.get(M.status)?.uses).toEqual(MEASURE_USES)
    expect(CATALOG.byId.get(M.targetsMet)?.uses).toEqual(MEASURE_USES)
  })

  it('keeps targets on the measures: none of its own entries holds one', () => {
    for (const d of metrics) expect(d.target, d.id).toBeUndefined()
  })
})

describe('settings are read through the registry', () => {
  it('reads every scorecard setting when the scorecard is computed', () => {
    const { metrics: api, reads } = recordParamReads(metricsWith({}))
    computeScorecard(sampleContext({ metrics: api }), VIEWS)
    // The privacy rules list every view and so start at the scorecard; only its own entries count.
    const own = paramsOfView('scorecard').filter((ref) => ref.startsWith('scorecard.'))
    expect(own).toHaveLength(4)
    for (const ref of own) expect(reads, ref).toContain(ref)
  })

  it('changes what each setting governs', () => {
    const base = computeScorecard(sampleContext(), VIEWS)
    expect(base.limit).toBe(DEFAULTS.limit)
    expect(base.counts.watch).toBeGreaterThan(0)
    const strict = computeScorecard(
      sampleContext({ metrics: metricsWith({ [M.watch]: { shareMargin: 0, relativeMargin: 0 } }) }),
      VIEWS,
    )
    expect(strict.counts.watch).toBe(0)
    expect(strict.counts.missed).toBe(base.counts.missed + base.counts.watch)
    const few = computeScorecard(sampleContext({ metrics: metricsWith({ [M.top]: { limit: 3 } }) }), VIEWS)
    expect(few.findings.top.filter((s) => s.view !== 'scorecard')).toHaveLength(3)
    const quiet = computeScorecard(
      sampleContext({ metrics: metricsWith({ [M.missed]: { minPractices: 9 } }) }),
      VIEWS,
    )
    expect(base.own).not.toBeNull()
    expect(quiet.own).toBeNull()
  })
})

describe('the UI', () => {
  it('declares a metric and its lineage on every Figure', () => {
    const dir = new URL('./ui/', import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    let count = 0
    for (const file of files) {
      const text = readFileSync(new URL(file, dir), 'utf8')
      for (const f of text.split('<Figure').slice(1)) {
        if (!/^\s/.test(f)) continue
        count++
        const props = f.slice(0, f.indexOf('>'))
        expect(props, file).toMatch(/\bmetric=\{/)
        expect(props, file).toMatch(/\buses=\{/)
      }
    }
    expect(count).toBeGreaterThan(0)
  })

  it('writes no em dash into a sentence', () => {
    const dir = new URL('./', import.meta.url)
    const files = [
      ...readdirSync(new URL('./ui/', dir)).map((f) => `ui/${f}`),
      ...readdirSync(new URL('./engine/', dir)).map((f) => `engine/${f}`),
      'metrics.ts',
    ].filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), 'utf8')
      expect(text, f).not.toMatch(/[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(]/)
      expect(text, f).not.toMatch(/'[^'\n]*!'/)
    }
  })
})
