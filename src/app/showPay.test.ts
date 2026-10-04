import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  get: async () => undefined,
  set: async () => {},
  del: async () => {},
}))

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)
// An earlier version remembered the switch across sessions.
storage.setItem('census:showPay', 'true')
storage.setItem('census:theme', '"dark"')
const { useCensus } = await import('@/data/store')

describe('pay amounts are a session decision', () => {
  it('start hidden on every load, whatever an earlier version stored', () => {
    expect(useCensus.getState().showPay).toBe(false)
    expect(useCensus.getState().theme).toBe('dark')
  })

  it('init removes the old stored switch and keeps other preferences', async () => {
    await useCensus.getState().init()
    expect(storage.getItem('census:showPay')).toBeNull()
    expect(storage.getItem('census:theme')).toBe('"dark"')
    expect(useCensus.getState().showPay).toBe(false)
  })

  it('switching on lasts for the session only', () => {
    useCensus.getState().setShowPay(true)
    expect(useCensus.getState().showPay).toBe(true)
    expect(storage.getItem('census:showPay')).toBeNull()
    useCensus.getState().setShowPay(false)
    expect(useCensus.getState().showPay).toBe(false)
  })
})
