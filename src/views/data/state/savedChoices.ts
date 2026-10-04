/**
 * The column choices Census remembers between uploads: a mapping profile per file layout (in
 * IndexedDB) and the column names a person picked per dataset (in localStorage). Counted here so
 * the Data room can offer to forget all of them, including ones left from datasets that have
 * since been reset to the sample.
 */
import { keys as idbKeys } from 'idb-keyval'
import { create } from 'zustand'
// The profile store alone (light), not the import library with its spreadsheet reader.
import { deleteProfile, forgetLearnedSynonyms, loadLearnedSynonyms } from '@/data/import/profiles'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'

/** Key prefix of the import library's saved profiles: `census:profile:<dataset>:<fingerprint>`. */
const PROFILE_PREFIX = 'census:profile:'

/** Saved profiles as dataset and header fingerprint. */
export function parseProfileKeys(all: readonly unknown[]): { dataset: DatasetKey; fingerprint: string }[] {
  const known = new Set<string>(DATASET_KEYS)
  return all.flatMap((k) => {
    if (typeof k !== 'string' || !k.startsWith(PROFILE_PREFIX)) return []
    const rest = k.slice(PROFILE_PREFIX.length)
    const cut = rest.indexOf(':')
    const dataset = rest.slice(0, cut)
    const fingerprint = rest.slice(cut + 1)
    return cut > 0 && fingerprint && known.has(dataset)
      ? [{ dataset: dataset as DatasetKey, fingerprint }]
      : []
  })
}

async function profileKeys() {
  try {
    return parseProfileKeys(await idbKeys())
  } catch {
    return []
  }
}

interface SavedChoicesState {
  /** File layouts with saved column choices. */
  layouts: number
  /** Datasets with column names the person picked. */
  learned: number
  refresh: () => Promise<void>
  forgetAll: () => Promise<void>
}

export const useSavedChoices = create<SavedChoicesState>((set, get) => ({
  layouts: 0,
  learned: 0,
  async refresh() {
    const layouts = (await profileKeys()).length
    const learned = DATASET_KEYS.filter((k) => Object.keys(loadLearnedSynonyms(k)).length > 0).length
    set({ layouts, learned })
  },
  async forgetAll() {
    for (const p of await profileKeys()) await deleteProfile(p.dataset, p.fingerprint)
    for (const k of DATASET_KEYS) forgetLearnedSynonyms(k)
    await get().refresh()
  },
}))
