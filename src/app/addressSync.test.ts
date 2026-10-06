/**
 * The address writer and the stores together (docs/FILTERS.md, part 1, History): what another open
 * tab's changes do to this tab's history, and that the data standard and the quality lens a link
 * or Back and Forward show stay in this tab. The browser is a stub: storage events are dispatched
 * by hand, as the browser does in every other tab of the origin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AddressIntent } from '@/data/address'

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

const storage = new MemoryStorage()
const win = Object.assign(new EventTarget(), { scrollTo: () => undefined })
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', win)
vi.stubGlobal('BroadcastChannel', undefined)

/** What the browser does in this tab when another tab writes `key`. */
function otherTabWrote(key: string, value: string | null): void {
  if (value == null) storage.removeItem(key)
  else storage.setItem(key, value)
  win.dispatchEvent(Object.assign(new Event('storage'), { key }))
}

type Mods = {
  store: typeof import('@/data/store')
  address: typeof import('./address')
  lens: typeof import('@/views/data/quality-overview/lens')
}
let m: Mods
const writes: (AddressIntent | null)[] = []
let stop: () => void = () => undefined

beforeAll(async () => {
  m = {
    store: await import('@/data/store'),
    address: await import('./address'),
    lens: await import('@/views/data/quality-overview/lens'),
  }
  await m.store.useCensus.getState().init()
  stop = m.address.followStores((intent) => writes.push(intent))
}, 60_000)

afterAll(() => {
  stop()
  vi.unstubAllGlobals()
})

const take = () => writes.splice(0)

describe('another tab never adds to this tab’s history', () => {
  it('settings saved elsewhere leave no hint behind for this tab’s next filter change', () => {
    const st = m.store.useCensus
    st.getState().setMotion('system')
    take()
    const saved = JSON.parse(storage.getItem('census:settings') ?? '{}') as Record<string, unknown>
    otherTabWrote('census:settings', JSON.stringify({ ...saved, motion: 'reduce' }))
    expect(st.getState().motion).toBe('reduce')
    // Nothing the address holds changed, so nothing was written…
    expect(take()).toEqual([])
    // …and this tab's next filter change is its own entry, not a replacement of the current one.
    st.getState().setFilters({ location: ['Hsinchu'] })
    expect(take()).toEqual([null])
    st.getState().resetFilters()
    take()
  })

  it('another tab switching the quality lens corrects this tab’s address in place', () => {
    otherTabWrote(m.lens.QUALITY_LENS_KEY, 'on')
    expect(m.lens.useQualityLens.getState().on).toBe(true)
    expect(take()).toEqual(['replace'])
    otherTabWrote(m.lens.QUALITY_LENS_KEY, null)
    expect(take()).toEqual(['replace'])
  })

  it('another tab changing your saved data standard is followed in place; other settings leave this tab’s standard', () => {
    const st = m.store.useCensus
    const saved = JSON.parse(storage.getItem('census:settings') ?? '{}') as Record<string, unknown>
    otherTabWrote('census:settings', JSON.stringify({ ...saved, dataStandard: 'gold' }))
    expect(st.getState().dataStandard).toBe('gold')
    expect(take()).toEqual(['replace'])
    // A link shows silver in this tab; another tab's theme change does not undo it.
    st.getState().setScopeStandard('silver')
    take()
    const now = JSON.parse(storage.getItem('census:settings') ?? '{}') as Record<string, unknown>
    otherTabWrote('census:settings', JSON.stringify({ ...now, theme: 'dark' }))
    expect(st.getState().dataStandard).toBe('silver')
    expect(st.getState().theme).toBe('dark')
    expect(take()).toEqual([])
  })
})

describe('the scope in the address belongs to this tab', () => {
  it('a data standard shown from the address is not saved, and a later settings save keeps yours', () => {
    const st = m.store.useCensus
    st.getState().setDataStandard('bronze')
    take()
    st.getState().setScopeStandard('gold')
    expect(st.getState().dataStandard).toBe('gold')
    expect(take()).toEqual([null])
    const saved = () =>
      (JSON.parse(storage.getItem('census:settings') ?? '{}') as { dataStandard?: string }).dataStandard
    expect(saved()).toBe('bronze')
    expect(m.store.savedDataStandard()).toBe('bronze')
    // Saving another setting saves your standard, never the one this tab shows.
    st.getState().setTheme('light')
    expect(saved()).toBe('bronze')
    expect(st.getState().dataStandard).toBe('gold')
    // The control saves it.
    st.getState().setDataStandard('gold')
    expect(saved()).toBe('gold')
    take()
  })

  it('the lens shown from the address is not remembered; the switch is', () => {
    const lens = m.lens.useQualityLens
    lens.getState().show(true)
    expect(lens.getState().on).toBe(true)
    expect(storage.getItem(m.lens.QUALITY_LENS_KEY)).toBeNull()
    expect(take()).toEqual([null])
    lens.getState().show(false)
    take()
    lens.getState().setOn(true)
    expect(storage.getItem(m.lens.QUALITY_LENS_KEY)).toBe('on')
    lens.getState().setOn(false)
    take()
  })
})
