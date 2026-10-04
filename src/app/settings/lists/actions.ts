/**
 * What every change in Settings > Official lists shares: the toast's Undo, which undoes the list
 * change and the data change made with it as one step, and the note a change adds when the list
 * still checks nothing after it.
 */
import { toast } from '@/components/toast'
import { listDef, type SourceKinds, savedPause } from '@/data/lists'
import type { ListId, ListsState } from '@/data/lists/types'
import { undoListChange } from '@/data/lists/undo'
import { pausedNote } from './listModel'

/** Undo a change from its toast; says so when a later change to the same list stands in the way. */
export function undoFromToast(changeId: string, by: string | null | undefined): void {
  if (!undoListChange(changeId, by))
    toast('That change can no longer be undone', {
      tone: 'critical',
      description: 'A later change touched the same list. Undo it first, in Changes to the lists.',
    })
}

/** The toast note for a change to `id`, when the list still checks nothing after it. */
export function changeNote(state: ListsState, id: ListId, sources: SourceKinds): string | undefined {
  const saved = state.lists[id]
  return saved ? pausedNote(listDef(id), savedPause(listDef(id), saved, sources)) : undefined
}
