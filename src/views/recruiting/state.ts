/**
 * View-local selection state shared across the Recruiting tabs: the river ribbon a reader clicked
 * and the action-queue filters (stage, next-step state, owner). Kept out of the global filters
 * because it narrows one table, not the whole app.
 */
import { create } from 'zustand'
import type { RibbonKind } from './engine/river'
import type { NextState } from './engine/types'

export interface FlowSelection {
  kind: RibbonKind | 'node'
  stage: number
}

interface RecruitingUi {
  flow: FlowSelection | null
  queueStage: number | null
  queueState: NextState | null
  owner: string | null
  /** Scroll the action queue into view on the next Pipeline render. */
  focusQueue: boolean
  selectFlow: (sel: FlowSelection | null) => void
  filterQueue: (patch: { stage?: number | null; state?: NextState | null; owner?: string | null }) => void
  openQueue: (stage: number | null, state: NextState | null) => void
  clearQueue: () => void
  queueFocused: () => void
}

/** The stage whose waiting candidates a river selection points at. */
export function queueStageFor(sel: FlowSelection): number | null {
  if (sel.kind === 'advanced') return sel.stage + 1 <= 4 ? sel.stage + 1 : null
  return sel.stage <= 4 ? sel.stage : null
}

export const useRecruitingUi = create<RecruitingUi>((set) => ({
  flow: null,
  queueStage: null,
  queueState: null,
  owner: null,
  focusQueue: false,
  selectFlow: (sel) =>
    set(
      sel
        ? { flow: sel, queueStage: queueStageFor(sel), queueState: null }
        : { flow: null, queueStage: null, queueState: null },
    ),
  filterQueue: (patch) =>
    set((s) => ({
      queueStage: patch.stage !== undefined ? patch.stage : s.queueStage,
      queueState: patch.state !== undefined ? patch.state : s.queueState,
      owner: patch.owner !== undefined ? patch.owner : s.owner,
    })),
  openQueue: (stage, state) =>
    set({ flow: null, queueStage: stage, queueState: state, owner: null, focusQueue: true }),
  clearQueue: () => set({ flow: null, queueStage: null, queueState: null, owner: null }),
  queueFocused: () => set({ focusQueue: false }),
}))
