/**
 * Which tab a view page shows for the address's tab (docs/ROLES-V2.md 4.13). The part before the
 * first ":" or "/" names the tab, as the route guard reads it (`baseTab`). Only a tab with parts
 * (People stats > Special analyses, `ViewTab.parts`) gets the rest of the address to pick a part;
 * any other tab gets its own key, so "#recruiting.requisitions:x" shows Requisitions and never
 * falls through to another tab's body. Pure.
 */
import { baseTab } from '@/access/policy/table'
import type { ViewTab } from '@/views/types'
import { resolveTab } from './exportMeta'

export interface ViewTabChoice {
  /** The tab the shell works with (header, sub-tabs, exports). */
  tab: string
  /** What the view gets: the tab, or the whole address for a tab with parts. */
  viewTab: string
  /** The address names something else: rewrite it to `tab` (no history entry). */
  rewrite: boolean
}

/**
 * `shown`: the tabs the mode and the feature switches show; `registered`: every tab the view has.
 */
export function viewTabOf(
  shown: readonly ViewTab[],
  registered: readonly ViewTab[],
  requested: string,
): ViewTabChoice {
  const base = baseTab(requested)
  const tab = resolveTab(shown, base)
  const parts = !!shown.find((t) => t.key === tab)?.parts
  // The part after "/" reads as after ":" (the route guard reads both), so "analyses/x" is the analyses tab.
  const viewTab =
    base === tab && requested && parts ? `${tab}${requested.slice(base.length).replace(/^\//, ':')}` : tab
  // A feature tab switched off while open (Engagement), or a tab the mode hides, shows the first
  // tab; a tab with something after it that is not a part shows the tab. The address follows, so
  // a reload or a shared link doesn't name what isn't there.
  const dropped = !!requested && registered.some((t) => t.key === base) && !shown.some((t) => t.key === base)
  const stray = !!requested && base === tab && !parts && requested !== tab
  return { tab, viewTab, rewrite: dropped || stray }
}
