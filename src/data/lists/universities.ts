/**
 * Universities as Quality of hire groups them (docs/ANALYSES.md, 2.3): by the name on the
 * Universities list in force. A spelling kept on the list as a retired value reads as the name
 * that replaced it ("Coyote Valley Univ." as "Coyote Valley University"), and a value that differs
 * from a listed name only in case or spacing reads as that name. A spelling mapped with Map to is
 * already rewritten in the data (a reference mapping), so it needs nothing here. Pure.
 */
import { listKey } from './defs'
import { officialLists, type SourceKinds } from './effective'
import type { ListsState, ListValue } from './types'

const contextMemo = new WeakMap<ListsState, Map<string, readonly ListValue[]>>()

/**
 * The Universities list in force for the analytics context: the one you saved, else the one
 * proposed from the data (the sample's own on the sample). Memoized on the saved lists.
 */
export function contextUniversities(saved: ListsState, sources: SourceKinds): readonly ListValue[] {
  let byKey = contextMemo.get(saved)
  if (!byKey) {
    byKey = new Map()
    contextMemo.set(saved, byKey)
  }
  const key = Object.keys(sources)
    .map((k) => `${k}:${sources[k as keyof SourceKinds]?.kind ?? ''}`)
    .sort()
    .join(',')
  let hit = byKey.get(key)
  if (!hit) {
    hit = officialLists(saved, sources).university?.values ?? []
    byKey.set(key, hit)
  }
  return hit
}

const namesMemo = new WeakMap<readonly ListValue[], ReadonlyMap<string, string>>()

/** Each spelling's name: listed names by their key, retired spellings by the name that replaced them. */
export function universityNames(list: readonly ListValue[]): ReadonlyMap<string, string> {
  let m = namesMemo.get(list)
  if (!m) {
    const out = new Map<string, string>()
    for (const v of list) if (!v.retired) out.set(listKey(v.value), v.value)
    for (const v of list) {
      if (!v.retired || !v.replacedBy) continue
      const to = out.get(listKey(v.replacedBy)) ?? v.replacedBy
      const k = listKey(v.value)
      if (!out.has(k)) out.set(k, to)
    }
    m = out
    namesMemo.set(list, m)
  }
  return m
}

/** The university a row names, as the list reads it; null for a blank. */
export function readUniversity(raw: unknown, names: ReadonlyMap<string, string>): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return names.get(listKey(text)) ?? text
}
