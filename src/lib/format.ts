/**
 * Number formatting shared by charts, tables, tiles and exports.
 * Missing or suppressed values always render as "—", never as 0.
 */
import { formatDate } from './dates'

export type Format =
  | 'int' // 1,284
  | 'compact' // 12.9K
  | 'num1' // 4.3
  | 'num2' // 0.98
  | 'pct' // fraction -> 12.4%
  | 'pct0' // fraction -> 12%
  | 'pts' // fraction difference -> +2.1 pts
  | 'money' // USD compact, $1.2M
  | 'moneyFull' // USD, $123,456
  | 'days' // 12 d
  | 'hours' // 6.5 h
  | 'years' // 4.2 yrs
  | 'ratio' // 0.98
  | 'date' // 30 Sep 2026
  | 'text'

export const DASH = '—'

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compactNf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function compact(v: number): string {
  return Math.abs(v) < 1000 ? nf0.format(v) : compactNf.format(v)
}

export function fmt(v: unknown, format: Format = 'int'): string {
  if (format === 'text') return v == null || v === '' ? DASH : String(v)
  if (format === 'date') return typeof v === 'string' ? formatDate(v) : DASH
  if (!isNum(v)) return DASH
  switch (format) {
    case 'int':
      return nf0.format(v)
    case 'compact':
      return compact(v)
    case 'num1':
      return nf1.format(v)
    case 'num2':
    case 'ratio':
      return nf2.format(v)
    case 'pct':
      return `${nf1.format(v * 100)}%`
    case 'pct0':
      return `${nf0.format(v * 100)}%`
    case 'pts': {
      const p = v * 100
      return `${p > 0 ? '+' : p < 0 ? '−' : ''}${nf1.format(Math.abs(p))} pts`
    }
    case 'money':
      return Math.abs(v) < 10_000 ? usd.format(v) : `$${compactNf.format(v)}`
    case 'moneyFull':
      return usd.format(v)
    case 'days':
      return `${Math.abs(v) < 10 && !Number.isInteger(v) ? nf1.format(v) : nf0.format(v)} d`
    case 'hours':
      return `${Math.abs(v) < 10 ? nf1.format(v) : nf0.format(v)} h`
    case 'years':
      return `${nf1.format(v)} yrs`
  }
  return String(v)
}

/** Signed delta in the unit of the format: "+3", "−1.2 pts", "+4 d". */
export function fmtDelta(d: number | null | undefined, format: Format): string {
  if (!isNum(d)) return DASH
  if (format === 'pct' || format === 'pct0' || format === 'pts') return fmt(d, 'pts')
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
  return `${sign}${fmt(Math.abs(d), format)}`
}

/** "1 person" / "12 people" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${nf0.format(n)} ${n === 1 ? one : many}`
}

/** Excel number format for a Format, used by the workbook exporter. */
export function excelNumFmt(format: Format | undefined): string | undefined {
  switch (format) {
    case 'int':
    case 'compact':
      return '#,##0'
    case 'num1':
    case 'years':
    case 'hours':
      return '#,##0.0'
    case 'num2':
    case 'ratio':
      return '0.00'
    case 'pct':
    case 'pts':
      return '0.0%'
    case 'pct0':
      return '0%'
    case 'money':
    case 'moneyFull':
      return '"$"#,##0'
    case 'days':
      return '#,##0'
    case 'date':
      return 'd mmm yyyy'
    default:
      return undefined
  }
}
