/**
 * What Ask can see and change on screen (docs/ASK-ACTIONS.md, parts 2 and 3): the interface the
 * engine drives, injected through `ToolEnv.app` so the engine stays pure and testable without
 * React. The app's own implementation is `createLiveApp()` (liveApp.ts): the store's filters with
 * the mode's clamp, `goTo` with the route guard, the figure registry, `openDrill` and the saved
 * views. Tests pass a fake (`fakeApp` in testkit.ts).
 *
 * Nothing here holds a name: figure titles, record titles and saved view names are passed through
 * the privacy pass before anything goes to Claude.
 */
import type { Column } from '@/charts/types'
import type { DataStandard, Tier } from '@/data/quality/tier'
import {
  canonicalFilters,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type Filters,
  isExcluded,
  sameFilters,
  withMode,
} from '@/data/scope'
import type { DrillSpec } from '@/drill/types'

/** A view (or page) and tab, as the address names them: `{ view: 'hrbp', tab: 'attrition' }`. */
export interface ScreenRoute {
  view: string
  tab: string
}

/** A figure on the tab on screen, as its registry entry declares it. */
export interface ScreenFigure {
  id: string
  title: string
  /** The metric dictionary entry it shows. */
  metric: string | null
  /** Rows behind it. */
  rows: number
  tier: Tier | null
  /** The data standard holds it back (its rows hold the reason). */
  withheld: boolean
  /** It draws a chart (false: a table or a list). */
  chart: boolean
}

/** The records panel, when it is open. */
export interface ScreenRecords {
  title: string
  subtitle: string | null
  /** The drill kind ('employees', 'cases' ...). */
  kind: string
  rows: number
}

/** A saved view the Views menu lists. */
export interface SavedViewInfo {
  id: string
  name: string
  /** The page it opens on, or null to stay where you are. */
  page: ScreenRoute | null
}

/** What the person is looking at. */
export interface ScreenState {
  route: ScreenRoute
  /** The filters in force (the store's, after the mode's clamp). */
  filters: Filters
  standard: DataStandard
  /** The figures on the tab on screen, in page order (the mode's hidden figures never register). */
  figures: readonly ScreenFigure[]
  records: ScreenRecords | null
  /** The saved view the scope is in (edited once the scope moved away from it). */
  savedView: { id: string; name: string; edited: boolean } | null
  /** The saved views the Views menu lists. */
  savedViews: readonly SavedViewInfo[]
}

/** What an action can be undone to. `records` belongs to the app (the records panel's stack). */
export interface AppSnapshot {
  route: ScreenRoute
  filters: Filters
  standard: DataStandard
  lens: boolean
  savedViewId: string | null
  records: unknown
  /** The history entry on screen (null outside a browser). */
  entry: number | null
}

/** The parts of the screen an action changed, so Undo puts back only those. */
export type ActionPart = 'scope' | 'route' | 'records'

/** A figure's rows and columns (with their drills), for `make_chart`. */
export interface FigureData {
  id: string
  title: string
  subtitle: string | null
  note: string | null
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
  tier: Tier | null
  withheld: boolean
  metric: string | null
  /** The fields it reads (`Figure`'s `uses`), when it declares them: Ask's privacy rules read them. */
  uses?: readonly string[] | null
  /** Where it is: the view and tab it is on. */
  view: string
  tab: string
}

/** The app as Ask drives it. Every change goes through the same functions as a click. */
export interface AskApp {
  /** "Let Ask change the screen" (Settings > Ask Census, on by default). Off: no action tools. */
  actionsOn(): boolean
  /** What is on screen now. */
  screen(): ScreenState
  /**
   * Resolve once the page shows the route and filters in force (the tab rendered, its figures
   * registered, the analytics context computed), or after `maxMs`.
   */
  settle(maxMs?: number): Promise<void>
  snapshot(): AppSnapshot
  /**
   * Undo: put back what an action changed (`undoState`: only the filters, period, route and so on
   * that differ between `before` and `after`). Back when the action's history entry
   * (`after.entry`) is still the one on screen, else those parts over the screen now, as a new entry.
   */
  restore(before: AppSnapshot, after: AppSnapshot, parts: readonly ActionPart[]): void
  /** New filters through the mode's clamp, as one history entry. */
  setFilters(next: Filters): void
  /** Back to the defaults (Manager mode: the manager's whole org), as one history entry. */
  resetFilters(): void
  /** Show a view and tab through the route guard, as one history entry. */
  goTo(view: string, tab: string): void
  /** Scroll to a figure on the tab and highlight it (the UI's job: an event it handles). */
  showFigure(id: string, opts: { table: boolean }): void
  /** Open the records panel (the mode's drill rules apply in the panel). */
  openRecords(spec: DrillSpec): void
  /**
   * Apply a saved view (scope and page) as one history entry. `leftOut` says, in a sentence, what
   * of its scope the loaded data or the mode could not use; null when it applied whole.
   */
  applySavedView(id: string): { leftOut: string | null }
  /** A figure's data: on the tab on screen, or laid out off screen from its view; null when there is none. */
  figure(id: string): Promise<FigureData | null>
  /**
   * The mode in force now (and Manager mode's manager), when the app knows it. A tool call from an
   * answer started in another mode is refused: the answer's context is the old mode's.
   */
  mode?(): { mode: string; managerId: string | null }
}

