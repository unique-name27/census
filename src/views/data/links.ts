/**
 * Addresses inside the Data room, carried in the route's tab (`#data.<tab>`):
 *
 *   #data                     Datasets tab
 *   #data.mapping             Categories & mapping tab
 *   #data.candidates          Datasets tab with Candidates open on its default panel
 *   #data.candidates-raw      … on its Raw panel (raw, mapping, quality, certify)
 *
 * Anything can open a dataset's panel with `goTo('data', datasetTab('candidates', 'quality'))`,
 * e.g. a tier badge opening the Quality panel. Pure, so the parsing is unit-tested.
 */
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'

export type DataTab = 'datasets' | 'mapping'

export type DatasetPanel = 'raw' | 'mapping' | 'quality' | 'certify'

/** The order the panels are listed in: the way data comes in, raw first. */
export const DATASET_PANELS: readonly DatasetPanel[] = ['raw', 'mapping', 'quality', 'certify']

export const PANEL_LABEL: Record<DatasetPanel, string> = {
  raw: 'Raw',
  mapping: 'Mapping',
  quality: 'Quality',
  certify: 'Certify',
}

/** The panel a dataset opens on: its fill rates, checks and tier. */
export const DEFAULT_PANEL: DatasetPanel = 'quality'

export const DATA_TABS: readonly { key: DataTab; label: string; route: string }[] = [
  { key: 'datasets', label: 'Datasets', route: '' },
  { key: 'mapping', label: 'Categories & mapping', route: 'mapping' },
]

export interface DataRoute {
  tab: DataTab
  /** The dataset to open and bring into view, when the address names one. */
  dataset: DatasetKey | null
  panel: DatasetPanel | null
}

const isDataset = (s: string): s is DatasetKey => (DATASET_KEYS as readonly string[]).includes(s)
const isPanel = (s: string): s is DatasetPanel => (DATASET_PANELS as readonly string[]).includes(s)

/** Read the route's tab. Unknown addresses land on the Datasets tab. */
export function parseDataTab(tab: string | null | undefined): DataRoute {
  const t = (tab ?? '').trim()
  if (t === 'mapping') return { tab: 'mapping', dataset: null, panel: null }
  const [key, panel] = t.split('-')
  if (key && isDataset(key))
    return { tab: 'datasets', dataset: key, panel: panel && isPanel(panel) ? panel : null }
  return { tab: 'datasets', dataset: null, panel: null }
}

/** The route tab for one dataset's panel: "candidates-quality". */
export function datasetTab(key: DatasetKey, panel?: DatasetPanel | null): string {
  return panel ? `${key}-${panel}` : key
}

/** The route tab of a Data room tab: '' for Datasets, 'mapping' for Categories & mapping. */
export const tabRoute = (tab: DataTab): string => DATA_TABS.find((t) => t.key === tab)?.route ?? ''
