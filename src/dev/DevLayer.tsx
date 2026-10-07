/**
 * The shell's hook into the debug overlays (docs/ROLES.md, 5.8): Alt+Shift+D (Option+Shift+D,
 * matched on `e.code`) switches every overlay on or off in Developer mode, and `DevOverlay` loads
 * and mounts while any overlay is on there. In HR and Manager mode the shortcut does nothing and
 * no overlay shows (their saved state is kept for the next Developer session). Small on purpose:
 * the overlay itself is loaded on first use.
 */
import { lazy, Suspense, useEffect } from 'react'
import { useCan } from '@/access/hooks'
import { anyOverlay, useDev } from './store'

const DevOverlay = lazy(() => import('./DevOverlay'))

/** Alt+Shift+D, and not while typing (Option+Shift+D types a letter on a Mac). */
export function isOverlayShortcut(
  e: Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'code'>,
  target: EventTarget | null = null,
): boolean {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyD') return false
  const el = target as HTMLElement | null
  if (el?.isContentEditable) return false
  const tag = el?.tagName
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT'
}

export function DevLayer() {
  const can = useCan('shortcut:dev-overlays')
  const overlays = useDev((s) => s.overlays)
  useEffect(() => {
    if (!can) return
    const onKey = (e: KeyboardEvent) => {
      if (!isOverlayShortcut(e, e.target)) return
      e.preventDefault()
      useDev.getState().toggleOverlays()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [can])
  if (!can || !anyOverlay(overlays)) return null
  return (
    <Suspense fallback={null}>
      <DevOverlay overlays={overlays} />
    </Suspense>
  )
}
