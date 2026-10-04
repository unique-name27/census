/**
 * Every view's open items for the current analytics context, computed in an idle callback after
 * the first paint (each view's model is cached per context, so the views, the Scorecard and the
 * Action center share them). Until the first result arrives the value is null; after a filter
 * change the previous result stays on screen, marked stale, until the new one is ready.
 *
 * `useOpenActionCount()` is the masthead's number: open items (not handled, not snoozed) in the
 * current scope that the data standard shows, the same count the Action center lists.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { VIEWS } from '@/views/registry'
import { type Collected, collectActions, isOpen, type ViewSource } from '../engine'
import { useActionMarks, useNow } from './store'

const SOURCES: readonly ViewSource[] = VIEWS

/** Run `fn` when the browser is idle (at most about a second later); returns a cancel function. */
function whenIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1000 })
    return () => window.cancelIdleCallback(id)
  }
  const t = setTimeout(fn, 200)
  return () => clearTimeout(t)
}

export interface CollectedState {
  value: Collected
  /** The value is for an earlier context (a filter just changed); the new one is on its way. */
  stale: boolean
}

export function useCollected(): CollectedState | null {
  const ctx = useAnalytics()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    const cancel = whenIdle(() => {
      const value = collectActions(ctx, SOURCES)
      if (live) setLatest({ ctx, value })
    })
    return () => {
      live = false
      cancel()
    }
  }, [ctx])
  if (!latest) return null
  return { value: latest.value, stale: latest.ctx !== ctx }
}

/** Open items across every view for the masthead button; null until they are known. */
export function useOpenActionCount(): number | null {
  const state = useCollected()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  if (!state) return null
  let n = 0
  for (const a of state.value.items) if (isOpen(a.id, marks, now)) n++
  return n
}
