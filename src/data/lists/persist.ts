/**
 * The official lists in this browser (`census:lists` in localStorage) and in the settings file.
 * Everything read back is checked: unknown lists, malformed values and attributes are dropped,
 * and Census's own values a saved vocabulary list lacks are put back.
 */
import { type Level, levelTrack } from '../schema'
import { isListId, listDef, listKey } from './defs'
import { EMPTY_LISTS, MAX_LOG, MAX_TEXT, replaceLists } from './edit'
import { LISTS_MIGRATION_DROPPED, migrateListsV1, migrateSavedLists } from './migrate'
import { censusValues } from './seed'
import type { AttrValue, ListChange, ListId, ListOp, ListsState, ListValue, SavedList } from './types'

export const LISTS_KEY = 'census:lists'
/** 2: job families contain job functions (`./migrate`). */
export const LISTS_STORE_VERSION = 2

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/**
 * A name as saved: trimmed only. A list built from data keeps each value exactly as the data
 * spells it, inner spaces included, so the rows that use it stay recognized after a reload.
 */
const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && s.length <= MAX_TEXT * 2 ? s : null
}

function cleanValue(id: ListId, raw: unknown): ListValue | null {
  if (!isObj(raw)) return null
  const value = str(raw.value)
  if (!value) return null
  const def = listDef(id)
  const out: ListValue = { value }
  if (def.parent) out.parent = str(raw.parent)
  if (isObj(raw.attrs)) {
    const attrs: Record<string, AttrValue> = {}
    for (const a of def.attrs) {
      const v = raw.attrs[a.key]
      if (typeof v === 'number' && Number.isFinite(v)) attrs[a.key] = v
      else if (typeof v === 'string' && v.trim()) attrs[a.key] = v.trim().slice(0, MAX_TEXT)
      else if (v === null) attrs[a.key] = null
    }
    if (Object.keys(attrs).length) out.attrs = attrs
  }
  if (raw.retired === true) out.retired = true
  const rb = str(raw.replacedBy)
  if (rb) out.replacedBy = rb
  if (raw.builtIn === true) out.builtIn = true
  if (raw.added === true) out.added = true
  return out
}

const BASES: readonly SavedList['basis'][] = ['sample', 'data', 'census', 'file']

/**
 * A saved list from untrusted input, or null. Values are de-duplicated by the rule every list
 * follows (spellings that differ only in case or spacing are one value, `listKey`), keeping the
 * first; on Census's lists its own values are always present (and are the only ones on a fixed list).
 */
export function cleanSavedList(
  id: ListId,
  raw: unknown,
  fallbackBasis: SavedList['basis'] = 'file',
): SavedList | null {
  if (!isObj(raw) || !Array.isArray(raw.values)) return null
  const def = listDef(id)
  const seen = new Set<string>()
  let values: ListValue[] = []
  for (const r of raw.values) {
    const v = cleanValue(id, r)
    if (!v || seen.has(listKey(v.value))) continue
    seen.add(listKey(v.value))
    values.push(v)
  }
  if (def.kind !== 'org') {
    const census = censusValues(id)
    const names = new Set(census.map((c) => c.value))
    for (const v of values) {
      if (names.has(v.value)) {
        v.builtIn = true
        delete v.added
      } else delete v.builtIn
    }
    // A fixed list holds exactly Census's values (only retired or relabelled).
    if (def.kind === 'fixed') values = values.filter((v) => names.has(v.value))
    for (const c of census) if (!values.some((v) => v.value === c.value)) values.push(c)
  } else for (const v of values) delete v.builtIn
  // A level's track follows from its code.
  if (id === 'level') for (const v of values) v.attrs = { ...v.attrs, track: levelTrack(v.value as Level) }
  const basis = BASES.includes(raw.basis as SavedList['basis'])
    ? (raw.basis as SavedList['basis'])
    : fallbackBasis
  const at = typeof raw.at === 'string' && raw.at ? raw.at : new Date(0).toISOString()
  return {
    values,
    basis,
    at,
    ...(raw.draft === true ? { draft: true } : {}),
    ...(raw.always === true ? { always: true } : {}),
  }
}

function cleanLists(raw: unknown, fallbackBasis?: SavedList['basis']): ListsState['lists'] {
  const out: ListsState['lists'] = {}
  if (!isObj(raw)) return out
  for (const [id, v] of Object.entries(raw)) {
    if (!isListId(id)) continue
    const s = cleanSavedList(id, v, fallbackBasis)
    if (s) out[id] = s
  }
  return out
}

const OPS = new Set(['save', 'add', 'remove', 'rename', 'set'])

