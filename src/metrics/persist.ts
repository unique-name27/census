/**
 * The dictionary in this browser: `census:metrics` in localStorage holds your overrides and the
 * change log. The first time it is read and nothing is saved yet, the compensation cycle values
 * from Settings (`census:settings`, or the older `census:comp-cycle-settings`) are carried over
 * into the Compensation metrics' settings, logged as a migration and saved, so it happens once.
 */
import { LEGACY_KEYS, SETTINGS_KEY, sanitizeCompCycle } from '@/data/settings'
import { compCycleEdits } from './compCycle'
import { applyEdits, EMPTY_METRICS, sanitizeMetricsState } from './overrides'
import type { MetricCatalog } from './registry'
import type { MetricsState } from './types'

export const METRICS_KEY = 'census:metrics'
export const METRICS_STORE_VERSION = 1

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageOrNull = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readJson(s: StorageLike, key: string): unknown {
  try {
    const v = s.getItem(key)
    return v == null ? undefined : JSON.parse(v)
  } catch {
    return undefined
  }
}

/** The compensation cycle saved by Settings before the dictionary, if any. */
function legacyCompCycle(storage: StorageLike): unknown {
  const settings = readJson(storage, SETTINGS_KEY)
  if (settings && typeof settings === 'object') return (settings as { compCycle?: unknown }).compCycle
  return readJson(storage, LEGACY_KEYS.compCycle)
}

/**
 * Carry the compensation cycle values over from Settings into the Compensation metrics' settings.
 * Values equal to the defaults change nothing; invalid ones keep their defaults.
 */
export function migrateCompCycle(
  storage: StorageLike,
  catalog: MetricCatalog,
  at: string = new Date().toISOString(),
): MetricsState {
  const raw = legacyCompCycle(storage)
  if (raw == null || typeof raw !== 'object') return EMPTY_METRICS
  const edits = compCycleEdits(sanitizeCompCycle(raw))
  return applyEdits(EMPTY_METRICS, catalog, edits, { kind: 'migration', at }).state
}

/** Your saved dictionary changes, cleaned against the catalog; or the migrated cycle settings. */
export function loadMetrics(
  catalog: MetricCatalog,
  storage: StorageLike | null = storageOrNull(),
): MetricsState {
  if (!storage) return EMPTY_METRICS
  const saved = readJson(storage, METRICS_KEY)
  if (saved && typeof saved === 'object') return sanitizeMetricsState(saved, catalog)
  const migrated = migrateCompCycle(storage, catalog)
  // Saved now, so the values survive Settings dropping its old copy on its next save.
  if (migrated.log.length) saveMetrics(migrated, storage)
  return migrated
}

/** Save the overrides and the change log. Never throws: without storage, changes last for the session. */
export function saveMetrics(state: MetricsState, storage: StorageLike | null = storageOrNull()): void {
  try {
    storage?.setItem(
      METRICS_KEY,
      JSON.stringify({ version: METRICS_STORE_VERSION, overrides: state.overrides, log: state.log }),
    )
  } catch {
    /* storage full or blocked: kept for this session */
  }
}
