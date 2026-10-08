/**
 * Loading the policy in force (docs/SECURITY-CENTER.md, "Publish and load"):
 *
 *  - Served from a site (the dev server, `npm run build`): fetch `access-policy.json` from Census's
 *    own origin, past the browser cache. No file means the built-in defaults.
 *  - The one-file build (`census.html`, opened from disk, cannot fetch): the copy embedded when it
 *    was built from `public/access-policy.json`, or the defaults when there was none.
 *
 * A file that is not JSON, not this format or version, or whose checksum does not match is ignored
 * as a whole and named in `ignored` (Developer mode warns); unknown roles and surfaces and lines
 * that cross a guard rail are left out one by one (`skipped`). The fetch is passed in, so this
 * stays testable without a network.
 */
import { readPolicyFile } from './file'
import type { SurfaceCatalog } from './lines'
import { DEFAULTS_IN_FORCE, type InForce } from './types'

export type FetchResult = { status: 'ok'; text: string } | { status: 'missing' }

export interface LoadEnv {
  /** The one-file build: read the embedded copy, never fetch. */
  oneFile: boolean
  /** The embedded file's text, when the one-file build has one. */
  embedded: string | null
  /** Fetch the site's file. */
  fetchFile: () => Promise<FetchResult>
  catalog: SurfaceCatalog
}

/** What a file's text puts in force. */
export function inForceOf(
  text: string,
  source: 'site' | 'embedded',
  oneFile: boolean,
  cat: SurfaceCatalog,
): InForce {
  const r = readPolicyFile(text, cat)
  if (!r.ok) return { ...DEFAULTS_IN_FORCE, oneFile, ignored: r.why }
  return { source, oneFile, file: r.file, lines: r.lines, skipped: r.skipped, ignored: null }
}

export async function loadInForce(env: LoadEnv): Promise<InForce> {
  if (env.oneFile)
    return env.embedded?.trim()
      ? inForceOf(env.embedded, 'embedded', true, env.catalog)
      : { ...DEFAULTS_IN_FORCE, oneFile: true }
  let got: FetchResult
  try {
    got = await env.fetchFile()
  } catch {
    // Offline or blocked: nothing to apply, the same as no file.
    return DEFAULTS_IN_FORCE
  }
  if (got.status === 'missing' || !got.text.trim()) return DEFAULTS_IN_FORCE
  return inForceOf(got.text, 'site', false, env.catalog)
}

/**
 * The browser's fetch of `access-policy.json` beside the page: a missing file (404, or the dev
 * server's index page for an unknown path) reads as missing.
 */
export async function fetchSiteFile(url: string): Promise<FetchResult> {
  const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
  if (!res.ok) return { status: 'missing' }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('text/html')) return { status: 'missing' }
  return { status: 'ok', text: await res.text() }
}
