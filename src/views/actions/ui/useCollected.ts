/**
 * Every view's open items for the current analytics context, collected in idle time after the
 * first paint, one view per idle slice (`scheduleCollect`; each view's model is cached per
 * context, so the views, the Scorecard, the homes and the Action center share them). Until the
 * first result arrives the value is null; after a filter change the previous result stays on
 * screen, marked stale, until the new one is ready. A run for an older context stops at its next
 * slice.
 *
 * `useRoleItems()` is the one split every reader uses (docs/ROLES-V2.md 6.2, check 1): the open
 * items of this browser, then the mode's "Needs attention" and "Waiting on others" (`roleView`).
 * `useOpenActionCount()` is the masthead's number from it: Needs attention in a role mode, every
 * open item in Developer, HR and CHRO.
 */
import { useEffect, useState } from 'react'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { VIEWS } from '@/views/registry'
import {
  type Collected,
  isOpen,
  isSuperseded,
  type RoleView,
  roleView,
  scheduleCollect,
  type ViewSource,
} from '../engine'
import { useActionMarks, useNow } from './store'

/** Every view; the collection keeps the ones with `actions`, so every caller shares one run. */
export const SOURCES: readonly ViewSource[] = VIEWS

export interface CollectedState {
  value: Collected
  /** The value is for an earlier context (a filter just changed); the new one is on its way. */
  stale: boolean
  /** The context the value was collected for. */
  ctx: AnalyticsContext
}

export function useCollected(): CollectedState | null {
  const ctx = useAnalytics()
  const [latest, setLatest] = useState<{ ctx: AnalyticsContext; value: Collected } | null>(null)
  useEffect(() => {
    let live = true
    scheduleCollect(ctx, SOURCES).then(
      (value) => {
        if (live) setLatest({ ctx, value })
      },
      (err) => {
        if (!isSuperseded(err)) console.error('Action center: items could not be collected', err)
      },
    )
    return () => {
      live = false
    }
  }, [ctx])
  if (!latest) return null
  return { value: latest.value, stale: latest.ctx !== ctx, ctx: latest.ctx }
}

export interface RoleItemsState extends RoleView {
  collected: Collected
  stale: boolean
}

/** The mode's two lists over the items open in this browser; null until they are known. */
export function useRoleItems(): RoleItemsState | null {
  const state = useCollected()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  if (!state) return null
  return {
    ...roleView(state.value, state.ctx, (a) => isOpen(a, marks, now)),
    collected: state.value,
    stale: state.stale,
  }
}

/**
 * The masthead button's number; null until it is known. With `'critical'`, only the critical ones
 * (the button's tooltip).
 */
export function useOpenActionCount(only?: 'critical'): number | null {
  const r = useRoleItems()
  if (!r) return null
  return only ? r.critical : r.count
}
