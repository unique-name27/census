/**
 * Saved lists from before job families contained job functions (version 1, docs/TAXONOMY.md 6.1).
 *
 * - Lists saved from the sample company hold the old sample's job families and functions, which no
 *   longer match it: both are dropped and fall back to the new sample's lists (or to lists proposed
 *   from your data).
 * - Lists built from your data or a file check the same fields as before, so their values stay.
 *   Job families lose their parent (the list has none now); job functions get a blank one, for
 *   "Fill parents from the data" to propose. The old parents are never inverted.
 * - Drafts and "keep checking" flags stay as saved.
 * - One change-log entry with no steps records it. Being a later change to both lists, it stops
 *   every earlier change to them from being undone (their steps assume the old shape), and it
 *   cannot be undone itself (`canUndo` refuses an entry with no steps).
 */
import { MAX_LOG } from './edit'
import type { ListChange, ListId, ListsState, SavedList } from './types'

export const JOB_LISTS: readonly ListId[] = ['jobFamily', 'jobFunction']

export const LISTS_MIGRATION_WHAT =
  'Job families now contain job functions. The saved job family and job function lists were moved to match.'

/** What the settings file summary adds when a file's sample-based job lists were left out. */
export const LISTS_MIGRATION_DROPPED =
  "The file's job family and job function lists were copied from the old sample company, so they were left out."

/** A version 1 list moved to the version 2 shape (null when it was saved from the sample). */
export function migrateJobList(id: ListId, list: SavedList): SavedList | null {
  if (!JOB_LISTS.includes(id)) return list
  if (list.basis === 'sample') return null
  const values = list.values.map((v) => {
    const { parent: _old, ...rest } = v
    return id === 'jobFunction' ? { ...rest, parent: null } : rest
  })
  return { ...list, values }
}

/** The saved lists of a version 1 state, moved; and the job lists dropped because they came from the sample. */
export function migrateSavedLists(lists: ListsState['lists']): {
  lists: ListsState['lists']
  dropped: ListId[]
} {
  const out: ListsState['lists'] = { ...lists }
  const dropped: ListId[] = []
  for (const id of JOB_LISTS) {
    const l = lists[id]
    if (!l) continue
    const next = migrateJobList(id, l)
    if (next) out[id] = next
    else {
      delete out[id]
      dropped.push(id)
    }
  }
  return { lists: out, dropped }
}

/**
 * A version 1 (or unversioned) state moved to version 2. The log entry is added only when the
 * state had a job family or job function list, or a change to one; otherwise nothing moved.
 */
export function migrateListsV1(
  state: ListsState,
  now = Date.now(),
): { state: ListsState; dropped: ListId[] } {
  const touched =
    JOB_LISTS.some((id) => state.lists[id]) ||
    state.log.some((c) => c.lists.some((l) => JOB_LISTS.includes(l)))
  if (!touched) return { state, dropped: [] }
  const { lists, dropped } = migrateSavedLists(state.lists)
  const entry: ListChange = {
    id: `lst-migrate-v2-${now.toString(36)}`,
    at: new Date(now).toISOString(),
    // Census made it, not the person reading the log.
    by: 'Census',
    what: LISTS_MIGRATION_WHAT,
    lists: [...JOB_LISTS],
    ops: [],
  }
  return { state: { lists, log: [entry, ...state.log].slice(0, MAX_LOG) }, dropped }
}
