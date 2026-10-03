/**
 * In-app navigation with browser history: each move pushes a hash entry (#view.tab), so Back and
 * Forward walk through views and tabs. The shell listens for hashchange to follow those moves.
 */
import { type RouteView, useCensus } from '@/data/store'

export const routeHash = (view: RouteView, tab = ''): string => `#${view}${tab ? `.${tab}` : ''}`

export function goTo(view: RouteView, tab = ''): void {
  const hash = routeHash(view, tab)
  if (location.hash !== hash) {
    try {
      history.pushState(null, '', hash)
    } catch {
      // Some browsers refuse history entries for file:// pages; a plain hash change still works.
      location.hash = hash
    }
  }
  // Keep the reader's place when switching tabs inside a view; jump to the top for a new view.
  const { route, navigate } = useCensus.getState()
  navigate(view, tab, { scroll: route.view !== view })
}
