/**
 * Running the views' engine functions from the Developer page (docs/ROLES.md, 5.3 and 5.7): "Run"
 * calls one `headline`, `summary` or `actions` on the live context and keeps the result for the
 * side sheet; "Run all engines" runs each twice, once on a freshly built context (cold: the
 * per-context caches miss) and once on the live one (warm), and records both. Warm runs go through
 * `timed` under the usual names, so they show in the Timings tab. No React.
 */

import { errorMessage } from '@/app/devlog'
import type { AnalyticsContext } from '@/data/context'
import { plural } from '@/lib/format'
import { timed, timingClock } from '@/lib/timing'
import type { ViewDef } from '@/views/types'
import { ENGINE_FNS, type EngineFn } from './inventory'
import type { EngineRun } from './store'

/** The User Timing name a function's runs are recorded under. */
export const engineMeasure = (view: string, fn: EngineFn): string =>
  fn === 'headline'
    ? `census:headline:${view}`
    : fn === 'summary'
      ? `census:scorecard:${view}`
      : `census:actions:${view}`

/** What a function returned, counted: "7 KPIs, 4 findings", "12 items", "18.4% voluntary attrition". */
export function returnedText(fn: EngineFn, value: unknown): string {
  if (value == null) return 'Nothing'
  if (fn === 'headline') {
    const h = value as { value?: unknown; label?: unknown }
    return `${String(h.value ?? '')} ${String(h.label ?? '')}`.trim()
  }
  if (fn === 'summary') {
    const s = value as { kpis?: unknown[]; findings?: unknown[] }
    return `${plural(s.kpis?.length ?? 0, 'KPI')}, ${plural(s.findings?.length ?? 0, 'finding')}`
  }
  return plural(Array.isArray(value) ? value.length : 0, 'item')
}

export interface EngineOutcome {
  ms: number
  value: unknown
  error: string | null
}

/** Call one function once; never throws. */
export function callEngine(view: ViewDef, fn: EngineFn, ctx: AnalyticsContext, record = true): EngineOutcome {
  const f = view[fn] as ((c: AnalyticsContext) => unknown) | undefined
  if (typeof f !== 'function') return { ms: 0, value: null, error: `${view.key} has no ${fn}` }
  const t = timingClock()
  try {
    const value = record ? timed(engineMeasure(view.key, fn), () => f(ctx)) : f(ctx)
    return { ms: timingClock() - t, value, error: null }
  } catch (err) {
    return { ms: timingClock() - t, value: null, error: errorMessage(err) }
  }
}

/** "Run": the live context, recorded; the run for the store and the value for the side sheet. */
export function runOne(
  view: ViewDef,
  fn: EngineFn,
  ctx: AnalyticsContext,
): { run: EngineRun; value: unknown } {
  const out = callEngine(view, fn, ctx)
  return {
    run: {
      id: `${view.key}.${fn}`,
      ms: out.ms,
      returned: out.error ? 'An error' : returnedText(fn, out.value),
      error: out.error,
      at: new Date().toISOString(),
    },
    value: out.error ? { error: out.error } : out.value,
  }
}

/** Wait for the browser to be idle (or a short timeout), so long runs keep the page responsive. */
export function idle(): Promise<void> {
  return new Promise((resolve) => {
    const w =
      typeof window === 'undefined'
        ? null
        : (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    if (w?.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 200 })
    else setTimeout(resolve, 0)
  })
}

/** "Run all engines": each function cold then warm, one view per idle slice. */
export async function runAllEngines(
  views: readonly ViewDef[],
  live: AnalyticsContext,
  fresh: () => AnalyticsContext,
  onProgress?: (done: number, total: number) => void,
): Promise<EngineRun[]> {
  const runs: EngineRun[] = []
  const withFns = views.filter((v) => ENGINE_FNS.some((fn) => typeof v[fn] === 'function'))
  for (const [i, view] of withFns.entries()) {
    await idle()
    // A fresh context per view, so each view's cold run misses every cache keyed on the context.
    const cold = fresh()
    for (const fn of ENGINE_FNS) {
      if (typeof view[fn] !== 'function') continue
      const c = callEngine(view, fn, cold, false)
      const w = callEngine(view, fn, live)
      runs.push({
        id: `${view.key}.${fn}`,
        ms: w.ms,
        coldMs: c.ms,
        returned: w.error ? 'An error' : returnedText(fn, w.value),
        error: w.error ?? c.error,
        at: new Date().toISOString(),
      })
    }
    onProgress?.(i + 1, withFns.length)
  }
  return runs
}

/**
 * A value as JSON for the side sheet: functions dropped, long arrays cut to their first 25 items
 * with a count of the rest, so a records list does not fill the page.
 */
export function engineJson(value: unknown, maxItems = 25): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_k, v) => {
        if (typeof v === 'function') return undefined
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[repeated]'
          seen.add(v)
          if (v instanceof Set) return [...v].slice(0, maxItems)
          if (v instanceof Map) return Object.fromEntries([...v.entries()].slice(0, maxItems))
          if (Array.isArray(v) && v.length > maxItems)
            return [...v.slice(0, maxItems), `… ${v.length - maxItems} more`]
        }
        return v
      },
      2,
    )
  } catch (err) {
    return JSON.stringify({ error: `Could not be shown as JSON: ${errorMessage(err)}` })
  }
}
