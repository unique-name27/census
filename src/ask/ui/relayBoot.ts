/**
 * The team relay at startup (docs/ASK-RELAY.md): read `ask-relay.json` once, the way the access
 * policy is read (src/dev/security/boot.ts). Served from a site (the dev server, `npm run build`,
 * GitHub Pages), it is fetched from beside the page, past the browser cache; the one-file build
 * (`npm run build:single`, which `npm run deploy` publishes) embeds `public/ask-relay.json` when it
 * existed at build time, through the glob below. No file, or one Census cannot read, means no relay:
 * Ask uses each person's own key, as it always has.
 */
import { fetchSiteFile } from '@/access/overrides'
import { loadRelay, RELAY_FILE_NAME, type RelayInForce, setRelayInForce } from '@/ask/engine'
import { useAsk } from './store'

/** The file embedded at build time, when `public/ask-relay.json` existed then. */
const EMBEDDED = import.meta.glob<string>('/public/ask-relay.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The embedded file's text, or null. */
export const embeddedRelay = (): string | null => Object.values(EMBEDDED)[0] ?? null

const isOneFileBuild = (): boolean => import.meta.env?.MODE === 'single'

/** The site's file, beside the page on its own origin; null where there is no site to ask. */
function siteFileUrl(): string | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (!/^https?:$/.test(window.location.protocol)) return null
  const url = new URL(RELAY_FILE_NAME, document.baseURI)
  return url.origin === window.location.origin ? url.href : null
}

let started: Promise<RelayInForce> | null = null

/**
 * Load the relay once (the shell calls this at startup; a question waits for it). Settings and the
 * Ask panel read it again when it lands.
 */
export function startAskRelay(): Promise<RelayInForce> {
  if (started) return started
  const url = siteFileUrl()
  const oneFile = isOneFileBuild()
  started = loadRelay({
    oneFile,
    embedded: oneFile ? embeddedRelay() : null,
    fetchFile: () => (url ? fetchSiteFile(url) : Promise.resolve({ status: 'missing' as const })),
  }).then((r) => {
    setRelayInForce(r)
    if (r.ignored) console.warn(`Ask Census: ${RELAY_FILE_NAME} is ignored. ${r.ignored}`)
    if (r.relayUrl) useAsk.getState().keyChanged()
    return r
  })
  return started
}
