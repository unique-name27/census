/**
 * Where the Claude API key is kept (Settings > Ask Census), the optional workspace ID below, and,
 * when the team runs a relay (docs/ASK-RELAY.md), the team passcode and the "Use my own key
 * instead" choice.
 *
 *  - By default in sessionStorage: this tab only, gone when the tab closes.
 *  - With "Keep on this device": in localStorage, until Forget key (or Clear all data, which
 *    removes every `census:` key).
 *
 * The key and the passcode each live under their own storage key, so neither is ever part of the
 * settings file, Report a problem, exports, logs or the URL. Every read and write is wrapped: a
 * blocked store only means the key or passcode is not remembered.
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

function get(s: Storage | null, name: string): string | null {
  try {
    const v = s?.getItem(name)
    return v?.trim() ? v.trim() : null
  } catch {
    return null
  }
}

function remove(s: Storage | null, name: string): void {
  try {
    s?.removeItem(name)
  } catch {
    /* blocked: nothing was kept there */
  }
}

/**
 * Whether the page is served from a host whose storage other sites share: GitHub Pages serves every
 * site of an account from `<account>.github.io` (GitLab Pages, every site of a group from
 * `<group>.gitlab.io`), and a page at one address can read what a page at another kept in the
 * browser, in localStorage, and in sessionStorage when the same tab moves between them. There,
 * "Keep on this device" is not offered for the key or the passcode (docs/ASK-RELAY.md, Security
 * notes). A custom domain set on Census's own repository gives it an address of its own.
 */
export function sharedHost(hostname: string = pageHost()): boolean {
  return /\.(github|gitlab)\.io\.?$/i.test(hostname.trim())
}

/** This page's host name, or '' outside a browser. */
export function pageHost(): string {
  try {
    return typeof location === 'undefined' ? '' : location.hostname
  } catch {
    return ''
  }
}

/** A secret kept for this tab, else on this device. */
function readSecret(name: string, stores: KeyStores): { value: string; kept: boolean } | null {
  const session = get(stores.session, name)
  if (session) return { value: session, kept: false }
  const local = get(stores.local, name)
  return local ? { value: local, kept: true } : null
}

/** Keep a secret for this tab, or on this device; the other store is cleared. */
function saveSecret(name: string, value: string, keep: boolean, stores: KeyStores): boolean {
  const v = value.trim()
  if (!v) {
    remove(stores.session, name)
    remove(stores.local, name)
    return true
  }
  const target = keep ? stores.local : stores.session
  const other = keep ? stores.session : stores.local
  try {
    if (!target) return false
    target.setItem(name, v)
  } catch {
    return false
  }
  remove(other, name)
  return true
}

export interface StoredKey {
  key: string
  /** Kept on this device (localStorage) rather than for this tab only. */
  kept: boolean
}

/** The key in force: this tab's, else the one kept on this device. Null when there is none. */
export function readKey(stores: KeyStores = browserStores()): StoredKey | null {
  const s = readSecret(KEY_STORAGE_KEY, stores)
  return s ? { key: s.value, kept: s.kept } : null
}

/**
 * Keep a key: for this tab, or on this device when `keep` is on. The other store is cleared, so
 * turning "Keep on this device" off removes the remembered copy. False when the browser would not
 * store it (the caller can still use the key for this page).
 */
export function saveKey(key: string, keep: boolean, stores: KeyStores = browserStores()): boolean {
  return saveSecret(KEY_STORAGE_KEY, key, keep, stores)
}

/** Forget the key everywhere it was kept. */
export function forgetKey(stores: KeyStores = browserStores()): void {
  remove(stores.session, KEY_STORAGE_KEY)
  remove(stores.local, KEY_STORAGE_KEY)
}

/** Looks like an Anthropic API key ("sk-ant-..."); a quick check before sending anything. */
export const looksLikeKey = (key: string): boolean => /^sk-ant-[A-Za-z0-9_-]{8,}$/.test(key.trim())

/** The key with all but its last four characters hidden: "sk-ant-…0000". */
export function maskKey(key: string): string {
  const k = key.trim()
  if (k.length <= 12) return '••••'
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}

/* ───────────── the workspace ID ───────────── */

