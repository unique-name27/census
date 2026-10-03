/**
 * App state (Zustand). Holds the ten datasets, where each came from, the global filters, the
 * route and per-viewer preferences.
 *
 * Persistence never leaves the browser: uploaded datasets go to IndexedDB, small preferences to
 * localStorage. Sample data is regenerated deterministically on load, so it is never stored.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { generateSample, SAMPLE_AS_OF } from './sample'
import { DEFAULT_FILTERS, type Filters } from './scope'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate, type ViewKey } from './schema'

export type RouteView = ViewKey | 'data'
export interface Route {
  view: RouteView
  tab: string
}
export const ROUTE_VIEWS: RouteView[] = ['recruiting', 'hrbp', 'services', 'talent', 'comp', 'data']

export interface SourceMeta {
  kind: 'sample' | 'upload'
  rowCount: number
  fileName?: string
  sheetName?: string
  importedAt?: string
  /** Rows that imported with a warning (defaulted or unparsed values). */
  warnings?: number
}

export type ThemePref = 'system' | 'light' | 'dark'

interface CensusState {
  ready: boolean
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  asOfOverride: ISODate | null
  filters: Filters
  route: Route
  showPay: boolean
  theme: ThemePref
  init: () => Promise<void>
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  navigate: (view: RouteView, tab?: string) => void
  setShowPay: (on: boolean) => void
  setTheme: (t: ThemePref) => void
  setAsOfOverride: (d: ISODate | null) => void
  replaceDataset: <K extends DatasetKey>(key: K, rows: Datasets[K], meta: Omit<SourceMeta, 'kind' | 'rowCount'>) => Promise<void>
  resetDataset: (key: DatasetKey) => Promise<void>
  resetAllToSample: () => Promise<void>
}

const LS = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`census:${k}`)
      return v == null ? fallback : (JSON.parse(v) as T)
    } catch {
      return fallback
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`census:${k}`, JSON.stringify(v))
    } catch {
      /* storage unavailable: preferences just won't persist */
    }
  },
}
const IDB_KEY = (k: DatasetKey) => `census:dataset:${k}`

const emptyData = (): Datasets => ({
  employees: [],
  jobChanges: [],
  requisitions: [],
  candidates: [],
  cases: [],
  transactions: [],
  reviews: [],
  succession: [],
  learning: [],
  comp: [],
})

const sampleMeta = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

export function parseHash(hash: string): Route | null {
  const [view, tab] = hash.replace(/^#/, '').split('.')
  if (!ROUTE_VIEWS.includes(view as RouteView)) return null
  return { view: view as RouteView, tab: tab ?? '' }
}

let sampleCache: Datasets | null = null
const sample = () => {
  sampleCache ??= generateSample()
  return sampleCache
}

export const useCensus = create<CensusState>((set, getState) => ({
  ready: false,
  data: emptyData(),
  sources: sampleMeta(emptyData()),
  asOfOverride: LS.get<ISODate | null>('asOf', null),
  filters: { ...DEFAULT_FILTERS, ...LS.get<Partial<Filters>>('filters', {}) },
  route: parseHash(typeof location === 'undefined' ? '' : location.hash) ?? { view: 'recruiting', tab: '' },
  showPay: LS.get('showPay', false),
  theme: LS.get<ThemePref>('theme', 'system'),

  async init() {
    const base = sample()
    const data: Datasets = { ...base }
    const sources = sampleMeta(base)
    for (const k of DATASET_KEYS) {
      try {
        const saved = await idbGet<{ rows: unknown[]; meta: SourceMeta }>(IDB_KEY(k))
        if (saved?.rows) {
          ;(data as unknown as Record<string, unknown[]>)[k] = saved.rows
          sources[k] = { ...saved.meta, kind: 'upload', rowCount: saved.rows.length }
        }
      } catch {
        /* IndexedDB blocked (private window): run on sample data */
      }
    }
    set({ data, sources, ready: true })
  },

  setFilters(patch) {
    const filters = { ...getState().filters, ...patch }
    LS.set('filters', filters)
    set({ filters })
  },
  resetFilters() {
    LS.set('filters', DEFAULT_FILTERS)
    set({ filters: { ...DEFAULT_FILTERS } })
  },
  navigate(view, tab = '') {
    const route = { view, tab }
    const hash = `#${view}${tab ? `.${tab}` : ''}`
    if (location.hash !== hash) history.replaceState(null, '', hash)
    set({ route })
    window.scrollTo({ top: 0 })
  },
  setShowPay(on) {
    LS.set('showPay', on)
    set({ showPay: on })
  },
  setTheme(theme) {
    LS.set('theme', theme)
    set({ theme })
  },
  setAsOfOverride(d) {
    LS.set('asOf', d)
    set({ asOfOverride: d })
  },
  async replaceDataset(key, rows, meta) {
    const full: SourceMeta = { ...meta, kind: 'upload', rowCount: rows.length, importedAt: meta.importedAt ?? new Date().toISOString() }
    set((s) => ({ data: { ...s.data, [key]: rows }, sources: { ...s.sources, [key]: full } }))
    try {
      await idbSet(IDB_KEY(key), { rows, meta: full })
    } catch {
      /* not persisted; still applied for this session */
    }
  },
  async resetDataset(key) {
    const base = sample()
    set((s) => ({
      data: { ...s.data, [key]: base[key] },
      sources: { ...s.sources, [key]: { kind: 'sample', rowCount: base[key].length } },
    }))
    try {
      await idbDel(IDB_KEY(key))
    } catch {
      /* ignore */
    }
  },
  async resetAllToSample() {
    const base = sample()
    set({ data: { ...base }, sources: sampleMeta(base), asOfOverride: null })
    LS.set('asOf', null)
    for (const k of DATASET_KEYS) {
      try {
        await idbDel(IDB_KEY(k))
      } catch {
        /* ignore */
      }
    }
  },
}))

export { SAMPLE_AS_OF }
