/**
 * Columns Census never reads or keeps, whatever the sheet: protected characteristics (gender,
 * ethnicity, age and birth date, nationality, citizenship, religion, disability, veteran status,
 * sexual orientation, marital status), stand-ins for them (graduation year reveals age) and
 * free-text survey comments. They are dropped when the sheet is read, so they never reach the
 * stored raw sheet, the mapping or a dataset. Pure.
 */
import { normalizeHeader } from './text'

/** Header words that mark a protected field wherever they appear ("Primary nationality"). */
const PROTECTED_WORDS = new Set([
  'gender',
  'sex',
  'ethnicity',
  'ethnic',
  'race',
  'nationality',
  'nationalities',
  'citizenship',
  'citizen',
  'birth',
  'birthdate',
  'birthday',
  'dob',
  'religion',
  'religious',
  'disability',
  'disabled',
  'veteran',
  'orientation',
  'marital',
  'pregnancy',
  'pregnant',
])

/** Whole headers that are protected but whose words are also used elsewhere ("age" vs "req age"). */
const PROTECTED_HEADERS = new Set([
  'age',
  'age band',
  'age group',
  'age range',
  'employee age',
  'national origin',
  'country of origin',
  'passport country',
  'passport nationality',
  'lgbtq',
])

/**
 * Stand-ins for a protected characteristic: graduation year reveals age (docs/ANALYSES.md, 2.3).
 * University is read; when it was earned is not.
 */
const PROXY_WORDS = new Set(['graduation', 'graduated'])
const PROXY_HEADERS = new Set([
  'grad year',
  'grad yr',
  'grad date',
  'class of',
  'class year',
  'year graduated',
  'degree year',
  'year of degree',
  'degree date',
  'year of graduation',
])

/** Free-text answers and comments: never imported (survey privacy). */
const COMMENT_WORDS = new Set(['comment', 'comments', 'verbatim', 'verbatims'])
const COMMENT_HEADERS = new Set([
  'open text',
  'free text',
  'open ended',
  'open response',
  'written feedback',
  'text response',
  'free text response',
])

export type DropReason = 'protected' | 'proxy' | 'comment'

/** Why a column is never imported, or null when it may be. */
export function dropReason(header: unknown): DropReason | null {
  const h = normalizeHeader(header)
  if (!h) return null
  const words = h.split(' ')
  // "Sexual orientation", "Gender identity", "Date of birth", "Country of citizenship"
  if (PROTECTED_HEADERS.has(h) || words.some((w) => PROTECTED_WORDS.has(w))) {
    // "Orientation" alone is new-hire orientation, not a protected field.
    if (words.includes('orientation') && !words.includes('sexual')) {
      if (!words.some((w) => w !== 'orientation' && PROTECTED_WORDS.has(w))) return null
    }
    // "Sex" only as its own word: "Essex" or "Sussex" sites never match (words are whole).
    return 'protected'
  }
  if (PROXY_HEADERS.has(h) || words.some((w) => PROXY_WORDS.has(w))) return 'proxy'
  if (COMMENT_HEADERS.has(h) || words.some((w) => COMMENT_WORDS.has(w))) return 'comment'
  return null
}

export interface DroppedColumn {
  header: string
  reason: DropReason
}

/** The columns of a header row that are never imported. */
export function droppedColumns(headers: readonly string[]): DroppedColumn[] {
  const out: DroppedColumn[] = []
  for (const header of headers) {
    const reason = dropReason(header)
    if (reason) out.push({ header, reason })
  }
  return out
}

/** The Data room's reason for leaving out a graduation year. */
export const PROXY_TEXT = 'Graduation year can reveal age, so Census does not read it.'

/** "Gender and Citizenship were left out: Census never imports protected characteristics." */
export function droppedText(dropped: readonly DroppedColumn[]): string | null {
  if (!dropped.length) return null
  const list = (xs: string[]) =>
    xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
  const parts: string[] = []
  const prot = dropped.filter((d) => d.reason === 'protected').map((d) => d.header)
  const proxies = dropped.filter((d) => d.reason === 'proxy').map((d) => d.header)
  const comments = dropped.filter((d) => d.reason === 'comment').map((d) => d.header)
  if (prot.length)
    parts.push(
      `${list(prot)} ${prot.length === 1 ? 'was' : 'were'} left out: Census never imports protected characteristics.`,
    )
  if (proxies.length)
    parts.push(`${list(proxies)} ${proxies.length === 1 ? 'was' : 'were'} left out. ${PROXY_TEXT}`)
  if (comments.length)
    parts.push(
      `${list(comments)} ${comments.length === 1 ? 'was' : 'were'} left out: free-text comments are never imported.`,
    )
  return parts.join(' ')
}
