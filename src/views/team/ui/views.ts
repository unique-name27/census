/**
 * The views My team reads, imported one by one (never from '@/views/registry', which imports My
 * team: reading it back from here would be an import cycle). They name the practices of the
 * readout, the tabs a tile opens, and the views whose open items the page lists (the ones Manager
 * mode shows).
 */
import type { RouteView } from '@/data/store'
import type { ViewSource } from '@/views/actions/engine'
import { view as hrbp } from '../../hrbp'
import { view as onboarding } from '../../onboarding'
import { view as org } from '../../org'
import { view as recruiting } from '../../recruiting'
import { view as talent } from '../../talent'
import type { LabelOf } from '../engine'

/** The four practices of the readout. */
export const PRACTICES = { hrbp, recruiting, onboarding, talent } as const

const BY_KEY = new Map<string, { label: string; tabs: readonly { key: string; label: string }[] }>(
  [hrbp, recruiting, onboarding, talent, org].map((v) => [v.key, v]),
)

/** "People stats, Workforce", or the view's name when the tab is not one of its tabs. */
export const labelOf: LabelOf = (view: RouteView, tab: string) => {
  if (view === 'actions') return 'Action center'
  const v = BY_KEY.get(view)
  if (!v) return view
  const t = v.tabs.find((x) => x.key === tab)
  return t ? `${v.label}, ${t.label}` : v.label
}

/** The views whose open items My team lists: the ones Manager mode shows that raise items. */
export const ITEM_SOURCES: readonly ViewSource[] = [recruiting, onboarding, hrbp, org, talent]
