import type { Column } from '@/charts/types'

/** One table to export: a figure's rows, a detail list, or a sheet of a view workbook. */
export interface ExportTable {
  /** Sheet name (sanitized on write) and file-name seed. */
  name: string
  title?: string
  subtitle?: string
  /** Footnote printed under the title block, e.g. "62 reqs filled". */
  note?: string
  columns: readonly Column[]
  rows: readonly Record<string, unknown>[]
}

export interface ExportOptions {
  /** Pay amount columns (`pay: true`) are dropped unless this is on. */
  showPay: boolean
  /** File name without extension; defaults to `fileStem(meta, name)`. */
  fileName?: string
}
