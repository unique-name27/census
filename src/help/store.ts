/**
 * Help state: the Help sheet (open, article, search), the running tour, and what this browser
 * remembers (`census:help`: the welcome card dismissed, tours finished). Light on purpose: no
 * article or tour content, so the shared components and the Scorecard can import it.
 *
 * A tour remembers the page and the filters it started from and puts both back when it ends. It
 * never adds to the browser history (docs/FILTERS.md: Help does not touch history): its moves
 * replace the entry on screen.
 */
import { create } from 'zustand'
import { useMode } from '@/access/store'
import type { Filters } from '@/data/scope'
import { closeSettings, type Route, useCensus } from '@/data/store'
import { useDrillStore } from '@/drill/store'

export const HELP_STORAGE_KEY = 'census:help'

export interface HelpPrefs {
  /** The Scorecard welcome card was dismissed (or its tour taken). */
  welcomeDismissed: boolean
  /** Tours finished to the last step, by id. */
  completed: readonly string[]
  /** My team's welcome line (Manager mode) was dismissed; set only once it is. */
  managerWelcomeDismissed?: true
  /** The modes whose Home welcome line was dismissed (CHRO, HRBP, Compensation and the rest), each on its own. */
  homeWelcomeDismissed?: readonly string[]
}

/** Whose welcome line: HR mode's on the Scorecard, Manager mode's on My team, or a role's on Home. */
export type WelcomeLine = 'hr' | 'manager' | { home: string }

const DEFAULT_PREFS: HelpPrefs = { welcomeDismissed: false, completed: [] }

