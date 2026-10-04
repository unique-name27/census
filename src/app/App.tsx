/**
 * The Census shell: band (masthead + folder tabs), then for a view the filter row, the view header
 * and the view body; or the Data room. Owns theme, routing, tooltips and toasts.
 */
import { MotionConfig, motion } from 'motion/react'
import { useEffect } from 'react'
import { FigureRegistryProvider } from '@/charts/registry'
import { CurrentViewProvider } from '@/components/currentView'
import { IconLock } from '@/components/icons'
import { Toaster, toast } from '@/components/toast'
import { TooltipProvider } from '@/components/ui'
import { AnalyticsProvider, useAnalytics } from '@/data/context'
import { SAMPLE_COMPANY } from '@/data/sample'
import { useCensus } from '@/data/store'
import { DrillPanel } from '@/drill'
import { DataRoom } from '@/views/data'
import { VIEWS, viewByKey } from '@/views/registry'
import type { ViewDef } from '@/views/types'
import { ViewErrorBoundary } from './ErrorBoundary'
import { resolveTab } from './exportMeta'
import { FilterBar } from './FilterBar'
import { FolderTabs, VIEW_PANEL_ID } from './FolderTabs'
import { LoadingShell } from './Loading'
import { Masthead } from './Masthead'
import { useHashRouting, useThemeAttribute } from './useShell'
import { VIEW_BODY_ID, ViewHeader } from './ViewHeader'

const PAGE = 'mx-auto w-full max-w-[1440px] px-(--gutter)'

function ViewPage({ view, requestedTab }: { view: ViewDef; requestedTab: string }) {
  const filters = useCensus((s) => s.filters)
  const resetFilters = useCensus((s) => s.resetFilters)
  const tab = resolveTab(view.tabs, requestedTab)
  const hasSubTabs = view.tabs.length > 1
  return (
    <div id={VIEW_PANEL_ID} role="tabpanel" aria-labelledby={`tab-${view.key}`}>
      <FilterBar />
      <FigureRegistryProvider key={view.key}>
        <CurrentViewProvider value={{ key: view.key, label: view.label, tabs: view.tabs, tab }}>
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

function Footer() {
  const { isSample } = useAnalytics()
  // The Data room header already says where files are kept; don't repeat it under the page.
  const onDataRoom = useCensus((s) => s.route.view === 'data')
  if (onDataRoom && !isSample) return null
  return (
    <footer className="border-t border-rule">
      <div className={`${PAGE} flex flex-wrap items-center gap-x-6 gap-y-1 py-4 text-[12px] text-muted`}>
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
  const view = route.view === 'data' ? null : (viewByKey.get(route.view) ?? VIEWS[0])
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#census-main"
        className="sr-only z-50 rounded-control bg-ink px-3 py-1.5 text-[13px] text-on-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
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
  useThemeAttribute()
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
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {ready ? (
          <AnalyticsProvider>
            <Shell />
            {/* Inside the provider: the panel reads the analytics context (names, as-of, pay setting). */}
            <DrillPanel />
          </AnalyticsProvider>
        ) : (
          <LoadingShell />
        )}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  )
}
