/**
 * Shapes shared by the import pipeline: parse → detect → auto-map → apply.
 *
 * Every step is a pure function of its inputs, so the Data room can re-run any step when the user
 * changes a choice (a different sheet, a remapped column, a corrected date order).
 */
import type { DatasetKey, Datasets } from '../schema'

/* ───────────── parsed files ───────────── */

export type FileFormat = 'xlsx' | 'xls' | 'csv' | 'tsv' | 'other'

export interface ParsedSheet {
  name: string
  /** 0-based index of the header row among the sheet's rows (Excel row 1 is 0). */
  headerRow: number
  /** Header names, trimmed and de-duplicated ("Name (2)"); blank headers become "Column N". */
  headers: string[]
  /** One object per non-blank data row, keyed by header. Blank cells are null. */
  rows: Record<string, unknown>[]
  /** Excel row number (1-based, as Excel shows it) of each entry in `rows`. */
  rowNumbers: number[]
}

export interface ParsedWorkbook {
  fileName: string
  format: FileFormat
  /** Non-empty sheets in workbook order. */
  sheets: ParsedSheet[]
  /** Names of sheets that had no data and were left out. */
  emptySheets: string[]
}

/* ───────────── mapping ───────────── */

export type Confidence = 'high' | 'medium' | 'low'

export interface MappedField {
  /** Source column chosen for the field, or null when nothing fits. */
  header: string | null
  confidence: Confidence
  /** 0-1 match strength (1 = exact name or chosen by the user). */
  score: number
  /** Plain-English reason, shown next to the confidence dot. */
  reason: string
}

/** Field key → chosen column. Every field of the dataset has an entry. */
export type Mapping = Record<string, MappedField>

export interface DatasetGuess {
  key: DatasetKey
  /** 0-1: how well the sheet fits this dataset. */
  confidence: number
  /** Number of the dataset's fields that found a column. */
  matched: number
  /** Required fields that found no column. */
  missingRequired: string[]
}

export interface HeaderCandidate {
  header: string
  score: number
  confidence: Confidence
  reason: string
}

/* ───────────── options ───────────── */

export type DateOrder = 'MDY' | 'DMY'

export interface DateOrderGuess {
  order: DateOrder
  /** False when no value disambiguates day and month (e.g. every value is 03/04/2026). */
  certain: boolean
}

export interface HourlyConversion {
  /** Paid hours per year used to annualize hourly rates. */
  hours: number
  /** Column that says which rows are hourly; null converts every row. */
  basisHeader: string | null
}

export interface ApplyOptions {
  /** Date order per source column (header). Detected from the values when absent. */
  dateOrders?: Record<string, DateOrder>
  /** Per percent field (key): true when the column holds whole numbers (3.5 = 3.5%). Detected when absent. */
  percentWhole?: Record<string, boolean>
  /** Compensation only: annualize hourly pay. Undefined detects it; null turns it off. */
  hourlyToAnnual?: HourlyConversion | null
  /**
   * Manual value corrections from the Data room's value grid: field key → normalized raw value
   * (see `normText`) → canonical value, or null to leave it blank on purpose.
   */
  valueMaps?: Record<string, Record<string, string | null>>
}

/** Options detected from the data, for the Data room to show and let the user override. */
export interface SuggestedOptions {
  /** Mapped date and date-time columns, by header. */
  dateOrders: Record<string, DateOrderGuess>
  /** Mapped percent fields, by field key. */
  percentWhole: Record<string, boolean>
  hourlyToAnnual: HourlyConversion | null
}

/* ───────────── results ───────────── */

export type IssueCode =
  | 'missing-required'
  | 'column-missing'
  | 'unreadable'
  | 'unknown-value'
  | 'out-of-range'
  | 'duplicate'
  | 'defaulted'
  | 'converted'
  | 'manager-self'
  | 'manager-unknown'
  | 'manager-ambiguous'
  | 'manager-cycle'
  | 'not-in-roster'

export type IssueAction = 'row-skipped' | 'left-blank' | 'defaulted' | 'cleared' | 'converted' | 'kept'

export interface ImportIssue {
  /** Excel row number of the source row; 0 for an issue about the whole sheet. */
  row: number
  /** The row's key (e.g. its employee ID) when known. */
  id: string | null
  /** Field key; '' for row-level issues. */
  field: string
  /** Field label for display. */
  label: string
  /** The source value as text ('' when blank). */
  value: string
  code: IssueCode
  /** What is wrong, in one plain sentence. */
  issue: string
  action: IssueAction
}

export interface ImportStats {
  rowsIn: number
  rowsOut: number
  skippedMissingRequired: number
  duplicates: number
  /** Values filled by a documented default (all fields together). */
  defaulted: number
  /** Values filled by a default, per field key. */
  defaults: Record<string, number>
  /** Values that could not be read and were left blank. */
  blanked: number
  /** Rows whose person is not in the roster (employee-keyed datasets, when a roster is given). */
  notInRoster: number
  /** Imported rows with at least one logged change or warning (for `SourceMeta.warnings`). */
  rowsWithIssues: number
  /** Employees only: how manager references resolved. */
  managers?: { byId: number; byName: number; cleared: number; topLevel: number }
}

export interface ImportResult<K extends DatasetKey = DatasetKey> {
  dataset: K
  rows: Datasets[K]
  issues: ImportIssue[]
  stats: ImportStats
  /** The options actually used (detected or given), for saving in a mapping profile. */
  used: {
    dateOrders: Record<string, DateOrder>
    percentWhole: Record<string, boolean>
    hourlyToAnnual: HourlyConversion | null
  }
}

export interface IssueSummary {
  code: IssueCode
  field: string
  label: string
  action: IssueAction
  count: number
  /** First few Excel row numbers, for "rows 4, 9, 12 …". */
  rows: number[]
  /** A few distinct source values. */
  examples: string[]
  /** One plain sentence describing the group. */
  message: string
}
