/**
 * One line above a list that holds Compensation's items while the merit cycle has no close date:
 * why they have no due date, said once rather than on every item, with the way to set one
 * (Settings, Compensation cycle) where the mode shows that section.
 */
import { useAnalytics } from '@/data/context'
import { openSettings } from '@/data/store'
import { plural } from '@/lib/format'
import { NO_CLOSE_REASON } from '@/views/comp/engine/actions'
import type { OpenAction } from '../engine'

const LINK = 'rounded-mark font-medium text-link underline-offset-2 hover:underline'

/** The items a list holds that wait on a cycle close date for their due date. */
export const undatedByCycle = (items: readonly OpenAction[]): OpenAction[] =>
  items.filter((a) => a.item.closesWhen === NO_CLOSE_REASON)

export function CloseDateNote({ items }: { items: readonly OpenAction[] }) {
  const { access } = useAnalytics()
  const n = undatedByCycle(items).length
  if (!n) return null
  return (
    <span>
      No merit cycle close date is set, so {plural(n, "Total rewards' item has", "Total rewards' items have")}{' '}
      no due date.{' '}
      {access.can('settings:compensation') && (
        <button type="button" className={LINK} onClick={() => openSettings('compensation')}>
          Set the close date
        </button>
      )}
    </span>
  )
}
