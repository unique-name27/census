/**
 * The mode this browser is in (docs/ROLES-V2.md 1.4 and 8.4; docs/ROLES.md 1.4 and 6.3), kept at
 * `census:mode` as version 2:
 *
 *   { "v": 2, "mode": "hrbp-region", "managerId": "E10421", "unit": "Silicon Engineering",
 *     "region": "APAC", "recruiter": { "name": "Maya Chen", "id": "E10877" } }
 *
 * A version 1 value (`{ "v": 1, "mode", "managerId" }`) reads as version 2 with the other picks
 * null and is written back as version 2 on the next change. A missing, unreadable or unknown value,
 * or an unknown mode, means HR. Every pick is kept when the mode changes, so coming back needs no
 * new pick. Read once when the store is created and written on every change, every storage access
 * in try/catch. Not in the address and not in the settings file. Another open tab that changes it
 * is followed through the browser's storage event, so one browser is one mode.
 */
import { create } from 'zustand'
import {
  hasPick,
  isMode,
  MODE_OF_PICK,
  type Mode,
  type ModePicks,
  NO_PICKS,
  PICK_OF,
  type PickKind,
} from './modes'

export const MODE_KEY = 'census:mode'

export interface StoredMode extends ModePicks {
  v: 2
  mode: Mode
}

const HR: StoredMode = Object.freeze({ v: 2, mode: 'hr', ...NO_PICKS }) as StoredMode

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function recruiterOf(v: unknown): ModePicks['recruiter'] {
  if (!v || typeof v !== 'object') return null
  const r = v as { name?: unknown; id?: unknown }
  const name = text(r.name)
  return name ? { name, id: text(r.id) } : null
}

/** The stored value as version 2, or HR for anything missing, corrupt or unknown. */
export function parseStoredMode(raw: string | null | undefined): StoredMode {
  if (!raw) return HR
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null
    if (!v || typeof v !== 'object' || (v.v !== 1 && v.v !== 2) || !isMode(v.mode)) return HR
    // Version 1 knew HR, Manager and Developer only, and the manager.
    if (v.v === 1 && v.mode !== 'hr' && v.mode !== 'manager' && v.mode !== 'developer') return HR
    const managerId = typeof v.managerId === 'string' && v.managerId ? v.managerId : null
    if (v.v === 1) return { v: 2, mode: v.mode, managerId, unit: null, region: null, recruiter: null }
    return {
      v: 2,
      mode: v.mode,
      managerId,
      unit: text(v.unit),
      region: text(v.region),
      recruiter: recruiterOf(v.recruiter),
    }
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

/** A pick made in a dialog: the manager, the business unit, the region or the recruiter ("*" for every recruiter). */
export type ModePick =
  | { kind: 'manager'; id: string }
  | { kind: 'unit'; unit: string }
  | { kind: 'region'; region: string }
  | { kind: 'recruiter'; name: string; id: string | null }

export interface ModeState {
  mode: Mode
  /** Every pick this browser remembers; each is kept when the mode changes. */
  picks: ModePicks
  /** Which pick dialog is open, if any. */
  picking: PickKind | null
  /** A line at the top of the dialog ("APAC is not in the loaded data. Pick again."). */
  pickNote: string | null
  /** The masthead's Mode menu is open (a redirect toast's "Change mode" opens it). */
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  /** Switch modes. A mode that needs a pick it does not have opens its picker and keeps the current mode. */
  setMode: (mode: Mode) => void
  /** Make (or change) a pick and enter its mode. */
  choose: (pick: ModePick) => void
  /** Open a pick dialog ("Change region…"), with an optional note. */
  openPicker: (kind: PickKind, note?: string | null) => void
  /** Close the dialog; the mode stays as it was. */
  cancelPick: () => void
  /** Re-read the stored mode (another tab changed it). */
  reload: () => void
  /** Kept for existing callers: `choose({ kind: 'manager', id })`. */
  chooseManager: (employeeId: string) => void
  /** Kept for existing callers: `picks.managerId`. */
  managerId: string | null
}

const samePicks = (a: ModePicks, b: ModePicks): boolean =>
  a.managerId === b.managerId &&
  a.unit === b.unit &&
  a.region === b.region &&
  a.recruiter?.name === b.recruiter?.name &&
  (a.recruiter?.id ?? null) === (b.recruiter?.id ?? null)

const picksOfStored = (s: StoredMode): ModePicks => ({
  managerId: s.managerId,
  unit: s.unit,
  region: s.region,
  recruiter: s.recruiter,
})

function withPick(picks: ModePicks, p: ModePick): ModePicks {
  switch (p.kind) {
    case 'manager':
      return { ...picks, managerId: p.id }
    case 'unit':
      return { ...picks, unit: p.unit }
    case 'region':
      return { ...picks, region: p.region }
    case 'recruiter':
      return { ...picks, recruiter: { name: p.name, id: p.id } }
  }
}

/**
 * The picks in force. `managerId` mirrors `picks.managerId` (callers and tests that set it directly
 * still steer Manager mode), so read the picks through this.
 */
export const picksOfState = (s: Pick<ModeState, 'picks' | 'managerId'>): ModePicks =>
  s.managerId === s.picks.managerId ? s.picks : { ...s.picks, managerId: s.managerId }

export const useMode = create<ModeState>((set, get) => {
  const initial = readStored()
  const persist = () => {
    const st = get()
    writeStored({ v: 2, mode: st.mode, ...picksOfState(st) })
  }
  return {
    mode: initial.mode,
    picks: picksOfStored(initial),
    managerId: initial.managerId,
    picking: null,
    pickNote: null,
    menuOpen: false,
    setMenuOpen(menuOpen) {
      set({ menuOpen })
    },
    setMode(mode) {
      const kind = PICK_OF[mode]
      if (kind && !hasPick(mode, picksOfState(get()))) {
        set({ picking: kind, pickNote: null })
        return
      }
      if (mode === get().mode) return
      set({ mode, picking: null, pickNote: null })
      persist()
    },
    choose(p) {
      const picks = withPick(picksOfState(get()), p)
      set({ mode: MODE_OF_PICK[p.kind], picks, managerId: picks.managerId, picking: null, pickNote: null })
      persist()
    },
    chooseManager(employeeId) {
      get().choose({ kind: 'manager', id: employeeId })
    },
    openPicker(kind, note = null) {
      set({ picking: kind, pickNote: note })
    },
    cancelPick() {
      set({ picking: null, pickNote: null })
    },
    reload() {
      const s = readStored()
      const cur = get()
      const picks = picksOfStored(s)
      if (s.mode !== cur.mode || !samePicks(picks, picksOfState(cur)))
        set({ mode: s.mode, picks, managerId: picks.managerId })
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
export const openPicker = (kind: PickKind, note?: string | null): void =>
  useMode.getState().openPicker(kind, note)
export const openManagerPicker = (note?: string | null): void =>
  useMode.getState().openPicker('manager', note)
export const openModeMenu = (): void => useMode.getState().setMenuOpen(true)
