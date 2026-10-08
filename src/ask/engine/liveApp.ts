/**
 * The app as Ask drives it: the real `AskApp` (app.ts), and the one module of the engine that
 * touches the app's stores. Every change goes through the same functions a click does:
 *
 *  - filters: the store's `setFilters` / `resetFilters`, through the mode's filter guard (Manager
 *    mode's clamp), as one history entry (docs/FILTERS.md, part 1);
 *  - routes: `goTo`, through the mode's route guard;
 *  - records: `openDrill` (the records panel applies the mode's drill rules);
 *  - saved views: the saved views store, applied as the Views menu does, as one history entry;
 *  - figures: the figure registry of the tab on screen, which `connectScreen` hands over (the
 *    UI's `AskScreenBridge` calls it from inside each figure registry), or the whole-view renderer
 *    for a figure on another tab.
 *
 * Pointing at a figure is the UI's to draw: `showFigure` emits a screen event (`onScreenEvent`);
 * with no listener it scrolls the figure into view itself. Undo steps Back when the action's
 * history entry is still the one on screen, else puts back only what the action changed (`undoState`)
 * as a new entry, as "Filter to this" does (src/drill/focus.ts).
 */

import type { Mode, ModePicks } from '@/access/modes'
import { routeDecision } from '@/access/policy'
import { picksOfState, useMode } from '@/access/store'
import type { FigureFacts, RegisteredFigure } from '@/charts/types'
import { goTo } from '@/components/navigation'
import { batchAddress, currentEntry, lensOn, setLensOn } from '@/data/address'
import type { AnalyticsContext } from '@/data/context'
import { listedViews, matchView, viewScope } from '@/data/savedViews'
import { FILTER_DIMENSIONS, type Filters, normalizeFilters, sameFilters } from '@/data/scope'
import { type RouteView, useCensus } from '@/data/store'
import { checkScope, vocabularyOf } from '@/data/urlScope'
import { isRouteView, useSavedViews } from '@/data/viewsStore'
import { type DrillEntry, useDrillStore } from '@/drill/store'
import type { DrillSpec } from '@/drill/types'
import {
  type ActionPart,
  type AppSnapshot,
  type AskApp,
  asLeft,
  type FigureData,
  figureHiddenFromAsk,
  pickOfMode,
  type ScreenFigure,
  type ScreenRecords,
  type ScreenState,
  undoState,
} from './app'
import { readScreenActions } from './screenSetting'

/* ───────────── what the page rendered (fed by the UI's AskScreenBridge) ───────────── */

/** The figure registry of the tab on screen, as `useFigureRegistry()` gives it. */
export interface ScreenRegistry {
  list: () => RegisteredFigure[]
  tracked?: () => FigureFacts[]
}

/** What one part of the page reports: its registry, the context it rendered with and where it is. */
export interface RenderedScreen {
  registry: ScreenRegistry | null
  ctx: AnalyticsContext
  view: string
  tab: string
  /** A newer analytics context is still being computed (`useAnalyticsPending()`). */
  pending: boolean
}

let rendered: RenderedScreen | null = null
/** The last context any part of the page rendered with (kept when the page changes). */
let lastCtx: AnalyticsContext | null = null

/**
 * Hand Ask what the page on screen rendered. Call it from an effect inside each figure registry
 * (and on pages without one); it returns the disconnect for the effect's cleanup.
 */
export function connectScreen(r: RenderedScreen): () => void {
  rendered = r
  lastCtx = r.ctx
  return () => {
    if (rendered === r) rendered = null
  }
}

/* ───────────── screen events (the UI draws them) ───────────── */

export type ScreenEvent = { type: 'show_figure'; id: string; table: boolean }

const listeners = new Set<(e: ScreenEvent) => void>()