/**
 * Figures Ask never reads: the Data room's mapping figures list raw values from the person's files
 * (values off the official lists, job titles), which go to Claude only as the tools' grouped,
 * checked counts.
 */
export const figureHiddenFromAsk = (id: string): boolean => /^data-map-/.test(id)

export const FIGURE_HIDDEN_FROM_ASK =
  "The Data room's mapping figures list raw values from the person's files, which never go to Claude, so Ask cannot point at or draw them. Say so; explain_quality gives values off the official lists as checked counts."

/** The tools that change the screen. */
export type ActionTool =
  | 'set_filters'
  | 'reset_filters'
  | 'open_view'
  | 'show_figure'
  | 'open_records'
  | 'apply_saved_view'

/**
 * One action Ask took, for the answer's action line and its Undo: "Filtered to Bengaluru, last 6
 * months". It arrives on the tool call (`ToolCallRecord.action`) and in `AskResult.actions`.
 */
export interface AskAction {
  /** The tool_use id. */
  id: string
  tool: ActionTool
  /** The action line in sentence case; it may hold person tokens ("Filtered to {{P3}}'s org"). */
  line: string
  /** What Undo puts back (pass the whole action to `undoAction`); null when there is nothing to undo. */
  undo: { before: AppSnapshot; after: AppSnapshot; parts: readonly ActionPart[] } | null
  /** show_figure: the figure to scroll to and highlight, and whether it shows its table. */
  figure?: { id: string; table: boolean }
  /**
   * open_records: the records it opened, for Open again (the records panel covers the answer while
   * it is open, and closing it is the person's own undo). Kept here only, never sent.
   */
  records?: DrillSpec
}

/** A tool call refused because the mode changed after the answer started. */
export const MODE_CHANGED =
  'The mode changed while this answer was being written, so nothing was done and nothing was calculated. Stop here.'

/**
 * Whether the mode in force (`app.mode()`) is no longer the one the answer's context was built
 * for: another mode, or another manager in Manager mode. False when the app does not say.
 */
export function modeMoved(
  app: Pick<AskApp, 'mode'> | null | undefined,
  access: { mode: string; lock: { managerId: string } | null } | null | undefined,
): boolean {
  const now = app?.mode?.()
  if (!now || !access) return false
  if (now.mode !== access.mode) return true
  return !!access.lock && access.lock.managerId !== now.managerId
}

/** Undo an action: false when it has nothing to undo. */
export function undoAction(app: Pick<AskApp, 'restore'>, action: AskAction): boolean {
  if (!action.undo) return false
  app.restore(action.undo.before, action.undo.after, action.undo.parts)
  return true
}

/**
 * What an action changed, finer than its parts: each org filter, the period, the data standard,
 * the quality lens, the saved view in force, the route and the records panel. Undo puts back only
 * these, so undoing one action never undoes another one's change.
 */
export type ChangeKey = FilterDimension | 'period' | 'standard' | 'lens' | 'savedView' | 'route' | 'records'

type Undo = NonNullable<AskAction['undo']>

/** One org filter as it filters: its values (sorted) and its mode, a mode without values ignored. */
const dimKey = (f: Filters, d: FilterDimension): string => {
  const c = canonicalFilters(f)
  return JSON.stringify([d === 'leaderId' ? c.leaderId : c[d], c.modes[d] ?? null])
}

const periodKey = (f: Filters): string => {
  const c = canonicalFilters(f)
  return JSON.stringify([c.period, c.customStart, c.customEnd])
}

const sameRoute = (a: ScreenRoute, b: ScreenRoute): boolean => a.view === b.view && a.tab === b.tab

