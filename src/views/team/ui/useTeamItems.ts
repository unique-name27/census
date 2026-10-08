/**
 * My team's two lists (docs/ROLES-V2.md 5.12): the Action center's collection for this context over
 * the views Manager mode shows, collected in idle time after the first paint, split into the
 * manager's Needs attention and Waiting on others (`teamLists`, the Action center's `roleView`).
 * Items are open in this browser by the Action center's marks, judged on the whole item, so a
 * handled roll-up whose fingerprint changed opens again here as it does there. Null until the
 * first collection is done; after a filter change the previous lists stay, marked stale.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { type Collected, isOpen, isSuperseded, scheduleCollect } from '@/views/actions/engine'
import { useActionMarks, useNow } from '@/views/actions/ui/store'
import { type TeamLists, teamLists } from '../engine'
import { ITEM_SOURCES } from './views'

export interface TeamItems extends TeamLists {
  stale: boolean
}

export function useTeamItems(): TeamItems | null {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    scheduleCollect(ctx, ITEM_SOURCES, { channel: 'team' }).then(
      (value) => {
        if (live) setLatest({ ctx, value })
      },
      (err) => {
        if (!isSuperseded(err)) console.error('My team: open items could not be collected', err)
      },
    )
    return () => {
      live = false
    }
  }, [ctx])
  if (!latest) return null
  return {
    ...teamLists(latest.ctx, latest.value, (a) => isOpen(a, marks, now)),
    stale: latest.ctx !== ctx,
  }
}
