/**
 * Which Action center items a mode lists (docs/ROLES.md, 3.3 and 3.4). Manager mode leaves out
 * items whose view or tab it hides, whose records or subject are a kind it does not list, and the
 * I-9 items (a Compliance measure). Every other mode lists every item. Pure.
 */
import type { ActionItem } from '@/views/types'
import type { AccessContext } from './context'

/** Whether an item is listed in this mode. */
export function itemShown(access: Pick<AccessContext, 'can'>, item: ActionItem): boolean {
  if (!access.can(`item:${item.id}`)) return false
  if (!access.can(`view:${item.view}`)) return false
  if (item.tab && !access.can(`tab:${item.view}.${item.tab}`)) return false
  if (item.subject.kind !== 'none' && !access.can(`drill:${item.subject.kind}`)) return false
  // A drill given as a spec names its kind; one built on click is checked by the records panel.
  const d = item.drill
  if (d && typeof d === 'object' && !access.can(`drill:${d.kind}`)) return false
  return true
}

/** The items a mode lists, the same array when every one is. */
export function itemsShown<T extends ActionItem>(
  access: Pick<AccessContext, 'can' | 'mode'>,
  items: readonly T[],
): T[] {
  if (access.mode !== 'manager') return items as T[]
  return items.filter((i) => itemShown(access, i))
}
