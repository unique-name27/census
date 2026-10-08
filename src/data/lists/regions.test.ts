/**
 * The Regions official list and its regional HR business partners (docs/ACTION-CENTER-AUDIT.md 5.8
 * and part 8, question 3; docs/ROLES-V2.md "Decisions made"): Census's three regions, the sample
 * company's partner for each, one you name in Settings, and none from the sample's list once your
 * own data is loaded.
 */
import { describe, expect, it } from 'vitest'
import { cachedSample } from '../sample'
import { DATASET_KEYS, emptyDatasets, REGIONS } from '../schema'
import { listDef } from './defs'
import { applyEdit, EMPTY_LISTS } from './edit'
import { effectiveLists, officialLists, type SourceKinds } from './effective'
import { regionOwners } from './regions'

const kinds = (upload: readonly string[]): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: upload.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds
const SAMPLE = kinds([])
const YOURS = kinds(['employees'])

describe('the Regions list', () => {
  it('holds the three regions Census reads, each with an HR business partner attribute', () => {
    const def = listDef('region')
    expect(def).toMatchObject({ kind: 'fixed', refs: [], reads: ['employees'] })
    expect(def.attrs.map((a) => a.key)).toEqual(['hrbp'])
    const yours = officialLists(EMPTY_LISTS, YOURS).region
    expect(yours?.values.map((v) => v.value)).toEqual([...REGIONS])
    expect(yours?.source).toBe('census')
    expect(yours?.values.every((v) => v.attrs?.hrbp == null)).toBe(true)
  })

  it('names the sample company’s regional HR business partners while the sample is loaded', () => {
    const list = officialLists(EMPTY_LISTS, SAMPLE).region
    expect(list?.source).toBe('sample')
    expect(Object.fromEntries(regionOwners(EMPTY_LISTS, SAMPLE))).toEqual({
      // The most senior HR business partner at the region's sites.
      Americas: 'Bhavana Joshi',
      APAC: 'Ya-Wen Chang',
      // No HR business partner works in EMEA: the unit HRBP who covers most of its people.
      EMEA: 'Michael Thomas',
    })
    // Each is a person on the sample roster.
    const names = new Set(cachedSample().employees.map((e) => e.name))
    for (const who of regionOwners(EMPTY_LISTS, SAMPLE).values()) expect(names.has(who), who).toBe(true)
  })

  it('names nobody for your own data until you name someone, and then that person', () => {
    expect(regionOwners(EMPTY_LISTS, YOURS).size).toBe(0)
    const data = emptyDatasets()
    const r = applyEdit(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, data, YOURS), {
      kind: 'attrs',
      list: 'region',
      value: 'EMEA',
      attrs: { hrbp: 'Lena Ortiz' },
    })
    if (!r.ok) throw new Error(r.error)
    expect(Object.fromEntries(regionOwners(r.state, YOURS))).toEqual({ EMEA: 'Lena Ortiz' })
    // Census's list with your change: it stays in force whatever data is loaded.
    expect(regionOwners(r.state, SAMPLE).get('EMEA')).toBe('Lena Ortiz')
  })

  it('leaves the sample’s partners out of your own data when the list was saved from the sample', () => {
    const data = emptyDatasets()
    const r = applyEdit(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, data, SAMPLE), {
      kind: 'attrs',
      list: 'region',
      value: 'APAC',
      attrs: { hrbp: 'Ananya Gowda' },
    })
    if (!r.ok) throw new Error(r.error)
    expect(regionOwners(r.state, SAMPLE).get('APAC')).toBe('Ananya Gowda')
    expect(officialLists(r.state, YOURS).region?.paused).toBe('sample')
    expect(regionOwners(r.state, YOURS).size).toBe(0)
  })

  it('keeps the same map for the same lists and data kinds', () => {
    expect(regionOwners(EMPTY_LISTS, SAMPLE)).toBe(regionOwners(EMPTY_LISTS, kinds([])))
  })
})

describe('the change log for a regional HR business partner', () => {
  it('keeps the acronym in the sentence', () => {
    const r = applyEdit(EMPTY_LISTS, effectiveLists(EMPTY_LISTS, emptyDatasets(), YOURS), {
      kind: 'attrs',
      list: 'region',
      value: 'APAC',
      attrs: { hrbp: 'Ananya Gowda' },
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.change.what).toBe('Changed the HR business partner of region "APAC".')
  })
})
