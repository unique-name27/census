/**
 * IndexedDB persistence for dataset versions and raw sheets. Nothing leaves the browser.
 *
 *   census:dataset:<key>              uploaded rows and source meta (and the version ID)
 *   census:versions:<key>             { current, history } version records
 *   census:raw:<key>:<versionId>      the original sheet and its import log
 *
 * Raw sheets are also kept in memory for the session, so they work when storage is blocked and
 * for the sample's raw extracts, which are rebuilt on every load and never stored.
 */
import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval'
import type { DatasetKey } from '../schema'
import type { DatasetVersion, RawRecord } from './types'
import { isVersion } from './versions'

export const DATASET_KEY = (k: DatasetKey) => `census:dataset:${k}`
export const VERSIONS_KEY = (k: DatasetKey) => `census:versions:${k}`
export const RAW_KEY = (k: DatasetKey, versionId: string) => `census:raw:${k}:${versionId}`
export const REFERENCE_KEY = 'census:reference'

export interface StoredVersions {
  current: DatasetVersion | null
  history: DatasetVersion[]
}

const memRaw = new Map<string, RawRecord>()

/** Keep a raw sheet for this session only (the sample's raw extracts). */
export function rememberRaw(rec: RawRecord): void {
  memRaw.set(RAW_KEY(rec.dataset, rec.versionId), rec)
}

export async function saveRaw(rec: RawRecord): Promise<void> {
  rememberRaw(rec)
  try {
    await idbSet(RAW_KEY(rec.dataset, rec.versionId), rec)
  } catch {
    /* kept in memory for this session */
  }
}

function isRaw(v: unknown): v is RawRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<RawRecord>
  return (
    typeof r.versionId === 'string' &&
    !!r.sheet &&
    Array.isArray(r.sheet.headers) &&
    Array.isArray(r.sheet.rows) &&
    Array.isArray(r.issues)
  )
}

export async function loadRaw(key: DatasetKey, versionId: string): Promise<RawRecord | null> {
  const k = RAW_KEY(key, versionId)
  const mem = memRaw.get(k)
  if (mem) return mem
  try {
    const v = await idbGet<unknown>(k)
    if (isRaw(v)) {
      memRaw.set(k, v)
      return v
    }
  } catch {
    /* storage blocked */
  }
  return null
}

export async function deleteRaw(key: DatasetKey, versionId: string): Promise<void> {
  memRaw.delete(RAW_KEY(key, versionId))
  try {
    await idbDel(RAW_KEY(key, versionId))
  } catch {
    /* nothing stored */
  }
}

export async function saveVersions(key: DatasetKey, stored: StoredVersions): Promise<void> {
  try {
    await idbSet(VERSIONS_KEY(key), stored)
  } catch {
    /* kept for this session */
  }
}

/** Throws when storage is unavailable, so the caller can tell "nothing saved" from "blocked". */
export async function loadVersions(key: DatasetKey): Promise<StoredVersions | null> {
  const v = await idbGet<unknown>(VERSIONS_KEY(key))
  if (!v || typeof v !== 'object') return null
  const r = v as { current?: unknown; history?: unknown }
  return {
    current: isVersion(r.current) ? r.current : null,
    history: Array.isArray(r.history) ? r.history.filter(isVersion) : [],
  }
}

/**
 * Remove every key Census stored in IndexedDB and every census:* key in localStorage. Returns
 * what could not be removed (empty when everything went), after trying every key.
 */
export async function clearCensusStorage(): Promise<string[]> {
  memRaw.clear()
  const failed: string[] = []
  let all: IDBValidKey[] = []
  try {
    all = await idbKeys()
  } catch {
    // No IndexedDB at all means nothing was stored there; otherwise it is blocked and may hold data.
    if (typeof indexedDB !== 'undefined') failed.push('stored uploads and mappings')
  }
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith('census:')) continue
    try {
      await idbDel(k)
    } catch {
      failed.push(k)
    }
  }
  let ks: string[] = []
  try {
    if (typeof localStorage !== 'undefined')
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('census:')) ks.push(k)
      }
  } catch {
    ks = [] // localStorage blocked: nothing was saved there
  }
  for (const k of ks) {
    try {
      localStorage.removeItem(k)
    } catch {
      failed.push(k)
    }
  }
  return failed
}
