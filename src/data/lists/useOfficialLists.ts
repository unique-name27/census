/**
 * The official lists as the page uses them: your saved lists, the sample's or Census's own, and
 * lists proposed from the loaded data (after your reference mappings), recomputed only when one
 * of those changes.
 */
import { useAnalytics } from '../context'
import { useCensus } from '../store'
import { effectiveLists, type SourceKinds } from './effective'
import { useLists } from './store'
import type { EffectiveLists, ListsState } from './types'

export interface OfficialListsView {
  saved: ListsState
  lists: EffectiveLists
  sources: SourceKinds
}

export function useOfficialLists(): OfficialListsView {
  const ctx = useAnalytics()
  const saved = useLists((s) => s.state)
  const sources = useCensus((s) => s.sources)
  return { saved, lists: effectiveLists(saved, ctx.all, sources), sources }
}
