/**
 * Side effects the shell owns: the theme attribute on <html> and following the URL hash.
 */
import { useEffect, useLayoutEffect } from 'react'
import { routeHash } from '@/components/navigation'
import { parseHash, type ThemePref, useCensus } from '@/data/store'

/** 'system' follows the OS (no attribute); 'light' and 'dark' pin the tokens. */
export function applyTheme(theme: ThemePref, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function useThemeAttribute(): void {
  const theme = useCensus((s) => s.theme)
  // Layout effect: the attribute lands before paint, so a pinned theme never flashes.
  useLayoutEffect(() => applyTheme(theme), [theme])
}

/** Keeps the route in step with the hash: on load, and when Back/Forward or a link changes it. */
export function useHashRouting(): void {
  useEffect(() => {
    const sync = () => {
      const { route, navigate } = useCensus.getState()
      const next = parseHash(location.hash)
      if (!next) {
        // No or unknown hash: write the current route so the address is shareable.
        try {
          history.replaceState(null, '', routeHash(route.view, route.tab))
        } catch {
          /* file:// pages in some browsers: the route still works without the hash */
        }
        return
      }
      if (next.view !== route.view || next.tab !== route.tab) navigate(next.view, next.tab)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
}
