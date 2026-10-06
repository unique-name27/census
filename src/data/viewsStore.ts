/**
 * The saved views as live state (docs/FILTERS.md, part 2): the list, "Open Census with this view",
 * and which view was applied last (for the filter row's name and "edited"). Every change is saved
 * to `census:views` right away; another tab's changes arrive through the storage event.
 */
import { create } from 'zustand'
import {
  addView,
  EMPTY_VIEWS,
  importViewsSection,
  loadViews,
  moveView,
  removeView,
  renameView,
  restoreView,
  type SavedView,
  type SavedViewsState,
  saveViews,
  setStartup,
  updateView,
  VIEWS_KEY,
  type ViewPage,
} from './savedViews'
import { ROUTE_VIEWS, type RouteView } from './store'
import type { UrlScope } from './urlScope'

export const isRouteView = (v: string): boolean => ROUTE_VIEWS.includes(v as RouteView)

type Removed = NonNullable<ReturnType<typeof removeView>['removed']>

interface ViewsState extends SavedViewsState {
  /** The view applied last in this tab (memory only). */
  appliedId: string | null
  /** Save a new view and mark it applied; null when the list is full (`viewsFull`). */
  add: (v: { name: string; scope: UrlScope; page: ViewPage | null }) => SavedView | null
  update: (id: string, scope: UrlScope) => void
  rename: (id: string, name: string) => void
  move: (id: string, delta: number) => void
  remove: (id: string) => Removed | null
  restore: (removed: Removed) => void
  setStartup: (id: string | null) => void
  setApplied: (id: string | null) => void
  /** Merge a settings file's views section; the summary says what came in. */
  importSection: (section: unknown) => { ok: true; summary: string } | { ok: false; error: string }
  /** Forget every saved view (clearing the device); the examples come back. */
  reset: () => void
}

const pick = (s: SavedViewsState): SavedViewsState => ({ views: s.views, startupId: s.startupId })

export const useSavedViews = create<ViewsState>((set, get) => {
  const commit = (next: SavedViewsState) => {
    saveViews(next)
    set(pick(next))
  }
  return {
    ...loadViews(isRouteView),
    appliedId: null,
    add(v) {
      const next = addView(pick(get()), v)
      if (next.views.length === get().views.length) return null
      commit(next)
      const view = next.views[next.views.length - 1]
      set({ appliedId: view.id })
      return view
    },
    update(id, scope) {
      commit(updateView(pick(get()), id, scope))
      set({ appliedId: id })
    },
    rename(id, name) {
      commit(renameView(pick(get()), id, name))
    },
    move(id, delta) {
      commit(moveView(pick(get()), id, delta))
    },
    remove(id) {
      const r = removeView(pick(get()), id)
      if (!r.removed) return null
      commit(r.state)
      if (get().appliedId === id) set({ appliedId: null })
      return r.removed
    },
    restore(removed) {
      commit(restoreView(pick(get()), removed))
    },
    setStartup(id) {
      commit(setStartup(pick(get()), id))
    },
    setApplied(appliedId) {
      set({ appliedId })
    },
    importSection(section) {
      const r = importViewsSection(pick(get()), section, isRouteView)
      if (!r.ok) return r
      commit(r.state)
      return { ok: true, summary: r.summary }
    },
    reset() {
      set({ ...loadViews(isRouteView, null), appliedId: null })
    },
  }
})

/** The views state for the settings file and tests. */
export const savedViewsState = (): SavedViewsState => pick(useSavedViews.getState())

export { EMPTY_VIEWS }

// Another tab of this browser saving its views updates this one (null: storage cleared).
try {
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key === VIEWS_KEY || e.key === null) useSavedViews.setState(loadViews(isRouteView))
    })
} catch {
  /* no window events (tests) */
}
