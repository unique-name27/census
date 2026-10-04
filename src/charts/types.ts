/**
 * Contracts shared by figures, tables and exports.
 */
import type { DataStandard, Tier } from '@/data/quality/tier'
import type { DrillSource } from '@/drill/Drill'
import type { Format } from '@/lib/format'

/** A per-row format, for columns whose unit differs by row (e.g. a "Value" column holding rates and day counts). */
export type RowFormat<T = Record<string, unknown>> = (row: T) => Format

/**
 * A column of the rows behind a figure: drives the table view and every export. The untyped
 * `Column` takes any row so typed columns (`Column<Row>`, whose per-row format reads a `Row`) fit
 * the untyped lists that registries and exports take.
 */
// biome-ignore lint/suspicious/noExplicitAny: see above; only the per-row format's parameter depends on T
export interface Column<T = any> {
  key: Extract<keyof T, string> | string
  label: string
  /** One format for the column, or one per row (`(row) => Format`); Excel gets a per-cell number format. */
  format?: Format | RowFormat<T>
  /** Pay amount: hidden from the table and exports unless pay amounts are switched on. */
  pay?: boolean
  align?: 'left' | 'right'
  /** Optional width hint for tables, in ch. */
  width?: number
  /**
   * Limit the column to one kind of output. 'sheets': tables on screen, Excel, CSV and copy, not
   * slides (units and long series that a slide shows inside the value or has no room for).
   * 'slides': slide tables only (a readable "+4 d" beside the numbers sheets carry).
   */
  only?: 'sheets' | 'slides'
  /**
   * The records behind a cell (usually a count or a rate): the cell becomes a button that opens
   * the drill panel. Return null for cells with nothing behind them. Not used by exports.
   */
  drill?: { bivarianceHack(row: T): DrillSource }['bivarianceHack']
  /**
   * A link for the cell (e.g. the record in its source system): the table shows the value as a
   * link that opens in a new tab. Return null for no link; when it gives one it wins over
   * `drill` for that cell. Only web, mail and same-site links render. Exports keep the plain value.
   */
  href?: { bivarianceHack(row: T): string | null }['bivarianceHack']
}

/** A row of the "datasheet" popover that defines a metric. */
export interface Definition {
  term: string
  text: string
  /** Muted formula line, e.g. "hired ÷ (hired + declined)". */
  formula?: string
}

/** What a figure registers with its view so "Export view" can collect it. */
export interface RegisteredFigure {
  id: string
  title: string
  subtitle?: string
  note?: string
  columns: Column[]
  rows: Record<string, unknown>[]
  /** The rendered chart SVG, if the figure has one. */
  getSvg: () => SVGSVGElement | null
  order: number
  /** The figure's data tier; absent when it is not gated (e.g. the Data room). */
  tier?: Tier | null
  /**
   * The data standard hides the figure: `rows` hold the reason instead of its data, and there is
   * no image. A preview shown on screen is never exported.
   */
  withheld?: boolean
  /** The metric dictionary entry the figure shows (`Figure`'s `metric`). */
  metric?: string
}

/** Context stamped on every export (header rows, file names, slide footers). */
export interface ExportMeta {
  /** The view's label, e.g. "People stats". */
  view: string
  /** The view's key ('hrbp'); file names drop it where a figure id repeats it. */
  viewKey?: string
  tab?: string
  scope: string
  window: string
  asOf: string
  isSample: boolean
  company: string
  /** The data standard in force; every sheet, slide and CSV preamble states it. */
  standard?: DataStandard
}
