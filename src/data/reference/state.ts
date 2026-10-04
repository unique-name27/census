/**
 * The change list for reference mappings: add, remove and undo, each recorded with who and when.
 * Pure reducers; the store holds the state and persists it (IndexedDB `census:reference`).
 */
import { validateMapping } from './apply'
import { describeMapping } from './describe'
import type { NewReferenceMapping, ReferenceAudit, ReferenceMapping, ReferenceState } from './types'

export const EMPTY_REFERENCE: ReferenceState = { mappings: [], audit: [] }

/** Change-list entries kept (the mappings themselves are never dropped). */
export const MAX_AUDIT = 500

let seq = 0
const makeId = (prefix: string, now: number) => {
  seq = (seq + 1) % 1_000_000
  return `${prefix}-${now.toString(36)}-${seq.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`
}

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

function audit(
  state: ReferenceState,
  action: ReferenceAudit['action'],
  mapping: ReferenceMapping,
  what: string,
  by: string | null,
  now: number,
): ReferenceAudit[] {
  const entry: ReferenceAudit = {
    id: makeId('chg', now),
    what,
    by,
    at: new Date(now).toISOString(),
    action,
    mappingId: mapping.id,
    mapping,
  }
  return [entry, ...state.audit].slice(0, MAX_AUDIT)
}

export type AddResult =
  | { ok: true; state: ReferenceState; mapping: ReferenceMapping }
  | { ok: false; error: string }

export function addMapping(
  state: ReferenceState,
  input: NewReferenceMapping,
  by?: string | null,
  now = Date.now(),
): AddResult {
  const err = validateMapping(input)
  if (err) return { ok: false, error: err }
  const who = clean(by)
  const at = new Date(now).toISOString()
  const id = makeId('map', now)
  let mapping: ReferenceMapping
  switch (input.kind) {
    case 'merge':
    case 'rename':
      mapping = {
        ...input,
        id,
        at,
        by: who,
        from: [...new Set(input.from.map((v) => v.trim()).filter(Boolean))],
        to: input.to.trim(),
        scope: input.scope ?? 'category',
      }
      break
    case 'move-department':
      mapping = {
        ...input,
        id,
        at,
        by: who,
        department: input.department.trim(),
        to: input.to.trim(),
        from: input.from ?? null,
      }
      break
    case 'move-family':
      mapping = {
        ...input,
        id,
        at,
        by: who,
        jobFamily: input.jobFamily.trim(),
        to: input.to.trim(),
        from: input.from ?? null,
      }
      break
  }
  return {
    ok: true,
    mapping,
    state: {
      mappings: [...state.mappings, mapping],
      audit: audit(state, 'add', mapping, describeMapping(mapping), who, now),
    },
  }
}

export function removeMapping(
  state: ReferenceState,
  id: string,
  by?: string | null,
  now = Date.now(),
): ReferenceState {
  const mapping = state.mappings.find((m) => m.id === id)
  if (!mapping) return state
  return {
    mappings: state.mappings.filter((m) => m.id !== id),
    audit: audit(state, 'remove', mapping, `Removed: ${describeMapping(mapping)}`, clean(by), now),
  }
}

/**
 * A change can be undone while its effect is still in place and it is the newest entry for its
 * mapping (after an undo and a restore, only the restore offers Undo).
 */
export function canUndo(state: ReferenceState, auditId: string): boolean {
  const entry = state.audit.find((a) => a.id === auditId)
  if (!entry) return false
  // The change list is newest first.
  if (state.audit.find((a) => a.mappingId === entry.mappingId) !== entry) return false
  const active = state.mappings.some((m) => m.id === entry.mappingId)
  return entry.action === 'add' ? active : !active
}

/** Undo one change (an add is removed, a removal is restored), or the latest one that can be. */
export function undoChange(
  state: ReferenceState,
  auditId?: string,
  by?: string | null,
  now = Date.now(),
): ReferenceState {
  const entry = auditId
    ? state.audit.find((a) => a.id === auditId)
    : state.audit.find((a) => canUndo(state, a.id))
  if (!entry || !canUndo(state, entry.id)) return state
  const who = clean(by)
  if (entry.action === 'add')
    return {
      mappings: state.mappings.filter((m) => m.id !== entry.mappingId),
      audit: audit(state, 'remove', entry.mapping, `Undid: ${describeMapping(entry.mapping)}`, who, now),
    }
  // Back in its original place: mappings apply in the order they were made.
  const mappings = [...state.mappings, entry.mapping].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return {
    mappings,
    audit: audit(state, 'add', entry.mapping, `Restored: ${describeMapping(entry.mapping)}`, who, now),
  }
}

/** Loose shape check for state read back from storage. */
export function isReferenceState(v: unknown): v is ReferenceState {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<ReferenceState>
  return Array.isArray(r.mappings) && Array.isArray(r.audit)
}
