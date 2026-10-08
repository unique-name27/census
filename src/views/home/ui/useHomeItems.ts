/**
 * The mode's Needs attention and Waiting on others for a role home: the Action center's split
 * (`roleView`, the one `useRoleItems` reads) over the same cached collection, open in this browser
 * by the same marks (a handled roll-up reopens when its fingerprint changes). So the home, the
 * masthead count and the Action center agree for one context (docs/ROLES-V2.md 6.2, check 1).
 *
 * The views come from `OTHER_VIEWS` rather than '@/views/registry': the registry imports the Home
 * view, so reading it back from here would be an import cycle. The collection is cached per
 * context and per set of views that raise items, and that set is the registry's, so the home joins
 * the masthead's and the page's run instead of starting its own.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import {
  type Collected,
  isOpen,
  isSuperseded,
  type RoleView,
  roleView,
  scheduleCollect,
} from '@/views/actions/engine'
import { useActionMarks, useNow } from '@/views/actions/ui/store'
import { OTHER_VIEWS } from '@/views/scorecard/views'

export interface HomeItems extends RoleView {
  collected: Collected
  /** The lists are for an earlier context (a filter just changed); the new ones are on their way. */
  stale: boolean
  /** The context the lists were collected for. */
  ctx: AnalyticsContext
}

export function useHomeItems(): HomeItems | null {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    scheduleCollect(ctx, OTHER_VIEWS).then(
      (value) => {
        if (live) setLatest({ ctx, value })
      },
      (err) => {
        if (!isSuperseded(err)) console.error('Home: open items could not be collected', err)
      },
    )
    return () => {
      live = false
    }
  }, [ctx])
  if (!latest) return null
  return {
    ...roleView(latest.value, latest.ctx, (a) => isOpen(a, marks, now)),
    collected: latest.value,
    stale: latest.ctx !== ctx,
    ctx: latest.ctx,
  }
}
