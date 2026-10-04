/**
 * "Open this dataset in the Data room": tier badges, below-standard notes and the drill panel
 * send the reader to a dataset's Quality panel (or another panel) with one call. The Data room
 * reads `useDatasetFocus` to select the dataset and open the panel; `nonce` changes on every
 * request, so asking for the same dataset twice still scrolls to it.
 */
import { create } from 'zustand'
import { goTo } from '@/components/navigation'
import type { DatasetKey } from '@/data/schema'
import { closeSettings } from '@/data/store'
import { useDrillStore } from '@/drill/store'

/** The panels each dataset has in the Data room (docs/DATA-TIERS.md, Data room changes). */
export type DatasetPanel = 'raw' | 'mapping' | 'quality' | 'certify'

export interface DatasetFocus {
  /** The dataset to select; null when nothing was requested. */
  key: DatasetKey | null
  panel: DatasetPanel
  /** Changes on every request. */
  nonce: number
}

export const useDatasetFocus = create<DatasetFocus>(() => ({ key: null, panel: 'quality', nonce: 0 }))

/** Select a dataset in the Data room and open one of its panels (Quality by default). */
export function openDatasetQuality(key: DatasetKey, panel: DatasetPanel = 'quality'): void {
  // The request leaves whatever sheet is open: the drill panel and Settings close first.
  useDrillStore.getState().close()
  closeSettings()
  useDatasetFocus.setState((s) => ({ key, panel, nonce: s.nonce + 1 }))
  // The address names the dataset and panel (`#data.candidates-quality`, as the Data room reads
  // it), so Back, Forward, a reload and a shared link come back to it.
  goTo('data', `${key}-${panel}`)
}

/** The Data room calls this once it has acted on a request, so a later visit starts plain. */
export function clearDatasetFocus(): void {
  useDatasetFocus.setState((s) => ({ ...s, key: null }))
}
