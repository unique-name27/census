// What `npm run deploy` publishes to GitHub Pages (scripts/deploy-pages.mjs), kept pure so a test
// can check it (src/dev/security/deployPages.test.ts):
//   census.html            -> index.html and census.html (the one-file build)
//   .nojekyll              (empty: serve files as they are)
//   public/access-policy.json -> access-policy.json, beside index.html, when it exists
//                          (docs/SECURITY-CENTER.md, "Publish and load")
// The one-file build embeds the policy file at build time; `policyProblem` stops a deploy whose
// census.html was built without the policy file in force, or whose policy file Census would ignore
// (the checks of `readPolicyFile` in src/access/overrides/file.ts: format, version, checksum).
import { createHash } from 'node:crypto'

export const POLICY_SOURCE = 'public/access-policy.json'
export const POLICY_TARGET = 'access-policy.json'
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
  return files
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
