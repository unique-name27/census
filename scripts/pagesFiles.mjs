// What `npm run deploy` publishes to GitHub Pages (scripts/deploy-pages.mjs), kept pure so a test
// can check it (src/dev/security/deployPages.test.ts):
//   census.html            -> index.html and census.html (the one-file build)
//   .nojekyll              (empty: serve files as they are)
//   public/access-policy.json -> access-policy.json, beside index.html, when it exists
//                          (docs/SECURITY-CENTER.md, "Publish and load")
//   public/ask-relay.json  -> ask-relay.json, beside index.html, when it exists (the team relay for
//                          Ask Census, docs/ASK-RELAY.md)
// The one-file build embeds both files at build time; `policyProblem` stops a deploy whose
// census.html was built without the policy file in force, or whose policy file Census would ignore
// (the checks of `readPolicyFile` in src/access/overrides/file.ts: format, version, checksum), and
// `relayProblem` does the same for the relay file (the checks of `readRelayFile` in
// src/ask/engine/relay.ts, with https required for the published site).
import { createHash } from 'node:crypto'

export const POLICY_SOURCE = 'public/access-policy.json'
export const POLICY_TARGET = 'access-policy.json'
export const RELAY_SOURCE = 'public/ask-relay.json'
/** `RELAY_FILE_NAME` in src/ask/engine/relay.ts (a test keeps them equal). */
export const RELAY_TARGET = 'ask-relay.json'
/** `POLICY_FORMAT` and `POLICY_FORMAT_VERSION` in src/access/overrides/types.ts (a test keeps them equal). */
export const POLICY_FORMAT = 'census-access-policy'
export const POLICY_VERSION = 1

const pick = (v) => {
  const o = v && typeof v === 'object' ? v : {}
  return [
    o.role ?? null,
    o.surface ?? null,
    o.decision ?? null,
    o.reason ?? null,
    o.by ?? null,
    o.at ?? null,
    o.how ?? null,
  ]
}

/**
 * The checksum Census computes over a policy file as it holds it (`checksumOf` in
 * src/access/overrides/file.ts: SHA-256 over every field in a fixed order).
 */
export function policyChecksum(file) {
  const text = JSON.stringify([
    POLICY_FORMAT,
    POLICY_VERSION,
    file.publishedAt,
    file.publishedBy,
    file.notes,
    (Array.isArray(file.overrides) ? file.overrides : []).map(pick),
  ])
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

/**
 * The files to publish, as { from, to } (`from` relative to the project root, null for an empty
 * file; `to` relative to the gh-pages root). `exists(path)` says whether a project file exists.
 */
export function pagesFiles(exists) {
  const files = [
    { from: 'census.html', to: 'index.html' },
    { from: 'census.html', to: 'census.html' },
    { from: null, to: '.nojekyll' },
  ]
  if (exists(POLICY_SOURCE)) files.push({ from: POLICY_SOURCE, to: POLICY_TARGET })
  if (exists(RELAY_SOURCE)) files.push({ from: RELAY_SOURCE, to: RELAY_TARGET })
  return files
}

/**
 * Why the relay file must not be published with this census.html, or null when it may. The file is
 * published for anyone to read, so it must hold nothing that looks like an API key and no field but
 * relayUrl (never a passcode or a key). It must be JSON with a relayUrl that is an https address
 * with nothing after it but a path (no user name, password, query, fragment or /v1), as Census
 * reads it, and census.html must carry that address, which the one-file build embeds with the file.
 */
export function relayProblem(relayText, html) {
  if (/sk-ant-/i.test(relayText))
    return `${RELAY_SOURCE} holds what looks like a Claude API key. The file is published for anyone to read: remove the key, keep only the relay's address, and replace the key in the Claude Console if it was ever published.`
  let file
  try {
    file = JSON.parse(relayText)
  } catch {
    return `${RELAY_SOURCE} is not valid JSON, so Census would ignore it.`
  }
  if (!file || typeof file !== 'object' || Array.isArray(file) || typeof file.relayUrl !== 'string')
    return `${RELAY_SOURCE} has no relayUrl, so Census would ignore it.`
  const extra = Object.keys(file).filter((k) => k !== 'relayUrl')
  if (extra.length)
    return `${RELAY_SOURCE} holds more than relayUrl (${extra.map((k) => k.replace(/[^\w-]/g, '').slice(0, 40)).join(', ')}). The file is published for anyone to read: keep only the relay's address in it, never a passcode or a key.`
  const raw = file.relayUrl.trim()
  let u
  try {
    u = new URL(raw)
  } catch {
    return `${RELAY_SOURCE} has a relayUrl that is not a web address, so Census would ignore it.`
  }
  if (u.protocol !== 'https:')
    return `${RELAY_SOURCE} has a relayUrl that does not start with https://, so the published site could not use it.`
  if (u.username || u.password || u.search || u.hash || raw.includes('?') || raw.includes('#'))
    return `${RELAY_SOURCE} has a relayUrl with more than the relay's address, so Census would ignore it.`
  if (/\/v1(\/|$)/.test(u.pathname.replace(/\/+$/, '')))
    return `${RELAY_SOURCE} has a relayUrl with /v1 in it, so Census would ignore it. Give the relay's address only.`
  if (!html.includes(raw)) return `census.html was built without ${RELAY_SOURCE}. Run npm run build:single, then deploy again.`
  return null
}

/**
 * Why the policy file must not be published with this census.html, or null when it may: the file
 * must be a policy file of the format version Census reads, with a list of overrides and a checksum
 * that matches its contents (Census ignores anything else), and census.html must carry that
 * checksum, which the one-file build embeds with the file.
 */
export function policyProblem(policyText, html) {
  let file
  try {
    file = JSON.parse(policyText)
  } catch {
    return `${POLICY_SOURCE} is not valid JSON, so Census would ignore it.`
  }
  if (!file || typeof file !== 'object' || Array.isArray(file) || file.format !== POLICY_FORMAT)
    return `${POLICY_SOURCE} is not a Census access policy file, so Census would ignore it.`
  if (file.version !== POLICY_VERSION)
    return `${POLICY_SOURCE} is format version ${String(file.version)}, and this Census reads version ${POLICY_VERSION}, so Census would ignore it.`
  if (!Array.isArray(file.overrides))
    return `${POLICY_SOURCE} has no list of overrides, so Census would ignore it.`
  if (typeof file.checksum !== 'string' || !file.checksum)
    return `${POLICY_SOURCE} has no checksum, so Census would ignore it. Publish it again from the Security center.`
  if (file.checksum !== policyChecksum(file))
    return `${POLICY_SOURCE} has a checksum that does not match its contents, so it may have been edited by hand or damaged, and Census would ignore it. Publish it again from the Security center.`
  if (!html.includes(file.checksum))
    return `census.html was built without ${POLICY_SOURCE}. Run npm run build:single, then deploy again.`
  return null
}