/** Change-log entries keep their steps only when every step names a known list. */
function cleanLog(raw: unknown): ListChange[] {
  if (!Array.isArray(raw)) return []
  const out: ListChange[] = []
  for (const c of raw) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.what !== 'string' || typeof c.at !== 'string')
      continue
    const ops = Array.isArray(c.ops)
      ? (c.ops.filter((o) => isObj(o) && OPS.has(o.op as string) && isListId(o.list)) as unknown as ListOp[])
      : []
    if (!Array.isArray(c.ops) || ops.length !== c.ops.length) continue
    const lists = Array.isArray(c.lists) ? (c.lists.filter(isListId) as ListId[]) : []
    out.push({
      id: c.id,
      at: c.at,
      by: typeof c.by === 'string' && c.by.trim() ? c.by.trim() : null,
      what: c.what,
      lists,
      ops,
      ...(typeof c.undoes === 'string' ? { undoes: c.undoes } : {}),
      ...(typeof c.reference === 'string' && c.reference ? { reference: c.reference } : {}),
    })
    if (out.length >= MAX_LOG) break
  }
  return out
}

export function sanitizeListsState(raw: unknown): ListsState {
  if (!isObj(raw)) return EMPTY_LISTS
  return { lists: cleanLists(raw.lists), log: cleanLog(raw.log) }
}

const versionOf = (raw: unknown): number =>
  isObj(raw) && typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1

/**
 * The saved lists, or none. Never throws. A state saved before version 2 is migrated
 * (`migrateListsV1`) and saved again at once, so the migration runs once.
 */
export function loadLists(storage: StorageLike | null = storageOrNull(), now = Date.now()): ListsState {
  if (!storage) return EMPTY_LISTS
  try {
    const v = storage.getItem(LISTS_KEY)
    if (v == null) return EMPTY_LISTS
    const raw: unknown = JSON.parse(v)
    const state = sanitizeListsState(raw)
    if (versionOf(raw) >= LISTS_STORE_VERSION) return state
    const migrated = migrateListsV1(state, now).state
    saveLists(migrated, storage)
    return migrated
  } catch {
    return EMPTY_LISTS
  }
}

/**
 * Save the lists and the change log. Never throws: without storage, changes last for the session.
 * False when they could not be saved in this browser.
 */
export function saveLists(state: ListsState, storage: StorageLike | null = storageOrNull()): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      LISTS_KEY,
      JSON.stringify({ version: LISTS_STORE_VERSION, lists: state.lists, log: state.log }),
    )
    return true
  } catch {
    /* storage full or blocked: kept for this session */
    return false
  }
}

/* ───────────── settings file ───────────── */

/** The lists as they travel in the settings file: the saved lists only (the change log stays here). */
export interface ListsFileSection {
  version: number
  lists: ListsState['lists']
}

/** The section for the settings file, or undefined when no list is saved. */
export function listsFileSection(state: ListsState): ListsFileSection | undefined {
  if (!Object.keys(state.lists).length) return undefined
  return { version: LISTS_STORE_VERSION, lists: state.lists }
}

export type ListsImportResult =
  | { ok: true; state: ListsState; changed: ListId[]; summary: string }
  | { ok: false; error: string }

const sameList = (a: SavedList | undefined, b: SavedList) =>
  !!a &&
  JSON.stringify(a.values) === JSON.stringify(b.values) &&
  !!a.draft === !!b.draft &&
  !!a.always === !!b.always

/**
 * Apply a settings file's lists: each list in the file replaces the one here (one logged change,
 * which can be undone). Lists the file does not hold stay as they are.
 */
export function importListsSection(
  section: unknown,
  state: ListsState,
  by?: string | null,
  now = Date.now(),
): ListsImportResult {
  if (!isObj(section) || !isObj(section.lists))
    return { ok: false, error: 'The official lists in the file could not be read.' }
  const read = cleanLists(section.lists, 'file')
  // A section from before version 2: the same move as a saved state (sample-based job lists left out).
  const { lists: incoming, dropped } =
    versionOf(section) < LISTS_STORE_VERSION ? migrateSavedLists(read) : { lists: read, dropped: [] }
  const left = dropped.length ? ` ${LISTS_MIGRATION_DROPPED}` : ''
  const changed: Partial<Record<ListId, SavedList>> = {}
  for (const [id, list] of Object.entries(incoming) as [ListId, SavedList][])
    if (!sameList(state.lists[id], list)) changed[id] = list
  const ids = Object.keys(changed) as ListId[]
  if (!ids.length)
    return { ok: true, state, changed: [], summary: `The official lists already matched the file.${left}` }
  const n = ids.length
  const r = replaceLists(
    state,
    changed,
    `Loaded ${n} official ${n === 1 ? 'list' : 'lists'} from a settings file.`,
    {
      by,
      now,
    },
  )
  return {
    ok: true,
    state: r.state,
    changed: ids,
    summary: `Official lists: replaced ${ids.map((id) => listDef(id).label.toLowerCase()).join(', ')}.${left}`,
  }
}
