/**
 * The Security center's React side of the policy layer: the policy laid over this tab
 * (`usePolicy`, over `policyStore`) and the draft (`useDraft`), kept in this browser at
 * `census:access-draft` after every change. A draft starts as a copy of what is in force; the
 * policy in force never changes because of it.
 */
import { create, useStore } from 'zustand'
import {
  type Draft,
  emptyDraft,
  loadDraft,
  type PolicyState,
  parseDraft,
  policyStore,
  saveDraft,
} from '@/access/overrides'

export function usePolicy<T>(select: (s: PolicyState) => T): T {
  return useStore(policyStore, select)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const local = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

interface DraftState {
  /** Null until the Security center first opens (the policy in force has loaded by then). */
  draft: Draft | null
  /** False when this browser would not keep the draft: it lasts for this visit. */
  kept: boolean
  /** Open the draft: the one kept in this browser, else a copy of what is in force. */
  open: () => Draft
  /** Replace the draft (every edit goes through here) and keep it. */
  set: (next: Draft) => void
  /** Start again from what is in force. */
  restart: () => void
  /** A draft from a settings file. */
  importSection: (section: unknown) => { ok: true; lines: number } | { ok: false; error: string }
}

const fromInForce = (): Draft => {
  const f = policyStore.getState().inForce
  return emptyDraft(f.lines, f.file?.checksum ?? '')
}

export const useDraft = create<DraftState>((set, get) => ({
  draft: null,
  kept: true,
  open() {
    const have = get().draft
    if (have) return have
    const draft = loadDraft(local()) ?? fromInForce()
    set({ draft })
    return draft
  },
  set(next) {
    set({ draft: next, kept: saveDraft(next, local()) })
  },
  restart() {
    const prev = get().draft
    const next = { ...fromInForce(), author: prev?.author ?? '', log: prev?.log ?? [] }
    set({ draft: next, kept: saveDraft(next, local()) })
  },
  importSection(section) {
    const d = parseDraft((section as { draft?: unknown } | null)?.draft ?? section)
    if (!d) return { ok: false, error: 'The file’s Security center draft could not be read.' }
    set({ draft: d, kept: saveDraft(d, local()) })
    return { ok: true, lines: d.lines.length }
  },
}))

/** The Security center's part of the settings file: the draft, when one is kept. */
export interface AccessDraftFileSection {
  draft: Draft
}

export function accessDraftFileSection(): AccessDraftFileSection | undefined {
  const d = useDraft.getState().draft ?? loadDraft(local())
  return d && (d.lines.length || d.log.length) ? { draft: d } : undefined
}
