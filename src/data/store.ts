/**
 * App state (Zustand). Holds the ten datasets with a version record each (mapping, import
 * counts, certification), your reference mappings, the settings, the global filters and the
 * route.
 *
 * Persistence never leaves the browser: uploaded datasets, versions, raw sheets and reference
 * mappings go to IndexedDB, settings and filters to localStorage. Sample data is regenerated
 * deterministically on load, so it is never stored. Showing pay amounts is a decision for one
 * session: it lives in memory and starts off on every load.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { todayISO } from '@/lib/dates'
import type { ApplyOptions, ImportIssue, Mapping, ParsedSheet } from './import/types'
import {
  buildSampleState,
  mergeStoredSample,
  type SampleSeed,
  type SampleSeedLoader,
  sampleVersion,
} from './quality/seed'
import {
  clearCensusStorage,
  DATASET_KEY,
  deleteRaw,
  loadRaw,
  loadVersions,
  REFERENCE_KEY,
  rememberRaw,
  type StoredVersions,
  saveRaw,
  saveVersions,
} from './quality/storage'
import type { DataStandard } from './quality/tier'
import type { Certification, DatasetVersion, RawRecord, VersionMapping } from './quality/types'
import {
  type CertifyInput,
  confirmVersion,
  droppedVersions,
  isVersion,
  makeCertification,
  makeVersion,
  newVersionId,
  pushHistory,
} from './quality/versions'
import {
  type AddResult,
  addMapping,
  EMPTY_REFERENCE,
  isReferenceState,
  removeMapping,
  undoChange,
} from './reference/state'
import type { NewReferenceMapping, ReferenceState } from './reference/types'
import { cachedSample, SAMPLE_AS_OF } from './sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate, type ViewKey } from './schema'
import { DEFAULT_FILTERS, type Filters, resolveAsOf } from './scope'
import {
  type CompCycleSettings,
  DEFAULT_SETTINGS,
  type ImportSettingsResult,
  loadSettings,
  type MotionPref,
  parseSettingsFile,
  pickSettings,
  SETTINGS_KEY,
  type Settings,
  type SettingsSection,
  sanitizeCompCycle,
  sanitizeTools,
  saveSettings,
  settingsBlob,
  type TextSize,
  type ThemePref,
} from './settings'
import { listenToTabs, postToTabs } from './tabSync'

export type { SampleSeed, SampleSeedEntry, SampleSeedLoader } from './quality/seed'
export type { ThemePref } from './settings'

export type RouteView = ViewKey | 'data'
export interface Route {
  view: RouteView
  tab: string
}
export const ROUTE_VIEWS: RouteView[] = ['recruiting', 'hrbp', 'org', 'services', 'talent', 'comp', 'data']

export interface SourceMeta {
  kind: 'sample' | 'upload'
  rowCount: number
  fileName?: string
  sheetName?: string
  importedAt?: string
  /** Rows that imported with a warning (defaulted or unparsed values). */
  warnings?: number
  /** Header fingerprint of the mapping profile used, so the Data room can offer to edit it. */
  profileFingerprint?: string
}

/** What an upload knows beyond its rows: the sheet it came from, the mapping and the import log. */
export interface ReplaceExtra {
  /** The original sheet, kept per version so it can be re-mapped without uploading again. */
  raw?: ParsedSheet | null
  mapping?: Mapping | VersionMapping | null
  options?: ApplyOptions | null
  issues?: readonly ImportIssue[]
  /** Rows in the file, including skipped ones (the importer's `stats.rowsIn`). */
  rowsIn?: number
}

/** The Settings sheet: open or closed, and the section to show. `nonce` changes on every open. */
export interface SettingsRequest {
  open: boolean
  section: SettingsSection | null
  nonce: number
}

