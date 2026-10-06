/**
 * Side effects the shell owns: the display settings on <html> (theme, text size, motion) and
 * the address (route and scope in the URL hash).
 */
import { useLayoutEffect } from 'react'
import { useAnalytics } from '@/data/context'
import { type MotionPref, TEXT_SIZE_SCALE, type TextSize } from '@/data/settings'
import { type ThemePref, useCensus } from '@/data/store'
import { useAddress } from './address'

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

/**
 * Keeps the address and the app in step: the route and the scope (filters, data standard, quality
 * lens) in the hash, Back and Forward through views, tabs and filter changes (src/app/address.ts).
 * Call once, inside the analytics provider.
 */
export function useHashRouting(): void {
  useAddress(useAnalytics())
}
