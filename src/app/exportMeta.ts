/**
 * Labels the shell stamps on screens and exports: company line, dataset provenance, the
 * ExportMeta header for workbooks and decks, and the mode an off-screen export renders in. Pure.
 */
import type { AccessContext, AccessInput } from '@/access/context'
import { EVERY_RECRUITER } from '@/access/modes'
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

/** How many datasets were uploaded rather than sample, out of all of them. */
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
  /** The mode line every export carries outside HR and Developer ("Made in HRBP mode for APAC."). */
  modeLine?: string
  /** Finance mode's cost line, in place of the "Pay amounts" line (`modeMeta`). */
  costLine?: string
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
    ...(args.modeLine && { modeLine: args.modeLine }),
    ...(args.costLine && { costLine: args.costLine }),
  }
  return args.readsData === false ? withoutDataContext(meta) : meta
}

/**
 * The mode and picks that rebuild this access context in an off-screen render (a whole-view
 * export lays the other tabs out in the same mode, scope included): the scope's pick, "Every
 * recruiter" for Recruiter mode with no scope, and the remembered pick of a scope whose pick is
 * gone (so the render holds nobody too).
 */
export function accessInputOf(access: Pick<AccessContext, 'mode' | 'scope'>): AccessInput {
  const s = access.scope
  if (!s)
    return access.mode === 'recruiter'
      ? { mode: 'recruiter', picks: { recruiter: { name: EVERY_RECRUITER, id: null } } }
      : { mode: access.mode }
  switch (s.kind) {
    case 'org':
      return { mode: access.mode, picks: { managerId: s.managerId || null } }
    case 'unit':
      return { mode: access.mode, picks: { unit: s.label || null } }
    case 'region':
      return { mode: access.mode, picks: { region: s.label || null } }
    case 'reqs':
      return {
        mode: access.mode,
        picks: { recruiter: s.recruiter ? { name: s.recruiter, id: s.recruiterId } : null },
      }
  }
}
