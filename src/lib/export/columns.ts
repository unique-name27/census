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

/** The format a column renders with: its own, or one inferred from a sample value. */
export function columnFormat(column: Pick<Column, 'format'>, sample: unknown): Format {
  if (column.format) return column.format
  if (isNum(sample)) return Number.isInteger(sample) ? 'int' : 'num2'
  return 'text'
}

export function columnAlign(column: Pick<Column, 'format' | 'align'>, sample?: unknown): 'left' | 'right' {
  if (column.align) return column.align
  return isNumericFormat(column.format) || (!column.format && isNum(sample)) ? 'right' : 'left'
}

/** First non-empty value of a column, used to infer formats for unformatted columns. */
export function sampleValue(rows: readonly Record<string, unknown>[], key: string): unknown {
  for (const r of rows) {
    const v = r[key]
    if (v != null && v !== '') return v
  }
  return undefined
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
export function plainText(v: unknown, format: Format | undefined): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    switch (format) {
      case 'pct':
      case 'pct0':
        return `${clean(v * 100, 2)}%`
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
