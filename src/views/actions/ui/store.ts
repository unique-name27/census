/**
 * Page state for the Action center:
 *
 *  - `useActionMarks`: Mark handled and Snooze, by item id, saved in this browser
 *    (`census:actions`, every read and write wrapped). Another open Census tab picks up changes
 *    through the browser's storage event.
 *  - `useActionFilters`: the page's own filters, kept for this visit only.
 *  - `useNow`: the clock a snooze is judged against, ticking once a minute.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  type ActionFilters,
  type Mark,
  type Marks,
  NO_FILTERS,
  STORAGE_KEY,
  snapshotOf,
  withHandled,
  withReopened,
  withSnapshot,
  withSnoozed,
} from '../engine'
import { browserStorage, loadMarks, saveMarks } from '../engine/marks'

export type Snapshot = Readonly<Record<string, Mark | null>>

interface MarksState {
  marks: Marks
  /** The last write reached the browser's storage (false: marks last for this visit only). */
  saved: boolean
  /** Each returns the marks as they were, for Undo. */
  handle: (ids: readonly string[]) => Snapshot
  snooze: (ids: readonly string[], days: number) => Snapshot
  reopen: (ids: readonly string[]) => Snapshot
  restore: (snap: Snapshot) => void
  /** Read the saved marks again (another tab changed them). */
  reload: () => void
}

export const useActionMarks = create<MarksState>((set, get) => {
  const commit = (marks: Marks) => set({ marks, saved: saveMarks(marks, browserStorage()) })
  const change = (ids: readonly string[], next: (m: Marks) => Marks): Snapshot => {
    const before = snapshotOf(get().marks, ids)
    commit(next(get().marks))
    return before
  }
  return {
    marks: loadMarks(browserStorage(), Date.now()),
    saved: true,
    handle: (ids) => change(ids, (m) => withHandled(m, ids, Date.now())),
    snooze: (ids, days) => change(ids, (m) => withSnoozed(m, ids, Date.now(), days)),
    reopen: (ids) => change(ids, (m) => withReopened(m, ids)),
    restore: (snap) => commit(withSnapshot(get().marks, snap)),
    reload: () => set({ marks: loadMarks(browserStorage(), Date.now()) }),
  }
})

// Another tab marked or snoozed something (or cleared Census's storage): read the marks again.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY || e.key === null) useActionMarks.getState().reload()
    })
  } catch {
    /* no storage events: other tabs catch up on their next load */
  }
}

/** Which items the list shows: open ones, or the ones handled or snoozed (to reopen them). */
export type ListMode = 'open' | 'parked'

interface FiltersState {
  filters: ActionFilters
  mode: ListMode
  setFilters: (patch: Partial<ActionFilters>) => void
  resetFilters: () => void
  setMode: (mode: ListMode) => void
}

export const useActionFilters = create<FiltersState>((set) => ({
  filters: NO_FILTERS,
  mode: 'open',
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
  setMode: (mode) => set({ mode }),
}))

/** Milliseconds now, refreshed every minute so a snooze that ends while the page is open ends on screen. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}
