/**
 * Every key Census keeps in this browser (docs/ROLES.md, 5.3 "Storage keys"): where it lives and
 * what it holds, so the Developer page can describe a scan of the three stores. A test scans the
 * source for `census:` literals and fails when one is neither listed here nor named as something
 * that is not storage (a User Timing measure, an event name). The Ask key's value is never shown or
 * copied ("set" or "not set"); the workspace ID is cut to `wrkspc_…`. Pure.
 */

export type StorageArea = 'localStorage' | 'sessionStorage' | 'IndexedDB'

export interface StorageKeyDef {
  /** The key, or its prefix when `prefix` is true ("census:dataset:" for "census:dataset:employees"). */
  key: string
  prefix?: boolean
  where: readonly StorageArea[]
  /** What it holds, one plain phrase. */
  holds: string
  /** In the settings file (Settings > This device > Save settings to a file). */
  inSettingsFile?: boolean
  /** Its value is never shown or copied ('key'), or only cut ('workspace'). */
  secret?: 'key' | 'workspace'
  /** Read once to move it into a newer key; Census no longer writes it. */
  legacy?: boolean
}

export const STORAGE_KEYS: readonly StorageKeyDef[] = [
  {
    key: 'census:settings',
    where: ['localStorage'],
    holds: 'Settings: display, data standard, reporting date, related tool links, engagement surveys switch',
    inSettingsFile: true,
  },
  {
    key: 'census:filters',
    where: ['localStorage'],
    holds: 'The filters last used, restored on the next visit',
  },
  { key: 'census:views', where: ['localStorage'], holds: 'Saved views and the one set to open Census' },
  {
    key: 'census:metrics',
    where: ['localStorage'],
    holds: 'Your metric definition changes and their change log',
    inSettingsFile: true,
  },
  { key: 'census:lists', where: ['localStorage'], holds: 'Official lists', inSettingsFile: true },
  { key: 'census:mode', where: ['localStorage'], holds: 'The mode and, in Manager mode, the manager' },
  { key: 'census:dev', where: ['localStorage'], holds: 'The debug overlay switches' },
  { key: 'census:help', where: ['localStorage'], holds: 'Help: welcome card dismissed, tours finished' },
  { key: 'census:actions', where: ['localStorage'], holds: 'Action center items marked handled or snoozed' },
  { key: 'census:ai-agents', where: ['localStorage'], holds: 'The AI in HR agent catalog' },
  { key: 'census:quality-lens', where: ['localStorage'], holds: 'The quality lens switch' },
  {
    key: 'census:reviewer-name',
    where: ['localStorage'],
    holds: 'The name last used to confirm or certify data',
  },
  {
    key: 'census:mapping-name',
    where: ['localStorage'],
    holds: 'An older copy of the reviewer name, moved on first read',
    legacy: true,
  },
  {
    key: 'census:org:',
    prefix: true,
    where: ['localStorage'],
    holds: 'Org chart preferences and the reorg scenario',
  },
  {
    key: 'census:org:jump',
    where: ['sessionStorage'],
    holds: 'A person the org chart opens at, read once',
  },
  {
    key: 'census:ask-key',
    where: ['sessionStorage', 'localStorage'],
    holds: 'The Claude API key for Ask Census (this tab only unless kept on this device)',
    secret: 'key',
  },
  {
    key: 'census:ask-workspace',
    where: ['localStorage'],
    holds: 'The Claude Console workspace ID',
    secret: 'workspace',
  },
  { key: 'census:ask-model', where: ['localStorage'], holds: 'The model Ask Census uses' },
  { key: 'census:theme', where: ['localStorage'], holds: 'An older theme setting', legacy: true },
  { key: 'census:tools', where: ['localStorage'], holds: 'Older related tool links', legacy: true },
  {
    key: 'census:comp-cycle-settings',
    where: ['localStorage'],
    holds: 'Older compensation cycle settings',
    legacy: true,
  },
  { key: 'census:asOf', where: ['localStorage'], holds: 'An older reporting date setting', legacy: true },
  {
    key: 'census:showPay',
    where: ['localStorage'],
    holds: 'An older pay amounts switch, removed on load',
    legacy: true,
  },
  {
    key: 'census:dataset:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'An uploaded dataset: its rows, source and version',
  },
  { key: 'census:versions:', prefix: true, where: ['IndexedDB'], holds: 'A dataset’s version records' },
  {
    key: 'census:raw:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'The original sheet of a version and its import log',
  },
  { key: 'census:reference', where: ['IndexedDB'], holds: 'Reference mappings and their change list' },
  { key: 'census:import-log:', prefix: true, where: ['IndexedDB'], holds: 'The import log of an upload' },
  {
    key: 'census:profile:',
    prefix: true,
    where: ['IndexedDB'],
    holds: 'Saved column choices for a file layout',
  },
  { key: 'census:synonyms:', prefix: true, where: ['IndexedDB'], holds: 'Column names learned from uploads' },
]

