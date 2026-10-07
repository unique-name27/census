/**
 * "Let Ask change the screen" (Settings > Ask Census; docs/ASK-ACTIONS.md, part 3), on by
 * default. Off, Ask gets no action tools (it still reads the screen and draws charts) and the
 * system prompt tells Claude to give view links instead. Kept in this browser like the model
 * choice; it is not a secret.
 */

/** Where the setting is kept: absent means on; "off" means off. */
export const SCREEN_ACTIONS_STORAGE_KEY = 'census:ask-actions'

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Whether Ask may change the screen (on unless switched off). Never throws. */
export function readScreenActions(store: Storage | null = local()): boolean {
  try {
    return store?.getItem(SCREEN_ACTIONS_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Keep the setting; false when the browser would not store it. */
export function saveScreenActions(on: boolean, store: Storage | null = local()): boolean {
  try {
    if (!store) return false
    if (on) store.removeItem(SCREEN_ACTIONS_STORAGE_KEY)
    else store.setItem(SCREEN_ACTIONS_STORAGE_KEY, 'off')
    return true
  } catch {
    return false
  }
}
