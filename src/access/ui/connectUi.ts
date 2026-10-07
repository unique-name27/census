/**
 * The shell's side of `connectAccess`: notices become toasts, and a mode change closes the
 * records panel (its rows were listed under the previous mode).
 */
import { toast } from '@/components/toast'
import { useDrillStore } from '@/drill/store'
import { type AccessNotice, connectAccess } from '../connect'

export function showAccessNotice(n: AccessNotice): void {
  toast(n.title, {
    ...(n.description ? { description: n.description } : {}),
    ...(n.action ? { action: n.action } : {}),
    timeout: n.timeout ?? 8000,
  })
}

/** Connect the modes to the app with the shell's toasts. Call once when the shell mounts. */
export function connectAccessUi(): () => void {
  return connectAccess({
    notify: showAccessNotice,
    onModeChange: () => useDrillStore.getState().close(),
  })
}
