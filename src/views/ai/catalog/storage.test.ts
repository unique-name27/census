import { describe, expect, it } from 'vitest'
import { SAMPLE_AGENTS } from './sample'
import { clearCatalog, loadCatalog, parseSaved, STORAGE_KEY, type StorageLike, saveCatalog } from './storage'
import type { Agent } from './types'

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('catalog persistence', () => {
  it('starts from the sample when nothing is saved', () => {
    const s = memoryStorage()
    const loaded = loadCatalog(s)
    expect(loaded.isDefault).toBe(true)
    expect(loaded.agents).toEqual(SAMPLE_AGENTS)
    // A fresh copy: editing it never changes the shipped sample.
    expect(loaded.agents[0]).not.toBe(SAMPLE_AGENTS[0])
    expect(s.data.size).toBe(0)
  })

  it('round-trips an edited catalog through storage', () => {
    const s = memoryStorage()
    const edited: Agent[] = [
      { ...SAMPLE_AGENTS[0], status: 'Live', url: 'https://glean.example.com/agents/jd' },
      { ...SAMPLE_AGENTS[5], useFor: ['Only this'] },
    ]
    expect(saveCatalog(edited, s)).toBe(true)
    expect(s.data.has(STORAGE_KEY)).toBe(true)
    const loaded = loadCatalog(s)
    expect(loaded.isDefault).toBe(false)
    expect(loaded.agents).toEqual(edited)
  })

  it('keeps an emptied catalog empty instead of bringing the sample back', () => {
    const s = memoryStorage()
    saveCatalog([], s)
    expect(loadCatalog(s)).toEqual({ agents: [], isDefault: false })
  })

  it('reset to sample forgets the saved catalog', () => {
    const s = memoryStorage()
    saveCatalog([SAMPLE_AGENTS[1]], s)
    expect(clearCatalog(s)).toBe(true)
    expect(loadCatalog(s).isDefault).toBe(true)
  })

  it('falls back to the sample for unreadable or foreign values', () => {
    expect(loadCatalog(memoryStorage({ [STORAGE_KEY]: '{not json' })).isDefault).toBe(true)
    expect(loadCatalog(memoryStorage({ [STORAGE_KEY]: '{"version":2,"agents":[]}' })).isDefault).toBe(true)
    expect(loadCatalog(memoryStorage({ [STORAGE_KEY]: '{"version":1}' })).isDefault).toBe(true)
    expect(parseSaved(null)).toBeNull()
  })

  it('drops invalid agents and clears unsafe links on the way in', () => {
    const raw = JSON.stringify({
      version: 1,
      agents: [
        { ...SAMPLE_AGENTS[0], url: 'javascript:alert(1)' },
        { ...SAMPLE_AGENTS[1], area: 'finance' },
        {
          name: 'No guardrails',
          area: 'hrbp',
          audience: ['hr'],
          description: 'x.',
          useFor: ['y'],
          dontUseFor: [],
        },
        { ...SAMPLE_AGENTS[0], id: 'copy' },
      ],
    })
    const loaded = loadCatalog(memoryStorage({ [STORAGE_KEY]: raw }))
    expect(loaded.agents).toHaveLength(1)
    expect(loaded.agents[0]).toEqual({ ...SAMPLE_AGENTS[0], url: '' })
  })

  it('never throws when storage is blocked', () => {
    expect(loadCatalog(throwing)).toMatchObject({ isDefault: true })
    expect(saveCatalog(SAMPLE_AGENTS, throwing)).toBe(false)
    expect(clearCatalog(throwing)).toBe(false)
    expect(loadCatalog(null).isDefault).toBe(true)
    expect(saveCatalog(SAMPLE_AGENTS, null)).toBe(false)
  })
})
