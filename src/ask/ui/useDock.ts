/**
 * The Ask panel's layout, live: the window size, the panel's state and width from the Ask store,
 * and the peek bar's measured height, through `dockLayout` (dock.ts). The shell reads it to make
 * room for the panel; the panel reads it to draw itself. The panel's own width is an area of its
 * own (`panelArea`), so breakpoints and `useNarrow` inside it follow the panel, not the window.
 */
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { createArea } from '@/components/mainArea'
import { type DockLayout, dockLayout, type Viewport } from './dock'
import { useAsk } from './store'

/** The page's width without its scrollbar: where the docked panel's right edge is. */
export function pageWidth(): number {
  if (typeof window === 'undefined') return 1440
  return document.documentElement.clientWidth || window.innerWidth
}

let viewport: Viewport =
  typeof window === 'undefined'
    ? { width: 1440, height: 900, page: 1440 }
    : { width: window.innerWidth, height: window.innerHeight, page: pageWidth() }

/** The window's size now: the same object until it changes, as useSyncExternalStore needs. */
function current(): Viewport {
  if (typeof window === 'undefined') return viewport
  const page = pageWidth()
  if (
    window.innerWidth !== viewport.width ||
    window.innerHeight !== viewport.height ||
    page !== viewport.page
  )
    viewport = { width: window.innerWidth, height: window.innerHeight, page }
  return viewport
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', cb)
  // The page's scrollbar comes and goes with the content, with no resize event.
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => cb())
  ro?.observe(document.documentElement)
  return () => {
    window.removeEventListener('resize', cb)
    ro?.disconnect()
  }
}

/** The window's size (one object until it changes). */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, current, current)
}

/** The peek bar's height as drawn (phones), so the page keeps room for it. */
export const usePeek = create<{ px: number; set: (px: number) => void }>((set) => ({
  px: 132,
  set: (px) => set({ px: Math.round(px) }),
}))

/** Where the panel is now, and how much room the page gives it. */
export function useDock(): DockLayout {
  const panel = useAsk((s) => s.panel)
  const width = useAsk((s) => s.width)
  const tall = useAsk((s) => s.tall)
  const peek = usePeek((s) => s.px)
  const vp = useViewport()
  return dockLayout(panel, vp, { width, tall }, peek)
}

/** The panel's own width, which its breakpoints and `useNarrow` read. */
export const panelArea = createArea()
