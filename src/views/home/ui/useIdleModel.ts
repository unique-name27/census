/**
 * A role home's model, worked out in idle time after the first paint (the Scorecard's pattern,
 * docs/ROLES-V2.md 5.1): the page shows its sheets at their final size with one quiet line, then
 * the numbers. Kept per context and home, so coming back to a page draws at once; while a newer
 * context is worked out the last model stays on screen, marked as updating. Each producing view's
 * model is cached per context too, so the home and the views share one computation.
 */
import { useEffect, useState } from 'react'
import { errorMessage, logDevError } from '@/app/devlog'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { recordSince } from '@/lib/timing'

const cache = new WeakMap<AnalyticsContext, Map<string, unknown>>()

function cached<T>(ctx: AnalyticsContext, key: string): T | undefined {
  return cache.get(ctx)?.get(key) as T | undefined
}

function store<T>(ctx: AnalyticsContext, key: string, value: T): T {
  let byKey = cache.get(ctx)
  if (!byKey) {
    byKey = new Map()
    cache.set(ctx, byKey)
  }
  byKey.set(key, value)
  return value
}

/** The model for this context now (tests and off-screen renders: no first paint to protect). */
export function homeModelNow<T>(
  ctx: AnalyticsContext,
  key: string,
  compute: (ctx: AnalyticsContext) => T,
): T {
  const hit = cached<T>(ctx, key)
  if (hit !== undefined) return hit
  const start = typeof performance !== 'undefined' ? performance.now() : 0
  const value = store(ctx, key, compute(ctx))
  recordSince(`census:home:${key}`, start)
  return value
}

function whenIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 400 })
    return () => window.cancelIdleCallback(id)
  }
  const t = setTimeout(fn, 50)
  return () => clearTimeout(t)
}

export interface IdleModel<T> {
  model: T | null
  /** The model shown is from the previous context; the new one is on its way. */
  updating: boolean
  error: string | null
}

export function useIdleModel<T>(key: string, compute: (ctx: AnalyticsContext) => T): IdleModel<T> {
  const ctx = useAnalytics()
  const [state, setState] = useState<{ ctx: AnalyticsContext; model: T } | null>(() => {
    const hit = cached<T>(ctx, key)
    return hit !== undefined ? { ctx, model: hit } : null
  })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const hit = cached<T>(ctx, key)
    if (hit !== undefined) {
      setState({ ctx, model: hit })
      return
    }
    return whenIdle(() => {
      try {
        setState({ ctx, model: homeModelNow(ctx, key, compute) })
        setError(null)
      } catch (err) {
        console.error(`Home: the ${key} home could not be computed`, err)
        logDevError({ where: 'view render', view: 'home', tab: 'overview', message: errorMessage(err) })
        setError(errorMessage(err))
      }
    })
  }, [ctx, key, compute])
  return { model: state?.model ?? null, updating: !!state && state.ctx !== ctx, error }
}
