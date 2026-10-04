/**
 * Labels the shell stamps on screens and exports: company line, dataset provenance and the
 * ExportMeta header for workbooks and decks. Pure.
 */
import type { ExportMeta } from '@/charts/types'
import type { DataStandard } from '@/data/quality/tier'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import type { Window } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { withoutDataContext } from '@/lib/export/names'

/** The company line in the masthead: the sample company, or the user's own data. */
export function companyLine(isSample: boolean, sampleCompany: string): string {
  return isSample ? sampleCompany : 'Your data'
}

/** How many of the ten datasets were uploaded rather than sample. */
export function uploadedCount(sources: Record<DatasetKey, SourceMeta>): { uploaded: number; total: number } {
  return {
    uploaded: DATASET_KEYS.filter((k) => sources[k]?.kind === 'upload').length,
    total: DATASET_KEYS.length,
  }
}

export interface DatasetProvenance {
  key: DatasetKey
  label: string
  kind: SourceMeta['kind']
  rowCount: number
  fileName?: string
}

export interface DatasetNote {
  /** "Sample data" or "Uploaded 2 of 3 datasets". */
  text: string
  allSample: boolean
  datasets: DatasetProvenance[]
}

/** Where the datasets a view reads came from. */
export function datasetNote(
  keys: readonly DatasetKey[],
  sources: Record<DatasetKey, SourceMeta>,
): DatasetNote {
  const datasets = keys.map((key) => {
    const s = sources[key]
    return {
      key,
      label: datasetDef(key).label,
      kind: s?.kind ?? 'sample',
      rowCount: s?.rowCount ?? 0,
      fileName: s?.fileName,
    }
  })
  const uploaded = datasets.filter((d) => d.kind === 'upload').length
  return {
    text: uploaded ? `Uploaded ${uploaded} of ${datasets.length} datasets` : 'Sample data',
    allSample: uploaded === 0,
    datasets,
  }
}

/** The sub-tab to show: the requested one when the view has it, else the view's first tab. */
export function resolveTab(tabs: readonly { key: string }[], requested: string): string {
  return tabs.some((t) => t.key === requested) ? requested : (tabs[0]?.key ?? '')
}

/** Context stamped on every export from a view. */
export function buildExportMeta(args: {
  viewLabel: string
  tabLabel?: string
  scopeLabel: string
  window: Window
  asOf: string
  isSample: boolean
  sampleCompany: string
  /** The data standard in force, stated on every sheet and slide. */
  standard?: DataStandard
  /** False for a view that reads no datasets (AI in HR): no scope, window, as-of or standard lines. */
  readsData?: boolean
}): ExportMeta {
  const meta: ExportMeta = {
    view: args.viewLabel,
    tab: args.tabLabel,
    scope: args.scopeLabel,
    window: args.window.label,
    // ISO, like the per-figure meta; the export library formats it for title rows and uses it in file names.
    asOf: args.asOf,
    isSample: args.isSample,
    company: args.isSample ? args.sampleCompany : 'Company data',
    ...(args.standard && { standard: args.standard }),
  }
  return args.readsData === false ? withoutDataContext(meta) : meta
}
