/**
 * Side effects the shell owns: the display settings on <html> (theme, text size, motion) and
 * following the URL hash.
 */
import { useEffect, useLayoutEffect } from 'react'
import { routeHash } from '@/components/navigation'
import { type MotionPref, TEXT_SIZE_SCALE, type TextSize } from '@/data/settings'
import { parseHash, type ThemePref, useCensus } from '@/data/store'

/** 'system' follows the OS (no attribute); 'light' and 'dark' pin the tokens. */
export function applyTheme(theme: ThemePref, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** The CSS zoom for a text size: '' (none) at Standard, else the scale. */
export function textZoom(size: TextSize): string {
  const scale = TEXT_SIZE_SCALE[size] ?? 1
  return scale === 1 ? '' : String(scale)
}

/**
 * Text size scales the whole app with CSS zoom on the app root (`#root`), so text, controls and
 * charts grow together and the layout reflows at the new size. Menus, popovers and sheets render
 * outside the app root; index.css gives their content the same zoom through `--text-zoom` while
 * their frames stay unzoomed, so they are placed against the right spot and fit the screen.
 */
export function applyTextSize(
  size: TextSize,
  root: HTMLElement = document.documentElement,
  app: HTMLElement | null = document.getElementById('root'),
): void {
  const zoom = textZoom(size)
  if (app) app.style.zoom = zoom
  if (size === 'md') {
    root.removeAttribute('data-text-size')
    root.style.removeProperty('--text-zoom')
  } else {
    root.setAttribute('data-text-size', size)
    root.style.setProperty('--text-zoom', zoom)
  }
}

/** 'reduce' pins reduced motion (index.css); 'system' follows the OS preference. */
export function applyMotion(motion: MotionPref, root: HTMLElement = document.documentElement): void {
  if (motion === 'reduce') root.setAttribute('data-motion', 'reduce')
  else root.removeAttribute('data-motion')
}

/** Theme, text size and motion from Settings, applied before paint so nothing flashes. */
export function useDisplaySettings(): void {
  const theme = useCensus((s) => s.theme)
  const textSize = useCensus((s) => s.textSize)
  const motion = useCensus((s) => s.motion)
  useLayoutEffect(() => applyTheme(theme), [theme])
  useLayoutEffect(() => applyTextSize(textSize), [textSize])
  useLayoutEffect(() => applyMotion(motion), [motion])
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
