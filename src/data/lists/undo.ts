/**
 * Undo a list change together with the reference mapping change made with it (a rename or move
 * that carried the data along), as one step: the list and the data go back together, or neither
 * does. The pure `undoBoth` holds the rule; `undoListChange` applies it to the two stores.
 */
import { canUndo as canUndoReference, undoChange as undoReference } from '../reference/state'
import type { ReferenceState } from '../reference/types'
import { useCensus } from '../store'
import { canUndo, undoChange } from './edit'
import { useLists } from './store'
import type { ListsState } from './types'

/**
 * The reference mapping change to undo with list change `changeId`: its own, while that can still
 * be undone (a mapping already removed in Categories & mapping stays removed). Null when the list
 * change can't be undone (nothing is undone then) or has no mapping to undo.
 */
export function referenceToUndo(
  lists: ListsState,
  reference: ReferenceState,
  changeId: string,
): { ok: boolean; reference: string | null } {
  const entry = lists.log.find((c) => c.id === changeId)
  if (!entry || !canUndo(lists, changeId)) return { ok: false, reference: null }
  const ref = entry.reference && canUndoReference(reference, entry.reference) ? entry.reference : null
  return { ok: true, reference: ref }
}

/** Undo a list change and its reference mapping change (pure); null when the list change can't be undone. */
export function undoBoth(
  lists: ListsState,
  reference: ReferenceState,
  changeId: string,
  by?: string | null,
  now = Date.now(),
): { lists: ListsState; reference: ReferenceState } | null {
  const plan = referenceToUndo(lists, reference, changeId)
  if (!plan.ok) return null
  const nextRef = plan.reference ? undoReference(reference, plan.reference, by, now) : reference
  const made = nextRef !== reference ? nextRef.audit[0]?.id : undefined
  return { lists: undoChange(lists, changeId, by, now, made), reference: nextRef }
}

/**
 * Undo a list change from the change log or a toast, with the data change made alongside it.
 * False when it can't be undone (a later change touched the same list); then nothing changes.
 */
export function undoListChange(changeId: string, by?: string | null): boolean {
  const plan = referenceToUndo(useLists.getState().state, useCensus.getState().reference, changeId)
  if (!plan.ok) return false
  let made: string | undefined
  if (plan.reference) {
    const before = useCensus.getState().reference
    useCensus.getState().undoReferenceChange(plan.reference, by)
    const after = useCensus.getState().reference
    if (after !== before) made = after.audit[0]?.id
  }
  return useLists.getState().undo(changeId, by, made)
}

/** Record the reference mapping change (its change-list id) made with list change `changeId`. */
export const linkReference = (changeId: string, reference: string): void =>
  useLists.getState().linkReference(changeId, reference)
