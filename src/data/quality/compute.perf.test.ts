/** Time budgets for the quality index on the sample. Perf files run one at a time, after the unit tests. */
import { describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { generateSample, SAMPLE_AS_OF } from '../sample'
import { DATASET_KEYS } from '../schema'
import { computeQuality, type VersionMap } from './compute'
import { FIELD_REFS } from './fieldRef'
import { confirmVersion, makeVersion } from './versions'

describe('quality index on the sample', () => {
  const data = generateSample()
  const versions = Object.fromEntries(
    DATASET_KEYS.map((k) => [
      k,
      confirmVersion(
        makeVersion({ dataset: k, source: 'sample', rows: data[k] as object[] }),
        'Jamie',
        '2026-10-02T10:00:00.000Z',
      ),
    ]),
  ) as VersionMap
  // A fresh version map each run, so the memo misses and every tier is evaluated from scratch.
  const index = () => computeQuality(data, { ...versions }, undefined, { asOf: SAMPLE_AS_OF })

  it('evaluates every dataset tier in under 60 ms', () => {
    const ms = bestCostMs(() => {
      const q = index()
      for (const k of DATASET_KEYS) q.datasetTier(k)
    })
    expect(ms).toBeLessThan(60)
  })

  it('evaluates every dataset and field tier in under 400 ms', () => {
    const ms = bestCostMs(() => {
      const q = index()
      for (const k of DATASET_KEYS) q.datasetTier(k)
      for (const ref of FIELD_REFS) q.fieldTier(ref)
    })
    expect(ms).toBeLessThan(400)
  })
})
