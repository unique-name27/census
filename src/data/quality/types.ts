/**
 * Shapes for dataset versions, certification and the quality index.
 */
import type { ApplyOptions, Confidence, ImportIssue, IssueCode, ParsedSheet } from '../import/types'
import type { DatasetKey, ISODate } from '../schema'
import type { FieldRef } from './fieldRef'
import type { Freshness, QualityRules } from './rules'
import type { Tier } from './tier'

/* ───────────── versions ───────────── */

/** How one schema field was filled from the file. */
export interface FieldMappingRecord {
  /** Source column, or null when the file had no column for the field. */
  header: string | null
  confidence: Confidence
  /** A person reviewed this field's column. */
  confirmed: boolean
}

/** Field key → its source column. */
export type VersionMapping = Record<string, FieldMappingRecord>

/** What the import log of a version says, in counts (the full log stays with the raw sheet). */
export interface IssueCounts {
  /** Rows in the file, including rows that were skipped. */
  rowsIn: number
  /** Rows imported. */
  rowsOut: number
  /** Logged issues of every kind. */
  total: number
  byCode: Partial<Record<IssueCode, number>>
  /** Field key ('' for row-level issues) → issue count. */
  byField: Record<string, number>
  /** Field key → values that could not be read or were not recognized (left blank or cleared). */
  invalidByField: Record<string, number>
  /** Field key → values the importer filled with a default instead of reading them from the file. */
  defaultedByField: Record<string, number>
  /** Distinct source rows with at least one error (see `ERROR_CODES`). */
  rowsWithErrors: number
  /** Issues that stop the dataset reaching silver (see `BLOCKING_CODES`). */
  blocking: number
}

/** A total the certifier reconciles the data to, such as headcount per the HRIS report. */
export interface ControlTotal {
  /** What the certifier called it: "Headcount per the HRIS report". */
  label: string
  /** Which number is computed from the data; see `CONTROL_METRICS`. */
  metric: ControlMetricId
  expected: number
  /** Computed from the data when certified. */
  actual?: number | null
  /** Allowed relative difference as a fraction (0.005 = 0.5%). */
  tolerance: number
}

export type ControlMetricId =
  | 'rows'
  | 'activeHeadcount'
  | 'activeWorkers'
  | 'exits12m'
  | 'totalBaseUsd'
  | 'openReqs'
  | 'openCases'
  | 'ratedPeople'

/** A local attestation by the data owner for one exact version. Not a login. */
export interface Certification {
  by: string
  /** ISO date-time. */
  at: string
  note?: string
  controlTotals?: ControlTotal[]
  /** The version certified; a different version is not certified. */
  versionId: string
  /** The as-of date the control totals were computed for. */
  asOf?: ISODate
}

export interface DatasetVersion {
  versionId: string
  dataset: DatasetKey
  source: 'sample' | 'upload'
  fileName: string | null
  sheetName: string | null
  /** ISO date-time the version was loaded (null for the generated sample). */
  importedAt: string | null
  rowCount: number
  /** Empty when nothing is known about the columns (the generated sample, older uploads). */
  mapping: VersionMapping
  /** ISO date-time a person confirmed the mapping; null until then. */
  mappingConfirmedAt?: string | null
  mappingConfirmedBy?: string | null
  applyOptions?: ApplyOptions | null
  issues: IssueCounts
  /** The original sheet is stored (see `getRaw`). */
  hasRaw: boolean
  certification?: Certification | null
}

/** The original sheet of a version and its import log. */
export interface RawRecord {
  dataset: DatasetKey
  versionId: string
  sheet: ParsedSheet
  issues: readonly ImportIssue[]
}

/* ───────────── quality ───────────── */

