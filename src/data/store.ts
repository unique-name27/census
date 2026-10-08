/**
 * App state (Zustand). Holds every dataset with a version record each (mapping, import
 * counts, certification), your reference mappings, the settings, your metric dictionary changes
 * with their change log, the global filters and the route.
 *
 * Persistence never leaves the browser: uploaded datasets, versions, raw sheets and reference
 * mappings go to IndexedDB, settings, the metric dictionary (`census:metrics`) and filters to
 * localStorage. Sample data is regenerated
 * deterministically on load, so it is never stored. Showing pay amounts is a decision for one
 * session: it lives in memory and starts off on every load.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { todayISO } from '@/lib/dates'
import { metricsApi } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { compCycleEdits, compCycleOf } from '@/metrics/compCycle'
import { applyDictionaryPlan, prepareDictionaryImport } from '@/metrics/excel'
import { applyImport, importMetricsSection, importSummary, metricsFileSection } from '@/metrics/imports'
import {
  applyEdit,
  applyEdits,
  type BatchResult,
  EMPTY_METRICS,
  resetAll,
  resetMetric,
  undoChange as undoMetric,
} from '@/metrics/overrides'
import { sameParam } from '@/metrics/params'
import { loadMetrics, METRICS_KEY, saveMetrics } from '@/metrics/persist'
import { qualityRulesOf } from '@/metrics/quality'
import type { EditResult, MetricEdit, MetricImportReport, MetricsState } from '@/metrics/types'
import { type AddressIntent, hintAddress, isHistoryMark } from './address'
import type { ApplyOptions, ImportIssue, Mapping, ParsedSheet } from './import/types'
import { listsFileSection } from './lists/persist'
import { useLists } from './lists/store'
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
import { loadViews, VIEWS_KEY, viewsFileSection } from './savedViews'
import {
  DATASET_KEYS,
  type DatasetKey,
  type Datasets,
  emptyDatasets,
  type ISODate,
  type ViewKey,
  withAllDatasets,
} from './schema'
import { DEFAULT_FILTERS, type Filters, normalizeFilters, resolveAsOf } from './scope'
import {
  type CompCycleSettings,
  DEFAULT_COMP_CYCLE,
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
import { readScope, splitHash, type UrlScope } from './urlScope'

export type { SampleSeed, SampleSeedEntry, SampleSeedLoader } from './quality/seed'
export type { ThemePref } from './settings'

/** A folder tab, or one of the pages reached from the masthead: the Data room, Actions and Developer. */
export type RouteView = ViewKey | 'data' | 'actions' | 'dev'
export interface Route {
  view: RouteView
  tab: string
}
export const ROUTE_VIEWS: RouteView[] = [
  'home',
  'team',
  'scorecard',
  'recruiting',
  'onboarding',
  'hrbp',
  'org',
  'services',
  'talent',
  'comp',
  'compliance',
  'listening',
  'ai',
  'data',
  'actions',
  'dev',
]
/** The page Census opens on when the address names none and no mode says otherwise (`homeView`). */
export const HOME_VIEW: RouteView = 'scorecard'
/** Pages reached from the masthead rather than a folder tab. */
export const PAGE_VIEWS: readonly RouteView[] = ['data', 'actions', 'dev']

/* ───────────── guards the modes register (docs/ROLES.md, 6.3) ───────────── */

/** The filters to keep instead of `next` (the Manager mode lock); the same object when they are fine. */
export type FilterGuard = (next: Filters) => Filters
/** Where a route goes in the current mode, and what to say when it moved. */
export interface RouteGuard {
  check: (route: Route) => { route: Route; notice?: () => void } | null
  /** The mode's home page. */
  home: () => RouteView
}
/** The data standard to show when a link or saved view names one (Manager mode keeps the saved one). */
export type StandardGuard = (asked: DataStandard) => DataStandard

let filterGuard: FilterGuard | null = null
let routeGuard: RouteGuard | null = null
let standardGuard: StandardGuard | null = null

