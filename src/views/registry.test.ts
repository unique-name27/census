import { describe, expect, it } from 'vitest'
import { DATASET_KEYS, DATASETS, type ViewKey } from '@/data/schema'
import { VIEWS } from './registry'

/** Views that declare a dataset in `ViewDef.datasets`, in folder-tab order. */
function readers(key: string): ViewKey[] {
  return VIEWS.filter((v) => v.datasets.includes(key as never)).map((v) => v.key)
}

describe('DATASETS[].usedBy', () => {
  it('names exactly the views that declare the dataset', () => {
    for (const def of DATASETS) {
      expect(new Set(def.usedBy), def.key).toEqual(new Set(readers(def.key)))
    }
  })

  it('lists each view once, in folder-tab order', () => {
    const order = VIEWS.map((v) => v.key)
    for (const def of DATASETS) {
      expect(new Set(def.usedBy).size, def.key).toBe(def.usedBy.length)
      expect(def.usedBy, def.key).toEqual([...def.usedBy].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  })

  it('every view reads only known datasets, and every dataset is read by some view', () => {
    for (const v of VIEWS) for (const d of v.datasets) expect(DATASET_KEYS, v.key).toContain(d)
    for (const def of DATASETS) expect(readers(def.key).length, def.key).toBeGreaterThan(0)
  })
})
