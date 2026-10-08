/**
 * Page state for the Action center:
 *
 *  - `useActionMarks`: Mark handled and Snooze (marks v2), saved in this browser
 *    (`census:actions`, every read and write wrapped), with the name they are kept under ("Kept as
 *    Priya in this browser") and the marks file. Another open Census tab picks up changes through
 *    the browser's storage event. One browser's marks hold across modes.
 *  - `useActionFilters`: the page's own filters and the list shown, kept for this visit only.
 *  - `useNow`: the clock a snooze is judged against, ticking once a minute.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  type ActionFilters,
  type Mark,
  type Marks,
  type MarkTarget,
  mergeMarks,
  NO_FILTERS,
  STORAGE_KEY,
  snapshotOf,
  withHandled,
  withReopened,
  withSnapshot,
  withSnoozed,
} from '../engine'
import { browserStorage, loadState, saveMarks } from '../engine/marks'

export type Snapshot = Readonly<Record<string, Mark | null>>

type Target = MarkTarget | string

interface MarksStore {
  marks: Marks
  /** The name marks are kept under in this browser, or null. */
  name: string | null
  /** The last write reached the browser's storage (false: marks last for this visit only). */
  saved: boolean
  /** Each returns the marks as they were, for Undo. */
  handle: (targets: readonly Target[]) => Snapshot
  snooze: (targets: readonly Target[], days: number) => Snapshot
  reopen: (targets: readonly Target[]) => Snapshot
  restore: (snap: Snapshot) => void
  setName: (name: string | null) => void
  /** Lay a marks file's marks over this browser's (the later mark wins); returns how many changed. */
  merge: (theirs: Marks) => number
  /** Read the saved marks again (another tab changed them). */
  reload: () => void
}

export const useActionMarks = create<MarksStore>((set, get) => {
  const initial = loadState(browserStorage(), Date.now())
  const commit = (marks: Marks, name: string | null = get().name) =>
    set({ marks, name, saved: saveMarks(marks, browserStorage(), name) })
  const change = (targets: readonly Target[], next: (m: Marks) => Marks): Snapshot => {
    const before = snapshotOf(get().marks, targets)
    commit(next(get().marks))
    return before
  }
  return {
    marks: initial.marks,
    name: initial.name,
    saved: true,
    handle: (targets) => change(targets, (m) => withHandled(m, targets, Date.now(), get().name)),
    snooze: (targets, days) => change(targets, (m) => withSnoozed(m, targets, Date.now(), days, get().name)),
    reopen: (targets) => change(targets, (m) => withReopened(m, targets)),
    restore: (snap) => commit(withSnapshot(get().marks, snap)),
    setName: (name) => commit(get().marks, name?.trim() ? name.trim().slice(0, 60) : null),
    merge: (theirs) => {
      const before = get().marks
      const next = mergeMarks(before, theirs)
      const changed = Object.keys(next).filter((k) => next[k] !== before[k]).length
      if (changed) commit(next)
      return changed
    },
    reload: () => {
      const s = loadState(browserStorage(), Date.now())
      set({ marks: s.marks, name: s.name })
    },
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

/**
 * Which items the list shows: every open item (Developer, HR, CHRO), a role mode's Needs attention
 * or Waiting on others, or the ones handled or snoozed (to reopen them).
 */
export type ListMode = 'open' | 'needs' | 'waiting' | 'parked'

interface FiltersState {
  filters: ActionFilters
  /** The list picked on the page; null until one is picked (the mode's default then). */
  list: ListMode | null
  setFilters: (patch: Partial<ActionFilters>) => void
  resetFilters: () => void
  setList: (list: ListMode | null) => void
}

export const useActionFilters = create<FiltersState>((set) => ({
  filters: NO_FILTERS,
  list: null,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
  setList: (list) => set({ list }),
}))

/** The list a page shows: the one picked when the mode has it, else the mode's first. */
export function listIn(picked: ListMode | null, roleLists: boolean): ListMode {
  if (roleLists) return picked === 'needs' || picked === 'waiting' || picked === 'parked' ? picked : 'needs'
  return picked === 'parked' ? 'parked' : 'open'
}

/** Milliseconds now, refreshed every minute so a snooze that ends while the page is open ends on screen. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}
