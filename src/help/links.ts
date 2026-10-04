/**
 * What a help link does, and whether it points somewhere real. `checkLink` is pure (the tests run
 * it over every article); `followLink` acts in the app.
 */
import { goTo, routeHash } from '@/components/navigation'
import type { SettingsSection } from '@/data/settings'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { openSettings, ROUTE_VIEWS, type RouteView } from '@/data/store'
import { metricHref, openMetricDefinition } from '@/views/data/metrics/open'
import type { HelpLink } from './markup'
import { closeHelp, startTour, useHelp } from './store'

/** What the link checks need to know about the app: its pages, their tabs, metrics, articles and tours. */
export interface LinkWorld {
  /** Tabs of each folder-tab view (all of them, feature-gated ones included). */
  viewTabs: ReadonlyMap<string, readonly string[]>
  /** Route tabs the Data room accepts. */
  isDataTab: (tab: string) => boolean
  hasMetric: (id: string) => boolean
  hasArticle: (id: string) => boolean
  hasTour: (id: string) => boolean
}

/** A route target "view" or "view.tab", split. */
export function parseRouteTarget(target: string): { view: string; tab: string } {
  const [view, ...rest] = target.split('.')
  return { view, tab: rest.join('.') }
}

/** Null when the link resolves; otherwise why it does not. */
export function checkLink(link: HelpLink, world: LinkWorld): string | null {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      if (!ROUTE_VIEWS.includes(view as RouteView)) return `no page "${view}"`
      if (!tab) return null
      if (view === 'data') return world.isDataTab(tab) ? null : `no Data room tab "${tab}"`
      if (view === 'actions') return tab === 'open' ? null : `no Action center tab "${tab}"`
      return world.viewTabs.get(view)?.includes(tab) ? null : `no tab "${tab}" in ${view}`
    }
    case 'metric':
      return world.hasMetric(link.target) ? null : `no metric "${link.target}"`
    case 'article':
      return world.hasArticle(link.target) ? null : `no article "${link.target}"`
    case 'tour':
      return world.hasTour(link.target) ? null : `no tour "${link.target}"`
    case 'settings':
      return (SETTINGS_SECTIONS as readonly string[]).includes(link.target)
        ? null
        : `no Settings section "${link.target}"`
  }
}

/** The address a link can carry, for links that go to a page (so they open in a new tab too). */
export function linkHref(link: HelpLink): string | undefined {
  if (link.kind === 'route') {
    const { view, tab } = parseRouteTarget(link.target)
    return routeHash(view as RouteView, tab)
  }
  if (link.kind === 'metric') return metricHref(link.target)
  return undefined
}

/** Do what the link says. Links that leave the Help sheet close it. */
export function followLink(link: HelpLink): void {
  switch (link.kind) {
    case 'route': {
      const { view, tab } = parseRouteTarget(link.target)
      closeHelp()
      goTo(view as RouteView, tab)
      return
    }
    case 'metric':
      closeHelp()
      openMetricDefinition(link.target)
      return
    case 'article':
      useHelp.getState().showArticle(link.target)
      return
    case 'tour':
      startTour(link.target)
      return
    case 'settings':
      closeHelp()
      openSettings(link.target as SettingsSection)
  }
}
