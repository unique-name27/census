/**
 * Phone width (under 768px, the grid's one-column breakpoint), as a live value for the few places
 * that must change what they render rather than how it is styled: chart default heights (220px,
 * 180px on phones) and phone-only layouts. Prefer CSS (`max-md:`) whenever styling is enough.
 * False outside a browser.
 *
 * Widths are the width of the area the component sits in (`AreaContext`, src/components/mainArea.ts):
 * the window, or the main area while Ask is docked beside it, or the Ask panel. CSS breakpoints
 * follow the same area, so code and styles agree.
 */
import { use, useSyncExternalStore } from 'react'
import { AreaContext } from './mainArea'

const PHONE = 768

function media(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null
}

/** A live media query; false outside a browser. It reads the window, not the area. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = media(query)
      if (!m) return () => {}
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => media(query)?.matches ?? false,
    () => false,
  )
}

const inBrowser = () => typeof window !== 'undefined'

/** Whether the area this component lays out in passes `test`; false outside a browser. */
function useAreaTest(test: (width: number) => boolean): boolean {
  const area = use(AreaContext)
  return useSyncExternalStore(
    area.subscribe,
    () => inBrowser() && test(area.width()),
    () => false,
  )
}

/** Under 768px: phones, where the desk grid is one column. */
export function useNarrow(): boolean {
  return useAreaTest((w) => w < PHONE)
}

/** At least `px` wide (e.g. 1280, where the filter row has room for the data standard menu). */
export function useMinWidth(px: number): boolean {
  return useAreaTest((w) => w >= px)
}

/** Chart plot heights by role (docs/DESIGN-REFRESH.md 2.7): desktop, then phone. */
export const CHART_HEIGHT = {
  lead: [280, 220],
  standard: [220, 180],
  small: [96, 96],
} as const

/** The plot height for a chart role at the current width. */
export function useChartHeight(role: keyof typeof CHART_HEIGHT = 'standard'): number {
  const narrow = useNarrow()
  return CHART_HEIGHT[role][narrow ? 1 : 0]
}
