/**
 * The first-visit welcome on each mode's home (docs/ROLES.md 3.1): one quiet line under the view
 * header, with the mode's first tour and "Not now" as ghost buttons (no card, no ink button).
 *
 *  - HR mode, on the Scorecard: "New to Census?" and the 2-minute tour (`getting-started`).
 *  - Manager mode, on My team (`variant="manager"`): "New to My team?" and "Getting started as a
 *    manager" (`manager-start`).
 *  - Developer mode: none.
 *
 * Dismissing it (or finishing its tour) is remembered in this browser, each mode's line on its
 * own. It never opens on its own as a modal. "Not now" moves focus to the Help button, where the
 * tour can be taken later.
 */
import { Button, cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { startTour, useHelp } from '../store'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'

export const GETTING_STARTED = 'getting-started'
export const MANAGER_START = 'manager-start'

const COPY = {
  hr: { title: 'New to Census?', take: 'Take the 2-minute tour', tour: GETTING_STARTED },
  manager: { title: 'New to My team?', take: 'Take the 1-minute tour', tour: MANAGER_START },
} as const

export function WelcomeCard({
  className,
  variant = 'hr',
}: {
  className?: string
  /** Whose home it sits on: HR mode's Scorecard (default) or Manager mode's My team. */
  variant?: 'hr' | 'manager'
}) {
  const role = variant
  const copy = COPY[role]
  const dismissed = useHelp((s) =>
    role === 'manager'
      ? s.prefs.managerWelcomeDismissed === true || s.prefs.completed.includes(MANAGER_START)
      : s.prefs.welcomeDismissed || s.prefs.completed.includes(GETTING_STARTED),
  )
  const dismiss = useHelp((s) => s.dismissWelcome)
  // Each line shows in its own mode only (Developer mode has none).
  const mode = useAnalyticsIfAny()?.access.mode
  if (dismissed || (mode && mode !== role)) return null
  const titleId = `census-welcome-title-${role}`
  return (
    // One quiet line under the view header, not a card: the page's numbers stay first.
    <section
      aria-labelledby={titleId}
      data-tour="welcome-card"
      className={cx(
        'col-span-full flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2',
        className,
      )}
    >
      <IconHelp className="size-4 shrink-0 text-muted" />
      <h2 id={titleId} className="font-medium text-ink">
        {copy.title}
      </h2>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(role)
          startTour(copy.tour)
        }}
      >
        {copy.take}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(role)
          // The line goes away; Help is where the tour lives from now on.
          helpTrigger.current?.focus()
        }}
      >
        Not now
      </Button>
    </section>
  )
}
