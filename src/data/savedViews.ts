/**
 * Saved views (docs/FILTERS.md, part 2): a name, a scope (period and custom dates, leader, org
 * filters with their include or exclude modes, data standard, quality lens) and, optionally, the
 * page to open (view and tab). Pure: types, validation, storage, matching and the settings file
 * section. The live list is `useSavedViews` (`./viewsStore`).
 *
 * Stored in this browser under `census:views` (every access guarded). Leaders are stored by
 * employee ID. Until something is saved, the list holds two starting examples that only show on
 * the sample data; they can be removed like any other view.
 */
import type { DataStandard } from './quality/tier'
import { DEFAULT_STANDARD, isDataStandard } from './quality/tier'
import { DEFAULT_FILTERS, dropIdleModes, type Filters, normalizeFilters } from './scope'
import { sameScope, type UrlScope } from './urlScope'

export const VIEWS_KEY = 'census:views'
export const VIEWS_VERSION = 1
/** Longest view name accepted. */
export const VIEW_NAME_MAX = 60
/** At most this many saved views. */
export const VIEWS_MAX = 50

/** The page a saved view opens on: a view key (or the Data room / Action center) and a tab. */
export interface ViewPage {
  view: string
  tab: string
}

export interface SavedView {
  id: string
  name: string
  filters: Filters
  standard: DataStandard
  lens: boolean
  /** The page it opens on ("Open on this page"), or null to stay where you are. */
  page: ViewPage | null
  /** One of the two starting examples, shown only on the sample data. */
  example?: boolean
}

export interface SavedViewsState {
  views: SavedView[]
  /** "Open Census with this view": at most one. */
  startupId: string | null
}

export const EMPTY_VIEWS: SavedViewsState = { views: [], startupId: null }

/** The two starting examples on the sample data. */
export const EXAMPLE_VIEWS: readonly SavedView[] = [
  {
    id: 'example-silicon-6m',
    name: 'Silicon Engineering, last 6 months',
    filters: { ...DEFAULT_FILTERS, period: 't6m', businessUnit: ['Silicon Engineering'], modes: {} },
    standard: DEFAULT_STANDARD,
    lens: false,
    page: null,
    example: true,
  },
  {
    id: 'example-bengaluru-ytd',
    name: 'Bengaluru, year to date',
    filters: { ...DEFAULT_FILTERS, period: 'ytd', location: ['Bengaluru'], modes: {} },
    standard: DEFAULT_STANDARD,
    lens: false,
    page: null,
    example: true,
  },
]

/** The state when nothing was ever saved: the two examples. */
export const STARTING_VIEWS: SavedViewsState = { views: [...EXAMPLE_VIEWS], startupId: null }

/** A saved view's scope. */
export const viewScope = (v: SavedView): UrlScope => ({
  filters: v.filters,
  standard: v.standard,
  lens: v.lens,
})

/** The views to list: examples only while every dataset is the sample. */
export const listedViews = (s: SavedViewsState, isSample: boolean): SavedView[] =>
  s.views.filter((v) => isSample || !v.example)

export const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, VIEW_NAME_MAX)

/**
 * Why a name can't be used, or null. `except` is the view being renamed. Pass the views you can
 * see (`listedViews`): a hidden example's name is free to use.
 */
export function nameProblem(s: Pick<SavedViewsState, 'views'>, name: string, except?: string): string | null {
  const n = cleanName(name)
  if (!n) return 'Enter a name.'
  if (s.views.some((v) => v.id !== except && v.name.toLowerCase() === n.toLowerCase()))
    return 'A saved view already has this name.'
  return null
}

/** True when no more views can be saved (`VIEWS_MAX`). */
export const viewsFull = (s: Pick<SavedViewsState, 'views'>): boolean => s.views.length >= VIEWS_MAX

/** What the save dialog says when the list is full. */
export const VIEWS_FULL = `You have ${VIEWS_MAX} saved views, the most Census keeps. Delete one in Manage views to save another.`

