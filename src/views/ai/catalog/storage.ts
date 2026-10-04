/**
 * The catalog in this browser (localStorage, like the Tools links). Nothing is stored until
 * someone changes the sample; "Reset to sample" removes the key again. Every read and write is
 * wrapped, so a blocked or full store just means changes last for this visit only. Pure apart
 * from the storage passed in, so tests use a fake one.
 */
import { SAMPLE_AGENTS } from './sample'
import type { Agent } from './types'
import { dedupeAgents, normalizeAgent } from './validate'

export const STORAGE_KEY = 'census:ai-agents'
const VERSION = 1

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface LoadedCatalog {
  agents: Agent[]
  /** True when nothing is saved and the catalog is the shipped sample. */
  isDefault: boolean
}

/** The browser's localStorage, or null where it is missing or blocked. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const sampleCatalog = (): Agent[] => SAMPLE_AGENTS.map((a) => ({ ...a }))

/** Parse a saved value; null when it is not a catalog this version understands. */
export function parseSaved(raw: string | null): Agent[] | null {
  if (raw == null) return null
  try {
    const v = JSON.parse(raw) as { version?: unknown; agents?: unknown }
    if (!v || v.version !== VERSION || !Array.isArray(v.agents)) return null
    return dedupeAgents(v.agents.map(normalizeAgent).filter((a): a is Agent => a !== null))
  } catch {
    return null
  }
}

export function loadCatalog(storage: StorageLike | null = browserStorage()): LoadedCatalog {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    raw = null
  }
  const saved = parseSaved(raw)
  return saved ? { agents: saved, isDefault: false } : { agents: sampleCatalog(), isDefault: true }
}

/** Save the catalog. False when the browser refused (the change then lasts for this visit). */
export function saveCatalog(
  agents: readonly Agent[],
  storage: StorageLike | null = browserStorage(),
): boolean {
  try {
    if (!storage) return false
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, agents }))
    return true
  } catch {
    return false
  }
}

/** Forget the saved catalog, so the sample shows again. */
export function clearCatalog(storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
