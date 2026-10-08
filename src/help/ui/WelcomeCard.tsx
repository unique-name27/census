/**
 * The first-visit welcome on each mode's home (docs/ROLES.md 3.1; docs/ROLES-V2.md 4.3): one quiet
 * line under the view header, with the mode's first tour and "Not now" as ghost buttons (no card, no
 * ink button).
 *
 *  - HR mode, on the Scorecard: "New to Census?" and the 2-minute tour (`getting-started`).
 *  - Manager mode, on My team (`variant="manager"`): "New to My team?" and "Getting started as a
 *    manager" (`manager-start`).
 *  - CHRO and every practice and partner mode, on Home (`variant="home"`): "New to Compensation
 *    mode?" and "Getting started with your home" (`home-start`).
 *  - Developer mode: none.
 *
 * It reads the live mode (the Mode button's): a page drawn in another mode, such as the Developer
 * page's preview of a role's Home, has none. Dismissing it (or finishing its tour) is remembered in
 * this browser, each mode's line on its own. It never opens on its own as a modal. "Not now" moves
 * focus to the Help button, where the tour can be taken later.
 */
import { useMode } from '@/access/store'
import { Button, cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import { startTour, useHelp, welcomeDismissed } from '../store'
import { type WelcomeVariant, welcomeFor } from '../welcome'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'

export function WelcomeCard({
  className,
  variant = 'hr',
}: {
  className?: string
  /** Whose home it sits on: HR mode's Scorecard (default), Manager mode's My team, or a role's Home. */
  variant?: WelcomeVariant
}) {
  // Each line shows in its own mode only (Developer mode has none), and only where the page is
  // drawn in the live mode.
  const pageMode = useAnalyticsIfAny()?.access.mode
  const liveMode = useMode((s) => s.mode)
  const copy = welcomeFor(variant, pageMode, liveMode)
  const dismissed = useHelp((s) => (copy ? welcomeDismissed(s.prefs, copy.line) : true))
  const dismiss = useHelp((s) => s.dismissWelcome)
  if (!copy || dismissed) return null
  const titleId = `census-welcome-title-${variant}`
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
          dismiss(copy.line)
          startTour(copy.tour)
        }}
      >
        {copy.take}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          dismiss(copy.line)
          // The line goes away; Help is where the tour lives from now on.
          helpTrigger.current?.focus()
        }}
      >
        Not now
      </Button>
    </section>
  )
}