export interface CensusState extends Settings {
  ready: boolean
  /** Browser storage did not answer at start-up; uploads from earlier sessions are not loaded. */
  storageUnavailable: boolean
  /** Loaded datasets as imported, before reference mappings (the analytics context applies them). */
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  /** The current version of each dataset. */
  versions: Record<DatasetKey, DatasetVersion>
  /** Earlier versions per dataset, newest first, at most three. */
  history: Record<DatasetKey, DatasetVersion[]>
  /** Your reference mappings and their change list. */
  reference: ReferenceState
  filters: Filters
  route: Route
  /** Pay amounts are shown and exported. In memory only: off on every load, never persisted. */
  showPay: boolean
  settingsOpen: SettingsRequest

  init: () => Promise<void>
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  navigate: (view: RouteView, tab?: string, opts?: { scroll?: boolean }) => void
  setShowPay: (on: boolean) => void

  /* settings */
  setTheme: (t: ThemePref) => void
  setTextSize: (s: TextSize) => void
  setMotion: (m: MotionPref) => void
  setDataStandard: (s: DataStandard) => void
  setAsOfOverride: (d: ISODate | null) => void
  setCompCycle: (c: CompCycleSettings) => void
  resetCompCycle: () => void
  /** Save a tool link; null clears it, undefined restores the default. False when the URL is not a web link. */
  setToolLink: (id: string, url: string | null | undefined) => boolean
  resetTools: () => void
  updateSettings: (patch: Partial<Settings>) => void
  openSettings: (section?: SettingsSection | null) => void
  closeSettings: () => void
  /** The settings as a JSON file (never pay amounts). */
  exportSettings: () => Blob
  /** Apply a settings file's text or parsed JSON; invalid fields keep their current values. */
  importSettings: (json: unknown) => ImportSettingsResult
  /** Delete everything Census stored on this device and start over on the sample with default settings. */
  clearDevice: () => Promise<void>

  /* datasets */
  replaceDataset: <K extends DatasetKey>(
    key: K,
    rows: Datasets[K],
    meta: Omit<SourceMeta, 'kind' | 'rowCount'>,
    extra?: ReplaceExtra,
  ) => Promise<void>
  resetDataset: (key: DatasetKey) => Promise<void>
  resetAllToSample: () => Promise<void>
  /** Apply a sample seed now, to every dataset that is still the sample. */
  applySampleSeed: (seed: SampleSeed) => void
  /** Record that `by` reviewed the column mapping of the current version. */
  confirmMapping: (key: DatasetKey, by: string) => void
  /** Certify the current version; control totals get their actual values recorded. */
  certify: (key: DatasetKey, input: CertifyInput) => Certification | null
  revokeCertification: (key: DatasetKey) => void
  /** The original sheet and import log of a version (the current one by default), loaded on demand. */
  getRaw: (key: DatasetKey, versionId?: string) => Promise<RawRecord | null>

  /* reference mappings */
  addReferenceMapping: (m: NewReferenceMapping, by?: string | null) => AddResult
  removeReferenceMapping: (id: string, by?: string | null) => void
  /** Undo one change from the change list, or the latest one that can be undone. */
  undoReferenceChange: (auditId?: string, by?: string | null) => void
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
  remove(k: string) {
    try {
      localStorage.removeItem(`census:${k}`)
    } catch {
      /* storage unavailable: nothing to remove */
    }
  },
}

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

const perKey = <T>(make: (k: DatasetKey) => T): Record<DatasetKey, T> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, make(k)])) as Record<DatasetKey, T>

const sampleMeta = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  perKey((k) => ({ kind: 'sample', rowCount: data[k].length }))

