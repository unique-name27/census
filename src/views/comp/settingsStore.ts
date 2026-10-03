/**
 * Cycle settings shared by the header popover and the view body, persisted per browser.
 * Storage can be missing or blocked (private windows); the settings then live for the session.
 */
import { create } from 'zustand'
import { type CycleSettings, DEFAULT_SETTINGS, sanitizeSettings } from './engine/settings'

const KEY = 'census:comp-cycle-settings'

function load(): CycleSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function save(s: CycleSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: the settings still apply until the tab closes */
  }
}

interface SettingsState {
  settings: CycleSettings
  setSettings: (s: CycleSettings) => void
  reset: () => void
}

export const useCycleSettings = create<SettingsState>((set) => ({
  settings: load(),
  setSettings(next) {
    const s = sanitizeSettings(next)
    save(s)
    set({ settings: s })
  },
  reset() {
    save(DEFAULT_SETTINGS)
    set({ settings: DEFAULT_SETTINGS })
  },
}))
