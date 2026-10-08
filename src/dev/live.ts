/**
 * Reads the live stores for the Developer page: the `census:` keys of the three browser stores
 * (values only to size them; the Ask key and the team passcode never reach the page beyond "set"), a fresh
 * analytics context for cold engine runs, and the snapshot the Settings list and the State tab
 * describe. Every storage access is in try/catch.
 */
import { get as idbGet, keys as idbKeys } from 'idb-keyval'
import { picksOfState, useMode } from '@/access/store'
import { readKey, readPasscode, readWorkspaceId } from '@/ask/engine/keys'
import { DEFAULT_MODEL, readModelChoice } from '@/ask/engine/models'
import { askVia } from '@/ask/engine/relay'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { useLists } from '@/data/lists/store'
import { pickSettings } from '@/data/settings'
import { useCensus } from '@/data/store'
import { useQualityLens } from '@/views/data/quality-overview/lens'
import type { SettingsSnapshot } from './settingsFacts'
import type { StorageSnapshot } from './storageKeys'
import { describeKey, scannedValue } from './storageKeys'
import { useDev } from './store'

function webEntries(store: () => Storage | null): { key: string; value: string | null }[] {
  const out: { key: string; value: string | null }[] = []
  try {
    const s = store()
    if (!s) return out
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (!key?.startsWith('census:')) continue
      // The Ask key and the team passcode never enter the page, not even their length.
      out.push({ key, value: scannedValue(key, s.getItem(key)) })
    }
  } catch {
    /* blocked: nothing to list */
  }
  return out
}

const local = () => (typeof localStorage === 'undefined' ? null : localStorage)
const session = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage)

/** Bytes a stored value takes, as JSON. */
function jsonBytes(v: unknown): number | null {
  try {
    const text = JSON.stringify(v)
    return text == null ? 0 : new Blob([text]).size
  } catch {
    return null
  }
}

/** Every `census:` key in localStorage, sessionStorage and IndexedDB, with its size. */
export async function readStorageSnapshot(): Promise<StorageSnapshot> {
  const indexedDb: { key: string; bytes: number | null }[] = []
  try {
    const all = await idbKeys()
    for (const k of all) {
      if (typeof k !== 'string' || !k.startsWith('census:')) continue
      let bytes: number | null = null
      try {
        bytes = jsonBytes(await idbGet(k))
      } catch {
        bytes = null
      }
      indexedDb.push({ key: k, bytes })
    }
  } catch {
    /* no IndexedDB, or blocked */
  }
  return { local: webEntries(local), session: webEntries(session), indexedDb }
}

/** The raw value of a localStorage key, for "Copy value" (never the Ask key). */
export function localValue(key: string): string | null {
  if (describeKey(key)?.secret === 'key') return null
  try {
    return local()?.getItem(key) ?? sessionStorage.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Remove one localStorage key ("Remove", after the in-page confirm). False when it could not be removed. */
export function removeLocalKey(key: string): boolean {
  try {
    local()?.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** The browser's own estimate of what this site stores, when it gives one. */
export async function storageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
  try {
    const e = await navigator.storage?.estimate?.()
    return { usage: e?.usage ?? null, quota: e?.quota ?? null }
  } catch {
    return { usage: null, quota: null }
  }
}

/**
 * A context built afresh from the stores (cold: the per-context caches miss), with the live
 * context's quality index and dictionary so it computes the same numbers.
 */
export function freshContext(live: AnalyticsContext): AnalyticsContext {
  const st = useCensus.getState()
  const mode = useMode.getState()
  return buildContext({
    data: st.data,
    sources: st.sources,
    filters: st.filters,
    asOfOverride: st.asOfOverride,
    showPay: st.showPay,
    showImmigration: st.showImmigration,
    features: { engagementSurveys: st.engagementSurveys },
    versions: st.versions,
    mappings: st.reference.mappings,
    standard: live.standard,
    quality: live.quality,
    metrics: live.metrics,
    access: { mode: mode.mode, picks: picksOfState(mode) },
    lists: useLists.getState().state,
  })
}

function askKeyState(): SettingsSnapshot['askKey'] {
  try {
    const k = readKey()
    return !k ? 'not set' : k.kept ? 'kept on this device' : 'set for this tab'
  } catch {
    return 'not set'
  }
}

/** Whether the team passcode is saved, and where; never its value. */
function askPasscodeState(): NonNullable<SettingsSnapshot['askPasscode']> {
  try {
    const p = readPasscode()
    return !p ? 'not set' : p.kept ? 'kept on this device' : 'set for this tab'
  } catch {
    return 'not set'
  }
}

/** How Ask connects now: the team relay, or the person's own key. */
const askViaState = (): NonNullable<SettingsSnapshot['askVia']> =>
  askVia().kind === 'team' ? 'team relay' : 'own key'

/** What the Settings list shows, read from the stores now. */
export function settingsSnapshot(ctx: Pick<AnalyticsContext, 'org'>): SettingsSnapshot {
  const st = useCensus.getState()
  const mode = useMode.getState()
  return {
    settings: pickSettings(st),
    showPay: st.showPay,
    showImmigration: st.showImmigration,
    mode: mode.mode,
    picks: picksOfState(mode),
    managerName: (id) => ctx.org.byId.get(id)?.name ?? null,
    overlays: useDev.getState().overlays,
    lens: useQualityLens.getState().on,
    askModel: readModelChoice(),
    defaultAskModel: DEFAULT_MODEL,
    askKey: askKeyState(),
    workspaceSet: !!readWorkspaceId(),
    askPasscode: askPasscodeState(),
    askVia: askViaState(),
  }
}

export { askKeyState, askPasscodeState, askViaState }
