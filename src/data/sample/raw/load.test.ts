import { describe, expect, it, vi } from 'vitest'

const idb = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (k: string) => structuredClone(idb.get(k)),
  set: async (k: string, v: unknown) => {
    idb.set(k, structuredClone(v))
  },
  del: async (k: string) => {
    idb.delete(k)
  },
  keys: async () => [...idb.keys()],
}))

const ls = new Map<string, string>()
vi.stubGlobal('localStorage', {
  get length() {
    return ls.size
  },
  key: (i: number) => [...ls.keys()][i] ?? null,
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => ls.set(k, v),
  removeItem: (k: string) => ls.delete(k),
})

async function fresh() {
  vi.resetModules()
  const store = await import('../../store')
  const load = await import('./load')
  return { store, load }
}

describe('loading the messy sample in the app', () => {
  it('opens on the starter state, then adds the sheets and logs without changing rows or decisions', async () => {
    idb.clear()
    const { store, load } = await fresh()
    const st = () => store.useCensus.getState()
    store.setSampleSeed(load.messySampleLoader)
    await st().init()

    expect(st().ready).toBe(true)
    expect(st().versions.employees.certification?.by).toBe('HRIS team')
    expect(st().versions.jobChanges.mappingConfirmedBy).toBe('HRIS team')
    expect(st().versions.candidates.hasRaw).toBe(false)
    const candidates = st().data.candidates
    const data = st().data

    // Decisions made before the import lands are kept.
    st().revokeCertification('employees')
    st().confirmMapping('candidates', 'Jamie')

    await vi.waitFor(() => expect(st().versions.candidates.hasRaw).toBe(true), { timeout: 10_000 })
    expect(st().data).toBe(data)
    expect(st().data.candidates).toBe(candidates)
    expect(st().versions.employees.certification).toBeNull()
    const v = st().versions.candidates
    expect(v.mappingConfirmedBy).toBe('Jamie')
    expect(Object.values(v.mapping).every((m) => m.confirmed)).toBe(true)
    expect(v.mapping.currentStage?.header).toBe('Current Stage')
    expect(v.fileName).toBe('ATS candidate export.csv')
    expect(st().versions.succession.issues.byCode['not-in-roster']).toBe(13)
    expect((await st().getRaw('cases'))?.sheet.headers).toContain('HR Service')
    expect(st().versions.comp.certification?.by).toBe('Total rewards')
  }, 20_000)
})
