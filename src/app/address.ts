/**
 * The one writer of the address (docs/FILTERS.md, part 1). It follows the store (route, filters,
 * data standard) and the quality lens and writes `#view.tab?scope` with the history policy of
 * `AddressWriter`; it follows Back, Forward and typed or pasted addresses the other way, restoring
 * the route and the scope together without pushing.
 *
 * On load (`useAddress`, once the data is loaded): a link's scope applies exactly, minus values
 * the data doesn't have (a toast says which); without one, the saved view marked "Open Census
 * with this view" applies, else your last filters; either way the address is then written with
 * `replaceState`.
 *
 * The data standard and the quality lens in the address are this tab's scope: a link, Back and
 * Forward or a saved view show them here without saving them, so other open tabs never follow.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { currentScope, routePath } from '@/components/navigation'
import { toast } from '@/components/toast'
import {
  type AddressIntent,
  addressBatching,
  batchAddress,
  connectLens,
  currentEntry,
  isHistoryMark,
  lensOn,
  onAddressFlush,
  setLensOn,
  takeAddressHint,
} from '@/data/address'
import type { AnalyticsContext } from '@/data/context'
import { normalizeFilters, sameFilters } from '@/data/scope'
import {
  HOME_VIEW,
  lastFilters,
  parseHash,
  type Route,
  savedDataStandard,
  takeInitialScope,
  useCensus,
} from '@/data/store'
import {
  checkScope,
  hashWithScope,
  type LeftOut,
  leftOutMessage,
  type PeriodProblem,
  periodMessage,
  readScope,
  type ScopeVocabulary,
  splitHash,
  type UrlScope,
  vocabularyOf,
} from '@/data/urlScope'
import { useSavedViews } from '@/data/viewsStore'
import { useQualityLens } from '@/views/data/quality-overview/lens'
import { AddressWriter } from './addressWriter'

// The quality lens lives with the Data room; the address reads and sets it through here, for this
// tab only (the switch itself remembers it in this browser).
connectLens({ get: () => useQualityLens.getState().on, set: (on) => useQualityLens.getState().show(on) })

const browserHistory = {
  hash: () => (typeof location === 'undefined' ? '' : location.hash),
  state: () => {
    try {
      return typeof history === 'undefined' ? null : history.state
    } catch {
      return null
    }
  },
  push: (hash: string, mark: { census: number }) => {
    try {
      history.pushState(mark, '', hash)
    } catch {
      // Some browsers refuse history entries for file:// pages; a plain hash change still works.
      location.hash = hash
    }
  },
  replace: (hash: string, mark: { census: number }) => {
    try {
      history.replaceState(mark, '', hash)
    } catch {
      /* file:// pages in some browsers: the route still works without the hash */
    }
  },
}

export const addressWriter = new AddressWriter(browserHistory, {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
})

/** Keep one history entry for every change while a filter menu is open; call the result on close. */
export const holdHistory = (): (() => void) => addressWriter.hold()

/** The address for the route and scope on screen. */
export function addressFor(route: Route, scope: UrlScope = currentScope()): string {
  return hashWithScope(routePath(route.view, route.tab), scope)
}

let applying = false

/**
 * The saved view applied on each history entry Census wrote (this page load only), so Back and
 * Forward show the view that entry was in, never "edited" over a scope it was not applied to.
 */
const appliedAt = new Map<number, string | null>()

/** Remember the saved view applied on the entry on screen. */
function noteEntry(): void {
  const id = currentEntry()
  if (id != null) appliedAt.set(id, useSavedViews.getState().appliedId)
}

/** Write the address for the current state with this intent (or the default for what changed). */
function writeNow(intent: AddressIntent | null): void {
  if (applying || typeof location === 'undefined') return
  const want = addressFor(useCensus.getState().route)
  const routeChanged = splitHash(want).route !== splitHash(location.hash).route
  addressWriter.write(want, intent ?? (routeChanged ? 'push' : 'coalesce'))
  noteEntry()
}

/**
 * Put a scope on screen: filters, data standard and lens (no address write of its own). `save`
 * stores the filters even when they are already on screen (the scope a page opened with becomes
 * your last filters). The data standard and the lens are this tab's: never saved from here.
 */
function putScope(scope: UrlScope, save = false): void {
  const st = useCensus.getState()
  if (save || !sameFilters(scope.filters, st.filters)) st.setFilters(normalizeFilters(scope.filters))
  st.setScopeStandard(scope.standard)
  if (lensOn() !== scope.lens) setLensOn(scope.lens)
}

/** "The link's period "x" could not be read, so the default was used." */
const unreadableMessage = (unreadable: readonly string[]): string =>
  `The link's ${unreadable.join(' and ')} could not be read, so the ${unreadable.length === 1 ? 'default was' : 'defaults were'} used.`

function toastLeftOut(
  leftOut: readonly LeftOut[],
  unreadable: readonly string[],
  period: PeriodProblem | null = null,
): void {
  const parts: string[] = []
  if (leftOut.length) parts.push(leftOutMessage(leftOut))
  if (unreadable.length) parts.push(unreadableMessage(unreadable))
  if (period) parts.push(periodMessage(period))
  if (!parts.length) return
  toast(parts[0], { ...(parts.length > 1 ? { description: parts.slice(1).join(' ') } : {}), timeout: 9000 })
}

