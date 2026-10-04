/**
 * Keeps open Census tabs in this browser in step, so one tab never silently undoes another.
 *
 * - Settings: the browser's `storage` event fires in every other tab when `census:settings`
 *   changes; the listener re-reads it.
 * - Reference mappings and "clear everything": a BroadcastChannel message after the write has
 *   finished. Receivers re-read IndexedDB rather than trust the message, so two tabs that edit at
 *   the same moment still end on the same stored state.
 *
 * Does nothing where there is no window (tests, workers). Nothing leaves the browser.
 */
export type TabMessage = { kind: 'reference' } | { kind: 'cleared' }

export interface TabHandlers {
  /** `census:settings` changed (or was removed) in another tab. */
  settings: () => void
  message: (m: TabMessage) => void
}

const CHANNEL = 'census'

let channel: BroadcastChannel | null = null
let started = false

function openChannel(): BroadcastChannel | null {
  if (channel) return channel
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
  } catch {
    channel = null
  }
  return channel
}

export function isTabMessage(v: unknown): v is TabMessage {
  const k = (v as { kind?: unknown } | null)?.kind
  return k === 'reference' || k === 'cleared'
}

/** Tell the other open tabs. Never throws. */
export function postToTabs(m: TabMessage): void {
  if (typeof window === 'undefined') return
  try {
    openChannel()?.postMessage(m)
  } catch {
    /* another tab will see the change on its next load */
  }
}

/** Start listening once per page; later calls do nothing. */
export function listenToTabs(settingsKey: string, h: TabHandlers): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('storage', (e) => {
    // A null key means another tab cleared all of localStorage.
    if (e.key === settingsKey || e.key === null) h.settings()
  })
  const ch = openChannel()
  if (ch)
    ch.onmessage = (e: MessageEvent) => {
      if (isTabMessage(e.data)) h.message(e.data)
    }
}
