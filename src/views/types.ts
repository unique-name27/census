import type { ComponentType } from 'react'
import type { AnalyticsContext } from '@/data/context'
import type { DatasetKey, ViewKey } from '@/data/schema'

export interface ViewTab {
  key: string
  label: string
}

/** The live number printed on a view's folder tab. Must be cheap to compute. */
export interface Headline {
  value: string
  label: string
  spark?: (number | null)[]
}

export interface ViewDef {
  key: ViewKey
  /** Tab label, e.g. "Recruiting". */
  label: string
  /** Sub-tabs; the first one is the default. */
  tabs: ViewTab[]
  View: ComponentType<{ tab: string }>
  headline: (ctx: AnalyticsContext) => Headline
  /** Datasets the view reads, for the "sample / uploaded" badges and empty states. */
  datasets: DatasetKey[]
  /** Optional controls rendered at the right of the view header (e.g. the pay-amounts switch). */
  HeaderActions?: ComponentType
}