export interface FieldStats {
  ref: FieldRef
  label: string
  /** Rows in the dataset. */
  rows: number
  /** Rows the field applies to (e.g. termination type only for leavers). */
  applicableRows: number
  /** Applicable rows holding a value (not blank, NaN or "Unknown"). Defaulted values count here too. */
  filled: number
  /** Applicable rows without a value. */
  blank: number
  /** filled ÷ applicable rows, null when no row applies. Defaulted values are not subtracted. */
  coverage: number | null
  /** Values that were not recognized: blanked at import, or outside the field's vocabulary now. */
  invalid: number
  /**
   * Of `invalid`, the values the importer left blank or cleared: those rows count as blank too, so
   * a count of distinct problem rows takes them once. Missing means 0.
   */
  invalidBlank?: number
  /** Values the importer filled with a default. */
  defaulted: number
  /** (invalid + defaulted) ÷ applicable rows; null when no row applies. */
  problemRate: number | null
  /** Which rows count, when not all of them ("Leavers"); null when every row does. */
  scope: string | null
  /** Blanks are normal for some rows it applies to, so coverage does not cap the tier. */
  blankOk: boolean
  /** Rows changed by your reference mappings. */
  remapped: number
  tier: Tier
  /** Why the field sits below its dataset's tier, or null when it doesn't. */
  capReason: string | null
  /**
   * What caps it: too few rows filled, too many values not recognized or defaulted, or reference
   * mappings changed it after the dataset was certified. Null when it is not capped.
   */
  capKind?: 'coverage' | 'values' | 'remapped' | null
}

export type RuleId =
  | 'has-rows'
  | 'mapping-confirmed'
  | 'no-blocking'
  | 'issue-rate'
  | 'references'
  | 'dates-in-order'
  | 'no-duplicates'
  | 'fresh'
  | 'certified'
  | 'control-totals'

export interface RuleResult {
  id: RuleId
  /** Short label, sentence case: "Mapping confirmed". */
  label: string
  pass: boolean
  /** One plain sentence with the number in it. */
  detail: string
  /** The tier this rule is needed for; null for checks that only inform. */
  gate: 'silver' | 'gold' | null
  /** How many rows fail (0 when it passes or is not about rows). */
  count: number
  /** Indexes into the dataset's rows of the rows behind a failure. */
  rows: number[]
}

export interface DatasetQuality {
  key: DatasetKey
  label: string
  tier: Tier
  rows: number
  version: DatasetVersion | null
  /** Rows with an import error ÷ rows in the file; null when there is no import log. */
  issueRate: number | null
  /** The freshness rule's result, as the tier judges it (the as-of date and the snapshot date it uses). */
  freshness: Freshness
  rules: RuleResult[]
  /** What keeps it from the next tier, one plain phrase each (empty at gold). */
  missing: string[]
}

/** The rows of a field behind each of its numbers, for drills. */
export type FieldRowKind = 'applicable' | 'filled' | 'blank' | 'invalid' | 'defaulted' | 'remapped'

/** What decides the tier of a number: its weakest field, or a dataset when it declares none. */
export interface Limiting {
  tier: Tier
  /** The dataset to open for details; null when the number names no data at all. */
  dataset: DatasetKey | null
  ref: FieldRef | null
}

export interface QualityIndex {
  /** The thresholds this index was computed with (the metric dictionary's data quality rules). */
  rules: QualityRules
  datasetTier(key: DatasetKey): Tier
  fieldTier(ref: FieldRef): Tier
  fieldStats(ref: FieldRef): FieldStats
  /** Plain English: "Silver: Candidates mapping confirmed 2 Oct by Jamie; not certified. Current stage is 97% filled." */
  explain(ref: FieldRef | DatasetKey): string
  /** Lowest tier among `uses`, or among the `fallback` datasets when `uses` is empty or missing. */
  tierOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): Tier
  /** The field or dataset that sets `tierOf`. */
  limitingOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): Limiting
  /** `explain` of the limiting field or dataset, for a badge on a number. */
  explainOf(uses: readonly FieldRef[] | undefined, fallback: readonly DatasetKey[]): string
  /** Rule results for a dataset, silver gates first, then gold gates, then checks that inform. */
  checks(key: DatasetKey): RuleResult[]
  dataset(key: DatasetKey): DatasetQuality
  /** Stats for every schema field of a dataset, in schema order. */
  fields(key: DatasetKey): FieldStats[]
  /** Indexes into the dataset's rows behind one of a field's numbers. */
  fieldRows(ref: FieldRef, kind: FieldRowKind): number[]
}
