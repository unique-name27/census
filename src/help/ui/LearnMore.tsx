/**
 * "Learn more" in the KPI and figure info popovers: opens the help article that covers the
 * metric, beside the "Edit definition" link. Renders nothing when no article covers it.
 *
 * It is the popover's close button as well, so the popover closes as Help opens and one Escape
 * closes Help. Place it only inside a popover (`Popover` in `@/components/ui`).
 */
import { Popover as BPopover } from '@base-ui/react/popover'
import { cx } from '@/components/ui'
import { articleForMetric } from '../learnMore'
import { openHelp } from '../store'
import { IconHelp } from './IconHelp'

export function LearnMoreLink({
  metricId,
  className,
}: {
  metricId: string | null | undefined
  className?: string
}) {
  const article = articleForMetric(metricId)
  if (!article) return null
  return (
    <BPopover.Close
      aria-haspopup="dialog"
      onClick={() => openHelp(article)}
      className={cx(
        'inline-flex items-center gap-1 rounded-[2px] text-[12px] font-medium text-link underline-offset-2 hover:underline',
        className,
      )}
    >
      <IconHelp className="size-3.5" />
      Learn more
    </BPopover.Close>
  )
}
