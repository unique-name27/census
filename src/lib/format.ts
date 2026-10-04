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
  | 'pct2' // fraction -> 3.54%
  | 'pts' // fraction difference -> +2.1 pts
  | 'money' // USD compact, $1.2M
  | 'moneyFull' // USD, $123,456
  | 'days' // 12 d
  | 'hours' // 6.5 h
  | 'years' // 4.2 yrs
  | 'ratio' // 0.98
  | 'times' // multiple -> 1.58×
  | 'date' // 30 Sep 2026
  | 'text'

export const DASH = '—'

/** U+2212, the typographic minus every display format uses for negative values. */
export const MINUS = '−'

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compactNf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** `body` of |v| with a true minus in front for negatives (none when the shown value rounds to zero). */
function signed(v: number, body: (abs: number) => string): string {
  const s = body(Math.abs(v))
  return v < 0 && /[1-9]/.test(s) ? `${MINUS}${s}` : s
}

export function compact(v: number): string {
  return signed(v, (a) => (a < 1000 ? nf0.format(a) : compactNf.format(a)))
}

export function fmt(v: unknown, format: Format = 'int'): string {
  if (format === 'text') return v == null || v === '' ? DASH : String(v)
  if (format === 'date') return typeof v === 'string' ? formatDate(v) : DASH
  if (!isNum(v)) return DASH
  switch (format) {
    case 'int':
      return signed(v, (a) => nf0.format(a))
    case 'compact':
      return compact(v)
    case 'num1':
      return signed(v, (a) => nf1.format(a))
    case 'num2':
    case 'ratio':
      return signed(v, (a) => nf2.format(a))
    case 'times':
      return signed(v, (a) => `${nf2.format(a)}×`)
    case 'pct':
      return signed(v, (a) => `${nf1.format(a * 100)}%`)
    case 'pct0':
      return signed(v, (a) => `${nf0.format(a * 100)}%`)
    case 'pct2':
      return signed(v, (a) => `${nf2.format(a * 100)}%`)
    case 'pts': {
      const s = nf1.format(Math.abs(v * 100))
      return `${!/[1-9]/.test(s) ? '' : v > 0 ? '+' : MINUS}${s} pts`
    }
    case 'money':
      return signed(v, (a) => (a < 10_000 ? usd.format(a) : `$${compactNf.format(a)}`))
    case 'moneyFull':
      return signed(v, (a) => usd.format(a))
    case 'days':
      return signed(v, (a) => `${a < 10 && !Number.isInteger(a) ? nf1.format(a) : nf0.format(a)} d`)
    case 'hours':
      return signed(v, (a) => `${a < 10 ? nf1.format(a) : nf0.format(a)} h`)
    case 'years':
      return signed(v, (a) => `${nf1.format(a)} yrs`)
  }
  return String(v)
}

/** Signed delta in the unit of the format: "+3", "−1.2 pts", "+4 d", "±0" (always the true minus). */
export function fmtDelta(d: number | null | undefined, format: Format): string {
  if (!isNum(d)) return DASH
  if (format === 'pct' || format === 'pct0' || format === 'pct2' || format === 'pts') return fmt(d, 'pts')
  const body = fmt(Math.abs(d), format)
  const sign = !/[1-9]/.test(body) ? '±' : d > 0 ? '+' : MINUS
  return `${sign}${body}`
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
    case 'times':
      return '0.00"×"'
    case 'pct':
    case 'pts':
      return '0.0%'
    case 'pct0':
      return '0%'
    case 'pct2':
      return '0.00%'
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
