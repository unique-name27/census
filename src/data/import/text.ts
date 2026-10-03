/**
 * Text normalization for headers and cell values.
 *
 * Headers are compared as canonical word lists: lowercase, punctuation removed, abbreviations
 * expanded ("Emp #" → employee number) and plurals folded, so "Date Hired", "hired_date" and
 * "HiredDate" all compare equal. Matching is always by whole word, never by substring.
 */

/** Lowercase, split camelCase, punctuation to spaces; "%" → pct, "#" → number, "&" → and. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/%/g, ' pct ')
    .replace(/#/g, ' number ')
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Normalized cell text for vocabulary lookups: lowercase, accents and punctuation removed, "&" → and. */
export function normText(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}+<]+/gu, ' ')
    .trim()
}

const STOPWORDS = new Set('of the a an for in by and or is was s per with at on'.split(' '))

/** Abbreviations and spelling variants folded to one canonical word. */
const CANON: Record<string, string> = {
  emp: 'employee',
  empl: 'employee',
  ee: 'employee',
  mgr: 'manager',
  mngr: 'manager',
  dept: 'department',
  no: 'number',
  num: 'number',
  nbr: 'number',
  nr: 'number',
  percent: 'pct',
  percentage: 'pct',
  perc: 'pct',
  identifier: 'id',
  dt: 'date',
  yr: 'year',
  hrs: 'hour',
  amt: 'amount',
  req: 'requisition',
  org: 'organization',
  organisation: 'organization',
  loc: 'location',
  sr: 'senior',
  snr: 'senior',
  jr: 'junior',
  min: 'minimum',
  max: 'maximum',
  mid: 'midpoint',
  comp: 'compensation',
  mgmt: 'management',
  perf: 'performance',
  eff: 'effective',
  term: 'termination',
  lvl: 'level',
  ccy: 'currency',
  curr: 'currency',
  centre: 'center',
  cntry: 'country',
  ctry: 'country',
  desc: 'description',
}

function stripPlural(t: string): string {
  return t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t) ? t.slice(0, -1) : t
}

function canonToken(t: string): string {
  return CANON[t] ?? CANON[stripPlural(t)] ?? stripPlural(t)
}

/**
 * Canonical words of a header or synonym, in order, without stopwords. A trailing "at" or "on"
 * ("Applied At", "Hired On") reads as "date".
 */
export function headerTokens(h: unknown): string[] {
  const raw = normalizeHeader(h).split(' ').filter(Boolean)
  const out: string[] = []
  raw.forEach((t, i) => {
    if ((t === 'at' || t === 'on') && i === raw.length - 1 && raw.length > 1) out.push('date')
    else if (!STOPWORDS.has(t)) out.push(canonToken(t))
  })
  return out
}

/** Display text for a raw cell value in issue logs and previews. */
export function displayValue(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date)
    return Number.isNaN(v.getTime())
      ? ''
      : v.toISOString().slice(0, 16).replace('T00:00', '').replace('T', ' ')
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v).trim()
}

const BLANK = /^(?:|-|--|—|–|n\/?a|null|nil|none|#n\/a|\(blank\)|not applicable)$/i

/** Empty cell, or a placeholder people type for "no value". */
export function isBlank(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'number') return Number.isNaN(v)
  if (v instanceof Date) return Number.isNaN(v.getTime())
  return typeof v === 'string' && BLANK.test(v.trim())
}
