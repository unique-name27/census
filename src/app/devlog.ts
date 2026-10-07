/**
 * The errors of this session, for the Developer page's "Errors this session" (docs/DESIGN-REFRESH.md
 * 4.3): a ring buffer of the last 100, fed by the view error boundary, the scorecard's "Could not be
 * computed" path, the Action center's per-view errors and Ask's tool errors. In memory only, never
 * stored or sent; it holds the error message and where it happened, never data values beyond what
 * the message itself says. Cheap enough to record in every mode. Pure (no React).
 */

/** Where an error was caught. */
export type DevErrorWhere = 'view render' | 'summary' | 'actions' | 'ask tool' | 'other'

export interface DevError {
  /** ISO date-time. */
  at: string
  where: DevErrorWhere
  /** The view or page key, when known. */
  view: string | null
  tab: string | null
  message: string
}

export const DEVLOG_SIZE = 100

let entries: DevError[] = []
const listeners = new Set<() => void>()

/** Note an error. Newest last; past 100 the oldest go. */
export function logDevError(e: Omit<DevError, 'at'> & { at?: string }): void {
  const entry: DevError = {
    at: e.at ?? new Date().toISOString(),
    where: e.where,
    view: e.view ?? null,
    tab: e.tab ?? null,
    message: String(e.message ?? '').slice(0, 500),
  }
  entries = [...entries, entry].slice(-DEVLOG_SIZE)
  for (const l of listeners) l()
}

/** The errors so far, oldest first (the same array until the next error). */
export const devErrors = (): readonly DevError[] => entries

/** Call `fn` on every new error; returns the unsubscribe (for `useSyncExternalStore`). */
export function subscribeDevErrors(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Start over (tests). */
export function clearDevErrors(): void {
  entries = []
  for (const l of listeners) l()
}

/** The message of anything thrown. */
export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))
