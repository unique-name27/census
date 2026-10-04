/**
 * The dataset manifest: one row per dataset with what it feeds, where it came from, how many rows
 * are loaded, how well its fields are filled and what needs a look. Pure: built from the store's
 * datasets and source metadata.
 */
import type { Column } from '@/charts'
import type { Severity } from '@/components/types'
import { TIER_LABEL, TIERS, type Tier } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import { DATASETS, type DatasetKey, type Datasets, type ISODate, type ViewKey } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { formatDate } from '@/lib/dates'
import type { Format } from '@/lib/format'
import { fmt } from '@/lib/format'
import { type DatasetCheck, datasetChecks, worstSeverity } from './checks'
import { type DatasetCoverage, type FieldFills, fieldCoverage, REQUIREMENT_LABEL } from './coverage'

/** Folder-tab order and labels of the six views. */
export const VIEW_ORDER: ViewKey[] = ['recruiting', 'hrbp', 'org', 'services', 'talent', 'comp']
export const VIEW_LABELS: Record<ViewKey, string> = {
  recruiting: 'Recruiting',
  hrbp: 'People stats',
  org: 'Org chart',
  services: 'HR ops',
  talent: 'Talent',
  comp: 'Compensation',
  ai: 'AI in HR',
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
  /** The dataset's tier (none, bronze, silver or gold), when the quality index was given. */
  tier: Tier | null
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

/**
 * Which views read each dataset, from the views' own declarations (`ViewDef.datasets`). The
 * schema's `usedBy` lists can fall behind when a view starts reading another dataset.
 */
export function feedsFromViews(
  views: readonly { key: ViewKey; datasets: readonly DatasetKey[] }[],
): Partial<Record<DatasetKey, ViewKey[]>> {
  const out: Partial<Record<DatasetKey, ViewKey[]>> = {}
  for (const v of views)
    for (const d of v.datasets) {
      const list = out[d] ?? []
      if (!list.includes(v.key)) list.push(v.key)
      out[d] = list
    }
  return out
}

/** The schema's list and the views' declarations together, in folder-tab order. */
function feedsOf(usedBy: readonly ViewKey[], declared: readonly ViewKey[] | undefined): ViewKey[] {
  const all = new Set<ViewKey>([...usedBy, ...(declared ?? [])])
  return VIEW_ORDER.filter((v) => all.has(v))
}

/** What the last upload of a dataset left behind in its import log. */
export interface UploadFacts {
  fills: FieldFills | null
  /** Kinds of change the log lists (its "Last upload" summary). */
  changeKinds: number
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
  /** Views that read each dataset (`feedsFromViews`), added to the schema's lists. */
  feeds?: Partial<Record<DatasetKey, readonly ViewKey[]>>
  /** Facts from the import log of each dataset's current upload. */
  uploads?: Partial<Record<DatasetKey, UploadFacts | null>>
  /** Each dataset's tier, from the quality index. */
  tiers?: Partial<Record<DatasetKey, Tier>>
  /**
   * The quality index: its import logs and tier rules add issues the checks here do not see, for
   * the sample's raw extracts as for uploads.
   */
  quality?: Pick<QualityIndex, 'checks' | 'fields' | 'dataset'> | null
}): ManifestRow[] {
  const { data, sources, asOf } = args
  const targetIsSample = (k: DatasetKey) => sources[k]?.kind !== 'upload'
  return DATASETS.map((def) => {
    const rows = data[def.key] as readonly object[]
    const source = sources[def.key] ?? { kind: 'sample', rowCount: rows.length }
    const upload = source.kind === 'upload' ? args.uploads?.[def.key] : null
    const coverage = fieldCoverage(def, rows, upload?.fills)
    const checks = datasetChecks({
      key: def.key,
      data,
      source,
      coverage,
      asOf,
      targetIsSample,
      fills: upload?.fills,
      changeKinds: upload ? upload.changeKinds : null,
      quality: args.quality,
    })
    const feeds = feedsOf(def.usedBy, args.feeds?.[def.key])
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      sheet: def.sheet,
      feeds,
      feedsText: feedsText(feeds),
      source: sourceInfo(source),
      rows: rows.length,
      coverage,
      checks,
      status: worstSeverity(checks),
      tier: args.tiers?.[def.key] ?? null,
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
  /** Datasets per tier (all zero when tiers were not given). */
  tiers: Record<Tier, number>
  /**
   * "41,444 rows across 10 datasets · 3 gold, 4 silver, 3 bronze · 2 need a look". Which ones are
   * uploads is in the masthead and each row.
   */
  text: string
}

/** "3 gold, 4 silver, 3 bronze", best first; empty when no row has a tier. */
export function tierMixText(counts: Record<Tier, number>): string {
  return [...TIERS]
    .reverse()
    .filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${t === 'none' ? 'with no data' : TIER_LABEL[t].toLowerCase()}`)
    .join(', ')
}

export function manifestSummary(rows: readonly ManifestRow[]): ManifestSummary {
  const uploaded = rows.filter((r) => r.source.kind === 'upload').length
  const needsLook = rows.filter((r) => r.status === 'critical' || r.status === 'warning').length
  const totalRows = rows.reduce((a, r) => a + r.rows, 0)
  const total = rows.length
  const tiers: Record<Tier, number> = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const r of rows) if (r.tier) tiers[r.tier]++
  const head = `${fmt(totalRows, 'int')} ${totalRows === 1 ? 'row' : 'rows'} across ${total} datasets`
  const mix = tierMixText(tiers)
  const tail = needsLook ? ` · ${needsLook} ${needsLook === 1 ? 'needs' : 'need'} a look` : ''
  return { uploaded, total, needsLook, totalRows, tiers, text: `${head}${mix ? ` · ${mix}` : ''}${tail}` }
}

/**
 * Shares just short of whole show two decimals in exports (99.99%), so a gap is never rounded
 * to 100%; everything else shows one.
 */
const shareFormat = (share: unknown): Format =>
  typeof share === 'number' && share < 1 && share >= 0.995 ? 'pct2' : 'pct'

/* ───────────── export of the manifest ───────────── */

export const MANIFEST_COLUMNS: Column[] = [
  { key: 'dataset', label: 'Dataset', width: 20 },
  { key: 'feeds', label: 'Feeds', width: 34 },
  { key: 'source', label: 'Source', width: 28 },
  { key: 'sourceDetail', label: 'Source detail', width: 22 },
  { key: 'tier', label: 'Tier', width: 10 },
  { key: 'rows', label: 'Rows', format: 'int' },
  {
    key: 'coverage',
    label: 'Field coverage',
    format: (r: Record<string, unknown>) => shareFormat(r.coverage),
  },
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
    tier: r.tier ? TIER_LABEL[r.tier] : '',
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
  { key: 'share', label: 'Filled', format: (r: Record<string, unknown>) => shareFormat(r.share) },
  { key: 'defaulted', label: 'Rows set by default', format: 'int' },
  { key: 'inFile', label: 'Column in the file', width: 12 },
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
      defaulted: f.defaulted,
      inFile: f.inFile == null ? '' : f.inFile ? 'Yes' : 'No',
      scope: f.scope ?? (f.event ? `All rows; blank until it happens (${f.event})` : 'All rows'),
    })),
  )
}

/** "1,912 rows" for the manifest and toasts. */
export const rowsText = (n: number): string => `${fmt(n, 'int')} ${n === 1 ? 'row' : 'rows'}`