/** Every filter change (the row, links, Back, saved views, Filter to, Ask) goes through this. */
export function setFilterGuard(fn: FilterGuard | null): void {
  filterGuard = fn
}
/** Every route change (`navigate`, so `goTo` and the address too) goes through this. */
export function setRouteGuard(g: RouteGuard | null): void {
  routeGuard = g
}
export function setStandardGuard(fn: StandardGuard | null): void {
  standardGuard = fn
}
/** The filters as the guard keeps them (unchanged without one). */
export const guardFilters = (f: Filters): Filters => (filterGuard ? filterGuard(f) : f)
/** The page Census opens on: the mode's home, the Scorecard when no mode is connected (tests, the gallery). */
export const homeView = (): RouteView => routeGuard?.home() ?? HOME_VIEW

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
  /**
   * A control in the section to land on instead of its heading: the `data-settings-focus` name it
   * carries ("ask-workspace"). Absent: the section's heading.
   */
  focus?: string
}

export type MetricImportResult = { ok: true; report: MetricImportReport } | { ok: false; error: string }

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
  /**
   * Work authorization types show per person (drill rows, tables, exports). In memory only, like
   * pay amounts: off on every load, never persisted. Aggregates are always shown.
   */
  showImmigration: boolean
  settingsOpen: SettingsRequest
  /** Your metric dictionary changes (wording, targets, settings) and their change log. */
  metrics: MetricsState
  /**
   * @deprecated The compensation cycle settings now live in the metric dictionary: read them with
   * `cycleSettingsOf(ctx.metrics)` / `compCycleOf(ctx.metrics)`. This is a read-only mirror of
   * those settings, kept in step with every dictionary change.
   */
  compCycle: CompCycleSettings

  init: () => Promise<void>
  /**
   * Change the filters. The address follows: by default rapid changes collapse into one history
   * entry; `history: 'push'` makes this change its own entry (applying a saved view, "Filter to").
   */
  setFilters: (patch: Partial<Filters>, opts?: { history?: AddressIntent }) => void
  resetFilters: () => void
  /**
   * Show a view and tab. The address follows with the scope kept; `history: 'push'` adds a history
   * entry (what `goTo` does), the default replaces the current one.
   */
  navigate: (view: RouteView, tab?: string, opts?: { scroll?: boolean; history?: AddressIntent }) => void
  setShowPay: (on: boolean) => void
  setShowImmigration: (on: boolean) => void
  /** Turn the engagement and eNPS surveys on or off in Listening (saved in this browser). */
  setEngagementSurveys: (on: boolean) => void

  /* settings */
  setTheme: (t: ThemePref) => void
  setTextSize: (s: TextSize) => void
  setMotion: (m: MotionPref) => void
  /** The data standard control and Settings: show it and save it (other open tabs follow). */
  setDataStandard: (s: DataStandard) => void
  /**
   * Show a data standard in this tab without saving it: the address (a link, Back and Forward) and
   * saved views carry it as part of the scope, which belongs to the tab. Your saved standard stays.
   */
  setScopeStandard: (s: DataStandard) => void
  setAsOfOverride: (d: ISODate | null) => void
  /** @deprecated Writes the comp metrics' settings in the dictionary (logged); edit them there instead. */
  setCompCycle: (c: CompCycleSettings) => void
  /** @deprecated Puts the comp metrics' cycle settings back to their defaults (logged). */
  resetCompCycle: () => void
  /** Save a tool link; null clears it, undefined restores the default. False when the URL is not a web link. */
  setToolLink: (id: string, url: string | null | undefined) => boolean
  resetTools: () => void
  updateSettings: (patch: Partial<Settings>) => void
  openSettings: (section?: SettingsSection | null, focus?: string) => void
  closeSettings: () => void
  /** The settings as a JSON file (never pay amounts). */
  /** `extra.accessDraft`: the Security center's draft section, which the settings file carries too. */
  exportSettings: (extra?: { accessDraft?: unknown }) => Blob
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

  /* metric dictionary */
  /** Change one wording, target or setting; validated against the metric's definition and logged. */
  editMetric: (edit: MetricEdit, by?: string | null) => EditResult
  /** Several changes at once (each validated on its own, one timestamp). */
  editMetrics: (edits: readonly MetricEdit[], by?: string | null) => BatchResult
  /** Undo one logged change, or the latest one that can be undone. False when nothing was undone. */
  undoMetricChange: (changeId?: string, by?: string | null) => boolean
  /** Put one metric back to its defaults (each field logged). */
  resetMetric: (metricId: string, by?: string | null) => void
  /** Put every metric back to its defaults. */
  resetAllMetrics: (by?: string | null) => void
  /** Apply an edited "Metric dictionary" workbook, field by field; reports what changed and what was refused. */
  importMetricDictionary: (file: ArrayBuffer | Uint8Array, by?: string | null) => Promise<MetricImportResult>

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

