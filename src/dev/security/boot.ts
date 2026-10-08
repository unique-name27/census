/**
 * Putting the policy file in force when Census starts (docs/SECURITY-CENTER.md, "Publish and
 * load"). The shell calls `startAccessPolicy()` once, before the analytics context is built, and
 * waits for `policyStore`'s `settled` (at most `WAIT_MS`; a later file still applies when it
 * arrives). A preview this tab kept across a reload is laid over again first.
 *
 * The one-file build (`npm run build:single`) embeds `public/access-policy.json` when it exists at
 * build time, through the glob below; every other build fetches the file from its own site.
 */
import {
  fetchSiteFile,
  type InForce,
  loadInForce,
  POLICY_FILE_NAME,
  policyStore,
  resumePreview,
  setInForce,
  settle,
} from '@/access/overrides'
import { surfaceCatalog } from './inventory'

/** How long the first screen waits for the site's file before showing the defaults. */
export const WAIT_MS = 2500

/** The file embedded at build time, when `public/access-policy.json` existed then. */
const EMBEDDED = import.meta.glob<string>('/public/access-policy.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The embedded file's text, or null. */
export const embeddedPolicy = (): string | null => Object.values(EMBEDDED)[0] ?? null

/** Whether this is the one-file build (`census.html`). */
export const isOneFileBuild = (): boolean => import.meta.env?.MODE === 'single'

/** The site's file, beside the page on its own origin; null where there is no site to ask. */
export function siteFileUrl(): string | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!/^https?:$/.test(window.location.protocol)) return null
  const url = new URL(POLICY_FILE_NAME, document.baseURI)
  return url.origin === window.location.origin ? url.href : null
}

let started: Promise<InForce> | null = null

/** Load the policy in force once. Returns what was put in force. */
export function startAccessPolicy(): Promise<InForce> {
  if (started) return started
  resumePreview()
  const url = siteFileUrl()
  const oneFile = isOneFileBuild()
  started = loadInForce({
    oneFile,
    embedded: oneFile ? embeddedPolicy() : null,
    fetchFile: () => (url ? fetchSiteFile(url) : Promise.resolve({ status: 'missing' as const })),
    catalog: surfaceCatalog(),
  }).then((inForce) => {
    setInForce(inForce)
    return inForce
  })
  if (typeof window !== 'undefined') window.setTimeout(settle, WAIT_MS)
  return started
}

/** Whether the shell can build the analytics context. */
export const policySettled = (): boolean => policyStore.getState().settled
