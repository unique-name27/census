/**
 * Addresses inside the Developer page (docs/ROLES.md, 5.1), carried in the route's tab with the
 * colon form the Data room uses:
 *
 *   #dev                         Overview
 *   #dev.inventory               Inventory, the Views list
 *   #dev.inventory:figures       Inventory, the Figures list
 *   #dev.inventory:homes/finance Inventory, Role homes, with the Finance home previewed
 *   #dev.access                  Access
 *   #dev.security                Security center (docs/SECURITY-CENTER.md)
 *   #dev.ask:query_records       Ask tools, with query_records picked
 *   #dev.state  #dev.timings
 *
 * The Security center is built in `src/dev/security/` by its own owner. This list keeps its slot,
 * after Access: the tab shows once `src/dev/security/index.tsx` exists, and the page renders its
 * `SecurityTab({ sub })` export (or its default export) with what follows the colon.
 *
 * Tiny and pure, so Help's link checks and the shell can read it without loading the page.
 */

export type DevTab = 'overview' | 'inventory' | 'access' | 'security' | 'ask' | 'state' | 'timings'

/** Whether this build has the Security center (its module is only looked up, never loaded here). */
export const HAS_SECURITY_CENTER: boolean = Object.keys(import.meta.glob('./security/index.tsx')).length > 0

const ALL_TABS: readonly { key: DevTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'access', label: 'Access' },
  { key: 'security', label: 'Security center' },
  { key: 'ask', label: 'Ask tools' },
  { key: 'state', label: 'State' },
  { key: 'timings', label: 'Timings' },
]

export const DEV_TABS: readonly { key: DevTab; label: string }[] = ALL_TABS.filter(
  (t) => t.key !== 'security' || HAS_SECURITY_CENTER,
)

export const DEV_TAB_KEYS: readonly DevTab[] = DEV_TABS.map((t) => t.key)

export const isDevTab = (s: string): s is DevTab => (DEV_TAB_KEYS as readonly string[]).includes(s)

export interface DevRoute {
  tab: DevTab
  /** What follows the colon: an inventory list or an Ask tool; '' when none. */
  sub: string
}

/** Read the route's tab. Unknown addresses land on the Overview. */
export function parseDevTab(tab: string | null | undefined): DevRoute {
  const t = (tab ?? '').trim()
  const colon = t.indexOf(':')
  const head = colon < 0 ? t : t.slice(0, colon)
  const sub = colon < 0 ? '' : t.slice(colon + 1)
  return isDevTab(head) ? { tab: head, sub } : { tab: 'overview', sub: '' }
}

/** The route tab for a Developer tab and its sub-address: "inventory:figures"; '' for the Overview. */
export function devTab(tab: DevTab, sub?: string | null): string {
  if (tab === 'overview' && !sub) return ''
  return sub ? `${tab}:${sub}` : tab
}

/** Whether a route tab names a real Developer tab (Help's link check). */
export const isDevRouteTab = (tab: string): boolean => {
  const t = tab.trim()
  if (!t) return true
  const head = t.split(':')[0]
  return isDevTab(head)
}
