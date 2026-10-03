/**
 * The view the shell is currently showing, so shared components (KPI tiles, readout links) can
 * open sibling tabs by key and print their labels without importing the view registry.
 */
import { createContext, type ReactNode, use } from 'react'
import type { RouteView } from '@/data/store'
import type { ViewTab } from '@/views/types'

export interface CurrentView {
  key: RouteView
  label: string
  tabs: ViewTab[]
  /** The resolved sub-tab key on screen. */
  tab: string
}

const Ctx = createContext<CurrentView | null>(null)

export function CurrentViewProvider({ value, children }: { value: CurrentView; children: ReactNode }) {
  return <Ctx value={value}>{children}</Ctx>
}

/** Null outside the shell (e.g. a component rendered in isolation). */
export function useCurrentView(): CurrentView | null {
  return use(Ctx)
}

/** Label of a sibling tab of the current view, falling back to its key. */
export function tabLabel(view: CurrentView | null, key: string): string {
  return view?.tabs.find((t) => t.key === key)?.label ?? key
}
