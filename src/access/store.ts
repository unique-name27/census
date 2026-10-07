/**
 * The mode this browser is in (docs/ROLES.md, 1.4 and 6.3), kept at `census:mode` as
 * `{ "v": 1, "mode": "manager", "managerId": "E10421" }`. Read once when the store is created and
 * written on every change, every storage access in try/catch: a missing, unreadable or unknown
 * value means HR. Not in the address and not in the settings file. Another open tab that changes
 * it is followed through the browser's storage event, so one browser is one mode.
 */
import { create } from 'zustand'
import { isMode, type Mode } from './modes'

export const MODE_KEY = 'census:mode'

export interface StoredMode {
  v: 1
  mode: Mode
  managerId: string | null
}

const HR: StoredMode = { v: 1, mode: 'hr', managerId: null }

/** The stored value, or HR for anything missing, corrupt or unknown. */
export function parseStoredMode(raw: string | null | undefined): StoredMode {
  if (!raw) return HR
  try {
    const v = JSON.parse(raw) as Partial<StoredMode> | null
    if (!v || typeof v !== 'object' || v.v !== 1 || !isMode(v.mode)) return HR
    const managerId = typeof v.managerId === 'string' && v.managerId ? v.managerId : null
    return { v: 1, mode: v.mode, managerId }
  } catch {
    return HR
  }
}

function readStored(): StoredMode {
  try {
    if (typeof localStorage === 'undefined') return HR
    return parseStoredMode(localStorage.getItem(MODE_KEY))
  } catch {
    return HR
  }
}

function writeStored(s: StoredMode): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: the mode lasts for this page */
  }
}

export interface ModeState {
  mode: Mode
  /**
   * Manager mode: the employee ID Census is shaped for. Kept when leaving Manager mode, so coming
   * back needs no new pick.
   */
  managerId: string | null
  /** The "Choose a manager" dialog is open. */
  picking: boolean
  /** A line at the top of the dialog ("Priya Raman is not in the loaded data as a manager. Pick again."). */
  pickNote: string | null
  /** The masthead's Mode menu is open (a redirect toast's "Change mode" opens it). */
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  /** Switch modes. Manager without a manager opens the picker and keeps the current mode until one is chosen. */
  setMode: (mode: Mode) => void
  /** Pick (or change) the manager and enter Manager mode. */
  chooseManager: (employeeId: string) => void
  /** Open the picker ("Change manager…"), with an optional note. */
  openPicker: (note?: string | null) => void
  /** Close the picker; the mode stays as it was. */
  cancelPick: () => void
  /** Re-read the stored mode (another tab changed it). */
  reload: () => void
}

export const useMode = create<ModeState>((set, get) => {
  const initial = readStored()
  const persist = () => {
    const { mode, managerId } = get()
    writeStored({ v: 1, mode, managerId })
  }
  return {
    mode: initial.mode,
    managerId: initial.managerId,
    picking: false,
    pickNote: null,
    menuOpen: false,
    setMenuOpen(menuOpen) {
      set({ menuOpen })
    },
    setMode(mode) {
      if (mode === 'manager' && !get().managerId) {
        set({ picking: true, pickNote: null })
        return
      }
      if (mode === get().mode) return
      set({ mode, picking: false, pickNote: null })
      persist()
    },
    chooseManager(employeeId) {
      set({ mode: 'manager', managerId: employeeId, picking: false, pickNote: null })
      persist()
    },
    openPicker(note = null) {
      set({ picking: true, pickNote: note })
    },
    cancelPick() {
      set({ picking: false, pickNote: null })
    },
    reload() {
      const s = readStored()
      const cur = get()
      if (s.mode !== cur.mode || s.managerId !== cur.managerId) set({ mode: s.mode, managerId: s.managerId })
    },
  }
})

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    // A null key means another tab cleared all of localStorage ("Clear everything"): back to HR.
    if (e.key === MODE_KEY || e.key === null) useMode.getState().reload()
  })

/** Imperative helpers for event handlers. */
export const setMode = (mode: Mode): void => useMode.getState().setMode(mode)
export const openManagerPicker = (note?: string | null): void => useMode.getState().openPicker(note)
export const openModeMenu = (): void => useMode.getState().setMenuOpen(true)