export function parseHash(hash: string): Route | null {
  const [view, tab] = hash.replace(/^#/, '').split('.')
  if (!ROUTE_VIEWS.includes(view as RouteView)) return null
  return { view: view as RouteView, tab: tab ?? '' }
}

/**
 * The as-of date the analytics context uses: the sample's fixed date while every dataset is the
 * sample, otherwise the override or the latest date in the data (capped at today).
 */
export function contextAsOf(args: {
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  asOfOverride: ISODate | null
  today?: ISODate
}): ISODate {
  const isSample = Object.values(args.sources).every((s) => s.kind === 'sample')
  return isSample && !args.asOfOverride
    ? SAMPLE_AS_OF
    : resolveAsOf(args.data, args.today ?? todayISO(), args.asOfOverride)
}

/** Resolves to the value, or null if it takes longer than ms. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

/** The generated sample, shared with the messy-sample seed so it is built once. */
const sample = cachedSample

/* ───────────── sample seed ───────────── */

let seedLoader: SampleSeedLoader | null = null
let loadedSeed: SampleSeed | null = null

/**
 * Register the messy-sample seed. `init` awaits it; a loader that fails leaves the plain sample.
 * Pass null to go back to the plain sample (tests).
 */
export function setSampleSeed(loader: SampleSeedLoader | null): void {
  seedLoader = loader
  loadedSeed = null
}

async function loadSeed(): Promise<SampleSeed | null> {
  if (loadedSeed || !seedLoader) return loadedSeed
  try {
    loadedSeed = await seedLoader()
  } catch {
    loadedSeed = null
  }
  return loadedSeed
}

/**
 * A sample version rebuilt from a later seed keeps the decisions already made on the same version:
 * its confirmation (per field too), its certification, or the revocation of it.
 */
function keepSampleDecisions(fresh: DatasetVersion, current: DatasetVersion | undefined): DatasetVersion {
  if (!current || current.versionId !== fresh.versionId || current.source !== 'sample') return fresh
  const confirmedAll = !!current.mappingConfirmedAt
  const mapping: VersionMapping = {}
  for (const [field, e] of Object.entries(fresh.mapping))
    mapping[field] = { ...e, confirmed: current.mapping[field]?.confirmed ?? confirmedAll }
  return {
    ...fresh,
    mapping,
    mappingConfirmedAt: current.mappingConfirmedAt ?? null,
    mappingConfirmedBy: current.mappingConfirmedBy ?? null,
    certification: current.certification ?? null,
  }
}

/* ───────────── persistence helpers ───────────── */

interface SavedDataset {
  rows: unknown[]
  meta: SourceMeta
  versionId?: string
}

const persistVersions = (key: DatasetKey, s: Pick<CensusState, 'versions' | 'history'>) =>
  saveVersions(key, { current: s.versions[key], history: s.history[key] })

async function persistReference(state: ReferenceState): Promise<void> {
  try {
    await idbSet(REFERENCE_KEY, state)
  } catch {
    /* kept for this session */
    return
  }
  // Other open tabs re-read the stored mappings, so the next save there doesn't drop these.
  postToTabs({ kind: 'reference' })
}

const initialSettings = loadSettings()
const sampleAsOf = SAMPLE_AS_OF

export const useCensus = create<CensusState>((set, getState) => {
  /** Apply a settings patch and save every setting. */
  const patchSettings = (patch: Partial<Settings>) => {
    set(patch)
    saveSettings(pickSettings(getState()))
  }

  /** Move a dataset to a new current version, keeping the old one in its history. */
  const advance = (
    key: DatasetKey,
    next: DatasetVersion,
    s: Pick<CensusState, 'versions' | 'history'>,
  ): {
    versions: Record<DatasetKey, DatasetVersion>
    history: Record<DatasetKey, DatasetVersion[]>
    dropped: string[]
  } => {
    const prev = s.versions[key] ?? null
    const before = s.history[key] ?? []
    const after = pushHistory(before, prev && prev.versionId !== next.versionId ? prev : null)
    const dropped = droppedVersions(prev ? [prev, ...before] : before, after, next)
    return {
      versions: { ...s.versions, [key]: next },
      history: { ...s.history, [key]: after },
      dropped,
    }
  }

  const freshSample = (key: DatasetKey, data: Datasets): DatasetVersion => {
    const entry = loadedSeed?.[key] ?? null
    const raws: RawRecord[] = []
    const v = sampleVersion(key, data, entry, sampleAsOf, raws)
    for (const r of raws) rememberRaw(r)
    return v
  }

  const plain = sample
  const empty = emptyData()

  return {
    ...initialSettings,
    ready: false,
    storageUnavailable: false,
    data: empty,
    sources: sampleMeta(empty),
    versions: perKey((k) =>
      makeVersion({ dataset: k, source: 'sample', rows: [], versionId: `sample-${k}` }),
    ),
    history: perKey(() => []),
    reference: EMPTY_REFERENCE,
    filters: { ...DEFAULT_FILTERS, ...LS.get<Partial<Filters>>('filters', {}) },
    route: parseHash(typeof location === 'undefined' ? '' : location.hash) ?? { view: 'recruiting', tab: '' },
    showPay: false,
    settingsOpen: { open: false, section: null, nonce: 0 },

    async init() {
      // Earlier versions remembered the pay switch across sessions; it is now per session only.
      LS.remove('showPay')
      // Another tab's settings, mappings or "clear everything" reach this one as they happen.
      listenToTabs(SETTINGS_KEY, {
        settings: () => set(loadSettings()),
        message: (m) => {
          if (m.kind === 'cleared') location.reload()
          else
            void idbGet<unknown>(REFERENCE_KEY)
              .then((v) => {
                if (isReferenceState(v)) set({ reference: v })
              })
              .catch(() => undefined)
        },
      })
      const seed = await loadSeed()
      const base = buildSampleState(plain(), seed, sampleAsOf)
      for (const r of base.raws) rememberRaw(r)
      const data = { ...base.data } as unknown as Record<DatasetKey, unknown[]>
      const sources = sampleMeta(base.data)
      const versions: Record<DatasetKey, DatasetVersion> = { ...base.versions }
      const history = perKey<DatasetVersion[]>(() => [])
      let reference = EMPTY_REFERENCE
      // Storage can be unavailable (private window) or stall (another tab holds an upgrade or a
      // delete open). Never let that keep the app on its loading screen: give it a moment, then
      // run on the sample and say so.
      const saved = await withTimeout(
        Promise.all([
          Promise.all(DATASET_KEYS.map((k) => idbGet<SavedDataset>(DATASET_KEY(k)).catch(() => undefined))),
          Promise.all(DATASET_KEYS.map((k) => loadVersions(k).catch(() => null))),
          idbGet<unknown>(REFERENCE_KEY).catch(() => undefined),
        ]),
        1500,
      )
      if (saved) {
        const [rowsSaved, versionsSaved, refSaved] = saved
        DATASET_KEYS.forEach((k, i) => {
          const s = rowsSaved[i]
          const stored: StoredVersions | null = versionsSaved[i]
          if (s?.rows) {
            data[k] = s.rows
            sources[k] = { ...s.meta, kind: 'upload', rowCount: s.rows.length }
            const vid = s.versionId ?? `legacy-${k}-${s.meta.importedAt ?? 'upload'}`
            versions[k] =
              stored?.current && isVersion(stored.current) && stored.current.versionId === vid
                ? stored.current
                : makeVersion({
                    dataset: k,
                    source: 'upload',
                    rows: s.rows as object[],
                    versionId: vid,
                    fileName: s.meta.fileName ?? null,
                    sheetName: s.meta.sheetName ?? null,
                    importedAt: s.meta.importedAt ?? null,
                  })
          } else versions[k] = mergeStoredSample(versions[k], stored?.current ?? null)
          history[k] = stored?.history ?? []
        })
        if (isReferenceState(refSaved)) reference = refSaved
      }
      set({
        data: data as unknown as Datasets,
        sources,
        versions,
        history,
        reference,
        ready: true,
        storageUnavailable: !saved,
      })
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
    navigate(view, tab = '', opts = {}) {
      const route = { view, tab }
      const hash = `#${view}${tab ? `.${tab}` : ''}`
      if (location.hash !== hash) history.replaceState(null, '', hash)
      set({ route })
      if (opts.scroll !== false) window.scrollTo({ top: 0 })
    },
    setShowPay(on) {
      set({ showPay: on })
    },

    /* ───────────── settings ───────────── */

    setTheme: (theme) => patchSettings({ theme }),
    setTextSize: (textSize) => patchSettings({ textSize }),
    setMotion: (motion) => patchSettings({ motion }),
    setDataStandard: (dataStandard) => patchSettings({ dataStandard }),
    setAsOfOverride: (asOfOverride) => patchSettings({ asOfOverride }),
    setCompCycle: (c) => patchSettings({ compCycle: sanitizeCompCycle(c) }),
    resetCompCycle: () => patchSettings({ compCycle: DEFAULT_SETTINGS.compCycle }),
    setToolLink(id, url) {
      const tools = { ...getState().tools }
      if (url === undefined) delete tools[id]
      else if (url === null || !url.trim()) tools[id] = null
      else {
        const clean = sanitizeTools({ [id]: url })[id]
        if (!clean) return false
        tools[id] = clean
      }
      patchSettings({ tools })
      return true
    },
    resetTools: () => patchSettings({ tools: {} }),
    updateSettings(patch) {
      const cur = pickSettings(getState())
      const next: Partial<Settings> = { ...patch }
      if (patch.compCycle) next.compCycle = sanitizeCompCycle(patch.compCycle)
      if (patch.tools) next.tools = sanitizeTools(patch.tools)
      patchSettings({ ...cur, ...next })
    },
    openSettings(section = null) {
      set((s) => ({ settingsOpen: { open: true, section, nonce: s.settingsOpen.nonce + 1 } }))
    },
    closeSettings() {
      set((s) => ({ settingsOpen: { ...s.settingsOpen, open: false } }))
    },
    exportSettings: () => settingsBlob(pickSettings(getState())),
    importSettings(json) {
      const r = parseSettingsFile(json, pickSettings(getState()))
      if (r.ok) patchSettings(r.settings)
      return r
    },
    async clearDevice() {
      const failed = await clearCensusStorage()
      const base = buildSampleState(plain(), loadedSeed, sampleAsOf)
      for (const r of base.raws) rememberRaw(r)
      set({
        ...DEFAULT_SETTINGS,
        data: base.data,
        sources: sampleMeta(base.data),
        versions: base.versions,
        history: perKey(() => []),
        reference: EMPTY_REFERENCE,
        filters: { ...DEFAULT_FILTERS },
        showPay: false,
        storageUnavailable: false,
      })
      // Other open tabs start over too, so their next save doesn't bring anything back.
      postToTabs({ kind: 'cleared' })
      if (failed.length) throw new Error(`Could not remove ${failed.join(', ')} from this browser.`)
    },

    /* ───────────── datasets ───────────── */

    async replaceDataset(key, rows, meta, extra) {
      const full: SourceMeta = {
        ...meta,
        kind: 'upload',
        rowCount: rows.length,
        importedAt: meta.importedAt ?? new Date().toISOString(),
      }
      const versionId = newVersionId(key)
      const version = makeVersion({
        dataset: key,
        source: 'upload',
        rows: rows as readonly object[],
        versionId,
        fileName: meta.fileName ?? null,
        sheetName: meta.sheetName ?? null,
        importedAt: full.importedAt,
        mapping: extra?.mapping ?? null,
        applyOptions: extra?.options ?? null,
        issues: extra?.issues,
        rowsIn: extra?.rowsIn,
        hasRaw: !!extra?.raw,
      })
      const next = advance(key, version, getState())
      set((s) => ({
        data: { ...s.data, [key]: rows },
        sources: { ...s.sources, [key]: full },
        versions: next.versions,
        history: next.history,
      }))
      if (extra?.raw) await saveRaw({ dataset: key, versionId, sheet: extra.raw, issues: extra.issues ?? [] })
      for (const id of next.dropped) await deleteRaw(key, id)
      await persistVersions(key, getState())
      try {
        await idbSet(DATASET_KEY(key), { rows, meta: full, versionId } satisfies SavedDataset)
      } catch {
        /* not persisted; still applied for this session */
      }
    },
    async resetDataset(key) {
      const data = {
        ...getState().data,
        [key]: (loadedSeed?.[key]?.rows ?? plain()[key]) as unknown[],
      } as Datasets
      const next = advance(key, freshSample(key, data), getState())
      set((s) => ({
        data: { ...s.data, [key]: data[key] },
        sources: { ...s.sources, [key]: { kind: 'sample', rowCount: data[key].length } },
        versions: next.versions,
        history: next.history,
      }))
      for (const id of next.dropped) await deleteRaw(key, id)
      await persistVersions(key, getState())
      try {
        await idbDel(DATASET_KEY(key))
      } catch {
        /* ignore */
      }
    },
    async resetAllToSample() {
      for (const k of DATASET_KEYS)
        if (getState().sources[k].kind !== 'sample') await getState().resetDataset(k)
      patchSettings({ asOfOverride: null })
    },
    applySampleSeed(seed) {
      loadedSeed = seed
      const s = getState()
      const onSample = DATASET_KEYS.filter((k) => s.sources[k].kind === 'sample')
      const base = buildSampleState(plain(), seed, sampleAsOf)
      for (const r of base.raws) rememberRaw(r)
      const data = { ...s.data } as Record<DatasetKey, unknown[]>
      const versions = { ...s.versions }
      const sources = { ...s.sources }
      for (const k of onSample) {
        data[k] = base.data[k] as unknown[]
        versions[k] = keepSampleDecisions(base.versions[k], s.versions[k])
        sources[k] = { kind: 'sample', rowCount: data[k].length }
      }
      // A seed that keeps the rows (only the versions gain their sheets and logs) leaves the data as is.
      const sameRows = onSample.every((k) => data[k] === (s.data[k] as unknown[]))
      set({ ...(sameRows ? {} : { data: data as unknown as Datasets }), versions, sources })
    },
    confirmMapping(key, by) {
      const v = getState().versions[key]
      set((s) => ({ versions: { ...s.versions, [key]: confirmVersion(v, by) } }))
      void persistVersions(key, getState())
    },
    certify(key, input) {
      const s = getState()
      const v = s.versions[key]
      if (!v) return null
      const asOf = contextAsOf(s)
      const certification = makeCertification({ version: v, input, data: s.data, asOf })
      set((st) => ({ versions: { ...st.versions, [key]: { ...v, certification } } }))
      void persistVersions(key, getState())
      return certification
    },
    revokeCertification(key) {
      const v = getState().versions[key]
      if (!v?.certification) return
      set((s) => ({ versions: { ...s.versions, [key]: { ...v, certification: null } } }))
      void persistVersions(key, getState())
    },
    getRaw(key, versionId) {
      const id = versionId ?? getState().versions[key]?.versionId
      return id ? loadRaw(key, id) : Promise.resolve(null)
    },

    /* ───────────── reference mappings ───────────── */

    addReferenceMapping(m, by) {
      const r = addMapping(getState().reference, m, by)
      if (r.ok) {
        set({ reference: r.state })
        void persistReference(r.state)
      }
      return r
    },
    removeReferenceMapping(id, by) {
      const next = removeMapping(getState().reference, id, by)
      if (next === getState().reference) return
      set({ reference: next })
      void persistReference(next)
    },
    undoReferenceChange(auditId, by) {
      const next = undoChange(getState().reference, auditId, by)
      if (next === getState().reference) return
      set({ reference: next })
      void persistReference(next)
    },
  }
})

/* ───────────── standalone helpers for code outside React ───────────── */

/** Open the Settings sheet, optionally at a section (the Tools menu opens 'tools'). */
export const openSettings = (section?: SettingsSection | null): void =>
  useCensus.getState().openSettings(section)
export const closeSettings = (): void => useCensus.getState().closeSettings()
export const exportSettings = (): Blob => useCensus.getState().exportSettings()
export const importSettings = (json: unknown): ImportSettingsResult =>
  useCensus.getState().importSettings(json)
export const clearDevice = (): Promise<void> => useCensus.getState().clearDevice()

export { SAMPLE_AS_OF }
