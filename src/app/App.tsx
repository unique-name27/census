/**
 * The Census shell: band (masthead + folder tabs), then for a view the filter row, the view header
 * and the view body; or one of the masthead's pages (the Data room, the Action center, the
 * Developer page). Owns theme, routing, the modes' guards (`connectAccessUi`), tooltips and toasts.
 * A view shows only the tabs its feature switches and the mode show (`withFeatureTabs`,
 * `withAccessTabs`).
 */
import { MotionConfig, motion } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { connectAccessUi } from '@/access/ui/connectUi'
import { ManagerPicker } from '@/access/ui/ManagerPicker'
import { FigureRegistryProvider } from '@/charts/registry'
import { CurrentViewProvider } from '@/components/currentView'
import { IconLock } from '@/components/icons'
import { Toaster, toast } from '@/components/toast'
import { TooltipProvider } from '@/components/ui'
import { AnalyticsProvider, useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { DATASET_KEYS, type ViewKey } from '@/data/schema'
import { PAGE_VIEWS, useCensus } from '@/data/store'
import { DevLayer } from '@/dev/DevLayer'
import { DrillPanel } from '@/drill'
import { ActionCenter } from '@/views/actions'
import { DataRoom } from '@/views/data'
import { VIEWS, viewByKey } from '@/views/registry'
import { type ViewDef, withAccessTabs, withFeatureTabs } from '@/views/types'
import { ViewErrorBoundary } from './ErrorBoundary'
import { resolveTab } from './exportMeta'
import { FilterBar } from './FilterBar'
import { FolderTabs, VIEW_PANEL_ID } from './FolderTabs'
import { LoadingShell } from './Loading'
import { Masthead } from './Masthead'
import { SettingsSheet } from './settings/SettingsSheet'
import { useDisplaySettings, useHashRouting } from './useShell'
import { VIEW_BODY_ID, ViewHeader } from './ViewHeader'

const PAGE = 'mx-auto w-full max-w-[1440px] px-(--gutter)'

/** The Developer page loads with its own code, so HR and Manager mode load none of it. */
const DevPage = lazy(() => import('@/dev/DevPage'))
const NO_TABS: { key: string; label: string }[] = []

function ViewPage({ view: registered, requestedTab }: { view: ViewDef; requestedTab: string }) {
  const filters = useCensus((s) => s.filters)
  const resetFilters = useCensus((s) => s.resetFilters)
  // Tabs behind a Settings switch (Listening's Engagement) show only while it is on.
  const engagementSurveys = useCensus((s) => s.engagementSurveys)
  // The tabs the mode shows, too (Manager mode hides Retention risk, Sources & offers…).
  const { access } = useAnalytics()
  const view = withAccessTabs(withFeatureTabs(registered, { engagementSurveys }), access)
  const tab = resolveTab(view.tabs, requestedTab)
  const hasSubTabs = view.tabs.length > 1
  // A feature tab switched off while open (Engagement), or a tab the mode hides, shows the first
  // tab: the address follows, so a reload or a shared link doesn't name a tab that isn't there.
  const dropped =
    !!requestedTab &&
    registered.tabs.some((t) => t.key === requestedTab) &&
    !view.tabs.some((t) => t.key === requestedTab)
  const navigate = useCensus((s) => s.navigate)
  useEffect(() => {
    if (dropped) navigate(view.key, tab, { scroll: false })
  }, [dropped, navigate, view.key, tab])
  return (
    <div id={VIEW_PANEL_ID} role="tabpanel" aria-labelledby={`tab-${view.key}`}>
      {/* The org, period and data-standard filters change nothing on a view that reads no datasets. */}
      {view.datasets.length > 0 && <FilterBar />}
      <FigureRegistryProvider key={view.key}>
        <CurrentViewProvider
          value={{ key: view.key, label: view.label, tabs: view.tabs, tab, datasets: view.datasets }}
        >
          <ViewHeader view={view} tab={tab} />
          <div
            id={VIEW_BODY_ID}
            {...(hasSubTabs && { role: 'tabpanel', 'aria-labelledby': `subtab-${view.key}-${tab}` })}
            className="pt-5"
          >
            <ViewErrorBoundary
              resetKey={`${view.key}.${tab}.${JSON.stringify(filters)}`}
              onResetFilters={resetFilters}
            >
              <motion.div
                key={`${view.key}.${tab}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                <view.View tab={tab} />
              </motion.div>
            </ViewErrorBoundary>
          </div>
        </CurrentViewProvider>
      </FigureRegistryProvider>
    </div>
  )
}

const ACTION_TABS = [{ key: 'open', label: 'Open items' }]

/**
 * The Action center page: the filter row (the leader filter is its "my team" mode), then the page
 * itself, with a figure registry so its tables export like any view's.
 */
function ActionsPage({ requestedTab }: { requestedTab: string }) {
  const filters = useCensus((s) => s.filters)
  const resetFilters = useCensus((s) => s.resetFilters)
  return (
    <div>
      <FilterBar />
      <FigureRegistryProvider key="actions">
        <CurrentViewProvider
          value={{
            key: 'actions',
            label: 'Actions',
            tabs: ACTION_TABS,
            tab: resolveTab(ACTION_TABS, requestedTab),
            datasets: DATASET_KEYS,
          }}
        >
          <ViewErrorBoundary resetKey={`actions.${JSON.stringify(filters)}`} onResetFilters={resetFilters}>
            <ActionCenter />
          </ViewErrorBoundary>
        </CurrentViewProvider>
      </FigureRegistryProvider>
    </div>
  )
}

/** The Developer page (`#dev`): no filter row; its own header, like the Data room's. */
function DevRoute({ requestedTab }: { requestedTab: string }) {
  return (
    <FigureRegistryProvider key="dev">
      <CurrentViewProvider
        value={{ key: 'dev', label: 'Developer', tabs: NO_TABS, tab: requestedTab, datasets: [] }}
      >
        <ViewErrorBoundary resetKey={`dev.${requestedTab}`}>
          <Suspense fallback={null}>
            <DevPage tab={requestedTab} />
          </Suspense>
        </ViewErrorBoundary>
      </CurrentViewProvider>
    </FigureRegistryProvider>
  )
}

function Footer() {
  const { isSample } = useAnalytics()
  // The Data room header already says where files are kept; don't repeat it under the page.
  const onDataRoom = useCensus((s) => s.route.view === 'data')
  if (onDataRoom && !isSample) return null
  return (
    <footer className="border-t border-rule">
      <div className={`${PAGE} flex flex-wrap items-center gap-x-6 gap-y-1 py-4 text-meta text-muted`}>
        {!onDataRoom && (
          <span className="flex items-center gap-1.5">
            <IconLock className="size-3.5 shrink-0" />
            Everything stays in this browser. Uploaded files are stored on this device only.
          </span>
        )}
        {isSample && (
          <span className="sm:ml-auto">
            {SAMPLE_COMPANY} is a fictional company. Its people and numbers are generated.
          </span>
        )}
      </div>
    </footer>
  )
}

function Shell() {
  useHashRouting()
  const route = useCensus((s) => s.route)
  const page = PAGE_VIEWS.includes(route.view) ? route.view : null
  const view = page ? null : (viewByKey.get(route.view as ViewKey) ?? VIEWS[0])
  return (
    <div className="flex min-h-dvh flex-col">
      {/* biome-ignore lint/a11y/useValidAnchor: a skip link stays a link; it moves focus itself because the address holds the route and scope, and "#census-main" would add a history entry */}
      <a
        href="#census-main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('census-main')?.focus()
        }}
        className="sr-only z-50 rounded-control bg-ink px-3 py-1.5 text-small text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="band">
        <div className={PAGE}>
          <Masthead />
          <FolderTabs />
        </div>
      </header>
      <main id="census-main" tabIndex={-1} className="flex-1 outline-none">
        <div className={`${PAGE} pb-16`}>
          {view ? (
            <ViewPage view={view} requestedTab={route.tab} />
          ) : page === 'actions' ? (
            <ActionsPage requestedTab={route.tab} />
          ) : page === 'dev' ? (
            <DevRoute requestedTab={route.tab} />
          ) : (
            <ViewErrorBoundary resetKey="data">
              <DataRoom />
            </ViewErrorBoundary>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}

export function App() {
  const ready = useCensus((s) => s.ready)
  const init = useCensus((s) => s.init)
  const motion = useCensus((s) => s.motion)
  useDisplaySettings()
  // The modes' guards go in before the data loads and the address connects, so the first scope and
  // route Census shows are already the mode's.
  useEffect(() => connectAccessUi(), [])
  useEffect(() => {
    void init().then(() => {
      if (useCensus.getState().storageUnavailable)
        toast('Showing sample data', {
          description:
            'This browser did not open its local storage in time, so files added earlier are not loaded. Reload to try again.',
          timeout: 10_000,
        })
    })
  }, [init])
  return (
    <MotionConfig reducedMotion={motion === 'reduce' ? 'always' : 'user'}>
      <TooltipProvider>
        {ready ? (
          <AnalyticsProvider>
            <Shell />
            {/* Inside the provider: the panels read the analytics context (names, as-of, tiers, pay setting). */}
            <DrillPanel />
            <SettingsSheet />
            <ManagerPicker />
            {/* Developer mode's debug overlays and their shortcut (Alt+Shift+D); nothing in the other modes. */}
            <DevLayer />
          </AnalyticsProvider>
        ) : (
          <LoadingShell />
        )}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}
