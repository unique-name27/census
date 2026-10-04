/**
 * Folder-tab headlines that arrive late. A headline must be cheap, so one that needs heavier work
 * (the People scorecard's "targets met" runs every practice's summary) returns a placeholder at
 * first, does the work in idle time after the first paint, then calls `refreshHeadlines()`: the
 * folder tabs read their headlines again for the same context.
 */
import { useSyncExternalStore } from 'react'

let version = 0
const listeners = new Set<() => void>()

/** Ask the folder tabs to read every headline again (a late one is ready). */
export function refreshHeadlines(): void {
  version++
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = () => version

/** A number that changes whenever a late headline is ready; add it to the headline memo's keys. */
export function useHeadlineVersion(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
