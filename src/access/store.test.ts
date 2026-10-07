/**
 * The mode store (docs/ROLES.md, 1.4 and 6.8 test 4): `census:mode` round trips; a corrupt,
 * unknown or missing value is HR; storage that throws still gives a working store; Manager mode
 * without a manager opens the picker and keeps the mode; the mode is not in the settings file, and
 * "Clear everything" removes it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  keys: async () => [],
}))

class MemoryStorage {
  m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}

/** A fresh copy of the store module, reading `raw` from `census:mode` as it is created. */
async function freshStore(storage: Storage | MemoryStorage) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  return import('./store')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('census:mode', () => {
  it('reads anything missing, corrupt or unknown as HR', async () => {
    const { parseStoredMode } = await import('./store')
    const hr = { v: 1, mode: 'hr', managerId: null }
    expect(parseStoredMode(null)).toEqual(hr)
    expect(parseStoredMode('')).toEqual(hr)
    expect(parseStoredMode('{not json')).toEqual(hr)
    expect(parseStoredMode('"manager"')).toEqual(hr)
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'admin' }))).toEqual(hr)
    expect(parseStoredMode(JSON.stringify({ v: 2, mode: 'manager', managerId: 'E1' }))).toEqual(hr)
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'manager', managerId: 42 }))).toEqual({
      v: 1,
      mode: 'manager',
      managerId: null,
    })
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'developer', managerId: 'E1' }))).toEqual({
      v: 1,
      mode: 'developer',
      managerId: 'E1',
    })
  })

  it('round trips: a choice is written, and a new page reads it back', async () => {
    const storage = new MemoryStorage()
    const a = await freshStore(storage)
    expect(a.useMode.getState().mode).toBe('hr')
    a.useMode.getState().chooseManager('E10421')
    expect(JSON.parse(storage.getItem(a.MODE_KEY) ?? 'null')).toEqual({
      v: 1,
      mode: 'manager',
      managerId: 'E10421',
    })
    a.useMode.getState().setMode('developer')
    const b = await freshStore(storage)
    expect(b.useMode.getState()).toMatchObject({ mode: 'developer', managerId: 'E10421', picking: false })
    // Back to Manager mode: the manager was kept, so no new pick.
    b.useMode.getState().setMode('manager')
    expect(b.useMode.getState()).toMatchObject({ mode: 'manager', managerId: 'E10421', picking: false })
  })

  it('works on storage that throws', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
      key: () => null,
      length: 0,
      clear: () => undefined,
    }
    const s = await freshStore(throwing)
    expect(s.useMode.getState().mode).toBe('hr')
    s.useMode.getState().chooseManager('E1')
    expect(s.useMode.getState()).toMatchObject({ mode: 'manager', managerId: 'E1' })
    s.useMode.getState().setMode('hr')
    expect(s.useMode.getState().mode).toBe('hr')
  })

  it('opens the picker for Manager mode without a manager and keeps the mode until one is chosen', async () => {
    const storage = new MemoryStorage()
    const s = await freshStore(storage)
    s.useMode.getState().setMode('manager')
    expect(s.useMode.getState()).toMatchObject({ mode: 'hr', picking: true })
    expect(storage.getItem(s.MODE_KEY)).toBeNull()
    s.useMode.getState().cancelPick()
    expect(s.useMode.getState()).toMatchObject({ mode: 'hr', picking: false })
    s.useMode.getState().setMode('manager')
    s.useMode.getState().chooseManager('E7')
    expect(s.useMode.getState()).toMatchObject({ mode: 'manager', managerId: 'E7', picking: false })
  })

  it('is not part of the settings file, and Clear everything removes it', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    const s = await freshStore(storage)
    s.useMode.getState().chooseManager('E10421')
    const { settingsBlob, DEFAULT_SETTINGS } = await import('@/data/settings')
    const text = await settingsBlob(DEFAULT_SETTINGS, new Date('2026-10-01T00:00:00Z')).text()
    expect(text).not.toMatch(/"mode"|census:mode|E10421/)
    const { clearCensusStorage } = await import('@/data/quality/storage')
    await clearCensusStorage()
    expect(storage.getItem(s.MODE_KEY)).toBeNull()
  })
})
