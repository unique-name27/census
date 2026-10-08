import { describe, expect, it } from 'vitest'
import { DATASET_KEYS, DATASETS, VIEW_KEYS, VIEW_LABEL, type ViewKey } from '@/data/schema'
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

describe('folder tabs', () => {
  it('open on Home, My team and the scorecard and follow the employee lifecycle, every view key once', () => {
    expect(VIEWS.map((v) => v.key)).toEqual([
      'home',
      'team',
      'scorecard',
      'recruiting',
      'onboarding',
      'hrbp',
      'org',
      'services',
      'talent',
      'comp',
      'compliance',
      'listening',
      'ai',
    ])
    expect(VIEWS.map((v) => v.key)).toEqual([...VIEW_KEYS])
    for (const v of VIEWS) expect(v.label, v.key).toBe(VIEW_LABEL[v.key])
  })

  it('give each view at least one tab with a unique key', () => {
    for (const v of VIEWS) {
      expect(v.tabs.length, v.key).toBeGreaterThan(0)
      expect(new Set(v.tabs.map((t) => t.key)).size, v.key).toBe(v.tabs.length)
    }
  })
})
