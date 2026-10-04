/**
 * The sample's starting state: plain generated rows, or (when a seed is registered) raw
 * extracts run through the import pipeline, with their mapping, import log and a starter
 * confirmation or certification per dataset (docs/DATA-TIERS.md, "Sample data that sucks").
 */
import type { ApplyOptions, ImportIssue, Mapping, ParsedSheet } from '../import/types'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate } from '../schema'
import type { ControlTotal, DatasetVersion, RawRecord, VersionMapping } from './types'
import { confirmVersion, makeCertification, makeVersion, sampleVersionId } from './versions'

export interface SampleSeedEntry<K extends DatasetKey = DatasetKey> {
  /** Rows as imported from the raw extract; the generated rows when absent. */
  rows?: Datasets[K]
  raw?: ParsedSheet
  mapping?: Mapping | VersionMapping
  options?: ApplyOptions
  issues?: readonly ImportIssue[]
  /** Rows in the raw extract (the importer's `stats.rowsIn`). */
  rowsIn?: number
  fileName?: string
  sheetName?: string
  importedAt?: string
  /** Starter state: the mapping was confirmed. */
  mappingConfirmed?: { by: string; at: string }
  /** Starter state: certified (implies a confirmed mapping is also given). */
  certification?: { by: string; at: string; note?: string; controlTotals?: Omit<ControlTotal, 'actual'>[] }
}

export type SampleSeed = { [K in DatasetKey]?: SampleSeedEntry<K> }

export type SampleSeedLoader = () => SampleSeed | Promise<SampleSeed>

export interface SampleState {
  data: Datasets
  versions: Record<DatasetKey, DatasetVersion>
  raws: RawRecord[]
}

/** Rows and version records for every dataset from the generated sample and an optional seed. */
export function buildSampleState(base: Datasets, seed: SampleSeed | null, asOf: ISODate): SampleState {
  const data = { ...base } as Record<DatasetKey, unknown[]>
  for (const k of DATASET_KEYS) {
    const rows = seed?.[k]?.rows
    if (rows) data[k] = rows as unknown[]
  }
  const datasets = data as unknown as Datasets
  const versions = {} as Record<DatasetKey, DatasetVersion>
  const raws: RawRecord[] = []
  for (const k of DATASET_KEYS) versions[k] = sampleVersion(k, datasets, seed?.[k] ?? null, asOf, raws)
  return { data: datasets, versions, raws }
}

/** One dataset's sample version (the rows must already be in `data`). */
export function sampleVersion(
  key: DatasetKey,
  data: Datasets,
  entry: SampleSeedEntry | null,
  asOf: ISODate,
  raws?: RawRecord[],
): DatasetVersion {
  const rows = data[key] as readonly object[]
  let v = makeVersion({
    dataset: key,
    source: 'sample',
    rows,
    versionId: sampleVersionId(key, !!entry),
    fileName: entry?.fileName ?? null,
    sheetName: entry?.sheetName ?? null,
    importedAt: entry?.importedAt ?? null,
    mapping: entry?.mapping ?? null,
    applyOptions: entry?.options ?? null,
    issues: entry?.issues,
    rowsIn: entry?.rowsIn,
    hasRaw: !!entry?.raw,
  })
  if (entry?.raw)
    raws?.push({ dataset: key, versionId: v.versionId, sheet: entry.raw, issues: entry.issues ?? [] })
  const confirmed =
    entry?.mappingConfirmed ??
    (entry?.certification ? { by: entry.certification.by, at: entry.certification.at } : null)
  if (confirmed) v = confirmVersion(v, confirmed.by, confirmed.at)
  if (entry?.certification)
    v = {
      ...v,
      certification: makeCertification({
        version: v,
        input: entry.certification,
        data,
        asOf,
        at: entry.certification.at,
      }),
    }
  return v
}

/**
 * A stored sample version carries the user's own decisions (confirmed, certified, revoked) for
 * the same version ID; everything else comes from the freshly built version.
 */
export function mergeStoredSample(fresh: DatasetVersion, stored: DatasetVersion | null): DatasetVersion {
  if (!stored || stored.versionId !== fresh.versionId || stored.source !== 'sample') return fresh
  const mapping: VersionMapping = {}
  for (const [k, e] of Object.entries(fresh.mapping))
    mapping[k] = { ...e, confirmed: !!stored.mapping[k]?.confirmed }
  return {
    ...fresh,
    mapping,
    mappingConfirmedAt: stored.mappingConfirmedAt ?? null,
    mappingConfirmedBy: stored.mappingConfirmedBy ?? null,
    certification: stored.certification ?? null,
  }
}
