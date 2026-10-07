/**
 * The open items My team lists, collected in an idle callback after the first paint (as the
 * Action center does): `collectActions` for this context over the views Manager mode shows, then
 * the items the org owns that are open in this browser (not handled, not snoozed). Null until the
 * first collection is done; after a filter change the previous list stays, marked stale.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { type Collected, collectActions, isOpen, type OpenAction } from '@/views/actions/engine'
import { useActionMarks, useNow } from '@/views/actions/ui/store'
import { waitingItems } from '../engine'
import { ITEM_SOURCES } from './views'

function whenIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1000 })
    return () => window.cancelIdleCallback(id)
  }
  const t = setTimeout(fn, 200)
  return () => clearTimeout(t)
}

export interface TeamItems {
  items: OpenAction[]
  stale: boolean
}

export function useTeamItems(): TeamItems | null {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    const cancel = whenIdle(() => {
      const value = collectActions(ctx, ITEM_SOURCES)
      if (live) setLatest({ ctx, value })
    })
    return () => {
      live = false
      cancel()
    }
  }, [ctx])
  if (!latest) return null
  return {
    items: waitingItems(latest.ctx, latest.value, (id) => isOpen(id, marks, now)),
    stale: latest.ctx !== ctx,
  }
}
