/**
 * The Developer page's addresses, its store (`census:dev`: the debug overlays, every access in
 * try/catch, all off for anything unreadable) and the overlay shortcut (Alt+Shift+D, never while
 * typing).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { isOverlayShortcut } from './DevLayer'
import { devTab, isDevRouteTab, parseDevTab } from './tabs'

class MemoryStorage {
  private m = new Map<string, string>()
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
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

describe('Developer page addresses', () => {
  it('reads the tab and its colon sub-address; unknown ones land on the Overview', () => {
    expect(parseDevTab('')).toEqual({ tab: 'overview', sub: '' })
    expect(parseDevTab('inventory:figures')).toEqual({ tab: 'inventory', sub: 'figures' })
    expect(parseDevTab('ask:query_records')).toEqual({ tab: 'ask', sub: 'query_records' })
    expect(parseDevTab('nope')).toEqual({ tab: 'overview', sub: '' })
    expect(devTab('overview')).toBe('')
    expect(devTab('overview', 'gaps')).toBe('overview:gaps')
    expect(devTab('inventory', 'storage')).toBe('inventory:storage')
    expect(isDevRouteTab('timings')).toBe(true)
    expect(isDevRouteTab('inventory:figures')).toBe(true)
    expect(isDevRouteTab('nope')).toBe(false)
    for (const t of ['inventory', 'access', 'ask', 'state', 'timings'] as const)
      expect(parseDevTab(devTab(t)).tab).toBe(t)
  })
})

describe('the overlay shortcut', () => {
  const key = { altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code: 'KeyD' }
  it('is Alt+Shift+D by key position, not while typing', () => {
    expect(isOverlayShortcut(key)).toBe(true)
    expect(isOverlayShortcut({ ...key, shiftKey: false })).toBe(false)
    expect(isOverlayShortcut({ ...key, ctrlKey: true })).toBe(false)
    expect(isOverlayShortcut({ ...key, code: 'KeyE' })).toBe(false)
    expect(isOverlayShortcut(key, { tagName: 'INPUT' } as unknown as EventTarget)).toBe(false)
    expect(
      isOverlayShortcut(key, { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(false)
    expect(isOverlayShortcut(key, { tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true)
  })
})

describe('the Developer store', () => {
  let store: typeof import('./store')
  const local = new MemoryStorage()
  beforeAll(async () => {
    local.setItem('census:dev', '{not json')
    vi.stubGlobal('localStorage', local)
    store = await import('./store')
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('reads corrupt, unknown and missing values as every overlay off', () => {
    expect(store.useDev.getState().overlays).toEqual({ figures: false, tours: false, metrics: false })
    expect(store.parseStoredDev(null)).toEqual({ figures: false, tours: false, metrics: false })
    expect(store.parseStoredDev('{"v":2,"overlays":{"figures":true}}').figures).toBe(false)
    expect(store.parseStoredDev('{"v":1,"overlays":{"figures":true,"tours":"yes"}}')).toEqual({
      figures: true,
      tours: false,
      metrics: false,
    })
  })

  it('keeps the overlays at census:dev and switches them all with the shortcut', () => {
    const s = store.useDev.getState()
    s.setOverlay('figures', true)
    expect(JSON.parse(local.getItem('census:dev') ?? '{}')).toEqual({
      v: 1,
      overlays: { figures: true, tours: false, metrics: false },
    })
    // Any on: the shortcut switches every one off; then every one on.
    store.useDev.getState().toggleOverlays()
    expect(store.anyOverlay(store.useDev.getState().overlays)).toBe(false)
    store.useDev.getState().toggleOverlays()
    expect(store.useDev.getState().overlays).toEqual({ figures: true, tours: true, metrics: true })
    store.useDev.getState().setOverlay('all', false)
    expect(store.parseStoredDev(local.getItem('census:dev'))).toEqual({
      figures: false,
      tours: false,
      metrics: false,
    })
  })

  it('still works when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    store.useDev.getState().setOverlay('tours', true)
    expect(store.useDev.getState().overlays.tours).toBe(true)
    store.useDev.getState().reload()
    expect(store.useDev.getState().overlays.tours).toBe(false)
    vi.stubGlobal('localStorage', local)
  })

  it('seeds the console and focuses an inventory list, each request new', () => {
    const s = store.useDev.getState()
    s.seedConsole('view_summary', { view: 'hrbp' })
    const first = store.useDev.getState().consoleSeed
    expect(first).toMatchObject({ tool: 'view_summary', input: '{\n  "view": "hrbp"\n}' })
    s.seedConsole('view_summary', '{"view":"talent"}')
    expect(store.useDev.getState().consoleSeed?.nonce).toBe((first?.nonce ?? 0) + 1)
    s.focusInventory('metrics', 'Talent')
    expect(store.useDev.getState().inventoryFocus).toMatchObject({ list: 'metrics', query: 'Talent' })
  })
})
