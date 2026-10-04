/**
 * The Mapping panel names the values the importer standardized on its own, so a column whose
 * spellings were changed never reads "Read as is".
 */
import { describe, expect, it } from 'vitest'
import { buildSampleState } from '@/data/quality/seed'
import { rawSpellings } from '@/data/reference/spellings'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { buildMessySample } from '@/data/sample/raw'
import { datasetDef } from '@/data/schema'
import { lineageRows, type Spelling, standardizedOf, standardizedText } from './lineage'

describe('standardizedOf', () => {
  const spellings: Spelling[] = [
    { raw: 'L4', value: 'L4', count: 300 },
    { raw: 'IC4', value: 'L4', count: 120 },
    { raw: 'IC2', value: 'L2', count: 40 },
    { raw: 'M1', value: 'M1', count: 30 },
    { raw: 'ic 3', value: 'L3', count: 5 },
    { raw: 'Lvl 9', value: null, count: 2 },
  ]

  it('counts the values read as a different canonical value, most common first', () => {
    const s = standardizedOf(spellings)!
    expect(s.total).toBe(165)
    expect(s.examples).toEqual([
      { from: 'IC4', to: 'L4' },
      { from: 'IC2', to: 'L2' },
    ])
    expect(standardizedText(s)).toBe('165 values standardized, such as IC4 → L4 and IC2 → L2')
  })

  it('leaves out values corrected by hand and is null when everything was read as is', () => {
    expect(standardizedOf(spellings, { ic4: 'L4', ic2: 'L2', 'ic 3': 'L3' })).toBeNull()
    expect(standardizedOf([{ raw: 'L4', value: 'L4', count: 3 }])).toBeNull()
    expect(standardizedOf(undefined)).toBeNull()
  })
})

describe('the messy sample', () => {
  it('names the standardized change types and levels of the Job changes extract', () => {
    const base = generateSample()
    const messy = buildMessySample(base)
    const state = buildSampleState(base, messy.seed, SAMPLE_AS_OF)
    const version = state.versions.jobChanges
    const sheet = messy.seed.jobChanges!.raw!
    const spellings = Object.fromEntries(
      Object.entries(rawSpellings('jobChanges', sheet, version.mapping, version.applyOptions)).map(
        ([ref, list]) => [ref.slice(ref.indexOf('.') + 1), list ?? []],
      ),
    )
    const rows = lineageRows(datasetDef('jobChanges'), version, undefined, spellings)
    for (const field of ['changeType', 'fromLevel', 'toLevel']) {
      const r = rows.find((x) => x.field === field)!
      expect(
        r.conversions.some((c) => /values? standardized, such as /.test(c)),
        field,
      ).toBe(true)
    }
  }, 60_000)
})
