/**
 * A link to another view or tab that follows the mode (docs/ROLES.md, 3.13): plain text when the
 * mode hides its target, otherwise a link whose address carries the route only (it keeps the
 * scope on screen) and that moves with `goTo` (one history entry). A modified click opens a new
 * tab as usual. For a control that is only a link (a button), use `useRouteShown` and leave the
 * control out when it is false.
 */
import type { MouseEvent, ReactNode } from 'react'
import { routeShown } from '@/access/policy'
import { useAnalyticsIfAny } from '@/data/context'
import type { RouteView } from '@/data/store'
import { goTo, routeHash } from './navigation'

/** Whether the mode on screen shows a view (or page) and tab; true outside the analytics provider. */
export function useRouteShown(view: RouteView, tab = ''): boolean {
  const access = useAnalyticsIfAny()?.access
  return !access || routeShown(access.mode, view, tab)
}

export function RouteLink({
  view,
  tab = '',
  children,
  className,
  textClassName,
  onFollow,
  'aria-label': ariaLabel,
}: {
  view: RouteView
  tab?: string
  children: ReactNode
  className?: string
  /** The class of the plain text shown when the target is hidden (defaults to none: it reads as text). */
  textClassName?: string
  /** Called before moving (close a sheet first, as Help and Ask do). */
  onFollow?: () => void
  'aria-label'?: string
}) {
  const shown = useRouteShown(view, tab)
  if (!shown) return <span className={textClassName}>{children}</span>
  const follow = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onFollow?.()
    goTo(view, tab)
  }
  return (
    <a href={routeHash(view, tab)} onClick={follow} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  )
}
