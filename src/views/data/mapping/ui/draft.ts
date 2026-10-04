/**
 * The change being drafted in the edit panel. A conflict's fix button fills it in and asks the
 * panel to scroll into view; the panel owns everything else.
 */
import { create } from 'zustand'
import { type Draft, type EditKind, EMPTY_DRAFT } from '../engine/edit'

export type { Draft }

interface DraftState {
  draft: Draft
  /** Changes when a fix asks the panel to come into view. */
  focusNonce: number
  set: (patch: Partial<Draft>) => void
  /** Start a new draft of `kind`, keeping nothing from the last one. */
  start: (patch: Partial<Draft> & { kind: EditKind }, focus?: boolean) => void
  reset: () => void
}

export const useDraft = create<DraftState>((set) => ({
  draft: EMPTY_DRAFT,
  focusNonce: 0,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  start: (patch, focus = false) =>
    set((s) => ({
      draft: { ...EMPTY_DRAFT, ref: s.draft.ref, ...patch },
      focusNonce: focus ? s.focusNonce + 1 : s.focusNonce,
    })),
  reset: () => set((s) => ({ draft: { ...EMPTY_DRAFT, kind: s.draft.kind, ref: s.draft.ref } })),
}))
