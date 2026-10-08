/**
 * Lineage for the Compensation view: every field a KPI, figure or finding declares exists in the
 * schema, every one of them declares at least one, every <Figure> in the tabs passes the uses of
 * its own id, and on the sample company no declared field is empty in every row.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Finding, Kpi } from '@/components/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { FIELD_REFS, type FieldRef, invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import {
  annualRatingUses,
  BY,
  COMPA,
  dimUses,
  FIGURE_IDS,
  jobUses,
  MARKET,
  MARKET_VS_MID,
  MERIT,
  POPULATION,
  POSITION,
  PROMOTED,
  RATING,
  refs,
  VOLUNTARY_ATTRITION,
} from './lineage'
import { type CompModel, computeComp } from './model'
import { DEFAULT_SETTINGS } from './settings'

const VIEW_DATASETS: readonly DatasetKey[] = ['comp', 'employees', 'reviews', 'jobChanges']

let data: Datasets

function sampleContext(filters: Partial<Filters> = {}, showPay = false): AnalyticsContext {
  const sources = Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
  ) as Record<DatasetKey, SourceMeta>
  return buildContext({
    data,
    sources,
    filters: { ...DEFAULT_FILTERS, ...filters },
    asOfOverride: null,
    showPay,
  })
}

/** Models over the scopes that reach every finding branch: company, a low-pay location, pay shown. */
const models: { label: string; ctx: AnalyticsContext; m: CompModel }[] = []

beforeAll(() => {
  data = generateSample()
  const scopes: [string, Partial<Filters>, boolean][] = [
    ['company', {}, false],
    ['company with pay amounts', {}, true],
    ['Bengaluru', { location: ['Bengaluru'] }, true],
    ['Go-to-Market', { businessUnit: ['Go-to-Market'] }, false],
  ]
  for (const [label, filters, showPay] of scopes) {
    const ctx = sampleContext(filters, showPay)
    models.push({ label, ctx, m: computeComp(ctx, DEFAULT_SETTINGS) })
  }
})

const all = (m: CompModel): (Kpi | Finding)[] => [...m.kpis, ...m.cycle.kpis, ...m.findings]