/** Follow the address: Back, Forward, or an address typed, pasted or clicked. Never pushes. */
function followAddress(vocab: ScopeVocabulary): void {
  const st = useCensus.getState()
  const route = parseHash(location.hash)
  const read = readScope(splitHash(location.hash).query)
  // An entry Census wrote is complete: no scope there means the defaults. A bare "#hrbp" typed or
  // clicked keeps the scope on screen.
  const exact = read.present || isHistoryMark(history.state)
  let leftOut: LeftOut[] = []
  let period: PeriodProblem | null = null
  addressWriter.endBurst()
  applying = true
  try {
    batchAddress('replace', () => {
      if (exact) {
        const checked = checkScope(read.scope, vocab)
        leftOut = checked.leftOut
        period = checked.period
        putScope(checked.scope)
        // The saved view this entry was in (none for an entry from before this page load).
        const entry = currentEntry()
        useSavedViews.getState().setApplied(entry == null ? null : (appliedAt.get(entry) ?? null))
      }
      if (route && (route.view !== st.route.view || route.tab !== st.route.tab))
        st.navigate(route.view, route.tab, { history: 'replace', scroll: route.view !== st.route.view })
    })
  } finally {
    applying = false
  }
  // Write the canonical address for this entry (an unknown hash gets the route on screen).
  takeAddressHint()
  addressWriter.write(addressFor(useCensus.getState().route), 'replace')
  noteEntry()
  if (exact) toastLeftOut(leftOut, read.unreadable, period)
}

/**
 * True when the saved view set to open Census can't be used: an example while your own data is
 * loaded (examples are not listed then, so it could be neither seen nor unset). That setting is
 * forgotten, and Census opens with your last filters as when no view is set.
 */
function dropExampleStartup(ctx: Pick<AnalyticsContext, 'isSample'>, viewId: string | undefined): boolean {
  const views = useSavedViews.getState()
  const view = views.views.find((v) => v.id === viewId)
  if (!view?.example || ctx.isSample) return false
  views.setStartup(null)
  return true
}

/** The first address of this page load: finish applying the scope Census opened with. */
export function loadAddress(ctx: AnalyticsContext): void {
  const init = takeInitialScope()
  if (!init) return
  const vocab = vocabularyOf(ctx)
  takeAddressHint()
  applying = true
  let leftOut: LeftOut[] = []
  let period: PeriodProblem | null = null
  let title: string | undefined
  try {
    if (init.source === 'startup' && dropExampleStartup(ctx, init.viewId)) {
      putScope({ filters: lastFilters(), standard: savedDataStandard(), lens: lensOn() }, true)
      if (init.page) {
        const named = parseHash(location.hash)
        useCensus
          .getState()
          .navigate(named?.view ?? HOME_VIEW, named?.tab ?? '', { history: 'replace', scroll: false })
      }
    } else if (init.scope) {
      const checked = checkScope(init.scope, vocab)
      leftOut = checked.leftOut
      period = checked.period
      putScope(checked.scope, true)
      if (init.source === 'startup') {
        useSavedViews.getState().setApplied(init.viewId ?? null)
        const name = useSavedViews.getState().views.find((v) => v.id === init.viewId)?.name
        if ((leftOut.length || period) && name) title = `Opened "${name}" without part of its scope`
      }
    }
  } finally {
    applying = false
  }
  takeAddressHint()
  addressWriter.write(addressFor(useCensus.getState().route), 'replace')
  noteEntry()
  if (title)
    toast(title, {
      description: [
        leftOut.length ? leftOutMessage(leftOut, "The saved view's") : '',
        period ? periodMessage(period, "The saved view's") : '',
      ]
        .filter(Boolean)
        .join(' '),
      timeout: 9000,
    })
  else toastLeftOut(leftOut, init.source === 'link' ? init.unreadable : [], period)
}

/**
 * Follow the stores and write the address when the route, the filters, the data standard or the
 * quality lens change. Every change takes its hint (`hintAddress`), also one that changes nothing
 * the address holds, so a hint never lingers to a later change. Returns the unsubscribe.
 */
export function followStores(write: (intent: AddressIntent | null) => void): () => void {
  const unsubs = [
    useCensus.subscribe((s, prev) => {
      const intent = takeAddressHint()
      if (s.route === prev.route && s.filters === prev.filters && s.dataStandard === prev.dataStandard) return
      if (addressBatching()) return
      write(intent)
    }),
    useQualityLens.subscribe((s, prev) => {
      const intent = takeAddressHint()
      if (s.on === prev.on || addressBatching()) return
      write(intent)
    }),
    // A saved view applied (or let go) belongs to the entry on screen.
    useSavedViews.subscribe((s, prev) => {
      if (s.appliedId !== prev.appliedId) noteEntry()
    }),
  ]
  return () => {
    for (const u of unsubs) u()
  }
}

/**
 * Keep the address and the stores in step both ways after load: the stores write the address, and
 * Back, Forward and typed addresses set the stores. `getCtx` gives the live analytics context.
 * Returns the stop.
 */
export function connectAddress(getCtx: () => AnalyticsContext): () => void {
  const unfollow = followStores(writeNow)
  onAddressFlush((intent) => writeNow(intent))
  const follow = () => followAddress(vocabularyOf(getCtx()))
  window.addEventListener('popstate', follow)
  window.addEventListener('hashchange', follow)
  return () => {
    unfollow()
    onAddressFlush(null)
    window.removeEventListener('popstate', follow)
    window.removeEventListener('hashchange', follow)
  }
}

/**
 * The shell's address sync. Call once inside the analytics provider: it applies the opening scope,
 * then keeps the address and the store in step both ways.
 */
export function useAddress(ctx: AnalyticsContext): void {
  const latest = useRef(ctx)
  useLayoutEffect(() => {
    latest.current = ctx
  })
  // Before paint, so the first screen already shows the opening scope.
  useLayoutEffect(() => {
    loadAddress(latest.current)
  }, [])
  useEffect(() => connectAddress(() => latest.current), [])
}