const perKey = <T>(make: (k: DatasetKey) => T): Record<DatasetKey, T> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, make(k)])) as Record<DatasetKey, T>

const sampleMeta = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  perKey((k) => ({ kind: 'sample', rowCount: data[k].length }))

/**
 * The route an address names (`#view.tab`), or null. The scope after a `?` is left for
 * `readScope` (src/data/urlScope.ts), so every view's own tab suffix parses as before.
 */
export function parseHash(hash: string): Route | null {
  const [view, tab] = splitHash(hash).route.split('.')
  if (!ROUTE_VIEWS.includes(view as RouteView)) return null
  return { view: view as RouteView, tab: tab ?? '' }
}

/**
 * Where the scope Census opened with came from: the address (`link`, applied exactly; also an
 * entry Census wrote itself, whose address is complete), the saved view marked "Open Census with
 * this view" (`startup`), or your last filters in this browser (`last`). The shell finishes the
 * job once the data is loaded: it checks a link's values against the data, applies the standard
 * and the quality lens, and writes the address.
 */
export interface InitialScope {
  source: 'link' | 'startup' | 'last'
  scope: UrlScope | null
  /** The startup view's id. */
  viewId?: string
  /** The startup view's page, when the address named none. */
  page?: Route
  /** Parts of the link that could not be read. */
  unreadable: string[]
}

export function initialScopeOf(args: {
  hash: string
  historyState: unknown
  views: ReturnType<typeof loadViews>
}): InitialScope {
  const { query } = splitHash(args.hash)
  const read = readScope(query)
  if (read.present || isHistoryMark(args.historyState))
    return { source: 'link', scope: read.scope, unreadable: read.unreadable }
  const start = args.views.views.find((v) => v.id === args.views.startupId)
  if (start) {
    const page =
      !parseHash(args.hash) && start.page && ROUTE_VIEWS.includes(start.page.view as RouteView)
        ? { view: start.page.view as RouteView, tab: start.page.tab }
        : undefined
    return {
      source: 'startup',
      scope: { filters: start.filters, standard: start.standard, lens: start.lens },
      viewId: start.id,
      ...(page ? { page } : {}),
      unreadable: [],
    }
  }
  return { source: 'last', scope: null, unreadable: [] }
}

function readInitialScope(): InitialScope {
  try {
    if (typeof location === 'undefined') return { source: 'last', scope: null, unreadable: [] }
    return initialScopeOf({
      hash: location.hash,
      historyState: typeof history === 'undefined' ? null : history.state,
      views: loadViews((v) => ROUTE_VIEWS.includes(v as RouteView)),
    })
  } catch {
    return { source: 'last', scope: null, unreadable: [] }
  }
}

/** The scope this page load started with (read once, when the store is created). */
export const initialScope: InitialScope = readInitialScope()
/**
 * The page this load opened on came from the address or the startup view (false: Census picked
 * its home). A mode connected later sends an unnamed opening to its own home without a notice.
 */
export const initialRouteNamed: boolean =
  !!initialScope.page || !!parseHash(typeof location === 'undefined' ? '' : location.hash)
