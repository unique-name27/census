/**
 * The first-visit welcome on the Scorecard: a small card offering the 2-minute tour or "Not now".
 * Dismissing it (or taking the tour) is remembered in this browser. It never opens on its own as
 * a modal. "Not now" moves focus to the Help button, where the tour can be taken later.
 */
import { Button, cx } from '@/components/ui'
import { startTour, useHelp } from '../store'
import { IconHelp } from './IconHelp'
import { helpTrigger } from './refs'

export const GETTING_STARTED = 'getting-started'

export function WelcomeCard({ className }: { className?: string }) {
  const dismissed = useHelp((s) => s.prefs.welcomeDismissed || s.prefs.completed.includes(GETTING_STARTED))
  const dismiss = useHelp((s) => s.dismissWelcome)
  if (dismissed) return null
  return (
    <section
      aria-labelledby="census-welcome-title"
      data-tour="welcome-card"
      className={cx(
        'col-span-full flex flex-wrap items-center gap-x-5 gap-y-3 rounded-sheet bg-sheet px-4 py-3.5',
        className,
      )}
    >
      <IconHelp className="hidden size-5 shrink-0 text-ink-2 sm:block" />
      <div className="min-w-0 flex-1 basis-[300px]">
        <h2 id="census-welcome-title" className="cut-head text-[15px] leading-snug font-semibold">
          New to Census?
        </h2>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
          A short tour shows the folder tabs, the filters, how to read a number, and where help lives. You can
          take it any time from Help.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            dismiss()
            startTour(GETTING_STARTED)
          }}
        >
          Take the 2-minute tour
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            dismiss()
            // The card goes away; Help is where the tour lives from now on.
            helpTrigger.current?.focus()
          }}
        >
          Not now
        </Button>
      </div>
    </section>
  )
}
