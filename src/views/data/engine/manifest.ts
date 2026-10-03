/**
 * The dataset manifest: one row per dataset with what it feeds, where it came from, how many rows
 * are loaded, how well its fields are filled and what needs a look. Pure: built from the store's
 * datasets and source metadata.
 */
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import { DATASETS, type DatasetKey, type Datasets, type ISODate, type ViewKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { type DatasetCheck, datasetChecks, worstSeverity } from './checks'
import { type DatasetCoverage, fieldCoverage, REQUIREMENT_LABEL } from './coverage'

/** Folder-tab order and labels of the six views. */
export const VIEW_ORDER: ViewKey[] = ['recruiting', 'hrbp', 'org', 'services', 'talent', 'comp']
export const VIEW_LABELS: Record<ViewKey, string> = {
  recruiting: 'Recruiting',
  hrbp: 'HR business partners',
  org: 'Org chart',
  services: 'Employee services',
  talent: 'Talent',
  comp: 'Compensation',
}

export interface SourceInfo {
  kind: 'sample' | 'upload'
  /** "Sample" or the file name. */
  label: string
  /** "Roster sheet · 3 Oct 2026" for uploads. */
  detail: string | null
}

export interface ManifestRow {
  key: DatasetKey
  label: string
  description: string
  /** Sheet name in templates. */
  sheet: string
  feeds: ViewKey[]
  /** "All six views" or the view names. */
  feedsText: string
  source: SourceInfo
  rows: number
  coverage: DatasetCoverage
  checks: DatasetCheck[]
  status: Severity
  /** Header fingerprint of the saved mapping used for the upload, when there is one. */
  profileFingerprint: string | null
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** "six views": how many views Census has, in words. */
export const VIEW_COUNT_TEXT = `${NUMBER_WORDS[VIEW_ORDER.length] ?? VIEW_ORDER.length} views`

const feedsAll = (views: readonly ViewKey[]) => VIEW_ORDER.every((v) => views.includes(v))

export function feedsText(views: readonly ViewKey[]): string {
  if (feedsAll(views)) return `All ${VIEW_COUNT_TEXT}`
  return VIEW_ORDER.filter((v) => views.includes(v))
    .map((v) => VIEW_LABELS[v])
    .join(', ')
}

/** "Feeds all six views", "Feeds Recruiting". */
export function feedsLine(views: readonly ViewKey[]): string {
  return feedsAll(views) ? `Feeds all ${VIEW_COUNT_TEXT}` : `Feeds ${feedsText(views)}`
}

export function sourceInfo(meta: SourceMeta): SourceInfo {
  if (meta.kind === 'sample') return { kind: 'sample', label: 'Sample', detail: null }
  const when = meta.importedAt ? formatDate(meta.importedAt.slice(0, 10)) : null
  const sheet = meta.sheetName && meta.sheetName !== meta.fileName ? `${meta.sheetName} sheet` : null
  const detail = [sheet, when].filter(Boolean).join(' · ')
  return { kind: 'upload', label: meta.fileName ?? 'Uploaded file', detail: detail || null }
}

export function buildManifest(args: {
  data: Datasets
  sources: Record<DatasetKey, SourceMeta>
  asOf: ISODate
}): ManifestRow[] {
  const { data, sources, asOf } = args
  const targetIsSample = (k: DatasetKey) => sources[k]?.kind !== 'upload'
  return DATASETS.map((def) => {
    const rows = data[def.key] as readonly object[]
    const source = sources[def.key] ?? { kind: 'sample', rowCount: rows.length }
    const coverage = fieldCoverage(def, rows)
    const checks = datasetChecks({ key: def.key, data, source, coverage, asOf, targetIsSample })
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      sheet: def.sheet,
      feeds: def.usedBy,
      feedsText: feedsText(def.usedBy),
      source: sourceInfo(source),
      rows: rows.length,
      coverage,
      checks,
      status: worstSeverity(checks),
      profileFingerprint: source.kind === 'upload' ? (source.profileFingerprint ?? null) : null,
    }
  })
}

export interface ManifestSummary {
  uploaded: number
  total: number
  /** Datasets with at least one warning or critical check. */
  needsLook: number
  totalRows: number
  /** "3 of 10 datasets are yours · 2 need a look" */
  text: string
}

export function manifestSummary(rows: readonly ManifestRow[]): ManifestSummary {
  const uploaded = rows.filter((r) => r.source.kind === 'upload').length
  const needsLook = rows.filter((r) => r.status === 'critical' || r.status === 'warning').length
  const totalRows = rows.reduce((a, r) => a + r.rows, 0)
  const total = rows.length
  const head =
    uploaded === 0
      ? `All ${total} datasets are sample data`
      : uploaded === total
        ? `All ${total} datasets are your uploads`
        : uploaded === 1
          ? `1 of ${total} datasets is your upload, the rest are sample data`
          : `${uploaded} of ${total} datasets are your uploads, the rest are sample data`
  const tail = needsLook ? ` · ${needsLook} ${needsLook === 1 ? 'needs' : 'need'} a look` : ''
  return { uploaded, total, needsLook, totalRows, text: `${head}${tail}` }
}

/* ───────────── export of the manifest ───────────── */

export const MANIFEST_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'feeds', label: 'Feeds', width: 34 },
  { key: 'source', label: 'Source', width: 28 },
  { key: 'sourceDetail', label: 'Source detail', width: 22 },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'coverage', label: 'Field coverage', format: 'pct' },
  { key: 'status', label: 'Status', width: 10 },
  { key: 'issues', label: 'Issues', width: 60 },
]

const STATUS_WORD: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'OK',
}

export function manifestExportRows(rows: readonly ManifestRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    dataset: r.label,
    feeds: r.feedsText,
    source: r.source.label,
    sourceDetail: r.source.detail ?? '',
    rows: r.rows,
    coverage: r.coverage.core,
    status: STATUS_WORD[r.status],
    issues: r.checks.map((c) => c.text).join(' '),
  }))
}

export const COVERAGE_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'field', label: 'Field', width: 24 },
  { key: 'requirement', label: 'Requirement', width: 12 },
  { key: 'expected', label: 'Rows counted', format: 'int' },
  { key: 'filled', label: 'Rows filled', format: 'int' },
  { key: 'share', label: 'Filled', format: 'pct' },
  { key: 'scope', label: 'Which rows count', width: 34 },
]

/** One row per dataset field with its fill rate (never its values). */
export function coverageExportRows(rows: readonly ManifestRow[]): Record<string, unknown>[] {
  return rows.flatMap((r) =>
    r.coverage.fields.map((f) => ({
      dataset: r.label,
      field: f.label,
      requirement: REQUIREMENT_LABEL[f.requirement],
      expected: f.expected,
      filled: f.filled,
      share: f.share,
      scope: f.scope ?? 'All rows',
    })),
  )
}

/** "1,912 rows" for the manifest and toasts. */
export const rowsText = (n: number): string => `${fmt(n, 'int')} ${n === 1 ? 'row' : 'rows'}`