/**
 * `census:` names in the source that are not storage keys: User Timing measures and marks, an event
 * name, and the prefix itself (the "Clear everything" key walk). The source scan accepts these.
 */
export const NOT_STORAGE_NAMES: readonly { name: string; what: string }[] = [
  { name: 'census:', what: 'The prefix every key starts with (Clear everything walks it)' },
  { name: 'census:scorecard', what: 'User Timing: the scorecard summaries' },
  { name: 'census:context', what: 'User Timing: the analytics context' },
  { name: 'census:quality', what: 'User Timing: the quality index' },
  { name: 'census:headline', what: 'User Timing: folder-tab headlines' },
  { name: 'census:actions', what: 'User Timing: Action center items (also a storage key)' },
  { name: 'census:drill', what: 'User Timing: records panel tables' },
  { name: 'census:ask', what: 'User Timing: Ask tools' },
  { name: 'census:export', what: 'User Timing: whole-view exports' },
  { name: 'census:scan', what: 'User Timing: Developer page figure scans' },
  { name: 'census:org-jump', what: 'An event the org chart listens for' },
]

/** The definition that describes a key, or null for a key Census does not know. */
export function describeKey(key: string): StorageKeyDef | null {
  const exact = STORAGE_KEYS.find((d) => !d.prefix && d.key === key)
  if (exact) return exact
  // The longest matching prefix wins ("census:org:jump" is exact; "census:org:prefs" is a prefix match).
  const prefixed = STORAGE_KEYS.filter((d) => d.prefix && key.startsWith(d.key)).sort(
    (a, b) => b.key.length - a.key.length,
  )
  return prefixed[0] ?? null
}

/** A value as the Developer page may show it: never the Ask key, the workspace ID cut. */
export function safeValue(key: string, raw: string | null): string {
  const def = describeKey(key)
  if (def?.secret === 'key') return raw?.trim() ? 'set' : 'not set'
  if (def?.secret === 'workspace') return raw?.trim() ? 'wrkspc_…' : 'not set'
  return raw ?? ''
}

/** Whether "Copy value" is offered for a key (never for the Ask key). */
export const canCopyValue = (key: string): boolean => describeKey(key)?.secret !== 'key'

/** One key found in this browser. */
export interface StorageRow {
  key: string
  where: StorageArea
  /** Bytes it takes (UTF-16 for web storage; the JSON size for IndexedDB); null when unknown. */
  bytes: number | null
  holds: string
  /** A key Census does not describe. */
  unknown: boolean
  inSettingsFile: boolean
  secret: boolean
}

/** A store's keys and values, as the scan reads them (web storage, or IndexedDB values as JSON sizes). */
export interface StorageSnapshot {
  local: readonly { key: string; value: string | null }[]
  session: readonly { key: string; value: string | null }[]
  indexedDb: readonly { key: string; bytes: number | null }[]
}

/** Every `census:` key of the snapshot, described; biggest first. */
export function storageRows(snap: StorageSnapshot): StorageRow[] {
  const rows: StorageRow[] = []
  const add = (key: string, where: StorageArea, bytes: number | null) => {
    if (!key.startsWith('census:')) return
    const def = describeKey(key)
    rows.push({
      key,
      where,
      bytes,
      holds: def?.holds ?? 'Not described',
      unknown: !def,
      inSettingsFile: !!def?.inSettingsFile,
      secret: !!def?.secret,
    })
  }
  // Web storage holds UTF-16 strings: two bytes a character, key and value.
  const webBytes = (k: string, v: string | null) => (k.length + (v?.length ?? 0)) * 2
  for (const e of snap.local) add(e.key, 'localStorage', webBytes(e.key, e.value))
  for (const e of snap.session) add(e.key, 'sessionStorage', webBytes(e.key, e.value))
  for (const e of snap.indexedDb) add(e.key, 'IndexedDB', e.bytes)
  return rows.sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.key.localeCompare(b.key))
}

/** Bytes by store, for the State tab and the Overview tile. */
export function storageTotals(rows: readonly StorageRow[]): Record<StorageArea, number> {
  const out: Record<StorageArea, number> = { localStorage: 0, sessionStorage: 0, IndexedDB: 0 }
  for (const r of rows) out[r.where] += r.bytes ?? 0
  return out
}
