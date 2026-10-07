/**
 * "About this view": a quiet link in a view or page header that opens the page's help article in
 * the Help sheet. It is a way into Help, not a second help system.
 */

import { cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import type { RouteView } from '@/data/store'
import { articleShown } from '../access'
import { articleForRoute } from '../articles'
import { openHelp } from '../store'
import { IconHelp } from './IconHelp'

export function AboutViewLink({
  view,
  tab = '',
  label = 'About this view',
  className,
}: {
  view: RouteView
  tab?: string
  label?: string
  className?: string
}) {
  const article = articleForRoute(view, tab)
  // Follows the view's article: none where the mode hides it.
  const access = useAnalyticsIfAny()?.access
  if (!article || (access && !articleShown(access, article.id))) return null
  return (
    <button
      type="button"
      data-tour="about-view"
      aria-haspopup="dialog"
      onClick={() => openHelp(article.id)}
      className={cx(
        'inline-flex items-center gap-1 rounded-mark text-meta text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink hover:decoration-ink',
        className,
      )}
    >
      <IconHelp className="size-3.5 shrink-0" />
      {label}
    </button>
  )
}
