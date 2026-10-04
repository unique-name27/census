/**
 * Dataset versions: one record per load of a dataset, with its mapping, import counts and
 * certification. A new version never inherits a certification. Pure helpers; the store keeps
 * the records and persists them.
 */
import type { ApplyOptions, Confidence, ImportIssue, Mapping } from '../import/types'
import type { DatasetKey, Datasets, ISODate } from '../schema'
import { emptyIssueCounts, summarizeImport } from './importSummary'
import { computeControlTotal, DEFAULT_TOLERANCE } from './rules'
import type { Certification, ControlTotal, DatasetVersion, IssueCounts, VersionMapping } from './types'

/** Versions kept per dataset besides the current one. */
export const HISTORY_SIZE = 3

let counter = 0
/** A unique version ID, e.g. "candidates-mdv2k1-3f9a". */
export function newVersionId(key: DatasetKey, now = Date.now()): string {
  counter = (counter + 1) % 1296
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')
  return `${key}-${now.toString(36)}-${counter.toString(36).padStart(2, '0')}${rand}`
}

/** The sample's version ID is fixed, so confirmations of the sample survive a reload. */
export const sampleVersionId = (key: DatasetKey, seeded = false): string =>
  `sample-${key}${seeded ? '-raw' : ''}`

const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low']

/** The importer's mapping (or a stored one) as a version mapping. Unconfirmed unless it says so. */
export function toVersionMapping(m: Mapping | VersionMapping | null | undefined): VersionMapping {
  const out: VersionMapping = {}
  if (!m) return out
  for (const [field, e] of Object.entries(m)) {
    if (!e || typeof e !== 'object') continue
    const rec = e as { header?: unknown; confidence?: unknown; confirmed?: unknown }
    out[field] = {
      header: typeof rec.header === 'string' ? rec.header : null,
      confidence: CONFIDENCES.includes(rec.confidence as Confidence) ? (rec.confidence as Confidence) : 'low',
      confirmed: rec.confirmed === true,
    }
  }
  return out
}

export interface VersionInput {
  dataset: DatasetKey
  source: 'sample' | 'upload'
  rows: readonly object[]
  versionId?: string
  fileName?: string | null
  sheetName?: string | null
  importedAt?: string | null
  mapping?: Mapping | VersionMapping | null
  applyOptions?: ApplyOptions | null
  issues?: readonly ImportIssue[]
  /** Rows in the file, from the importer's stats. */
  rowsIn?: number
  hasRaw?: boolean
}

export function makeVersion(input: VersionInput): DatasetVersion {
  const mapping = toVersionMapping(input.mapping)
  const known = Object.keys(mapping).length > 0
  const issues: IssueCounts = input.issues?.length
    ? summarizeImport({
        dataset: input.dataset,
        rows: input.rows,
        issues: input.issues,
        mapped: known ? (f) => mapping[f]?.header != null : undefined,
        rowsIn: input.rowsIn,
      })
    : { ...emptyIssueCounts(input.rows.length), rowsIn: input.rowsIn ?? input.rows.length }
  return {
    versionId: input.versionId ?? newVersionId(input.dataset),
    dataset: input.dataset,
    source: input.source,
    fileName: input.fileName ?? null,
    sheetName: input.sheetName ?? null,
    importedAt: input.importedAt ?? null,
    rowCount: input.rows.length,
    mapping,
    mappingConfirmedAt: null,
    mappingConfirmedBy: null,
    applyOptions: input.applyOptions ?? null,
    issues,
    hasRaw: !!input.hasRaw,
    certification: null,
  }
}

/** The version with its mapping confirmed by `by` (every field marked reviewed). */
export function confirmVersion(v: DatasetVersion, by: string, at = new Date().toISOString()): DatasetVersion {
  const mapping: VersionMapping = {}
  for (const [k, e] of Object.entries(v.mapping)) mapping[k] = { ...e, confirmed: true }
  return { ...v, mapping, mappingConfirmedAt: at, mappingConfirmedBy: by.trim() }
}

export interface CertifyInput {
  by: string
  note?: string
  controlTotals?: readonly Omit<ControlTotal, 'actual'>[]
}

/** A certification of this exact version, with each control total's actual value recorded. */
export function makeCertification(args: {
  version: DatasetVersion
  input: CertifyInput
  data: Datasets
  asOf: ISODate
  at?: string
}): Certification {
  const { version, input, data, asOf } = args
  const controlTotals: ControlTotal[] = (input.controlTotals ?? []).map((t) => ({
    label: t.label.trim(),
    metric: t.metric,
    expected: t.expected,
    tolerance: Number.isFinite(t.tolerance) && t.tolerance >= 0 ? t.tolerance : DEFAULT_TOLERANCE,
    actual: computeControlTotal(t.metric, data, version.dataset, asOf),
  }))
  const note = input.note?.trim()
  return {
    by: input.by.trim(),
    at: args.at ?? new Date().toISOString(),
    ...(note ? { note } : {}),
    ...(controlTotals.length ? { controlTotals } : {}),
    versionId: version.versionId,
    asOf,
  }
}

/** True when the version carries a certification of itself. */
export const isCertified = (v: DatasetVersion | null | undefined): boolean =>
  !!v?.certification && v.certification.versionId === v.versionId

/** History after `prev` is replaced: newest first, at most `HISTORY_SIZE`. */
export function pushHistory(
  history: readonly DatasetVersion[],
  prev: DatasetVersion | null,
): DatasetVersion[] {
  if (!prev) return history.slice(0, HISTORY_SIZE)
  return [prev, ...history.filter((h) => h.versionId !== prev.versionId)].slice(0, HISTORY_SIZE)
}

/** Version IDs that dropped out of the history (their raw sheets can be deleted). */
export function droppedVersions(
  before: readonly DatasetVersion[],
  after: readonly DatasetVersion[],
  current: DatasetVersion | null,
): string[] {
  const keep = new Set(after.map((v) => v.versionId))
  if (current) keep.add(current.versionId)
  return before.map((v) => v.versionId).filter((id) => !keep.has(id))
}

/** Loose shape check for a version read back from storage. */
export function isVersion(v: unknown): v is DatasetVersion {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<DatasetVersion>
  return (
    typeof r.versionId === 'string' &&
    typeof r.dataset === 'string' &&
    (r.source === 'sample' || r.source === 'upload') &&
    !!r.mapping &&
    typeof r.mapping === 'object' &&
    !!r.issues &&
    typeof r.issues === 'object'
  )
}
