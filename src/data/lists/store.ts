/**
 * The official lists you saved, with their change log: one small store, saved in this browser
 * (`census:lists`) after every change and kept in step with other open tabs. The pure functions
 * in this folder do the work; this only holds the state.
 */
import { create } from 'zustand'
import {
  applyEdit,
  applyEdits,
  type BatchResult,
  type EditOptions,
  type EditResult,
  EMPTY_LISTS,
  undoChange,
  withReference,
} from './edit'
import { importListsSection, LISTS_KEY, type ListsImportResult, loadLists, saveLists } from './persist'
import type { EffectiveLists, ListEdit, ListsState } from './types'
import { applyListsImport, type ListsImportPlan } from './workbook'

export interface ListsStore {
  state: ListsState
  /** The last change could not be saved in this browser (storage full or blocked): it lasts for this session. */
  unsaved: boolean
  /** Make one change against the lists in force; logged and saved. */
  edit: (edit: ListEdit, eff: EffectiveLists, opts?: EditOptions) => EditResult
  /** Several changes as one logged change. */
  editMany: (edits: readonly ListEdit[], eff: EffectiveLists, what: string, opts?: EditOptions) => BatchResult
  /**
   * Undo one change, or the latest one that can be. False when nothing was undone. `reference`
   * is the reference mapping change made alongside the undo (see `undoListChange`).
   */
  undo: (changeId?: string, by?: string | null, reference?: string) => boolean
  /** Record the reference mapping change made with a list change, so its undo covers both. */
  linkReference: (changeId: string, reference: string) => void
  /** Apply an Official lists workbook's plan. */
  applyImport: (plan: ListsImportPlan, eff: EffectiveLists, opts?: EditOptions) => BatchResult
  /** Apply a settings file's lists section. */
  importSection: (section: unknown, by?: string | null) => ListsImportResult
  /** Forget every saved list and the change log (Clear everything on this device). */
  reset: () => void
}

let listening = false

export const useLists = create<ListsStore>((set, get) => {
  const commit = (next: ListsState) => {
    if (next === get().state) return
    set({ state: next, unsaved: !saveLists(next) })
  }
  if (typeof window !== 'undefined' && !listening) {
    listening = true
    // Another tab's change (or "clear everything") reaches this one as it happens.
    window.addEventListener('storage', (e) => {
      if (e.key === LISTS_KEY || e.key === null) set({ state: loadLists() })
    })
  }
  return {
    state: loadLists(),
    unsaved: false,
    edit(edit, eff, opts) {
      const r = applyEdit(get().state, eff, edit, opts)
      if (r.ok) commit(r.state)
      return r
    },
    editMany(edits, eff, what, opts) {
      const r = applyEdits(get().state, eff, edits, what, opts)
      commit(r.state)
      return r
    },
    undo(changeId, by, reference) {
      const before = get().state
      const next = undoChange(before, changeId, by, Date.now(), reference)
      commit(next)
      return next !== before
    },
    linkReference(changeId, reference) {
      commit(withReference(get().state, changeId, reference))
    },
    applyImport(plan, eff, opts) {
      const r = applyListsImport(get().state, eff, plan, opts)
      commit(r.state)
      return r
    },
    importSection(section, by) {
      const r = importListsSection(section, get().state, by)
      if (r.ok) commit(r.state)
      return r
    },
    reset() {
      set({ state: EMPTY_LISTS, unsaved: false })
    },
  }
})
