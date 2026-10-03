/**
 * Contracts shared by figures, tables and exports.
 */
import type { Format } from '@/lib/format'

/** A column of the rows behind a figure: drives the table view and every export. */
export interface Column<T = Record<string, unknown>> {
  key: Extract<keyof T, string> | string
  label: string
  format?: Format
  /** Pay amount: hidden from the table and exports unless pay amounts are switched on. */
  pay?: boolean
  align?: 'left' | 'right'
  /** Optional width hint for tables, in ch. */
  width?: number
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
}

/** Context stamped on every export (header rows, file names, slide footers). */
export interface ExportMeta {
  view: string
  tab?: string
  scope: string
  window: string
  asOf: string
  isSample: boolean
  company: string
}
