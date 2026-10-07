/**
 * The open items the Scorecard counts ("Critical open items", "Where open items wait"): the
 * Action center's collection for this context, in an idle callback after the first paint, kept to
 * the items open in this browser (not handled, not snoozed), as the Action center lists them.
 * The views come from `OTHER_VIEWS` (the registry imports the Scorecard, so it cannot be read
 * here); each view's model is cached per context, so the collection reuses what the summaries and
 * the masthead's count already computed. Null until the first collection is done.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { type Collected, collectActions, isOpen, type OpenAction } from '@/views/actions/engine'
import { useActionMarks, useNow } from '@/views/actions/ui/store'
import { OTHER_VIEWS } from '../views'

function whenIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1000 })
    return () => window.cancelIdleCallback(id)
  }
  const t = setTimeout(fn, 200)
  return () => clearTimeout(t)
}

export interface ScorecardItems {
  open: OpenAction[]
  stale: boolean
}

export function useScorecardItems(): ScorecardItems | null {
  const ctx = useAnalytics()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    const cancel = whenIdle(() => {
      const value = collectActions(ctx, OTHER_VIEWS)
      if (live) setLatest({ ctx, value })
    })
    return () => {
      live = false
      cancel()
    }
  }, [ctx])
  if (!latest) return null
  return { open: latest.value.items.filter((a) => isOpen(a.id, marks, now)), stale: latest.ctx !== ctx }
}
