/**
 * The team relay (docs/ASK-RELAY.md): a small server the team runs that holds a shared Claude API
 * key, so people ask with a team passcode instead of a key of their own. Census learns its address
 * from `ask-relay.json` beside the page (`{ "relayUrl": "https://…" }`), loaded at startup the way
 * `access-policy.json` is (src/ask/ui/relayBoot.ts): fetched from the site, or embedded in the
 * one-file build when `public/ask-relay.json` existed at build time.
 *
 * With a relay, Ask sends its requests there with the passcode in the `x-census-passcode` header,
 * unless the person turned on "Use my own key instead". With no relay, Ask works as it always has:
 * the person's own key, straight to Anthropic. Pure but for the module's own state.
 */
import { type KeyStores, readKey, readOwnKeyChoice, readPasscode } from './keys'

/** The file beside the page that names the relay. */
export const RELAY_FILE_NAME = 'ask-relay.json'

/** The request header that carries the team passcode (the relay checks it). */
export const PASSCODE_HEADER = 'x-census-passcode'

/** What the SDK sends as its key when the relay holds the real one; the relay drops it. */
export const RELAY_PLACEHOLDER_KEY = 'census-relay-placeholder'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The relay address as Census uses it (`https://host[:port][/path]`, no trailing slash), or why the
 * value cannot be one: it must be https (http only on this computer, for testing), with no user
 * name, password, query or fragment.
 */
export function relayUrlOf(value: unknown): { ok: true; url: string } | { ok: false; why: string } {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, why: 'It has no relayUrl.' }
  let u: URL
  try {
    u = new URL(value.trim())
  } catch {
    return { ok: false, why: 'Its relayUrl is not a web address.' }
  }
  const local = LOCAL_HOSTS.has(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local))
    return { ok: false, why: 'Its relayUrl must start with https://.' }
  if (u.username || u.password)
    return { ok: false, why: 'Its relayUrl must not hold a user name or password.' }
  if (u.search || u.hash || value.includes('?') || value.includes('#'))
    return { ok: false, why: 'Its relayUrl must be the relay’s address only, with nothing after ? or #.' }
  const path = u.pathname.replace(/\/+$/, '')
  if (/\/v1(\/|$)/.test(path))
    return { ok: false, why: 'Its relayUrl must be the relay’s address only, without /v1/messages.' }
  return { ok: true, url: `${u.origin}${path}` }
}

/** Looks like a Claude API key somewhere in the text. */
const HOLDS_KEY = /sk-ant-/i

/**
 * What `ask-relay.json`'s text says: the relay address, or why the file is ignored. The file is
 * published for anyone to read, so it must hold the address and nothing else: a file with any other
 * field (a passcode, a key, a note) or anything that looks like an API key is ignored, as the
 * deploy refuses it (`relayProblem` in scripts/pagesFiles.mjs).
 */
export function readRelayFile(text: string): { ok: true; relayUrl: string } | { ok: false; why: string } {
  if (HOLDS_KEY.test(text)) return { ok: false, why: 'The file holds what looks like an API key.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, why: 'The file is not valid JSON.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { ok: false, why: 'The file is not a Census relay file.' }
  if (Object.keys(data).some((k) => k !== 'relayUrl'))
    return { ok: false, why: 'The file must hold only relayUrl, never a passcode, a key or anything else.' }
  const r = relayUrlOf((data as Record<string, unknown>).relayUrl)
  return r.ok ? { ok: true, relayUrl: r.url } : r
}

export interface RelayInForce {
  /** The relay address, or null for none (Ask uses the person's own key). */
  relayUrl: string | null
  /** Where it came from. */
  source: 'site' | 'embedded' | 'none'
  /** Why a file that was found is not used, or null. */
  ignored: string | null
}

export const NO_RELAY: RelayInForce = { relayUrl: null, source: 'none', ignored: null }

export type RelayFetch = { status: 'ok'; text: string } | { status: 'missing' }

export interface RelayLoadEnv {
  /** The one-file build: read the embedded copy, never fetch. */
  oneFile: boolean
  /** The embedded file's text, when the one-file build has one. */
  embedded: string | null
  /** Fetch the site's file. */
  fetchFile: () => Promise<RelayFetch>
}

function inForceOf(text: string, source: 'site' | 'embedded'): RelayInForce {
  const r = readRelayFile(text)
  return r.ok ? { relayUrl: r.relayUrl, source, ignored: null } : { ...NO_RELAY, ignored: r.why }
}

/** The relay in force: the site's file, or the one-file build's embedded copy; none when there is no file. */
export async function loadRelay(env: RelayLoadEnv): Promise<RelayInForce> {
  if (env.oneFile) return env.embedded?.trim() ? inForceOf(env.embedded, 'embedded') : NO_RELAY
  let got: RelayFetch
  try {
    got = await env.fetchFile()
  } catch {
    // Offline or blocked: the same as no file.
    return NO_RELAY
  }
  if (got.status === 'missing' || !got.text.trim()) return NO_RELAY
  return inForceOf(got.text, 'site')
}

/* ───────────── the relay in force in this tab ───────────── */

let inForce: RelayInForce = NO_RELAY

/** The relay this tab loaded at startup (none until it has loaded, or when there is no file). */
export const relayInForce = (): RelayInForce => inForce

/** Put a loaded relay in force (startup, and tests). */
export function setRelayInForce(r: RelayInForce): void {
  inForce = r
}

/* ───────────── how Ask connects ───────────── */

/** How Ask connects: the person's own key straight to Anthropic, or the team relay with the passcode. */
export type AskVia = { kind: 'own' } | { kind: 'team'; relayUrl: string }

/** The team relay when one is configured and "Use my own key instead" is off; else the person's own key. */
export function askVia(
  relayUrl: string | null = inForce.relayUrl,
  ownKey: boolean = readOwnKeyChoice(),
): AskVia {
  return relayUrl && !ownKey ? { kind: 'team', relayUrl } : { kind: 'own' }
}

/** What Ask sends with: the person's key, or the team passcode and the relay it goes to. */
export type AskCredential =
  | { kind: 'own'; key: string; kept: boolean }
  | { kind: 'team'; passcode: string; kept: boolean; relayUrl: string }

/** The credential in force for this way of connecting, or null when none is saved (nothing is sent). */
export function readCredential(via: AskVia = askVia(), stores?: KeyStores): AskCredential | null {
  if (via.kind === 'team') {
    const p = readPasscode(stores)
    return p ? { kind: 'team', passcode: p.passcode, kept: p.kept, relayUrl: via.relayUrl } : null
  }
  const k = readKey(stores)
  return k ? { kind: 'own', key: k.key, kept: k.kept } : null
}