describe('compensation lineage', () => {
  it('names only schema fields in its building blocks', () => {
    const groups = { POPULATION, COMPA, POSITION, MARKET, MARKET_VS_MID, MERIT, RATING, PROMOTED }
    for (const [name, g] of Object.entries(groups)) expect(invalidRefs(g), name).toEqual([])
    expect(invalidRefs([...VOLUNTARY_ATTRITION, ...Object.values(BY)])).toEqual([])
    expect(invalidRefs(annualRatingUses(null))).toEqual([])
    expect(new Set(FIELD_REFS).has('employees.terminationType')).toBe(true)
  })

  it('merges groups in order without repeats and skips what is not used', () => {
    expect(
      refs(['comp.baseSalary', 'comp.rangeMid'], 'comp.baseSalary', false, null, 'comp.fxToUsd'),
    ).toEqual(['comp.baseSalary', 'comp.rangeMid', 'comp.fxToUsd'])
    expect(COMPA).toContain('employees.terminationDate')
    // The defining field leads, so it explains the badge when fields tie.
    expect([COMPA[0], POSITION[0], MARKET[0], MERIT[0]]).toEqual([
      'comp.rangeMid',
      'comp.rangeMin',
      'comp.marketP50',
      'comp.meritPct',
    ])
    expect(dimUses('promoted')).toEqual(PROMOTED)
    expect(dimUses('location')).toEqual(['employees.location'])
    expect(dimUses('tenureBand')).toEqual(['employees.hireDate'])
    expect(dimUses(undefined)).toEqual([])
  })

  it('lists job function only when the roster has one, and potential only when no cycle is named annual', () => {
    expect(jobUses({ has: { jobFunction: false } as CompModel['pop']['has'] })).toEqual([
      'employees.department',
    ])
    expect(jobUses({ has: { jobFunction: true } as CompModel['pop']['has'] })).toEqual([
      'employees.jobFunction',
      'employees.department',
    ])
    expect(annualRatingUses('2025 Annual')).not.toContain('reviews.potential')
    expect(annualRatingUses('2025 H2')).toContain('reviews.potential')
    expect(annualRatingUses('2025 Annual')).toContain('reviews.cycle')
  })

  it('every KPI and finding on the sample declares schema fields', () => {
    for (const { label, m } of models) {
      expect(m.findings.length, label).toBeGreaterThan(0)
      for (const x of all(m)) {
        const where = `${label}: ${x.id}`
        expect(x.uses?.length ?? 0, where).toBeGreaterThan(0)
        expect(invalidRefs(x.uses ?? []), where).toEqual([])
        expect(new Set(x.uses).size, `${where} repeats a field`).toBe(x.uses!.length)
      }
    }
  })

  it('every figure declares schema fields', () => {
    for (const { label, m } of models) {
      expect(Object.keys(m.uses).sort(), label).toEqual([...FIGURE_IDS].sort())
      for (const id of FIGURE_IDS) {
        expect(m.uses[id].length, `${label}: ${id}`).toBeGreaterThan(0)
        expect(invalidRefs(m.uses[id]), `${label}: ${id}`).toEqual([])
      }
    }
  })

  it('counts pay amount columns and the cost to minimum only while amounts are shown', () => {
    const [hidden, shown] = models
    expect(hidden.m.uses['comp-below-minimum']).not.toContain('comp.fxToUsd')
    expect(shown.m.uses['comp-below-minimum']).toContain('comp.fxToUsd')
    const below = (m: CompModel) => m.findings.find((f) => f.id === 'comp-below-min')!
    expect(below(hidden.m).uses).not.toContain('comp.fxToUsd')
    expect(below(shown.m).uses).toContain('comp.fxToUsd')
  })

  it('declares exactly what each sample story reads', () => {
    const { m } = models[0]
    const f = (id: string) => m.findings.find((x) => x.id === id)!
    // Bengaluru pay is tied to its voluntary attrition, so termination type and dates count.
    const blr = f('comp-low-compa-location-Bengaluru').uses!
    for (const r of [...COMPA, ...VOLUNTARY_ATTRITION, 'employees.location']) expect(blr).toContain(r)
    expect(blr).not.toContain('comp.meritPct')
    // Below minimum names Bengaluru and recent promotions.
    expect(f('comp-below-min').uses).toEqual(
      refs(POSITION, 'employees.department', 'employees.location', PROMOTED),
    )
    expect(m.kpis.find((k) => k.id === 'p4p')!.uses).toEqual(refs(MERIT, RATING))
    expect(m.kpis.find((k) => k.id === 'merit-spend')!.uses).toEqual(refs(MERIT, 'comp.fxToUsd'))
  })

  it('no declared field is empty in every row of the sample', () => {
    for (const { label, ctx, m } of models) {
      const items: [string, readonly FieldRef[] | undefined][] = [
        ...all(m).map((x) => [x.id, x.uses] as [string, readonly FieldRef[] | undefined]),
        ...FIGURE_IDS.map((id) => [id, m.uses[id]] as [string, readonly FieldRef[]]),
      ]
      for (const [id, uses] of items)
        expect(ctx.quality.tierOf(uses, VIEW_DATASETS), `${label}: ${id}`).not.toBe('none')
    }
  })
})

/** The tab sources, to check each <Figure> passes the uses of its own id. */
const TABS = import.meta.glob('../tabs/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('compensation figures in the tabs', () => {
  it('pass uses for their own id', () => {
    const seen: string[] = []
    for (const [path, src] of Object.entries(TABS)) {
      const blocks = src.split('<Figure').slice(1)
      for (const b of blocks) {
        const id = /^\s+id="([^"]+)"/.exec(b)?.[1]
        expect(id, `${path}: a Figure without a literal id`).toBeTruthy()
        expect(b, `${path}: ${id}`).toMatch(new RegExp(`^\\s+id="${id}"\\s+uses=\\{m\\.uses\\['${id}'\\]\\}`))
        seen.push(id!)
      }
    }
    expect(seen.sort()).toEqual([...FIGURE_IDS].sort())
  })
})
