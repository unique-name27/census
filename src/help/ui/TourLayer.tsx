/**
 * The tour engine: a highlight ring around the step's element and a small popover anchored to it,
 * with Next, Back and Skip. Arrow keys move between steps and Esc ends the tour while focus is in
 * the popover (or nowhere in particular); Tab stays inside the popover. A step that needs another
 * page opens it first. When the element is missing (a filter or a narrow screen hides it) the
 * step shows as a centered card. Reduced motion: no smooth scrolling, and the global CSS removes
 * transitions. Mounted once, beside the Help sheet.
 */
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOUR_NOT_SHOWN } from '@/access/copy'
import { Button, cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import type { ViewKey } from '@/data/schema'
import { type RouteView, useCensus } from '@/data/store'
import { viewByKey } from '@/views/registry'
import { tourInMode } from '../access'
import { type TourRun, useHelp } from '../store'
import { type Box, moved, placePopover, type Size, tourKey } from '../tour/place'
import { tourById } from '../tours'
import type { Tour, TourStep } from '../types'
import { helpTrigger } from './refs'

/** How long a step looks for its element before it shows as a centered card. */
const SEEK_MS = 2500
/** A short look is invisible; after this the card shows centered while it keeps looking. */
const QUIET_MS = 300
/** How often a step looks for its element, and checks that it has not moved. */
const SEEK_EVERY_MS = 60
const TRACK_EVERY_MS = 250
const POP_WIDTH = 360

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return (
    document.documentElement.getAttribute('data-motion') === 'reduce' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/** Laid out and not hidden: it has a box on screen. */
function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && el.getClientRects().length > 0
}

/** The tab a route lands on: '' is the view's first tab. */
function landedTab(view: RouteView, tab: string): string {
  if (tab) return tab
  return viewByKey.get(view as ViewKey)?.tabs[0]?.key ?? ''
}

/** Open the page a step needs, unless it is already showing. A tour never adds to the history. */
function openStepPage(step: TourStep): void {
  if (!step.view) return
  const { route: r, navigate } = useCensus.getState()
  const want = step.tab ?? ''
  const here =
    r.view === step.view &&
    (step.tab === undefined || landedTab(r.view, r.tab) === landedTab(step.view, want))
  if (!here) navigate(step.view, want, { history: 'replace', scroll: r.view !== step.view })
}

/** Store the popover's size when it changed. */
function measurePopover(el: HTMLElement | null, set: (f: (s: Size | null) => Size | null) => void): void {
  if (!el) return
  const width = el.offsetWidth
  const height = el.offsetHeight
  set((s) => (s && s.width === width && s.height === height ? s : { width, height }))
}

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'

function ActiveTour({ run, tour }: { run: TourRun; tour: Tour }) {
  const index = Math.min(run.index, tour.steps.length - 1)
  const step = tour.steps[index]
  const total = tour.steps.length
  const last = index === total - 1
  const goToStep = useHelp((s) => s.goToStep)
  const endTour = useHelp((s) => s.endTour)
  // null while looking; then the element, or null inside `found` when it is missing.
  const [found, setFound] = useState<{ index: number; el: HTMLElement | null } | null>(null)
  const [waited, setWaited] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const [popSize, setPopSize] = useState<Size | null>(null)
  const [view, setView] = useState<Size>(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const popRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const titleId = `tour-${tour.id}-title`
  const bodyId = `tour-${tour.id}-body`

  const go = (i: number) => {
    if (i < 0) return
    if (i >= total) endTour('done')
    else goToStep(i)
  }

  // Open the step's page, then look for its element (lazy tabs and idle-time sheets take a moment).
  useEffect(() => {
    let timer = 0
    setFound(null)
    setBox(null)
    setWaited(false)
    openStepPage(step)
    const quiet = window.setTimeout(() => setWaited(true), QUIET_MS)
    if (!step.target) {
      setFound({ index, el: null })
      return () => window.clearTimeout(quiet)
    }
    const selector = step.target
    const started = Date.now()
    const seek = () => {
      const el = document.querySelector<HTMLElement>(selector)
      if (el && isShown(el)) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
        el.scrollIntoView({
          block: tall ? 'start' : 'center',
          inline: 'nearest',
          behavior: reducedMotion() ? 'auto' : 'smooth',
        })
        setFound({ index, el })
        return
      }
      if (Date.now() - started > SEEK_MS) {
        setFound({ index, el: null })
        return
      }
      timer = window.setTimeout(seek, SEEK_EVERY_MS)
    }
    // After the page change has rendered.
    timer = window.setTimeout(seek, 0)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(quiet)
    }
  }, [index, step])

  // Follow the element as the page scrolls, reflows or re-renders it: on scroll and resize, when
  // the element changes size, and on a slow timer for anything else that moves it.
  useEffect(() => {
    if (!found?.el || !step.target) return
    const selector = step.target
    let el: HTMLElement | null = found.el
    let lastBox: Box | null = null
    const update = () => {
      if (!el?.isConnected) el = document.querySelector<HTMLElement>(selector)
      const r = el && isShown(el) ? el.getBoundingClientRect() : null
      const b = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      if (moved(lastBox, b)) {
        lastBox = b
        setBox(b)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(found.el)
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    const timer = window.setInterval(update, TRACK_EVERY_MS)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
      window.clearInterval(timer)
    }
  }, [found, step.target])

  useEffect(() => {
    const onResize = () => setView({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Measure the popover so it can be placed beside its target: after every render (a new step's
  // text changes its height), and when it resizes on its own (fonts, text size).
  useLayoutEffect(() => measurePopover(popRef.current, setPopSize))
  useEffect(() => {
    const el = popRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measurePopover(el, setPopSize))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Each step that shows puts focus on Next (Done), so Enter moves on and Tab stays in the popover.
  const shownIndex = found?.index ?? null
  useEffect(() => {
    if (shownIndex == null) return
    nextRef.current?.focus({ preventScroll: true })
  }, [shownIndex])

  // Arrow keys and Esc, while focus is in the popover or on nothing in particular.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = tourKey(e.key)
      if (!k || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return
      const t = e.target instanceof Node ? e.target : null
      const inPopover = !!t && !!popRef.current?.contains(t)
      const onNothing = !t || t === document.body || t === document.documentElement
      if (!inPopover && !onNothing) return
      e.preventDefault()
      if (k === 'end') endTour('skip')
      else go(index + k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Tab cycles inside the popover.
  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = [...(popRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (!items.length) return
    const first = items[0]
    const lastItem = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      lastItem.focus()
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault()
      first.focus()
    }
  }

  const seeking = found == null
  const target = !seeking && found.el && box ? box : null
  const missing = !seeking && !!step.target && !found.el
  const pos = popSize ? placePopover(target, popSize, view, step.placement ?? 'auto') : null
  const docked = pos?.side === 'dock-top' || pos?.side === 'dock-bottom'
  const visible = !!pos && (!seeking || waited)
  const pad = 6

  return createPortal(
    <>
      {target ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[45] rounded-sheet transition-[top,left,width,height] duration-200 ease-out"
          style={{
            top: target.top - pad,
            left: target.left - pad,
            width: target.width + pad * 2,
            height: target.height + pad * 2,
            boxShadow: '0 0 0 2px var(--focus), 0 0 0 9999px var(--overlay)',
          }}
        />
      ) : (
        !seeking && <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[45] bg-overlay" />
      )}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={trapTab}
        className={cx(
          'fixed z-[55] flex flex-col rounded-sheet bg-sheet p-4 text-ink shadow-(--shadow-pop) outline-none transition-[top,left,opacity] duration-200 ease-out',
          !visible && 'invisible opacity-0',
        )}
        style={
          docked
            ? { top: pos?.top ?? 0, left: 16, right: 16 }
            : { top: pos?.top ?? 0, left: pos?.left ?? 0, width: `min(${POP_WIDTH}px, calc(100vw - 32px))` }
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="eyebrow min-w-0 flex-1 truncate">{tour.title}</span>
          <span className="tnum shrink-0 text-meta text-muted">
            {index + 1} of {total}
          </span>
        </div>
        <div aria-hidden="true" className="mt-2 h-0.5 overflow-hidden rounded-full bg-sheet-3">
          <div className="h-full bg-ink" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <h2 id={titleId} className="cut-head mt-3 text-title leading-snug font-semibold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-small leading-snug text-ink-2">
          {step.body}
        </p>
        {missing && (
          <p className="mt-2 text-meta leading-snug text-muted">
            This part is not on screen right now. A filter, the data standard or the screen size may hide it.
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {seeking ? '' : `Step ${index + 1} of ${total}: ${step.title}`}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" className="-ml-2.5" onClick={() => endTour('skip')}>
            Skip tour
          </Button>
          <span className="flex-1" />
          <Button size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
            Back
          </Button>
          <Button ref={nextRef} size="sm" variant="primary" onClick={() => go(index + 1)}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * The running tour, if any. When a tour ends, focus goes back to what started it, or to the
 * masthead Help button when that is gone.
 */
export function TourLayer() {
  const run = useHelp((s) => s.tour)
  // The tour as the mode runs it: steps on a page, tab or control the mode hides are skipped, and
  // a tour the mode hides does not run (docs/ROLES.md, 3.8).
  const access = useAnalyticsIfAny()?.access
  const known = tourById(run?.id)
  const tour = known && access ? tourInMode(access, known) : known
  const opener = useRef<HTMLElement | null>(null)
  const wasRunning = useRef(false)
  useEffect(() => {
    if (run) {
      opener.current = run.opener
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    // After the page the tour returned to has rendered.
    const timer = window.setTimeout(() => {
      const back = opener.current?.isConnected ? opener.current : helpTrigger.current
      back?.focus({ preventScroll: true })
      opener.current = null
    }, 0)
    return () => window.clearTimeout(timer)
  }, [run])
  // A tour that no longer exists (renamed in an update) just ends; one the mode hides opens the
  // Help sheet's list, saying so.
  useEffect(() => {
    if (!run || tour) return
    useHelp.getState().endTour('skip')
    if (known) useHelp.getState().openHelp(null, TOUR_NOT_SHOWN)
  }, [run, tour, known])
  if (!run || !tour) return null
  return <ActiveTour key={run.id} run={run} tour={tour} />
}
