/**
 * Column handling shared by the table view and every exporter: pay-amount filtering, alignment,
 * and the plain-text form of a value used by CSV and the clipboard.
 */
import type { Column } from '@/charts/types'
import { type Format, isNum } from '@/lib/format'

/** Drop pay-amount columns unless pay amounts are switched on. Ratios are never marked `pay`. */
export function visibleColumns<C extends Pick<Column, 'pay'>>(columns: readonly C[], showPay: boolean): C[] {
  return showPay ? columns.slice() : columns.filter((c) => !c.pay)
}

const TEXT_FORMATS = new Set<Format>(['text', 'date'])

/** Numeric formats right-align and use tabular figures. */
export function isNumericFormat(format: Format | undefined): boolean {
  return format !== undefined && !TEXT_FORMATS.has(format)
}

type FormatSpec = Column['format']

/**
 * A column's own format for one row: its per-row function applied to `row`, or its fixed format.
 * Undefined when the column has no format (or a per-row format and no row to apply it to).
 */
export function rowFormat(column: Pick<Column, 'format'>, row?: object | null): Format | undefined {
  const f = column.format
  if (typeof f !== 'function') return f
  return row ? f(row) : undefined
}

/**
 * The format a column renders with: its own (for a per-row format, the one of `row`, usually the
 * first row with a value), or one inferred from a sample value.
 */
export function columnFormat(column: Pick<Column, 'format'>, sample: unknown, row?: object | null): Format {
  const own = rowFormat(column, row)
  if (own) return own
  if (isNum(sample)) return Number.isInteger(sample) ? 'int' : 'num2'
  return 'text'
}

/** The format of one cell: the column's per-row format for `row`, else the column format. */
export function cellFormat(column: Pick<Column, 'format'>, row: object, fallback: Format): Format {
  return typeof column.format === 'function' ? (column.format(row) ?? fallback) : fallback
}

export function columnAlign(
  column: Pick<Column, 'format' | 'align'>,
  sample?: unknown,
  row?: object | null,
): 'left' | 'right' {
  if (column.align) return column.align
  const own = rowFormat(column, row)
  return isNumericFormat(own) || (!own && isNum(sample)) ? 'right' : 'left'
}

/** First non-empty value of a column, used to infer formats for unformatted columns. */
export function sampleValue(rows: readonly Record<string, unknown>[], key: string): unknown {
  for (const r of rows) {
    const v = r[key]
    if (v != null && v !== '') return v
  }
  return undefined
}

/** First row with a non-empty value in `key` (the row a per-row format is sampled on), else the first row. */
export function sampleRow<R extends object>(rows: readonly R[], key: string): R | undefined {
  for (const r of rows) {
    const v = (r as Record<string, unknown>)[key]
    if (v != null && v !== '') return r
  }
  return rows[0]
}

/** Round away binary noise (0.1 + 0.2) without losing meaningful precision. */
function clean(v: number, digits: number): string {
  const r = Number(v.toFixed(digits))
  return String(Object.is(r, -0) ? 0 : r)
}

/**
 * A value as plain text that Excel and Google Sheets parse back into the right type:
 * percentages as "12.4%", points as "2.1", money as a plain number, dates as ISO.
 * Missing values are empty, never 0.
 */
export function plainText(v: unknown, spec: Format | FormatSpec | undefined, row?: object): string {
  const format = typeof spec === 'function' ? (row ? spec(row) : undefined) : spec
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    switch (format) {
      case 'pct':
      case 'pct0':
        return `${clean(v * 100, 2)}%`
      case 'pct2':
        return `${clean(v * 100, 4)}%`
      case 'pts':
        return clean(v * 100, 2)
      case 'int':
      case 'compact':
        return clean(v, 0)
      case 'money':
      case 'moneyFull':
        return clean(v, 2)
      default:
        return clean(v, 6)
    }
  }
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => plainText(x, format)).join(', ')
  return String(v)
}
