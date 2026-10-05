/**
 * Where the Claude API key is kept (Settings > Ask Census).
 *
 *  - By default in sessionStorage: this tab only, gone when the tab closes.
 *  - With "Keep on this device": in localStorage, until Forget key (or Clear all data, which
 *    removes every `census:` key).
 *
 * The key lives under its own storage key, so it is never part of the settings file, Report a
 * problem, exports, logs or the URL. Every read and write is wrapped: a blocked store only means
 * the key is not remembered.
 */

export const KEY_STORAGE_KEY = 'census:ask-key'

export interface KeyStores {
  session: Storage | null
  local: Storage | null
}

function store(kind: 'session' | 'local'): Storage | null {
  try {
    if (kind === 'session') return typeof sessionStorage === 'undefined' ? null : sessionStorage
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const browserStores = (): KeyStores => ({ session: store('session'), local: store('local') })

function get(s: Storage | null): string | null {
  try {
    const v = s?.getItem(KEY_STORAGE_KEY)
    return v?.trim() ? v.trim() : null
  } catch {
    return null
  }
}

function remove(s: Storage | null): void {
  try {
    s?.removeItem(KEY_STORAGE_KEY)
  } catch {
    /* blocked: nothing was kept there */
  }
}

export interface StoredKey {
  key: string
  /** Kept on this device (localStorage) rather than for this tab only. */
  kept: boolean
}

/** The key in force: this tab's, else the one kept on this device. Null when there is none. */
export function readKey(stores: KeyStores = browserStores()): StoredKey | null {
  const session = get(stores.session)
  if (session) return { key: session, kept: false }
  const local = get(stores.local)
  return local ? { key: local, kept: true } : null
}

/**
 * Keep a key: for this tab, or on this device when `keep` is on. The other store is cleared, so
 * turning "Keep on this device" off removes the remembered copy. False when the browser would not
 * store it (the caller can still use the key for this page).
 */
export function saveKey(key: string, keep: boolean, stores: KeyStores = browserStores()): boolean {
  const k = key.trim()
  if (!k) {
    forgetKey(stores)
    return true
  }
  const target = keep ? stores.local : stores.session
  const other = keep ? stores.session : stores.local
  try {
    if (!target) return false
    target.setItem(KEY_STORAGE_KEY, k)
  } catch {
    return false
  }
  remove(other)
  return true
}

/** Forget the key everywhere it was kept. */
export function forgetKey(stores: KeyStores = browserStores()): void {
  remove(stores.session)
  remove(stores.local)
}

/** Looks like an Anthropic API key ("sk-ant-..."); a quick check before sending anything. */
export const looksLikeKey = (key: string): boolean => /^sk-ant-[A-Za-z0-9_-]{8,}$/.test(key.trim())

/** The key with all but its last four characters hidden: "sk-ant-…0000". */
export function maskKey(key: string): string {
  const k = key.trim()
  if (k.length <= 12) return '••••'
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}