/** Listen for what Ask asks the page to show (scroll to a figure and highlight it). Returns the stop. */
export function onScreenEvent(fn: (e: ScreenEvent) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The figure's element on the page (every `Figure` carries `data-tour="figure-<id>"`). */
export function figureElement(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  try {
    return document.querySelector<HTMLElement>(`[data-tour="figure-${CSS.escape(id)}"]`)
  } catch {
    return null
  }
}

function emit(e: ScreenEvent): void {
  if (!listeners.size) {
    // No UI listening: at least bring the figure into view.
    if (e.type === 'show_figure') figureElement(e.id)?.scrollIntoView({ block: 'center' })
    return
  }
  for (const fn of listeners)
    try {
      fn(e)
    } catch (err) {
      console.error('Ask Census: a screen event handler failed', err)
    }
}

/* ───────────── reading the screen ───────────── */

const isSampleNow = (): boolean =>
  Object.values(useCensus.getState().sources).every((s) => !s || s.kind === 'sample')

function figuresNow(): ScreenFigure[] {
  const reg = rendered?.registry
  if (!reg) return []
  const st = useCensus.getState()
  // Only a registry for the route on screen (a tab that has not rendered yet lists nothing).
  if (rendered && rendered.view !== st.route.view) return []
  const facts = (reg.tracked?.() ?? []).filter((f) => !figureHiddenFromAsk(f.id))
  if (facts.length)
    return facts
      .filter((f) => f.kind === 'figure')
      .map((f) => ({
        id: f.id,
        title: f.title,
        metric: f.metric ?? null,
        rows: f.rows,
        tier: f.tier ?? null,
        withheld: !!f.withheld,
        chart: f.image,
      }))
  return reg
    .list()
    .filter((f) => !figureHiddenFromAsk(f.id))
    .map((f) => ({
      id: f.id,
      title: f.title,
      metric: f.metric ?? null,
      rows: f.rows.length,
      tier: f.tier ?? null,
      withheld: !!f.withheld,
      chart: !!f.getSvg(),
    }))
}

function recordsNow(): ScreenRecords | null {
  const stack = useDrillStore.getState().stack
  const top = stack[stack.length - 1]
  if (!top) return null
  if (top.type === 'person') {
    const name = lastCtx?.org.byId.get(top.employeeId)?.name ?? top.employeeId
    return { title: `the person card of ${name}`, subtitle: null, kind: 'person', rows: 1 }
  }
  const spec = top.spec
  return {
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    kind: spec.kind,
    rows: Array.isArray(spec.rows) ? spec.rows.length : 0,
  }
}

function screenNow(): ScreenState {
  const st = useCensus.getState()
  const views = useSavedViews.getState()
  const listed = listedViews(views, isSampleNow())
  const match = matchView(
    listed,
    { filters: st.filters, standard: st.dataStandard, lens: lensOn() },
    views.appliedId,
  )
  return {
    route: { view: st.route.view, tab: st.route.tab },
    filters: st.filters,
    standard: st.dataStandard,
    figures: figuresNow(),
    records: recordsNow(),
    savedView: match.view ? { id: match.view.id, name: match.view.name, edited: match.edited } : null,
    savedViews: listed.map((v) => ({
      id: v.id,
      name: v.name,
      page: v.page && isRouteView(v.page.view) ? { view: v.page.view, tab: v.page.tab } : null,
    })),
  }
}

/** True when the page shows the route, filters and standard in force, its context computed. */
function inStep(): boolean {
  const r = rendered
  if (!r) return false
  const st = useCensus.getState()
  if (r.pending || r.view !== st.route.view) return false
  const tab = st.route.tab
  if (tab && r.tab !== tab && !tab.startsWith(`${r.tab}:`) && !tab.startsWith(`${r.tab}/`)) return false
  return sameFilters(r.ctx.filters, st.filters) && r.ctx.standard === st.dataStandard
}

const signature = (): string =>
  figuresNow()
    .map((f) => `${f.id}:${f.rows}:${f.withheld}`)
    .join('|')

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Wait until the page has caught up with the store: the tab rendered with the filters in force
 * and its figures stopped changing (two checks 80 ms apart), or `maxMs` passed. Timers only: a
 * hidden tab runs no animation frames.
 */
async function settle(maxMs = 4000): Promise<void> {
  const until = Date.now() + maxMs
  let last = ''
  let quiet = 0
  await sleep(0)
  while (Date.now() < until) {
    if (inStep()) {
      const sig = signature()
      quiet = sig === last ? quiet + 1 : 0
      last = sig
      if (quiet >= 2) return
    }
    await sleep(80)
  }
}

/* ───────────── changing it ───────────── */

function snapshot(): AppSnapshot {
  const st = useCensus.getState()
  return {
    route: { view: st.route.view, tab: st.route.tab },
    filters: st.filters,
    standard: st.dataStandard,
    lens: lensOn(),
    savedViewId: useSavedViews.getState().appliedId,
    records: useDrillStore.getState().stack,
    entry: currentEntry(),
  }
}

function restore(before: AppSnapshot, after: AppSnapshot, parts: readonly ActionPart[]): void {
  if (parts.includes('records')) useDrillStore.setState({ stack: before.records as DrillEntry[] })
  if (!parts.includes('scope') && !parts.includes('route')) return
  const st = useCensus.getState()
  const now = {
    route: { view: st.route.view, tab: st.route.tab },
    filters: st.filters,
    standard: st.dataStandard,
    lens: lensOn(),
    savedViewId: useSavedViews.getState().appliedId,
  }
  // Back, while the action's history entry is still the one on screen and shows what it left
  // (Forward redoes it).
  const back =
    after.entry != null &&
    after.entry !== before.entry &&
    currentEntry() === after.entry &&
    asLeft(now, { before, after, parts })
  if (back && typeof history !== 'undefined') {
    history.back()
    return
  }
  // Else only what this action changed and the screen still shows, over the screen now, as one
  // new entry.
  const next = undoState(now, { before, after, parts })
  if (!next.changed) return
  const routeMoved = next.route.view !== st.route.view || next.route.tab !== st.route.tab
  batchAddress('push', () => {
    if (!sameFilters(next.filters, st.filters)) st.setFilters(normalizeFilters(next.filters))
    if (next.standard !== st.dataStandard) st.setScopeStandard(next.standard)
    if (next.lens !== lensOn()) setLensOn(next.lens)
    if (routeMoved)
      st.navigate(next.route.view as RouteView, next.route.tab, { scroll: next.route.view !== st.route.view })
  })
  if (next.savedViewId !== useSavedViews.getState().appliedId)
    useSavedViews.getState().setApplied(next.savedViewId)
}

function setFilters(next: Filters): void {
  useCensus.getState().setFilters(normalizeFilters(next), { history: 'push' })
}

function resetFilters(): void {
  batchAddress('push', () => useCensus.getState().resetFilters())
}

const DIM_WORD: Readonly<Record<string, string>> = {
  businessUnit: 'business unit',
  department: 'department',
  location: 'location',
  level: 'level',
}

/**
 * What the mode's clamp did to a saved view's filters, in a sentence, or null when it kept them:
 * Manager mode replaces a leader outside the org, HRBP mode keeps its business unit or region,
 * Finance keeps the business unit and period.
 */
function clampedWords(mode: Mode, picks: ModePicks, asked: Filters, now: Filters): string | null {
  if (sameFilters(normalizeFilters(asked), normalizeFilters(now))) return null
  switch (mode) {
    case 'manager':
      return asked.leaderId && now.leaderId !== asked.leaderId
        ? "Manager mode keeps Census on the manager's org, so its leader was replaced."
        : null
    case 'hrbp-unit':
      return `HRBP mode keeps Census on ${picks.unit ?? 'its business unit'}, so its filters outside it were left out.`
    case 'hrbp-region':
      return `HRBP mode keeps Census on ${picks.region ?? 'its region'}, so its locations outside it were left out.`
    case 'finance':
      return 'Finance mode filters by business unit and period only, so its other filters were left out.'
    default:
      return null
  }
}

/** Apply a saved view as the Views menu does (one history entry), saying what of it was left out. */
function applySavedView(id: string): { leftOut: string | null } {
  const view = useSavedViews.getState().views.find((v) => v.id === id)
  if (!view) return { leftOut: 'That saved view no longer exists.' }
  const st = useCensus.getState()
  const ctx = lastCtx
  const checked = ctx
    ? checkScope(viewScope(view), vocabularyOf(ctx))
    : { scope: viewScope(view), leftOut: [], period: null }
  const page = view.page && isRouteView(view.page.view) ? view.page : null
  batchAddress('push', () => {
    st.setFilters(checked.scope.filters)
    st.setScopeStandard(checked.scope.standard)
    setLensOn(checked.scope.lens)
    if (page && (page.view !== st.route.view || page.tab !== st.route.tab))
      st.navigate(page.view as RouteView, page.tab, { scroll: page.view !== st.route.view })
  })
  useSavedViews.getState().setApplied(view.id)
  // In words, without IDs: a leader the data does not have is "its leader".
  const parts: string[] = []
  for (const d of FILTER_DIMENSIONS) {
    const vs = checked.leftOut.filter((x) => x.dim === d)
    if (!vs.length) continue
    parts.push(d === 'leaderId' ? 'its leader' : `${DIM_WORD[d]} ${vs.map((x) => x.value).join(', ')}`)
  }
  const sentences: string[] = []
  if (parts.length) sentences.push(`Not in the loaded data, so left out: ${parts.join('; ')}.`)
  // The mode's guards, each with its own reason: the clamp kept the scope, the route guard the page.
  const now = useCensus.getState().filters
  const m = useMode.getState()
  const kept = clampedWords(m.mode, picksOfState(m), checked.scope.filters, now)
  if (kept) sentences.push(kept)
  if (page) {
    const d = routeDecision(m.mode, { view: page.view as RouteView, tab: page.tab })
    if (d.redirected && d.reason)
      sentences.push(`Its page was not opened: ${d.reason.title.replace(/\.$/, '')}. ${d.reason.description}`)
  }
  if (checked.period) sentences.push('Its custom period did not fit the reporting date, so it was adjusted.')
  return { leftOut: sentences.length ? sentences.join(' ') : null }
}

/** A figure on screen, or one laid out off screen from its view (ids start with the view key). */
async function figure(id: string): Promise<FigureData | null> {
  if (figureHiddenFromAsk(id)) return null
  const st = useCensus.getState()
  const reg = rendered?.registry
  const here = reg?.list().find((f) => f.id === id)
  if (here) {
    const facts = reg?.tracked?.().find((f) => f.id === id)
    return {
      id,
      title: here.title,
      subtitle: here.subtitle ?? null,
      note: here.note ?? null,
      columns: here.columns,
      rows: here.rows,
      tier: here.tier ?? null,
      withheld: !!here.withheld,
      metric: facts?.metric ?? here.metric ?? null,
      uses: facts?.uses ?? null,
      view: st.route.view,
      tab: rendered?.tab ?? st.route.tab,
    }
  }
  const key = id.split('-')[0] ?? ''
  // The Data room is not a view: its figures are read from the tab on screen only.
  if (typeof document === 'undefined' || !lastCtx || key === 'data') return null
  const [{ viewByKey }, { renderWholeView }, { withAccessTabs, withFeatureTabs }] = await Promise.all([
    import('@/views/registry'),
    import('@/app/wholeView'),
    import('@/views/types'),
  ])
  const registered = viewByKey.get(key as never)
  if (!registered) return null
  const ctx = lastCtx
  const view = withAccessTabs(withFeatureTabs(registered, ctx.features), ctx.access)
  const out = await renderWholeView(view, {
    measure: `census:ask:figure:${key}`,
    whileMounted: async (groups) => {
      for (const g of groups) {
        const f = g.figures.find((x) => x.id === `${g.key}:${id}`)
        if (f) return { figure: f, tab: g.key }
      }
      return null
    },
  })
  if (!out.value) return null
  const { figure: f, tab } = out.value
  const facts = out.facts[tab]?.find((x) => x.id === id)
  return {
    id,
    title: f.title,
    subtitle: f.subtitle ?? null,
    note: f.note ?? null,
    columns: f.columns,
    rows: f.rows,
    tier: f.tier ?? null,
    withheld: !!f.withheld,
    metric: facts?.metric ?? f.metric ?? null,
    uses: facts?.uses ?? null,
    view: key,
    tab,
  }
}

/** The app as Ask drives it. One per page: pass it as `env.app`. */
export const liveAskApp: AskApp = {
  actionsOn: () => readScreenActions(),
  screen: screenNow,
  settle,
  snapshot,
  restore,
  setFilters,
  resetFilters,
  goTo: (view, tab) => goTo(view as RouteView, tab),
  showFigure: (id, opts) => emit({ type: 'show_figure', id, table: opts.table }),
  openRecords: (spec: DrillSpec) => useDrillStore.getState().open(spec),
  applySavedView,
  figure,
  mode: () => {
    const m = useMode.getState()
    return { mode: m.mode, managerId: m.managerId, pick: pickOfMode(m.mode, picksOfState(m)) }
  },
}

/** For tests: forget what the page reported. */
export function resetScreenForTests(): void {
  rendered = null
  lastCtx = null
  listeners.clear()
}
