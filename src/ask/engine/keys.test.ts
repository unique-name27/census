/**
 * Where the API key is kept: this tab by default, this device when kept, gone after Forget, never
 * in the settings file; the optional workspace ID; and the model choice.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, saveSettings, settingsBlob } from '@/data/settings'
import { FAKE_KEY } from './fakeApi'
import {
  clearWorkspaceId,
  forgetKey,
  KEY_STORAGE_KEY,
  type KeyStores,
  looksLikeKey,
  looksLikeWorkspaceId,
  maskKey,
  readKey,
  readWorkspaceId,
  saveKey,
  saveWorkspaceId,
  WORKSPACE_STORAGE_KEY,
} from './keys'
import { DEFAULT_MODEL, MODEL_STORAGE_KEY, modelById, readModelChoice, saveModelChoice } from './models'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}

class BlockedStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('blocked')
  }
  override setItem(): void {
    throw new Error('blocked')
  }
  override removeItem(): void {
    throw new Error('blocked')
  }
}

const stores = (): KeyStores & { session: MemoryStorage; local: MemoryStorage } => ({
  session: new MemoryStorage(),
  local: new MemoryStorage(),
})

describe('the API key', () => {
  it('is kept for this tab only by default', () => {
    const s = stores()
    expect(readKey(s)).toBeNull()
    expect(saveKey(FAKE_KEY, false, s)).toBe(true)
    expect(s.session.getItem(KEY_STORAGE_KEY)).toBe(FAKE_KEY)
    expect(s.local.getItem(KEY_STORAGE_KEY)).toBeNull()
    expect(readKey(s)).toEqual({ key: FAKE_KEY, kept: false })
  })

  it('is kept on this device when asked, and moves back when that is turned off', () => {
    const s = stores()
    saveKey(FAKE_KEY, true, s)
    expect(s.local.getItem(KEY_STORAGE_KEY)).toBe(FAKE_KEY)
    expect(s.session.getItem(KEY_STORAGE_KEY)).toBeNull()
    expect(readKey(s)).toEqual({ key: FAKE_KEY, kept: true })
    saveKey(FAKE_KEY, false, s)
    expect(s.local.getItem(KEY_STORAGE_KEY)).toBeNull()
    expect(readKey(s)).toEqual({ key: FAKE_KEY, kept: false })
  })

  it('is gone everywhere after Forget key (and saving an empty key forgets it)', () => {
    const s = stores()
    s.session.setItem(KEY_STORAGE_KEY, FAKE_KEY)
    s.local.setItem(KEY_STORAGE_KEY, FAKE_KEY)
    forgetKey(s)
    expect(readKey(s)).toBeNull()
    saveKey(FAKE_KEY, true, s)
    saveKey('  ', true, s)
    expect(readKey(s)).toBeNull()
  })

  it('survives blocked or missing storage without throwing', () => {
    const blocked = { session: new BlockedStorage(), local: new BlockedStorage() }
    expect(saveKey(FAKE_KEY, false, blocked)).toBe(false)
    expect(readKey(blocked)).toBeNull()
    expect(() => forgetKey(blocked)).not.toThrow()
    expect(saveKey(FAKE_KEY, true, { session: null, local: null })).toBe(false)
  })

  it('is never part of the settings file', async () => {
    const local = new MemoryStorage()
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, local)
    saveKey(FAKE_KEY, true, { session: null, local })
    expect(KEY_STORAGE_KEY).not.toBe(SETTINGS_KEY)
    expect(local.getItem(SETTINGS_KEY)).not.toContain(FAKE_KEY)
    const file = await settingsBlob(loadSettings(local)).text()
    expect(file).toContain('"theme": "dark"')
    expect(file).not.toContain(FAKE_KEY)
    expect(file).not.toContain('sk-ant')
  })

  it('is checked for shape and shown masked', () => {
    expect(looksLikeKey(FAKE_KEY)).toBe(true)
    expect(looksLikeKey('hello')).toBe(false)
    expect(maskKey(FAKE_KEY)).toBe('sk-ant-…0000')
    expect(maskKey(FAKE_KEY)).not.toContain('test-fake')
  })
})

describe('the workspace ID', () => {
  const WS = 'wrkspc_01TestFake'

  it('is kept on this device, trimmed, and cleared', () => {
    const local = new MemoryStorage()
    expect(readWorkspaceId(local)).toBeNull()
    expect(saveWorkspaceId(`  ${WS} `, local)).toBe(true)
    expect(local.getItem(WORKSPACE_STORAGE_KEY)).toBe(WS)
    expect(readWorkspaceId(local)).toBe(WS)
    clearWorkspaceId(local)
    expect(readWorkspaceId(local)).toBeNull()
    expect(local.getItem(WORKSPACE_STORAGE_KEY)).toBeNull()
    // Saving a blank one clears it.
    saveWorkspaceId(WS, local)
    expect(saveWorkspaceId('   ', local)).toBe(true)
    expect(readWorkspaceId(local)).toBeNull()
  })

  it('saves only what looks like a workspace ID, and reads nothing else back', () => {
    const local = new MemoryStorage()
    saveWorkspaceId(WS, local)
    expect(saveWorkspaceId('workspace one', local)).toBe(false)
    expect(saveWorkspaceId('wrkspc_01 Test', local)).toBe(false)
    expect(readWorkspaceId(local)).toBe(WS)
    local.setItem(WORKSPACE_STORAGE_KEY, 'wrkspc_01\nX-Other: 1')
    expect(readWorkspaceId(local)).toBeNull()
    expect(looksLikeWorkspaceId(WS)).toBe(true)
    expect(looksLikeWorkspaceId(` ${WS} `)).toBe(true)
    expect(looksLikeWorkspaceId('wrkspc_')).toBe(false)
    expect(looksLikeWorkspaceId('wrkspc_01-Test')).toBe(false)
    expect(looksLikeWorkspaceId('sk-ant-test-fake-0001')).toBe(false)
  })

  it('stays when the key is forgotten', () => {
    const s = stores()
    saveKey(FAKE_KEY, true, s)
    saveWorkspaceId(WS, s.local)
    forgetKey(s)
    expect(readKey(s)).toBeNull()
    expect(readWorkspaceId(s.local)).toBe(WS)
  })

  it('survives blocked or missing storage without throwing', () => {
    const blocked = new BlockedStorage()
    expect(saveWorkspaceId(WS, blocked)).toBe(false)
    expect(readWorkspaceId(blocked)).toBeNull()
    expect(() => clearWorkspaceId(blocked)).not.toThrow()
    expect(saveWorkspaceId(WS, null)).toBe(false)
    expect(readWorkspaceId(null)).toBeNull()
  })

  it('is never part of the settings file', async () => {
    const local = new MemoryStorage()
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, local)
    saveWorkspaceId(WS, local)
    expect(WORKSPACE_STORAGE_KEY).not.toBe(SETTINGS_KEY)
    expect(local.getItem(SETTINGS_KEY)).not.toContain(WS)
    const file = await settingsBlob(loadSettings(local)).text()
    expect(file).toContain('"theme": "dark"')
    expect(file).not.toContain('wrkspc_')
  })
})

describe('the model choice', () => {
  it('defaults to Claude Opus 5.5 and keeps another choice', () => {
    const s = new MemoryStorage()
    expect(readModelChoice(s)).toBe(DEFAULT_MODEL)
    expect(saveModelChoice('claude-haiku-4-5-20251001', s)).toBe(true)
    expect(readModelChoice(s)).toBe('claude-haiku-4-5-20251001')
    s.setItem(MODEL_STORAGE_KEY, 'gpt-nonsense')
    expect(readModelChoice(s)).toBe(DEFAULT_MODEL)
    expect(readModelChoice(new BlockedStorage())).toBe(DEFAULT_MODEL)
    expect(modelById('nope').id).toBe('claude-opus-5-5')
    expect(modelById('claude-sonnet-5-5').label).toBe('Claude Sonnet 5.5')
  })
})
