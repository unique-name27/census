/**
 * The width a part of the page lays itself out in (docs/ASK-ACTIONS.md, part 1). While Ask is
 * docked beside the page, the shell's main area is narrower than the window, so its breakpoints
 * follow the main area: in CSS, an element inside an area (`data-area`, a size container named
 * `shell`) reads Tailwind's `sm` to `2xl` and `max-*` against that container
 * (src/styles/index.css); in code, `useNarrow` and `useMinWidth` read the `Area` in context. The
 * Ask panel is an area of its own. Everything outside an area (sheets, menus, toasts) follows the
 * window, as before.
 */
import { createContext } from 'react'

export interface Area {
  /** Called whenever the width may have changed. Returns the stop. */
  subscribe(onChange: () => void): () => void
  /** The width in CSS px that this area's breakpoints read. */
  width(): number
}

/** A settable area: `set(null)` hands it back to the window (the main area when nothing is docked). */
export interface SettableArea extends Area {
  set(width: number | null): void
}

const windowWidth = (): number => (typeof window === 'undefined' ? 0 : window.innerWidth)

function onResize(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', fn)
  return () => window.removeEventListener('resize', fn)
}

/** The window: what media queries read. */
export const windowArea: Area = { subscribe: onResize, width: windowWidth }

/** An area whose width is measured (a ResizeObserver sets it), or the window's until it is. */
export function createArea(): SettableArea {
  let measured: number | null = null
  const listeners = new Set<() => void>()
  return {
    subscribe(fn) {
      listeners.add(fn)
      const stop = onResize(fn)
      return () => {
        listeners.delete(fn)
        stop()
      }
    },
    width: () => measured ?? windowWidth(),
    set(next) {
      const w = next == null ? null : Math.round(next)
      if (w === measured) return
      measured = w
      for (const fn of listeners) fn()
    },
  }
}

/** The shell's main area: the window, or the room Ask's docked panel leaves it. */
export const mainArea: SettableArea = createArea()

/** The area the components below lay out in (the window outside any). */
export const AreaContext = createContext<Area>(windowArea)

/** At least `px` wide in the main area, for code outside React's render (scroll decisions). */
export const mainAreaAtLeast = (px: number): boolean =>
  typeof window !== 'undefined' && mainArea.width() >= px
