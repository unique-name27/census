/**
 * The mode store (docs/ROLES-V2.md 1.4, 8.4 and 8.8 test 6): `census:mode` version 2 round trips
 * every mode and pick; a version 1 value migrates in place; a corrupt, unknown or missing value is
 * HR; storage that throws still gives a working store; picks are kept across mode changes; each
 * pick dialog opens when its mode is chosen without a pick; the mode is not in the settings file,
 * and "Clear everything" removes it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODES, type Mode, NO_PICKS, PICK_OF } from './modes'

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

/** A fresh copy of the store module, reading `census:mode` from `storage` as it is created. */
async function freshStore(storage: Storage | MemoryStorage) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  return import('./store')
}

const stored = (storage: MemoryStorage, key: string) => JSON.parse(storage.getItem(key) ?? 'null')

const HR = { v: 2, mode: 'hr', ...NO_PICKS }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('census:mode version 2', () => {
  it('reads anything missing, corrupt or unknown as HR', async () => {
    const { parseStoredMode } = await import('./store')
    expect(parseStoredMode(null)).toEqual(HR)
    expect(parseStoredMode('')).toEqual(HR)
    expect(parseStoredMode('{not json')).toEqual(HR)
    expect(parseStoredMode('"manager"')).toEqual(HR)
    expect(parseStoredMode('null')).toEqual(HR)
    expect(parseStoredMode(JSON.stringify({ v: 2, mode: 'admin' }))).toEqual(HR)
    expect(parseStoredMode(JSON.stringify({ v: 3, mode: 'finance' }))).toEqual(HR)
    expect(parseStoredMode(JSON.stringify({ mode: 'finance' }))).toEqual(HR)
    // Version 1 knew three modes only.
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'finance' }))).toEqual(HR)
  })

  it('migrates a version 1 value in place: HR, Manager and Developer, other picks null', async () => {
    const { parseStoredMode } = await import('./store')
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'hr', managerId: null }))).toEqual(HR)
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'manager', managerId: 'E10421' }))).toEqual({
      ...HR,
      mode: 'manager',
      managerId: 'E10421',
    })
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'developer', managerId: 'E1' }))).toEqual({
      ...HR,
      mode: 'developer',
      managerId: 'E1',
    })
    // A bad manager ID reads as none.
    expect(parseStoredMode(JSON.stringify({ v: 1, mode: 'manager', managerId: 42 }))).toEqual({
      ...HR,
      mode: 'manager',
    })
  })

  it('reads every mode and every pick, and drops a malformed pick', async () => {
    const { parseStoredMode } = await import('./store')
    const picks = {
      managerId: 'E10421',
      unit: 'Silicon Engineering',
      region: 'APAC',
      recruiter: { name: 'Maya Chen', id: 'E10877' },
    }
    for (const mode of MODES)
      expect(parseStoredMode(JSON.stringify({ v: 2, mode, ...picks })), mode).toEqual({
        v: 2,
        mode,
        ...picks,
      })
    expect(
      parseStoredMode(JSON.stringify({ v: 2, mode: 'recruiter', recruiter: { name: '*', id: null } }))
        .recruiter,
    ).toEqual({ name: '*', id: null })
    // A missing pick is null; a recruiter without a name is none; text is trimmed.
    expect(parseStoredMode(JSON.stringify({ v: 2, mode: 'hrbp-unit' }))).toEqual({ ...HR, mode: 'hrbp-unit' })
    expect(
      parseStoredMode(
        JSON.stringify({ v: 2, mode: 'recruiter', recruiter: { id: 'E1' }, unit: 7, region: '  EMEA ' }),
      ),
    ).toEqual({ ...HR, mode: 'recruiter', region: 'EMEA' })
  })

  it('writes version 2, and a version 1 value is written back as version 2 on the next change', async () => {
    const storage = new MemoryStorage()
    storage.setItem('census:mode', JSON.stringify({ v: 1, mode: 'manager', managerId: 'E10421' }))
    const a = await freshStore(storage)
    expect(a.useMode.getState()).toMatchObject({ mode: 'manager', managerId: 'E10421' })
    expect(a.useMode.getState().picks).toEqual({ ...NO_PICKS, managerId: 'E10421' })
    // Reading does not write.
    expect(stored(storage, a.MODE_KEY).v).toBe(1)
    a.useMode.getState().setMode('hr')
    expect(stored(storage, a.MODE_KEY)).toEqual({ ...HR, managerId: 'E10421' })
  })

  it('round trips every pick, and a new page reads them back', async () => {
    const storage = new MemoryStorage()
    const a = await freshStore(storage)
    const s = a.useMode.getState
    expect(s().mode).toBe('hr')
    s().chooseManager('E10421')
    s().choose({ kind: 'unit', unit: 'Silicon Engineering' })
    s().choose({ kind: 'region', region: 'APAC' })
    s().choose({ kind: 'recruiter', name: 'Maya Chen', id: 'E10877' })
    const all = {
      managerId: 'E10421',
      unit: 'Silicon Engineering',
      region: 'APAC',
      recruiter: { name: 'Maya Chen', id: 'E10877' },
    }
    expect(stored(storage, a.MODE_KEY)).toEqual({ v: 2, mode: 'recruiter', ...all })
    s().setMode('developer')
    const b = await freshStore(storage)
    expect(b.useMode.getState()).toMatchObject({
      mode: 'developer',
      picks: all,
      managerId: 'E10421',
      picking: null,
    })
  })

  it('keeps every pick when the mode changes, so coming back needs no new pick', async () => {
    const storage = new MemoryStorage()
    const s = (await freshStore(storage)).useMode.getState
    s().choose({ kind: 'unit', unit: 'Silicon Engineering' })
    s().choose({ kind: 'region', region: 'EMEA' })
    s().setMode('finance')
    s().setMode('hrbp-unit')
    expect(s()).toMatchObject({ mode: 'hrbp-unit', picking: null })
    expect(s().picks.unit).toBe('Silicon Engineering')
    s().setMode('hrbp-region')
    expect(s()).toMatchObject({ mode: 'hrbp-region', picking: null })
    expect(s().picks).toMatchObject({ unit: 'Silicon Engineering', region: 'EMEA' })
    // Changing one pick keeps the others.
    s().choose({ kind: 'unit', unit: 'Data Center Group' })
    expect(s().picks).toMatchObject({ unit: 'Data Center Group', region: 'EMEA' })
    expect(s().mode).toBe('hrbp-unit')
  })

  it('opens each pick dialog when its mode is chosen without a pick, and keeps the mode until one is made', async () => {
    for (const mode of MODES) {
      const kind = PICK_OF[mode]
      const storage = new MemoryStorage()
      const s = (await freshStore(storage)).useMode.getState
      s().setMode(mode)
      if (!kind) {
        expect(s(), mode).toMatchObject({ mode, picking: null })
        continue
      }
      expect(s(), mode).toMatchObject({ mode: 'hr', picking: kind })
      expect(storage.getItem('census:mode'), mode).toBeNull()
      s().cancelPick()
      expect(s(), mode).toMatchObject({ mode: 'hr', picking: null })
      s().setMode(mode)
      const pick =
        kind === 'manager'
          ? ({ kind, id: 'E7' } as const)
          : kind === 'unit'
            ? ({ kind, unit: 'Silicon Engineering' } as const)
            : kind === 'region'
              ? ({ kind, region: 'APAC' } as const)
              : ({ kind, name: 'Maya Chen', id: null } as const)
      s().choose(pick)
      expect(s(), mode).toMatchObject({ mode, picking: null, pickNote: null })
    }
  })

  it('opens a dialog with a note, and "Every recruiter" is a pick', async () => {
    const s = (await freshStore(new MemoryStorage())).useMode.getState
    s().openPicker('region', 'No location in the loaded data is in APAC. Pick again.')
    expect(s()).toMatchObject({
      picking: 'region',
      pickNote: 'No location in the loaded data is in APAC. Pick again.',
    })
    s().choose({ kind: 'recruiter', name: '*', id: null })
    expect(s()).toMatchObject({
      mode: 'recruiter',
      picking: null,
      picks: { recruiter: { name: '*', id: null } },
    })
  })

  it('follows a manager set directly (older callers), and writes it with the picks', async () => {
    const storage = new MemoryStorage()
    const a = await freshStore(storage)
    a.useMode.setState({ mode: 'manager', managerId: 'E2' })
    expect(a.picksOfState(a.useMode.getState()).managerId).toBe('E2')
    a.useMode.getState().setMode('hr')
    expect(stored(storage, a.MODE_KEY)).toMatchObject({ v: 2, mode: 'hr', managerId: 'E2' })
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
    s.useMode.getState().choose({ kind: 'region', region: 'APAC' })
    expect(s.useMode.getState().mode).toBe('hrbp-region')
    s.useMode.getState().setMode('hr')
    expect(s.useMode.getState().mode).toBe('hr')
    s.useMode.getState().reload()
    expect(s.useMode.getState().mode).toBe('hr')
  })

  it('follows another tab through reload', async () => {
    const storage = new MemoryStorage()
    const a = await freshStore(storage)
    storage.setItem(a.MODE_KEY, JSON.stringify({ v: 2, mode: 'finance', ...NO_PICKS }))
    a.useMode.getState().reload()
    expect(a.useMode.getState().mode).toBe('finance' satisfies Mode)
    storage.removeItem(a.MODE_KEY)
    a.useMode.getState().reload()
    expect(a.useMode.getState().mode).toBe('hr')
  })

  it('is not part of the settings file, and Clear everything removes it', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    const s = await freshStore(storage)
    s.useMode.getState().chooseManager('E10421')
    s.useMode.getState().choose({ kind: 'recruiter', name: 'Maya Chen', id: 'E10877' })
    const { settingsBlob, DEFAULT_SETTINGS } = await import('@/data/settings')
    const text = await settingsBlob(DEFAULT_SETTINGS, new Date('2026-10-01T00:00:00Z')).text()
    expect(text).not.toMatch(/"mode"|census:mode|E10421|Maya Chen|recruiter/)
    const { clearCensusStorage } = await import('@/data/quality/storage')
    await clearCensusStorage()
    expect(storage.getItem(s.MODE_KEY)).toBeNull()
  })
})
