/**
 * The Developer page's own state (docs/ROLES.md, 5.8 and 6.3). The debug overlays are kept in this
 * browser at `census:dev` (`{ "v": 1, "overlays": { "figures": false, "tours": false, "metrics":
 * false } }`, every storage access in try/catch); they show only in Developer mode. Everything
 * else is in memory until reload: the last figure scans, the last engine runs, and the requests
 * other parts of Census make of the page (open the Ask console on a tool call, open an inventory
 * list at a search). Small and free of React components, so the shell can read it without loading
 * the page.
 */
import { create } from 'zustand'
import type { Mode } from '@/access/modes'
import type { FigureScan } from './scanModel'

export const DEV_KEY = 'census:dev'

export type OverlayKey = 'figures' | 'tours' | 'metrics'
export const OVERLAY_KEYS: readonly OverlayKey[] = ['figures', 'tours', 'metrics']

export const OVERLAY_LABEL: Record<OverlayKey, string> = {
  figures: 'Figure ids',
  tours: 'Tour targets',
  metrics: 'Metric ids on hover',
}

export const OVERLAY_HINT: Record<OverlayKey, string> = {
  figures: 'A label with its id on each figure. Click it to copy the id.',
  tours: 'An outline and a label on every element a tour can point at.',
  metrics: 'Hovering a key figure, figure or finding shows its metric id and the fields it reads.',
}

export type Overlays = Record<OverlayKey, boolean>

const ALL_OFF: Overlays = { figures: false, tours: false, metrics: false }

/** The stored overlays, or all off for anything missing, corrupt or unknown. */
export function parseStoredDev(raw: string | null | undefined): Overlays {
  if (!raw) return ALL_OFF
  try {
    const v = JSON.parse(raw) as { v?: unknown; overlays?: Partial<Record<string, unknown>> } | null
    if (!v || typeof v !== 'object' || v.v !== 1 || !v.overlays || typeof v.overlays !== 'object')
      return ALL_OFF
    const o = v.overlays
    return { figures: o.figures === true, tours: o.tours === true, metrics: o.metrics === true }
  } catch {
    return ALL_OFF
  }
}

function readStored(): Overlays {
  try {
    if (typeof localStorage === 'undefined') return ALL_OFF
    return parseStoredDev(localStorage.getItem(DEV_KEY))
  } catch {
    return ALL_OFF
  }
}

function writeStored(overlays: Overlays): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEV_KEY, JSON.stringify({ v: 1, overlays }))
  } catch {
    /* storage unavailable: the overlays last for this page */
  }
}

/** The last run of one engine function ("Run" or "Run all engines"). */
export interface EngineRun {
  /** "hrbp.summary". */
  id: string
  ms: number
  /** Cold: on a freshly built context, so the per-context caches miss. */
  coldMs?: number | null
  /** What it returned, counted: "7 KPIs, 4 findings", "12 items". */
  returned: string
  error: string | null
  at: string
}

export interface DevState {
  overlays: Overlays
  /** One overlay, or every one at once ('all'). */
  setOverlay: (key: OverlayKey | 'all', on: boolean) => void
  /** Alt+Shift+D: every overlay off when any is on, else every one on. */
  toggleOverlays: () => void
  /** The last figure scan in each mode, in memory only. */
  scans: Partial<Record<Mode, FigureScan>>
  addScan: (scan: FigureScan) => void
  /** A scan running now: its mode and how far it is ("Laying out People stats, Workforce (4 of 12)"). */
  scanning: { mode: Mode; text: string } | null
  setScanning: (s: { mode: Mode; text: string } | null) => void
  engineRuns: Record<string, EngineRun>
  setEngineRuns: (runs: readonly EngineRun[]) => void
  /** A tool call to open in the Ask tools console ("Open in console" under What was sent). */
  consoleSeed: { tool: string; input: string; nonce: number } | null
  seedConsole: (tool: string, input: unknown) => void
  /** An inventory list to open at a search (a number on the Overview opens its rows). */
  inventoryFocus: { list: string; query: string; nonce: number } | null
  focusInventory: (list: string, query?: string) => void
  /** Re-read the stored overlays (another tab changed them). */
  reload: () => void
}

export const anyOverlay = (o: Overlays): boolean => OVERLAY_KEYS.some((k) => o[k])

export const useDev = create<DevState>((set, get) => ({
  overlays: readStored(),
  setOverlay: (key, on) => {
    const overlays =
      key === 'all' ? { figures: on, tours: on, metrics: on } : { ...get().overlays, [key]: on }
    writeStored(overlays)
    set({ overlays })
  },
  toggleOverlays: () => get().setOverlay('all', !anyOverlay(get().overlays)),
  scans: {},
  addScan: (scan) => set((s) => ({ scans: { ...s.scans, [scan.mode]: scan } })),
  scanning: null,
  setScanning: (scanning) => set({ scanning }),
  engineRuns: {},
  setEngineRuns: (runs) =>
    set((s) => ({ engineRuns: { ...s.engineRuns, ...Object.fromEntries(runs.map((r) => [r.id, r])) } })),
  consoleSeed: null,
  seedConsole: (tool, input) =>
    set((s) => ({
      consoleSeed: {
        tool,
        input: typeof input === 'string' ? input : JSON.stringify(input ?? {}, null, 2),
        nonce: (s.consoleSeed?.nonce ?? 0) + 1,
      },
    })),
  inventoryFocus: null,
  focusInventory: (list, query = '') =>
    set((s) => ({ inventoryFocus: { list, query, nonce: (s.inventoryFocus?.nonce ?? 0) + 1 } })),
  reload: () => set({ overlays: readStored() }),
}))

// Another open Census tab that changes the overlays is followed (one browser, one set of overlays).
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === DEV_KEY || e.key === null) useDev.getState().reload()
    })
  } catch {
    /* no storage events: each tab keeps its own until reload */
  }
}
