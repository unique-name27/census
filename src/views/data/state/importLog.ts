/**
 * The exceptions log of each dataset's last upload, kept in this browser (IndexedDB) so the Data
 * room can show what changed and offer the CSV after a reload. A log belongs to one upload: it is
 * shown only while the dataset's `importedAt` still matches.
 */
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import type { ImportIssue, ImportStats } from '@/data/import'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'

export interface ImportLog {
  dataset: DatasetKey
  fileName: string
  sheetName: string
  importedAt: string
  stats: ImportStats
  issues: ImportIssue[]
  /** More issues were found than are kept (the first `MAX_LOGGED_ISSUES` are). */
  truncated: number
}

/** Issues kept per dataset; a file with more keeps the first ones and says how many were left out. */
export const MAX_LOGGED_ISSUES = 10_000

const KEY = (k: DatasetKey) => `census:import-log:${k}`

function isLog(v: unknown): v is ImportLog {
  if (!v || typeof v !== 'object') return false
  const l = v as Partial<ImportLog>
  return typeof l.importedAt === 'string' && Array.isArray(l.issues) && !!l.stats
}

interface LogState {
  logs: Partial<Record<DatasetKey, ImportLog>>
  loaded: boolean
  load: () => Promise<void>
  save: (log: Omit<ImportLog, 'truncated'>) => Promise<void>
  clear: (key: DatasetKey) => Promise<void>
  clearAll: () => Promise<void>
}

export const useImportLogs = create<LogState>((set, get) => ({
  logs: {},
  loaded: false,
  async load() {
    if (get().loaded) return
    const logs: Partial<Record<DatasetKey, ImportLog>> = {}
    for (const k of DATASET_KEYS) {
      try {
        const v = await idbGet<unknown>(KEY(k))
        if (isLog(v)) logs[k] = v
      } catch {
        /* storage blocked: logs only last for this session */
      }
    }
    set((s) => ({ logs: { ...logs, ...s.logs }, loaded: true }))
  },
  async save(input) {
    const extra = Math.max(0, input.issues.length - MAX_LOGGED_ISSUES)
    const log: ImportLog = { ...input, issues: input.issues.slice(0, MAX_LOGGED_ISSUES), truncated: extra }
    set((s) => ({ logs: { ...s.logs, [log.dataset]: log } }))
    try {
      await idbSet(KEY(log.dataset), log)
    } catch {
      /* not persisted; still shown for this session */
    }
  },
  async clear(key) {
    set((s) => {
      const logs = { ...s.logs }
      delete logs[key]
      return { logs }
    })
    try {
      await idbDel(KEY(key))
    } catch {
      /* nothing stored */
    }
  },
  async clearAll() {
    set({ logs: {} })
    for (const k of DATASET_KEYS) {
      try {
        await idbDel(KEY(k))
      } catch {
        /* nothing stored */
      }
    }
  },
}))

/** The log of the upload a dataset currently holds, or null (sample data, or an older upload). */
export function logFor(
  logs: Partial<Record<DatasetKey, ImportLog>>,
  key: DatasetKey,
  source: SourceMeta | undefined,
): ImportLog | null {
  const log = logs[key]
  if (!log || source?.kind !== 'upload' || !source.importedAt) return null
  return log.importedAt === source.importedAt ? log : null
}
