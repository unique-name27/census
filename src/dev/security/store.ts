/**
 * The Security center's React side of the policy layer: the policy laid over this tab
 * (`usePolicy`, over `policyStore`) and the draft (`useDraft`), kept in this browser at
 * `census:access-draft` after every change. A draft starts as a copy of what is in force; the
 * policy in force never changes because of it. A draft read from this browser or a settings file
 * goes through the loader's screening first (`screenDraft`): a line it would leave out never
 * reaches the editor or a preview, and the Security center lists it (`skipped`).
 */
import { create, useStore } from 'zustand'
import {
  type Draft,
  emptyDraft,
  loadDraft,
  type PolicyState,
  parseDraft,
  policyStore,
  type SkippedLine,
  type SurfaceCatalog,
  saveDraft,
  screenLines,
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

/**
 * A draft's lines screened as the loader screens a file; `skipped` lists what was left out. With no
 * catalog (a settings file read outside the Security center), every guard rail still applies.
 */
export function screenDraft(d: Draft, cat: SurfaceCatalog | null): { draft: Draft; skipped: SkippedLine[] } {
  const { lines, skipped } = screenLines(d.lines, cat)
  // Lines the screen replaced (a later one for the same surface) are dropped quietly: the draft keeps one.
  const out = skipped.filter((s) => s.kind !== 'replaced')
  return { draft: skipped.length ? { ...d, lines } : d, skipped: out }
}

interface DraftState {
  /** Null until the Security center first opens (the policy in force has loaded by then). */
  draft: Draft | null
  /** Lines left out of the draft when it was read from this browser or a settings file. */
  skipped: SkippedLine[]
  /** False when this browser would not keep the draft: it lasts for this visit. */
  kept: boolean
  /**
   * Open the draft: the one kept in this browser (screened against `cat`, the Security center's
   * surface catalog), else a copy of what is in force.
   */
  open: (cat?: SurfaceCatalog | null) => Draft
  /** Replace the draft (every edit goes through here) and keep it. */
  set: (next: Draft) => void
  /** Start again from what is in force. */
  restart: () => void
  /** A draft from a settings file. */
  importSection: (
    section: unknown,
  ) => { ok: true; lines: number; skipped: number } | { ok: false; error: string }
}

const fromInForce = (): Draft => {
  const f = policyStore.getState().inForce
  return emptyDraft(f.lines, f.file?.checksum ?? '')
}

export const useDraft = create<DraftState>((set, get) => ({
  draft: null,
  skipped: [],
  kept: true,
  open(cat = null) {
    const have = get().draft
    if (have) return have
    const stored = loadDraft(local())
    const { draft, skipped } = stored ? screenDraft(stored, cat) : { draft: fromInForce(), skipped: [] }
    set({ draft, skipped })
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
    const read = parseDraft((section as { draft?: unknown } | null)?.draft ?? section)
    if (!read) return { ok: false, error: 'The file’s Security center draft could not be read.' }
    // Rails only here (Settings may open before the Security center); the editor's catalog is not loaded.
    const { draft, skipped } = screenDraft(read, null)
    set({ draft, skipped, kept: saveDraft(draft, local()) })
    return { ok: true, lines: draft.lines.length, skipped: skipped.length }
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
