/**
 * Key figures on a role home: the producing views' own tiles, picked by id, each opening the tab
 * that explains it (its own link when it has one). Pure.
 */
import type { Kpi } from '@/components/types'
import type { RouteView } from '@/data/store'

export { scorecardJudge } from '@/views/scorecard/engine/status'

/** The tile with this id, linked to a view's tab unless it carries its own link; none when missing. */
export function tile(
  list: readonly Kpi[],
  id: string,
  to?: { view: RouteView; tab?: string; label: string },
): Kpi[] {
  const k = list.find((x) => x.id === id)
  if (!k) return []
  if (k.link || !to) return [k]
  const { tab, ...rest } = k
  return [{ ...rest, link: { view: to.view, tab: to.tab ?? tab ?? '', label: to.label } }]
}

/** A tile waiting on something computed later (the open items): same place, a quiet note. */
export const pendingTile = (id: string, metricId: string, label: string, note: string): Kpi => ({
  id,
  metricId,
  label,
  value: null,
  format: 'int',
  note,
})
