/**
 * Renders every tab of a view off screen so "Whole view, all tabs" can export them together.
 *
 * Each tab mounts in its own hidden container (absolute, 10,000px to the left, 1280px wide, inert
 * and aria-hidden) inside the analytics context, the tab's own current-view context and its own
 * figure registry. Tabs are laid out one after another and stay mounted until every one has
 * settled (fonts loaded, two animation frames, no `Pending` sheet left, then no change in what it
 * has drawn), so their charts can be captured as images; then the whole off-screen tree unmounts.
 */
import { MotionConfig } from 'motion/react'
import { Component, type ReactNode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { AccessInput } from '@/access/context'
import { FigureRegistryProvider, useFigureRegistry } from '@/charts/registry'
import type { FigureFacts, RegisteredFigure } from '@/charts/types'
import { CurrentViewProvider } from '@/components/currentView'
import { TooltipProvider } from '@/components/ui'
import { AnalyticsProvider } from '@/data/context'
import type { FigureGroup } from '@/lib/export/view'
import { recordSince, timingClock } from '@/lib/timing'
import type { ViewDef, ViewTab } from '@/views/types'
import { renderSignature, tabFigureGroup } from './wholeViewModel'

/** Width the hidden tabs lay out at: a desktop page, whatever the window. */
export const OFFSCREEN_WIDTH = 1280

type Registry = NonNullable<ReturnType<typeof useFigureRegistry>>

/** rAF does not fire in a background browser tab; never wait longer than this for a frame. */
const FRAME_FALLBACK_MS = 120
/** Rounds of two frames to wait for a tab to stop changing before taking what it has. */
const MAX_SETTLE_ROUNDS = 25

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    requestAnimationFrame(finish)
    window.setTimeout(finish, FRAME_FALLBACK_MS)
  })
}

async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await nextFrame()
}

async function fontsReady(): Promise<void> {
  try {
    await document.fonts?.ready
  } catch {
    /* no font loading API: system fonts are already there */
  }
}

/** Longest wait for a tab still showing `Pending` sheets (numbers computed in idle slices). */
const PENDING_WAIT_MS = 20_000

/**
 * Fonts, two frames, then wait while the tab still shows `Pending` sheets (the Scorecard's band,
 * the Action center and My team's open items arrive in idle slices), then until what it has drawn
 * stops changing.
 */
async function settle(read: () => readonly RegisteredFigure[], pending: () => boolean): Promise<void> {
  await fontsReady()
  await frames(2)
  const until = Date.now() + PENDING_WAIT_MS
  while (pending() && Date.now() < until) await frames(2)
  let prev = renderSignature(read())
  for (let i = 0; i < MAX_SETTLE_ROUNDS; i++) {
    await frames(2)
    const next = renderSignature(read())
    if (next === prev) return
    prev = next
  }
}

/** Hands the tab's figure registry to the collector. */
function RegistrySink({ onReady }: { onReady: (registry: Registry | null) => void }) {
  const registry = useFigureRegistry()
  useLayoutEffect(() => {
    onReady(registry)
  }, [registry, onReady])
  return null
}