/** The parts of the screen an action changed. */
export function changeKeys(undo: Undo): ChangeKey[] {
  const { before: b, after: a, parts } = undo
  const out: ChangeKey[] = []
  if (parts.includes('scope')) {
    for (const d of FILTER_DIMENSIONS) if (dimKey(b.filters, d) !== dimKey(a.filters, d)) out.push(d)
    if (periodKey(b.filters) !== periodKey(a.filters)) out.push('period')
    if (b.standard !== a.standard) out.push('standard')
    if (b.lens !== a.lens) out.push('lens')
    if (b.savedViewId !== a.savedViewId) out.push('savedView')
  }
  if (parts.includes('route') && !sameRoute(b.route, a.route)) out.push('route')
  if (parts.includes('records')) out.push('records')
  return out
}

/** The screen as Undo reads and writes it. */
export interface UndoState {
  route: ScreenRoute
  filters: Filters
  standard: DataStandard
  lens: boolean
  savedViewId: string | null
}

/** One of the keys as a screen shows it, comparable between screens. */
function keyValue(k: ChangeKey, s: UndoState): string {
  switch (k) {
    case 'period':
      return periodKey(s.filters)
    case 'standard':
      return s.standard
    case 'lens':
      return String(s.lens)
    case 'savedView':
      return String(s.savedViewId)
    case 'route':
      return JSON.stringify([s.route.view, s.route.tab])
    case 'records':
      return ''
    default:
      return dimKey(s.filters, k)
  }
}

/**
 * What an action changed that the screen still shows as the action left it. A filter, the period
 * or the page changed since (by the person, or by a later action) is no longer the action's to put
 * back, so Undo leaves it; with nothing left, the line says "Changed since" instead of Undo.
 */
export function stillShown(now: UndoState, undo: Undo): ChangeKey[] {
  return changeKeys(undo).filter((k) => k === 'records' || keyValue(k, now) === keyValue(k, undo.after))
}

/** The screen shows exactly what the action left (nothing changed since, of any filter or the page). */
export function asLeft(now: UndoState, undo: Undo): boolean {
  const a = undo.after
  return (
    sameFilters(now.filters, a.filters) &&
    now.standard === a.standard &&
    now.lens === a.lens &&
    sameRoute(now.route, a.route)
  )
}

/**
 * What Undo puts on screen: the screen now, with only what the action changed, and still shows as
 * it left it, set back to how it was before it. Two actions that changed different filters undo in
 * either order; the person's own changes since, to other filters or to the same one, are kept.
 * `changed` is false when there is nothing to put back.
 */
export function undoState(now: UndoState, undo: Undo): UndoState & { changed: boolean } {
  const keys = new Set(stillShown(now, undo))
  const b = undo.before
  let filters = now.filters
  for (const d of FILTER_DIMENSIONS) {
    if (!keys.has(d)) continue
    filters = {
      ...filters,
      ...(d === 'leaderId' ? { leaderId: b.filters.leaderId } : { [d]: [...b.filters[d]] }),
      modes: withMode(filters.modes, d, isExcluded(b.filters, d) ? 'exclude' : 'include'),
    }
  }
  if (keys.has('period'))
    filters = {
      ...filters,
      period: b.filters.period,
      customStart: b.filters.customStart,
      customEnd: b.filters.customEnd,
    }
  const out: UndoState = {
    route: keys.has('route') ? b.route : now.route,
    filters,
    standard: keys.has('standard') ? b.standard : now.standard,
    lens: keys.has('lens') ? b.lens : now.lens,
    savedViewId: keys.has('savedView') ? b.savedViewId : now.savedViewId,
  }
  const changed =
    !sameFilters(out.filters, now.filters) ||
    out.standard !== now.standard ||
    out.lens !== now.lens ||
    out.savedViewId !== now.savedViewId ||
    !sameRoute(out.route, now.route)
  return { ...out, changed }
}

/**
 * The actions whose Undo waits for a later one: an action that changed what a later action (not
 * undone) changed again is undone after it, so Undo never brings back a change already undone.
 * `actions` in the order they ran, across the conversation.
 */
export function undoWaits(actions: readonly AskAction[], isUndone: (a: AskAction) => boolean): Set<string> {
  const out = new Set<string>()
  const later = new Set<ChangeKey>()
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i]
    if (!a?.undo || isUndone(a)) continue
    const keys = changeKeys(a.undo)
    if (keys.some((k) => later.has(k))) out.add(a.id)
    for (const k of keys) later.add(k)
  }
  return out
}

/**
 * The action's history entry is behind the one on screen: the person stepped Back past it, so the
 * screen no longer shows it (Forward brings it back). Entry ids only grow (src/app/addressWriter.ts).
 */
export function steppedBack(action: AskAction, entry: number | null): boolean {
  const u = action.undo
  if (!u || entry == null || u.after.entry == null || u.after.entry === u.before.entry) return false
  if (!u.parts.includes('scope') && !u.parts.includes('route')) return false
  return entry < u.after.entry
}
