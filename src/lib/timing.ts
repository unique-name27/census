/**
 * User Timing for the Developer page (docs/ROLES.md, 5.7). `timed(name, fn)` wraps a call in a
 * `performance.measure` named `census:…`; it records only while the module flag is on, which
 * `src/access/connect.ts` sets in Developer mode, so the other modes pay one boolean check.
 *
 *   const model = timed(`census:headline:${view.key}`, () => view.headline(ctx))
 *   const t = timingClock(); …; recordSince(`census:ask:${name}`, t)
 *
 * Names: `census:context`, `census:quality`, `census:headline:<view>`, `census:scorecard:<view>`
 * (the scorecard records those itself, in every mode, as it always has), `census:actions:<view>`,
 * `census:drill:<kind>`, `census:ask:<tool>`, `census:export:<view>`. Every access to the User
 * Timing API is in try/catch: without it nothing is recorded and nothing breaks. Pure (no React).
 */

/** Every measure Census records starts with this. */
export const TIMING_PREFIX = 'census:'

let on = false

/** Record from now on (Developer mode) or stop (every other mode). */
export function setTimingOn(value: boolean): void {
  on = value
}

/** Whether `timed` records right now. */
export const timingOn = (): boolean => on

/** Milliseconds on the performance clock (Date.now() where there is none). */
export function timingClock(): number {
  try {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  } catch {
    return Date.now()
  }
}

/** Record a measure from `start` (a `timingClock()` reading) to now; nothing while recording is off. */
export function recordSince(name: string, start: number): void {
  if (!on) return
  try {
    performance.measure(name, { start, end: timingClock() })
  } catch {
    /* no User Timing API: nothing to record */
  }
}

/** Run `fn`, recording how long it took under `name` while recording is on. Returns what `fn` returns. */
export function timed<T>(name: string, fn: () => T): T {
  if (!on) return fn()
  const start = timingClock()
  try {
    return fn()
  } finally {
    recordSince(name, start)
  }
}

/** One recorded measure: what the Timings tab reads. */
export interface TimingEntry {
  name: string
  /** When it started, ms on the performance clock. */
  start: number
  ms: number
}

/** Every `census:` measure recorded so far, oldest first. */
export function timingEntries(): TimingEntry[] {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
    return performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith(TIMING_PREFIX))
      .map((e) => ({ name: e.name, start: e.startTime, ms: e.duration }))
  } catch {
    return []
  }
}

/** Forget every `census:` measure ("Clear timings"); marks are left alone. */
export function clearTimings(): void {
  try {
    const names = new Set(timingEntries().map((e) => e.name))
    for (const n of names) performance.clearMeasures(n)
  } catch {
    /* no User Timing API: nothing was recorded */
  }
}

/** A measure name's group: "census:headline:hrbp" → "headline". */
export const timingGroup = (name: string): string => name.slice(TIMING_PREFIX.length).split(':')[0] ?? ''
