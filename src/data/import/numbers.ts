/**
 * Number reading for imports: currency symbols and codes, thousands separators in US or
 * European style, accounting negatives "(1,234)", percent signs and k/m suffixes on amounts.
 */

const SPACES = /[\s']/g
const SYMBOLS = /(?:US\$|C\$|CA\$|A\$|NT\$|S\$|HK\$|R\$|[$€£¥₹₩₪₫฿₱₺₽])/gi
const CODES =
  /(?<![a-z])(?:USD|EUR|GBP|CAD|INR|TWD|NTD|CNY|RMB|ILS|NIS|VND|JPY|AUD|SGD|HKD|CHF|SEK|NOK|DKK|KRW|MXN|BRL|PLN|CZK|MYR|PHP|THB)(?![a-z])/gi

export interface NumberRead {
  value: number | null
  /** The text carried a percent sign. */
  percent: boolean
}

/** Pick the decimal separator from the text's own punctuation. */
function unifySeparators(s: string): string | null {
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  if (dots && commas) {
    // The separator that comes last is the decimal one: 1,234.56 or 1.234,56.
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  }
  if (commas) {
    // 12,500 and 1,250,000 are thousands, 9,80,000 is Indian lakh grouping; 12,5 is a decimal comma.
    if (/^-?\d{1,3}(?:,\d{3})+$/.test(s) || /^-?\d{1,2}(?:,\d{2})+,\d{3}$/.test(s)) return s.replace(/,/g, '')
    if (commas === 1) return s.replace(',', '.')
    return null
  }
  if (dots > 1) return /^-?\d{1,3}(?:\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : null
  return s
}

/**
 * Read a number from a cell. `amount` allows k/m/b suffixes ("120k", "1.2M"). Blank-like
 * values return null without being an error; anything unreadable returns NaN.
 */
export function readNumber(v: unknown, amount = false): NumberRead {
  if (v == null) return { value: null, percent: false }
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : Number.NaN, percent: false }
  if (typeof v !== 'string') return { value: Number.NaN, percent: false }
  let s = v.trim()
  if (!s) return { value: null, percent: false }
  let negative = false
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) {
    negative = true
    s = paren[1]
  }
  const percent = s.includes('%')
  s = s.replace(/%/g, '').replace(SYMBOLS, '').replace(CODES, '').replace(SPACES, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.endsWith('-')) {
    negative = !negative
    s = s.slice(0, -1)
  } else if (s.startsWith('+')) s = s.slice(1)
  let scale = 1
  if (amount) {
    const suffix = /^(.*?)(k|m|mm|mn|b|bn)$/i.exec(s)
    if (suffix) {
      const unit = suffix[2].toLowerCase()
      scale = unit === 'k' ? 1e3 : unit.startsWith('b') ? 1e9 : 1e6
      s = suffix[1]
    }
  }
  if (!s) return { value: Number.NaN, percent }
  const unified = unifySeparators(s)
  if (unified == null || !/^(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(unified))
    return { value: Number.NaN, percent }
  const n = Number(unified) * scale
  return { value: negative ? -n : n, percent }
}

/** True when the value reads as a number (money and percent text included). */
export function looksNumeric(v: unknown): boolean {
  const r = readNumber(v, true)
  return r.value != null && Number.isFinite(r.value)
}
