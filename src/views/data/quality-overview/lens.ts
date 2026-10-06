/**
 * Two small pieces of state for seeing data quality under the dashboard (docs/METRICS.md, part 2):
 *
 * - the quality lens: the "Show data quality" switch in the view header. When on, every KPI tile,
 *   figure footer and finding shows its tier, the field limiting it and the rows it used and left
 *   out. Off by default so the dashboard stays clean for meetings; remembered per browser
 *   (`census:quality-lens`), and every storage access is guarded.
 * - a request to open the Data quality tab (`#data.quality`) at one dataset, so a tier badge in the
 *   view header strip lands on that dataset's rows of the tab.
 *
 * No React components here, so the shared UI (KpiStrip, Figure, Readout) can import it cheaply.
 */
import { create } from 'zustand'
import { goTo } from '@/components/navigation'
import { hintAddress } from '@/data/address'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { closeSettings } from '@/data/store'
import { useDrillStore } from '@/drill/store'

export const QUALITY_LENS_KEY = 'census:quality-lens'

/** The route tab of the Data quality tab: `#data.quality`. */
export const QUALITY_TAB_ROUTE = 'quality'

function readLens(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(QUALITY_LENS_KEY) === 'on'
  } catch {
    return false
  }
}

function writeLens(on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (on) localStorage.setItem(QUALITY_LENS_KEY, 'on')
    else localStorage.removeItem(QUALITY_LENS_KEY)
  } catch {
    /* storage blocked: the switch lasts for this page only */
  }
}

interface LensState {
  on: boolean
  /** The switch: show or hide, and remember it in this browser (other open tabs follow). */
  setOn: (on: boolean) => void
  /**
   * Show or hide in this tab only, without remembering it: the address (a link, Back and Forward)
   * and saved views carry the lens as part of the scope, which belongs to the tab.
   */
  show: (on: boolean) => void
}

export const useQualityLens = create<LensState>((set) => ({
  on: readLens(),
  setOn(on) {
    writeLens(on)
    set({ on })
  },
  show(on) {
    set({ on })
  },
}))

/** Whether the quality lens is on (a hook; components re-render when it changes). */
export const useLensOn = (): boolean => useQualityLens((s) => s.on)

// Another tab of this browser switching the lens updates this one too. That corrects this tab's
// address; it never adds to this tab's history.
try {
  if (typeof window !== 'undefined')
    window.addEventListener('storage', (e) => {
      if (e.key !== QUALITY_LENS_KEY && e.key !== null) return
      hintAddress('replace')
      useQualityLens.setState({ on: readLens() })
    })
} catch {
  /* no window events (tests) */
}

/* ───────────── opening the Data quality tab at a dataset ───────────── */

/** The route tab of the Data quality tab at one dataset: "quality/employees" (`#data.quality/employees`). */
export const qualityRoute = (key?: DatasetKey | null): string =>
  key ? `${QUALITY_TAB_ROUTE}/${key}` : QUALITY_TAB_ROUTE

/** The dataset a Data quality route names, or null. */
export function datasetOfQualityRoute(tab: string | null | undefined): DatasetKey | null {
  const m = /^quality[/:]([A-Za-z]+)$/.exec((tab ?? '').trim())
  return m && (DATASET_KEYS as readonly string[]).includes(m[1]) ? (m[1] as DatasetKey) : null
}

export interface QualityFocus {
  /** Changes on every request, so asking for the same dataset twice still scrolls to it. */
  nonce: number
}

export const useQualityFocus = create<QualityFocus>(() => ({ nonce: 0 }))

/** Open the Data quality tab, at one dataset when given (the drill panel and Settings close first). */
export function openDataQuality(key?: DatasetKey | null): void {
  useDrillStore.getState().close()
  closeSettings()
  useQualityFocus.setState((s) => ({ nonce: s.nonce + 1 }))
  goTo('data', qualityRoute(key))
}
