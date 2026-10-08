/**
 * Number formatting shared by charts, tables, tiles and exports.
 * Missing or suppressed values always render as "—", never as 0.
 */
import { COST_STEP, UNDER_COST_STEP } from './costRounding'
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
  | 'pts2' // fraction difference -> +0.81 pts
  | 'deltaDays' // day difference -> +4 d, −1 d, ±0 d
  | 'deltaPct' // relative change as a fraction -> +103%, −47.6%, ±0%
  | 'money' // USD compact, $1.2M
  | 'moneyFull' // USD, $123,456
  | 'moneyM' // USD in millions, one decimal: $12.3M, $0.4M; under $100,000 reads "under $0.1M" (Finance's rounded cost, src/lib/costRounding.ts)
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
/** Compact money keeps one decimal, so the values in one figure line up: $7.3M, $3.0M, $207.6K. */
const compactMoneyNf = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** "+body" / "−body" / "±body": the sign of `v`, or ± when the shown body rounds to zero. */
function withSign(v: number, body: string): string {
  return `${!/[1-9]/.test(body) ? '±' : v > 0 ? '+' : MINUS}${body}`
}

/** A difference of two fractions in percentage points: "+2.1 pts", "−0.81 pts", "0.0 pts". */
function points(v: number, nf: Intl.NumberFormat): string {
  const s = nf.format(Math.abs(v * 100))
  return `${!/[1-9]/.test(s) ? '' : v > 0 ? '+' : MINUS}${s} pts`
}

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
    case 'pts':
      return points(v, nf1)
    case 'pts2':
      return points(v, nf2)
    case 'deltaDays':
      return withSign(v, fmt(Math.abs(v), 'days'))
    case 'deltaPct': {
      // Changes of 100% or more read as whole percents ("+103%"); smaller ones keep a decimal.
      const pct = Math.abs(v * 100)
      const body = Math.round(pct * 10) / 10 >= 100 ? nf0.format(pct) : nf1.format(pct)
      return /[1-9]/.test(body) ? withSign(v, `${body}%`) : '±0%'
    }
    case 'money':
      return signed(v, (a) => (a < 10_000 ? usd.format(a) : `$${compactMoneyNf.format(a)}`))
    case 'moneyFull':
      return signed(v, (a) => usd.format(a))
    case 'moneyM':
      return Math.abs(v) < COST_STEP ? UNDER_COST_STEP : signed(v, (a) => `$${nf1.format(a / 1_000_000)}M`)
    case 'days':
      return signed(v, (a) => `${a < 10 && !Number.isInteger(a) ? nf1.format(a) : nf0.format(a)} d`)
    case 'hours':
      return signed(v, (a) => `${a < 10 ? nf1.format(a) : nf0.format(a)} h`)
    case 'years':
      return signed(v, (a) => `${nf1.format(a)} yrs`)
  }
  return String(v)
}

/**
 * Signed delta in the unit of the format: "+3", "−1.2 pts", "+0.81 pts" (pct2), "+4 d", "±0"
 * (always the true minus). A change in a rate is in points; a change in a delta format
 * (deltaDays) is itself a delta in that format.
 */
export function fmtDelta(d: number | null | undefined, format: Format): string {
  if (!isNum(d)) return DASH
  switch (format) {
    case 'pct':
    case 'pct0':
    case 'pts':
    case 'deltaPct':
      return fmt(d, 'pts')
    case 'pct2':
    case 'pts2':
      return fmt(d, 'pts2')
    case 'deltaDays':
      return fmt(d, 'deltaDays')
    case 'moneyM':
      // A difference of rounded amounts under the step says only that it is under $0.1M.
      return Math.abs(d) < COST_STEP ? UNDER_COST_STEP : withSign(d, fmt(Math.abs(d), 'moneyM'))
  }
  return withSign(d, fmt(Math.abs(d), format))
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
    case 'pts2':
      return '+0.00%;"−"0.00%;0.00%'
    case 'deltaPct':
      return '+0.0%;"−"0.0%;"±"0%'
    case 'deltaDays':
      return '+#,##0" d";"−"#,##0" d";"±"0" d"'
    case 'money':
    case 'moneyFull':
      return '"$"#,##0'
    case 'moneyM':
      // In millions to one decimal; an amount under the step is written as the words, not 0.
      return '"$"#,##0.0,,"M";"−$"#,##0.0,,"M"'
    case 'days':
      return '#,##0'
    case 'date':
      return 'd mmm yyyy'
    default:
      return undefined
  }
}