/** A tab that throws is left out of the export; the others still go. */
class TabBoundary extends Component<
  { onError: (err: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    this.props.onError(err)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function OffscreenTabs({
  view,
  tabs,
  access,
  onRegistry,
  onError,
}: {
  view: ViewDef
  tabs: readonly ViewTab[]
  access?: AccessInput
  onRegistry: (tab: string, registry: Registry | null) => void
  onError: (tab: string, err: unknown) => void
}) {
  return (
    <MotionConfig reducedMotion="always">
      <TooltipProvider>
        <AnalyticsProvider access={access}>
          {tabs.map((tab) => (
            <div key={tab.key} data-export-tab={tab.key} className="pt-5">
              <FigureRegistryProvider>
                <CurrentViewProvider
                  value={{
                    key: view.key,
                    label: view.label,
                    tabs: view.tabs,
                    tab: tab.key,
                    datasets: view.datasets,
                  }}
                >
                  <RegistrySink onReady={(r) => onRegistry(tab.key, r)} />
                  <TabBoundary onError={(err) => onError(tab.key, err)}>
                    <view.View tab={tab.key} />
                  </TabBoundary>
                </CurrentViewProvider>
              </FigureRegistryProvider>
            </div>
          ))}
        </AnalyticsProvider>
      </TooltipProvider>
    </MotionConfig>
  )
}

export interface WholeViewProgress {
  /** 0-based index of the tab being laid out. */
  index: number
  total: number
  tab: ViewTab
}

export interface WholeViewResult<T> {
  /** One group per tab that rendered, in tab order; figure ids are prefixed with the tab key. */
  groups: FigureGroup[]
  /** Tabs that threw while rendering (left out of `groups`). */
  failed: ViewTab[]
  /** What `whileMounted` returned. */
  value: T
  /**
   * What every figure of each tab declared, rows or not, by tab key (the Developer page's figure
   * scan and contract checks).
   */
  facts: Record<string, FigureFacts[]>
}

/**
 * Lay out every tab of `view` off screen, collect each tab's figures, run `whileMounted` while
 * they are still on the page (e.g. to capture chart images), then unmount.
 */
export async function renderWholeView<T>(
  view: ViewDef,
  opts: {
    onProgress?: (p: WholeViewProgress) => void
    whileMounted: (groups: FigureGroup[]) => Promise<T>
    /**
     * The mode to render in (the one on screen when not given). Pass the view with the mode's tabs
     * only (`withAccessTabs`); the Developer page's "Scan as role" passes the mode and pick it lays out.
     */
    access?: AccessInput
    /** The User Timing name recorded in Developer mode (default `census:export:<view>`). */
    measure?: string
    /**
     * Why the view is laid out: a whole-view export (default), or the Developer page's figure scan,
     * which reads what the figures declare and exports nothing. Tabs kept out of exports (Leave &
     * return) still render for a scan.
     */
    purpose?: 'export' | 'scan'
  },
): Promise<WholeViewResult<T>> {
  const started = timingClock()
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.inert = true
  host.dataset.censusOffscreen = view.key
  host.dataset.censusPurpose = opts.purpose ?? 'export'
  // A fixed, zero-size clip: the off-screen stage never adds to the page's scroll area.
  Object.assign(host.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '0',
    height: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  const stage = document.createElement('div')
  Object.assign(stage.style, {
    position: 'absolute',
    left: '-10000px',
    top: '0',
    width: `${OFFSCREEN_WIDTH}px`,
  })
  host.append(stage)
  document.body.append(host)

  const registries = new Map<string, Registry | null>()
  const errors = new Map<string, unknown>()
  const onRegistry = (tab: string, r: Registry | null) => registries.set(tab, r)
  const onError = (tab: string, err: unknown) => {
    console.error(`Whole-view export: the ${tab} tab of ${view.key} failed to render`, err)
    errors.set(tab, err)
  }
  const listOf = (tab: string) => registries.get(tab)?.list() ?? []
  const root = createRoot(stage)
  try {
    const tabs = view.tabs
    for (let i = 0; i < tabs.length; i++) {
      opts.onProgress?.({ index: i, total: tabs.length, tab: tabs[i] })
      root.render(
        <OffscreenTabs
          view={view}
          tabs={tabs.slice(0, i + 1)}
          access={opts.access}
          onRegistry={onRegistry}
          onError={onError}
        />,
      )
      const key = tabs[i].key
      await settle(
        () => listOf(key),
        () => !!stage.querySelector(`[data-export-tab="${CSS.escape(key)}"] [data-pending]`),
      )
    }
    const ok = tabs.filter((t) => !errors.has(t.key))
    const groups = ok.map((t) => tabFigureGroup(t, listOf(t.key)))
    const facts: Record<string, FigureFacts[]> = {}
    for (const t of ok) facts[t.key] = registries.get(t.key)?.tracked?.() ?? []
    const value = await opts.whileMounted(groups)
    return { groups, failed: tabs.filter((t) => errors.has(t.key)), value, facts }
  } finally {
    root.unmount()
    host.remove()
    recordSince(opts.measure ?? `census:export:${view.key}`, started)
  }
}