/** Read the remembered prefs; anything unreadable falls back to the defaults. */
export function parsePrefs(raw: string | null): HelpPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const v = JSON.parse(raw) as Partial<HelpPrefs> | null
    if (!v || typeof v !== 'object') return DEFAULT_PREFS
    const strings = (x: unknown): string[] =>
      Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === 'string'))] : []
    const home = strings(v.homeWelcomeDismissed)
    return {
      welcomeDismissed: v.welcomeDismissed === true,
      ...(v.managerWelcomeDismissed === true ? { managerWelcomeDismissed: true as const } : {}),
      ...(home.length ? { homeWelcomeDismissed: home } : {}),
      completed: strings(v.completed),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function loadPrefs(): HelpPrefs {
  try {
    return parsePrefs(localStorage.getItem(HELP_STORAGE_KEY))
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(p: HelpPrefs): void {
  try {
    localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable: the card shows again next time, nothing else changes */
  }
}

export interface TourRun {
  id: string
  index: number
  /** Where the tour started, to return there at the end. */
  from: Route
  /** The filters when it started, put back at the end. */
  filters: Filters
  /** What had focus when the tour started; focus returns there. */
  opener: HTMLElement | null
  /** The live mode when the tour started: finishing "Getting started with your home" ends that mode's welcome line. */
  mode?: string
}

export type TourEnd = 'done' | 'skip'

interface HelpState {
  open: boolean
  /** The article shown in the sheet; null for the sheet's home. */
  articleId: string | null
  query: string
  /** Changes on every open request, so asking again lands on the requested article. */
  nonce: number
  /** A line at the top of the sheet's list ("That article is not shown in this mode."). */
  notice: string | null
  tour: TourRun | null
  prefs: HelpPrefs
  /** Where focus goes when the tour ends and its opener is gone. */
  lastEnded: { id: string; how: TourEnd; nonce: number } | null

  openHelp: (articleId?: string | null, notice?: string | null) => void
  closeHelp: () => void
  showArticle: (id: string | null) => void
  setQuery: (q: string) => void
  startTour: (id: string) => void
  goToStep: (index: number) => void
  endTour: (how: TourEnd) => void
  /** Dismiss a welcome line: HR mode's on the Scorecard (default), Manager mode's, or one role's Home. */
  dismissWelcome: (which?: WelcomeLine) => void
  /** Re-read the remembered prefs (another tab changed them). */
  reloadPrefs: () => void
}

export const useHelp = create<HelpState>((set, get) => ({
  open: false,
  articleId: null,
  query: '',
  nonce: 0,
  notice: null,
  tour: null,
  prefs: loadPrefs(),
  lastEnded: null,

  openHelp(articleId = null, notice = null) {
    // Every open starts from a clean search: an old query would hide the home links (tours,
    // Report a problem, What's new) and give "Back to results" for an unrelated search.
    set((s) => ({ open: true, articleId, query: '', nonce: s.nonce + 1, notice }))
  },
  closeHelp() {
    set({ open: false })
  },
  showArticle(id) {
    set({ articleId: id })
  },
  setQuery(query) {
    set({ query, articleId: null })
  },
  startTour(id) {
    const { route, filters } = useCensus.getState()
    const active = typeof document === 'undefined' ? null : document.activeElement
    // Panels that hold focus would sit over the tour: close them first.
    useDrillStore.getState().close()
    closeSettings()
    set({
      open: false,
      tour: {
        id,
        index: 0,
        from: { ...route },
        filters: { ...filters },
        opener: active instanceof HTMLElement && active !== document.body ? active : null,
        mode: useMode.getState().mode,
      },
    })
  },
  goToStep(index) {
    const t = get().tour
    if (t) set({ tour: { ...t, index } })
  },
  endTour(how) {
    const t = get().tour
    if (!t) return
    const census = useCensus.getState()
    if (JSON.stringify(census.filters) !== JSON.stringify(t.filters))
      census.setFilters(t.filters, { history: 'replace' })
    const r = census.route
    if (r.view !== t.from.view || r.tab !== t.from.tab)
      census.navigate(t.from.view, t.from.tab, { history: 'replace', scroll: r.view !== t.from.view })
    const prefs = how === 'done' ? withTourDone(get().prefs, t.id, t.mode) : get().prefs
    if (prefs !== get().prefs) savePrefs(prefs)
    set((s) => ({
      tour: null,
      prefs,
      lastEnded: { id: t.id, how, nonce: (s.lastEnded?.nonce ?? 0) + 1 },
    }))
  },
  dismissWelcome(which = 'hr') {
    const prefs = withDismissed(get().prefs, which)
    if (prefs === get().prefs) return
    savePrefs(prefs)
    set({ prefs })
  },
  reloadPrefs() {
    set({ prefs: loadPrefs() })
  },
}))

/** The prefs with a welcome line dismissed (the same object when it already was). */
export function withDismissed(p: HelpPrefs, which: WelcomeLine): HelpPrefs {
  if (which === 'manager') return p.managerWelcomeDismissed ? p : { ...p, managerWelcomeDismissed: true }
  if (which === 'hr') return p.welcomeDismissed ? p : { ...p, welcomeDismissed: true }
  const done = p.homeWelcomeDismissed ?? []
  return done.includes(which.home) ? p : { ...p, homeWelcomeDismissed: [...done, which.home] }
}

/**
 * Whether a welcome line is gone: dismissed, or its tour finished. A role's Home line is its own:
 * dismissing it, or finishing "Getting started with your home", as CHRO leaves Compensation's.
 */
export function welcomeDismissed(p: HelpPrefs, which: WelcomeLine): boolean {
  if (which === 'manager') return p.managerWelcomeDismissed === true || p.completed.includes('manager-start')
  if (which === 'hr') return p.welcomeDismissed || p.completed.includes('getting-started')
  return (p.homeWelcomeDismissed ?? []).includes(which.home)
}

/**
 * The prefs with a tour finished in a mode: marked finished, and "Getting started with your home"
 * also ends the welcome line of the mode it was taken in (and no other mode's).
 */
export function withTourDone(p: HelpPrefs, id: string, mode?: string): HelpPrefs {
  const done = withCompleted(p, id)
  return id === 'home-start' && mode ? withDismissed(done, { home: mode }) : done
}

/** The prefs with a tour marked finished (the same object when it already was). */
export function withCompleted(p: HelpPrefs, id: string): HelpPrefs {
  return p.completed.includes(id) ? p : { ...p, completed: [...p.completed, id] }
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === HELP_STORAGE_KEY || e.key === null) useHelp.getState().reloadPrefs()
  })

/** Imperative helpers for event handlers. */
export const openHelp = (articleId?: string | null, notice?: string | null): void =>
  useHelp.getState().openHelp(articleId, notice)
export const closeHelp = (): void => useHelp.getState().closeHelp()
export const startTour = (id: string): void => useHelp.getState().startTour(id)
