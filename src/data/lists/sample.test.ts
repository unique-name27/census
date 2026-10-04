/**
 * The hard rule for official lists: on the sample company, with the lists Census ships, every
 * dataset and every field keeps exactly the tier (and the count of values not recognized) it has
 * without them.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { qualityFor, referenceLayer } from '../context'
import type { ImportIssue } from '../import/types'
import { computeQuality, type QualityIndex } from '../quality'
import { buildSampleState } from '../quality/seed'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import { buildMessySample, RAW_DATASETS, SAMPLE_TIERS, starterSample } from '../sample/raw'
import { DATASET_KEYS, type DatasetKey, type Datasets } from '../schema'
import { analyzeLists } from './analyze'
import { EMPTY_LISTS } from './edit'
import { effectiveLists, type SourceKinds, validationVocab } from './effective'

const SAMPLE: SourceKinds = Object.fromEntries(
  DATASET_KEYS.map((k) => [k, { kind: 'sample' }]),
) as SourceKinds

let base: Datasets
beforeAll(() => {
  base = generateSample()
})

/** Every dataset tier, and every field's tier and count of values not recognized. */
function snapshot(q: QualityIndex) {
  const out: Record<string, string> = {}
  for (const k of DATASET_KEYS) {
    out[k] = q.datasetTier(k)
    for (const f of q.fields(k)) out[f.ref] = `${f.tier} ${f.invalid}`
  }
  return out
}

describe('official lists on the sample company', () => {
  it('check the org fields, so the comparison below means something', () => {
    const vocab = validationVocab(EMPTY_LISTS, SAMPLE)
    for (const ref of [
      'employees.department',
      'requisitions.department',
      'hiringPlan.businessUnit',
      'employees.costCenter',
      'cases.location',
      'employees.jobFamily',
    ])
      expect(vocab.refs.has(ref), ref).toBe(true)
    expect(vocab.refs.get('requisitions.department')?.has('Photonics')).toBe(false)
    expect(validationVocab(EMPTY_LISTS, SAMPLE)).toBe(vocab)
  })

  it('leave every tier of the starter sample exactly as it is', () => {
    const starter = starterSample(base)
    const state = buildSampleState(base, starter.seed, SAMPLE_AS_OF)
    const without = computeQuality(state.data, state.versions, undefined, { asOf: SAMPLE_AS_OF })
    const withLists = computeQuality(state.data, state.versions, undefined, {
      asOf: SAMPLE_AS_OF,
      vocab: validationVocab(EMPTY_LISTS, SAMPLE),
    })
    expect(withLists).not.toBe(without)
    expect(snapshot(withLists)).toEqual(snapshot(without))
    expect(Object.fromEntries(DATASET_KEYS.map((k) => [k, withLists.datasetTier(k)]))).toEqual(SAMPLE_TIERS)
  })

  it('leave every tier of the imported messy sample, with its import logs, exactly as it is', () => {
    const messy = buildMessySample(base)
    const state = buildSampleState(base, messy.seed, SAMPLE_AS_OF)
    const issues: Partial<Record<DatasetKey, readonly ImportIssue[]>> = {}
    for (const k of RAW_DATASETS) issues[k] = messy.imports[k].result.issues
    const without = computeQuality(state.data, state.versions, issues, { asOf: SAMPLE_AS_OF })
    const withLists = computeQuality(state.data, state.versions, issues, {
      asOf: SAMPLE_AS_OF,
      vocab: validationVocab(EMPTY_LISTS, SAMPLE),
    })
    expect(snapshot(withLists)).toEqual(snapshot(without))
  })

  it('leave the tiers the app shows (reference layer and context) as they are', () => {
    const starter = starterSample(base)
    const state = buildSampleState(base, starter.seed, SAMPLE_AS_OF)
    const applied = referenceLayer(state.data, [])
    const plain = qualityFor(applied, state.versions, SAMPLE_AS_OF)
    const lists = qualityFor(
      applied,
      state.versions,
      SAMPLE_AS_OF,
      undefined,
      validationVocab(EMPTY_LISTS, SAMPLE),
    )
    expect(snapshot(lists)).toEqual(snapshot(plain))
  })

  it('find nothing off the org lists, and the planted values off Census’s own lists', () => {
    const starter = starterSample(base)
    const state = buildSampleState(base, starter.seed, SAMPLE_AS_OF)
    const a = analyzeLists(effectiveLists(EMPTY_LISTS, state.data, SAMPLE), state.data)
    for (const id of [
      'businessUnit',
      'department',
      'jobFunction',
      'jobFamily',
      'location',
      'costCenter',
    ] as const)
      expect(a[id].notOnList, id).toEqual([])
    // The old ATS department names are retired values in use, not missing ones.
    expect(a.department.uses.get('DV')?.total).toBe(22)
    expect(a.source.notOnListRows).toBe(399)
    expect(a.caseCategory.notOnListRows).toBe(165)
  })
})