/**
 * The Claude Console workspace a key that belongs to none should use (Settings > Ask Census,
 * optional). It goes to Anthropic as the `anthropic-workspace-id` request header and nowhere else.
 * It is an identifier, not a secret, so it is kept on this device (localStorage), apart from the
 * settings file like the key; Forget key leaves it alone, Clear all data removes it.
 */
export const WORKSPACE_STORAGE_KEY = 'census:ask-workspace'

/** Looks like a Claude Console workspace ID ("wrkspc_01..."). */
export const looksLikeWorkspaceId = (id: string): boolean => /^wrkspc_[A-Za-z0-9]+$/.test(id.trim())

/** The workspace ID saved in Settings, or null (none saved, not a workspace ID, or blocked storage). */
export function readWorkspaceId(local: Storage | null = store('local')): string | null {
  try {
    const v = local?.getItem(WORKSPACE_STORAGE_KEY)?.trim()
    return v && looksLikeWorkspaceId(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Keep a workspace ID (trimmed). A blank one clears it. False when it does not look like a
 * workspace ID (nothing is saved) or the browser would not store it.
 */
export function saveWorkspaceId(id: string, local: Storage | null = store('local')): boolean {
  const v = id.trim()
  if (!v) {
    clearWorkspaceId(local)
    return true
  }
  if (!looksLikeWorkspaceId(v)) return false
  try {
    if (!local) return false
    local.setItem(WORKSPACE_STORAGE_KEY, v)
    return true
  } catch {
    return false
  }
}

/** Remove the workspace ID: requests then go without one. */
export function clearWorkspaceId(local: Storage | null = store('local')): void {
  try {
    local?.removeItem(WORKSPACE_STORAGE_KEY)
  } catch {
    /* blocked: nothing was kept there */
  }
}

/* ───────────── the team passcode (a relay is configured) ───────────── */

/**
 * The team passcode, for a team that runs the Ask relay (docs/ASK-RELAY.md): kept exactly like the
 * key (this tab by default, this device with "Keep on this device"), under its own storage key. It
 * goes to the relay as the `x-census-passcode` request header and nowhere else.
 */
export const PASSCODE_STORAGE_KEY = 'census:ask-passcode'

export interface StoredPasscode {
  passcode: string
  /** Kept on this device (localStorage) rather than for this tab only. */
  kept: boolean
}

/** The passcode in force: this tab's, else the one kept on this device. Null when there is none. */
export function readPasscode(stores: KeyStores = browserStores()): StoredPasscode | null {
  const s = readSecret(PASSCODE_STORAGE_KEY, stores)
  return s ? { passcode: s.value, kept: s.kept } : null
}

/** Keep the passcode, for this tab or on this device; false when the browser would not store it. */
export function savePasscode(passcode: string, keep: boolean, stores: KeyStores = browserStores()): boolean {
  return saveSecret(PASSCODE_STORAGE_KEY, passcode, keep, stores)
}

/** Forget the passcode everywhere it was kept. */
export function forgetPasscode(stores: KeyStores = browserStores()): void {
  remove(stores.session, PASSCODE_STORAGE_KEY)
  remove(stores.local, PASSCODE_STORAGE_KEY)
}

/**
 * Looks like a passcode the relay can be sent: 4 to 256 visible characters (letters, numbers,
 * spaces and common symbols; a request header carries nothing else), the relay's own minimum.
 */
export const looksLikePasscode = (p: string): boolean => /^[ -~]{4,256}$/.test(p.trim())

/**
 * "Use my own key instead" (Settings > Ask Census, only when a relay is configured): on, Ask uses
 * the person's own key straight to Anthropic, as with no relay. Not a secret, so it is kept on this
 * device; absent means off (the team relay).
 */
export const SOURCE_STORAGE_KEY = 'census:ask-source'

/** Whether "Use my own key instead" is on. Never throws. */
export function readOwnKeyChoice(local: Storage | null = store('local')): boolean {
  try {
    return local?.getItem(SOURCE_STORAGE_KEY) === 'own'
  } catch {
    return false
  }
}

/** Turn "Use my own key instead" on or off; false when the browser would not store it. */
export function saveOwnKeyChoice(on: boolean, local: Storage | null = store('local')): boolean {
  try {
    if (!local) return false
    if (on) local.setItem(SOURCE_STORAGE_KEY, 'own')
    else local.removeItem(SOURCE_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