/** The name, or the name with " (2)", " (3)"… so no other view has it (case aside). */
export function uniqueName(views: readonly SavedView[], name: string, except?: string): string {
  const taken = new Set(views.filter((v) => v.id !== except).map((v) => v.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`
    const next = `${name.slice(0, VIEW_NAME_MAX - suffix.length)}${suffix}`
    if (!taken.has(next.toLowerCase())) return next
  }
}

let seq = 0
/** A fresh id (time plus a counter, so two saves in one millisecond differ). */
export const newViewId = (now = Date.now()): string => `v${now.toString(36)}${(seq++).toString(36)}`

/* ───────── matching ───────── */

/**
 * What the filter row shows: the saved view whose scope is the current one (the one last applied
 * first), or the last applied view marked edited once the scope moved away from it.
 */
export function matchView(
  views: readonly SavedView[],
  scope: UrlScope,
  appliedId: string | null,
): { view: SavedView | null; edited: boolean } {
  const applied = appliedId ? (views.find((v) => v.id === appliedId) ?? null) : null
  if (applied && sameScope(viewScope(applied), scope)) return { view: applied, edited: false }
  const exact = views.find((v) => sameScope(viewScope(v), scope))
  if (exact) return { view: exact, edited: false }
  return applied ? { view: applied, edited: true } : { view: null, edited: false }
}

/* ───────── changes (pure; each returns a new state) ───────── */

/** Add a view. A full list (`viewsFull`) stays as it is: nothing is dropped to make room. */
export function addView(
  s: SavedViewsState,
  v: { name: string; scope: UrlScope; page: ViewPage | null },
  id = newViewId(),
): SavedViewsState {
  const view: SavedView = {
    id,
    name: cleanName(v.name),
    // An exclude switch left on without values is not part of the scope (the address drops it too).
    filters: dropIdleModes(normalizeFilters(v.scope.filters)),
    standard: v.scope.standard,
    lens: v.scope.lens,
    page: v.page,
  }
  if (viewsFull(s)) return s
  return { ...s, views: [...s.views, view] }
}

/** Save the current scope into a view (its page stays). It is then yours, not an example. */
export function updateView(s: SavedViewsState, id: string, scope: UrlScope): SavedViewsState {
  return {
    ...s,
    views: s.views.map((v) =>
      v.id === id
        ? {
            id: v.id,
            name: v.name,
            filters: dropIdleModes(normalizeFilters(scope.filters)),
            standard: scope.standard,
            lens: scope.lens,
            page: v.page,
          }
        : v,
    ),
  }
}

export function renameView(s: SavedViewsState, id: string, name: string): SavedViewsState {
  const n = cleanName(name)
  if (!n) return s
  return { ...s, views: s.views.map((v) => (v.id === id ? { ...v, name: n, example: undefined } : v)) }
}

/** Move a view up (-1) or down (+1) in the list. */
export function moveView(s: SavedViewsState, id: string, delta: number): SavedViewsState {
  const i = s.views.findIndex((v) => v.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= s.views.length) return s
  const views = [...s.views]
  const [v] = views.splice(i, 1)
  views.splice(j, 0, v)
  return { ...s, views }
}

/** Remove a view; returns what Undo needs. */
export function removeView(
  s: SavedViewsState,
  id: string,
): { state: SavedViewsState; removed: { view: SavedView; index: number; startup: boolean } | null } {
  const index = s.views.findIndex((v) => v.id === id)
  if (index < 0) return { state: s, removed: null }
  const view = s.views[index]
  const startup = s.startupId === id
  return {
    state: { views: s.views.filter((v) => v.id !== id), startupId: startup ? null : s.startupId },
    removed: { view, index, startup },
  }
}

/** Put a removed view back where it was. */
export function restoreView(
  s: SavedViewsState,
  removed: { view: SavedView; index: number; startup: boolean },
): SavedViewsState {
  if (s.views.some((v) => v.id === removed.view.id)) return s
  const views = [...s.views]
  views.splice(Math.min(removed.index, views.length), 0, removed.view)
  return { views, startupId: removed.startup ? removed.view.id : s.startupId }
}

/** "Open Census with this view" for one view (null for none). */
export const setStartup = (s: SavedViewsState, id: string | null): SavedViewsState => ({
  ...s,
  startupId: id && s.views.some((v) => v.id === id) ? id : null,
})

/* ───────── validation and storage ───────── */

/** A route the page may name (the store's list of views; passed in so this module stays pure). */
export type IsRouteView = (view: string) => boolean

function sanitizeView(raw: unknown, isRoute: IsRouteView): SavedView | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : null
  const name = typeof r.name === 'string' ? cleanName(r.name) : ''
  if (!id || !name) return null
  const p = r.page as Record<string, unknown> | null | undefined
  const page =
    p && typeof p === 'object' && typeof p.view === 'string' && isRoute(p.view)
      ? { view: p.view, tab: typeof p.tab === 'string' ? p.tab.slice(0, 200) : '' }
      : null
  return {
    id,
    name,
    filters: dropIdleModes(normalizeFilters(r.filters)),
    standard: isDataStandard(r.standard) ? r.standard : DEFAULT_STANDARD,
    lens: r.lens === true,
    page,
    ...(r.example === true ? { example: true } : {}),
  }
}

/** Saved views from untrusted input (storage or a settings file): invalid views are dropped. */
export function sanitizeViews(raw: unknown, isRoute: IsRouteView): SavedViewsState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const views: SavedView[] = []
  const seen = new Set<string>()
  for (const v of Array.isArray(r.views) ? r.views : []) {
    const clean = sanitizeView(v, isRoute)
    if (clean && !seen.has(clean.id)) {
      seen.add(clean.id)
      views.push(clean)
    }
  }
  const kept = views.slice(0, VIEWS_MAX)
  const startupId =
    typeof r.startupId === 'string' && kept.some((v) => v.id === r.startupId) ? r.startupId : null
  return { views: kept, startupId }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The saved views, or the starting examples when nothing was ever saved. */
export function loadViews(
  isRoute: IsRouteView,
  storage: StorageLike | null = storageOrNull(),
): SavedViewsState {
  if (!storage) return STARTING_VIEWS
  try {
    const v = storage.getItem(VIEWS_KEY)
    if (v == null) return STARTING_VIEWS
    return sanitizeViews(JSON.parse(v), isRoute)
  } catch {
    return STARTING_VIEWS
  }
}

export function saveViews(s: SavedViewsState, storage: StorageLike | null = storageOrNull()): void {
  try {
    storage?.setItem(VIEWS_KEY, JSON.stringify({ version: VIEWS_VERSION, ...s }))
  } catch {
    /* storage unavailable: the views last for this session */
  }
}

/* ───────── settings file ───────── */

/** The settings file's `views` section. */
export interface ViewsFileSection {
  version: number
  views: SavedView[]
  startupId: string | null
}

export const viewsFileSection = (s: SavedViewsState): ViewsFileSection => ({
  version: VIEWS_VERSION,
  views: s.views,
  startupId: s.startupId,
})

/**
 * A settings file's views merged into yours: a view with the same id, else the same name, is
 * replaced; the others are added while there is room (`VIEWS_MAX`). A replaced view whose name
 * another of your views has gets " (2)". The file's "Open Census with this view" applies when it
 * names a view that came in. The summary counts the views that came in.
 */
export function importViewsSection(
  s: SavedViewsState,
  section: unknown,
  isRoute: IsRouteView,
): { ok: true; state: SavedViewsState; summary: string } | { ok: false; error: string } {
  if (!section || typeof section !== 'object' || !Array.isArray((section as { views?: unknown }).views))
    return { ok: false, error: 'The saved views in the file could not be read.' }
  const file = sanitizeViews(section, isRoute)
  const views = [...s.views]
  let came = 0
  let full = 0
  // Your "Open Census with this view", which follows a view of yours that a file view replaces.
  let startup = s.startupId
  const incoming = new Set<string>()
  for (const v of file.views) {
    let at = views.findIndex((x) => x.id === v.id)
    // By name, only one of yours: two views in the file never replace each other.
    if (at < 0)
      at = views.findIndex((x) => !incoming.has(x.id) && x.name.toLowerCase() === v.name.toLowerCase())
    // Its id is unique in your list; its name is made unique among the views it doesn't replace.
    const next = { ...v, name: uniqueName(views, v.name, at >= 0 ? views[at].id : undefined) }
    if (at >= 0) {
      if (views[at].id === startup) startup = next.id
      views[at] = next
    } else if (views.length < VIEWS_MAX) views.push(next)
    else {
      full++
      continue
    }
    incoming.add(next.id)
    came++
  }
  const has = (id: string | null) => !!id && views.some((v) => v.id === id)
  const startupId = has(file.startupId) ? file.startupId : has(startup) ? startup : null
  const summary = came === 1 ? '1 saved view' : `${came} saved views`
  return {
    ok: true,
    state: { views, startupId },
    summary: full
      ? `${summary} (${full} more left out: Census keeps at most ${VIEWS_MAX} saved views)`
      : summary,
  }
}