let initialTaken = false
/** The opening scope, once: the shell applies it after the data loads (null after that). */
export function takeInitialScope(): InitialScope | null {
  if (initialTaken) return null
  initialTaken = true
  return initialScope
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
/**
 * Your saved data standard (Settings and the data standard control). The one on screen can differ:
 * a link, Back and Forward or a saved view show theirs in this tab only (`setScopeStandard`).
 */
let savedStandard: DataStandard = initialSettings.dataStandard
if (initialScope.scope) initialSettings.dataStandard = initialScope.scope.standard

/** Your saved data standard, which a page without a scope in its address opens with. */
export const savedDataStandard = (): DataStandard => savedStandard

/** Your last filters in this browser (what a page without a scope in its address opens with). */
export const lastFilters = (): Filters =>
  normalizeFilters({ ...DEFAULT_FILTERS, ...LS.get<Partial<Filters>>('filters', {}) })
const initialMetrics = loadMetrics(CATALOG)
let listeningForMetrics = false
const sampleAsOf = SAMPLE_AS_OF

/** The cycle settings in force, reusing `prev` when they are the same values. */
function cycleMirror(m: MetricsState, prev?: CompCycleSettings): CompCycleSettings {
  const next = compCycleOf(metricsApi(m))
  return prev && sameParam(prev, next) ? prev : next
}

/** Two import reports as one (a settings file can carry both a dictionary and an old comp cycle). */
function mergeReports(a: MetricImportReport | undefined, b: MetricImportReport): MetricImportReport {
  if (!a) return b
  const changed = [...a.changed, ...b.changed]
  const rejected = [...a.rejected, ...b.rejected]
  const unknown = [...new Set([...a.unknown, ...b.unknown])]
  return { changed, rejected, unknown, summary: importSummary(changed, rejected, unknown) }
}

export const useCensus = create<CensusState>((set, getState) => {
  /**
   * Apply a settings patch and save every setting. The data standard saved is yours (set by this
   * patch, or as it was), never one a link or saved view shows in this tab only.
   */
  const patchSettings = (patch: Partial<Settings>) => {
    const { compCycle: _ignored, ...rest } = patch
    if (rest.dataStandard) savedStandard = rest.dataStandard
    set(rest)
    saveSettings({ ...pickSettings(getState()), dataStandard: savedStandard })
  }

  /** Make a new dictionary state current: the comp cycle mirror follows, and it is saved. */
  const commitMetrics = (next: MetricsState) => {
    if (next === getState().metrics) return
    set((s) => ({ metrics: next, compCycle: cycleMirror(next, s.compCycle) }))
    saveMetrics(next)
  }

  const editMetrics = (edits: readonly MetricEdit[], by?: string | null): BatchResult => {
    const r = applyEdits(getState().metrics, CATALOG, edits, { by })
    commitMetrics(r.state)
    return r
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

  // Datasets the sample doesn't include yet start empty, so every key is always present.
  const plain = (): Datasets => withAllDatasets(sample())
  const empty = emptyDatasets()

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
    // Filters saved before include and exclude modes existed load as include.
    filters: initialScope.scope
      ? normalizeFilters(initialScope.scope.filters)
      : normalizeFilters({ ...DEFAULT_FILTERS, ...LS.get<Partial<Filters>>('filters', {}) }),
    route: initialScope.page ??
      parseHash(typeof location === 'undefined' ? '' : location.hash) ?? { view: HOME_VIEW, tab: '' },
    showPay: false,
    showImmigration: false,
    settingsOpen: { open: false, section: null, nonce: 0 },
    metrics: initialMetrics,
    compCycle: cycleMirror(initialMetrics),

    async init() {
      // Earlier versions remembered the pay switch across sessions; it is now per session only.
      LS.remove('showPay')
      // Another tab's dictionary changes reach this one as they happen (null: storage cleared).
      if (typeof window !== 'undefined' && !listeningForMetrics) {
        listeningForMetrics = true
        window.addEventListener('storage', (e) => {
          if (e.key !== METRICS_KEY && e.key !== null) return
          const next = loadMetrics(CATALOG)
          set((s) => ({ metrics: next, compCycle: cycleMirror(next, s.compCycle) }))
        })
      }
      // Another tab's settings, mappings or "clear everything" reach this one as they happen.
      listenToTabs(SETTINGS_KEY, {
        settings: () => {
          const next = loadSettings()
          // The data standard on screen is this tab's scope: it follows only when the other tab
          // changed your saved standard (its control or Settings), and that corrects this tab's
          // address, never adds to its history.
          const follow = next.dataStandard !== savedStandard
          savedStandard = next.dataStandard
          if (follow) hintAddress('replace')
          set(follow ? next : { ...next, dataStandard: getState().dataStandard })
        },
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

    setFilters(patch, opts = {}) {
      const filters = guardFilters(normalizeFilters({ ...getState().filters, ...patch }))
      LS.set('filters', filters)
      if (opts.history) hintAddress(opts.history)
      set({ filters })
    },
    resetFilters() {
      const filters = guardFilters({ ...DEFAULT_FILTERS, modes: {} })
      LS.set('filters', filters)
      set({ filters })
    },
    navigate(view, tab = '', opts = {}) {
      // A route the mode hides opens the mode's home (or the view's first shown tab) instead, so
      // the address never holds it and Back never returns to it.
      const checked = routeGuard?.check({ view, tab }) ?? null
      const route = checked?.route ?? { view, tab }
      const moved = route.view !== view || route.tab !== tab
      // The shell writes the address (route and scope together); this says how.
      hintAddress(opts.history ?? 'replace')
      set({ route })
      if (opts.scroll !== false && typeof window !== 'undefined') window.scrollTo({ top: 0 })
      if (moved) checked?.notice?.()
    },
    setShowPay(on) {
      set({ showPay: on })
    },
    setShowImmigration(on) {
      set({ showImmigration: on })
    },
    setEngagementSurveys: (engagementSurveys) => patchSettings({ engagementSurveys }),

    /* ───────────── settings ───────────── */

    setTheme: (theme) => patchSettings({ theme }),
    setTextSize: (textSize) => patchSettings({ textSize }),
    setMotion: (motion) => patchSettings({ motion }),
    setDataStandard: (dataStandard) => patchSettings({ dataStandard }),
    setScopeStandard(asked) {
      const dataStandard = standardGuard ? standardGuard(asked) : asked
      if (getState().dataStandard !== dataStandard) set({ dataStandard })
    },
    setAsOfOverride: (asOfOverride) => patchSettings({ asOfOverride }),
    setCompCycle: (c) => {
      editMetrics(compCycleEdits(sanitizeCompCycle(c)))
    },
    resetCompCycle: () => {
      editMetrics(compCycleEdits(DEFAULT_COMP_CYCLE))
    },
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
      // The standard on screen may be this tab's scope only: it is saved when the patch sets it.
      const { dataStandard: _shown, ...cur } = pickSettings(getState())
      const { compCycle, ...next } = patch
      if (compCycle) editMetrics(compCycleEdits(sanitizeCompCycle(compCycle)))
      if (patch.tools) next.tools = sanitizeTools(patch.tools)
      patchSettings({ ...cur, ...next })
    },
    openSettings(section = null, focus) {
      set((s) => ({
        settingsOpen: { open: true, section, nonce: s.settingsOpen.nonce + 1, ...(focus ? { focus } : {}) },
      }))
    },
    closeSettings() {
      set((s) => ({ settingsOpen: { ...s.settingsOpen, open: false } }))
    },
    exportSettings: (extra) =>
      settingsBlob(
        { ...pickSettings(getState()), dataStandard: savedStandard },
        new Date(),
        metricsFileSection(getState().metrics),
        listsFileSection(useLists.getState().state),
        // Saved views as stored (`census:views`); none until one is saved.
        LS.get<unknown>(VIEWS_KEY.replace(/^census:/, ''), null) == null
          ? undefined
          : viewsFileSection(loadViews((v) => ROUTE_VIEWS.includes(v as RouteView))),
        extra?.accessDraft,
      ),
    importSettings(json) {
      const st = getState()
      const r = parseSettingsFile(
        json,
        { ...pickSettings(st), dataStandard: savedStandard },
        undefined,
        st.compCycle,
      )
      if (!r.ok) return r
      patchSettings(r.settings)
      let state = getState().metrics
      let report: MetricImportReport | undefined
      if (r.metricsSection !== undefined) {
        const m = importMetricsSection(r.metricsSection, state, CATALOG)
        if (m.ok) {
          state = m.state
          report = m.report
        } else
          report = {
            changed: [],
            rejected: [{ metricId: '', field: '', reason: m.error }],
            unknown: [],
            summary: m.error,
          }
      }
      if (r.compCycle) {
        const planned = compCycleEdits(r.compCycle).map((edit) => ({ edit }))
        const c = applyImport(state, CATALOG, planned, [], [])
        state = c.state
        report = mergeReports(report, c.report)
      }
      commitMetrics(state)
      // Official lists in the file replace the saved ones, list by list (logged, can be undone).
      const lists =
        r.listsSection !== undefined ? useLists.getState().importSection(r.listsSection) : undefined
      const listsSummary = lists?.ok ? lists.summary : undefined
      const listsError = lists && !lists.ok ? lists.error : undefined
      return {
        ...r,
        ...(report ? { metrics: report } : {}),
        ...(listsSummary ? { listsSummary } : {}),
        ...(listsError ? { listsError } : {}),
      }
    },
    async clearDevice() {
      const failed = await clearCensusStorage()
      savedStandard = DEFAULT_SETTINGS.dataStandard
      useLists.getState().reset()
      const base = buildSampleState(plain(), loadedSeed, sampleAsOf)
      for (const r of base.raws) rememberRaw(r)
      set({
        ...DEFAULT_SETTINGS,
        data: base.data,
        sources: sampleMeta(base.data),
        versions: base.versions,
        history: perKey(() => []),
        reference: EMPTY_REFERENCE,
        metrics: EMPTY_METRICS,
        compCycle: cycleMirror(EMPTY_METRICS),
        filters: { ...DEFAULT_FILTERS, modes: {} },
        showPay: false,
        showImmigration: false,
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
      const defaultTolerance = qualityRulesOf(metricsApi(s.metrics)).tolerance
      const certification = makeCertification({ version: v, input, data: s.data, asOf, defaultTolerance })
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

    /* ───────────── metric dictionary ───────────── */

    editMetric(edit, by) {
      const r = applyEdit(getState().metrics, CATALOG, edit, { by })
      if (r.ok) commitMetrics(r.state)
      return r
    },
    editMetrics,
    undoMetricChange(changeId, by) {
      const before = getState().metrics
      const next = undoMetric(before, CATALOG, changeId, { by })
      commitMetrics(next)
      return next !== before
    },
    resetMetric(metricId, by) {
      commitMetrics(resetMetric(getState().metrics, CATALOG, metricId, { by }))
    },
    resetAllMetrics(by) {
      commitMetrics(resetAll(getState().metrics, CATALOG, { by }))
    },
    async importMetricDictionary(file, by) {
      const r = await prepareDictionaryImport(file, CATALOG)
      if (!r.ok) return r
      // Applied to the state as it is once the file is read, so nothing made meanwhile is lost.
      const done = applyDictionaryPlan(r.plan, getState().metrics, CATALOG, { by })
      commitMetrics(done.state)
      return { ok: true, report: done.report }
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

/**
 * Open the Settings sheet, optionally at a section (the Tools menu opens 'tools'), and optionally
 * on one control in it (`focus`: its `data-settings-focus` name).
 */
export const openSettings = (section?: SettingsSection | null, focus?: string): void =>
  useCensus.getState().openSettings(section, focus)
export const closeSettings = (): void => useCensus.getState().closeSettings()
export const exportSettings = (extra?: { accessDraft?: unknown }): Blob =>
  useCensus.getState().exportSettings(extra)
export const importSettings = (json: unknown): ImportSettingsResult =>
  useCensus.getState().importSettings(json)
export const clearDevice = (): Promise<void> => useCensus.getState().clearDevice()

export { SAMPLE_AS_OF }
