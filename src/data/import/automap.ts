/**
 * Confidence-scored column mapping.
 *
 * Every (field, header) pair is scored on the header's words against the field's label, key and
 * synonyms, then adjusted by what the column's values look like. Pairs are assigned strongest
 * first, one header per field and one field per header, so a weak early match can never steal a
 * column that strongly belongs to a later field.
 *
 * Scale: 1.0 exact name · 0.92 same words in another order or spelling · 0.62-0.9 partial match
 * · ±0.4 from values. Matches below 0.5 are dropped. High ≥ 0.85, medium ≥ 0.65, else low.
 */
import { median } from '@/lib/stats'
import type { DatasetDef, DatasetKey, FieldDef } from '../schema'
import { readNumber } from './numbers'
import { type ColumnProfile, profileColumn, vocabularyHit } from './sniff'
import { EXTRA_SYNONYMS } from './synonyms'
import { headerTokens, normalizeHeader } from './text'
import type { Confidence, HeaderCandidate, Mapping } from './types'

export const MIN_SCORE = 0.5
export const confidenceOf = (score: number): Confidence =>
  score >= 0.85 ? 'high' : score >= 0.65 ? 'medium' : 'low'

const wordSet = (list: string) => new Set(list.trim().split(/\s+/))

/** Words that say little on their own; they can't carry a partial match by themselves. */
const GENERIC = wordSet(`
  id name type status date number code level category group reason value amount pct total current
  flag description title time year hour count rate information detail data primary main text
  indicator
`)

/** Words that point a header at a different person or measure ("Manager name" is not the name). */
const QUALIFIERS = wordSet(`
  manager supervisor hiring candidate requester reviewer incumbent successor recruiter coordinator
  prior previous old from to new next last first target market minimum maximum midpoint bonus
  equity termination hire offer rejection response resolution pre calibration cost parent second
  backup assistant spouse emergency dependent
`)

/** Words that state a value's type; a header missing the field's type word is a weaker match. */
const TYPE_MARKERS = new Set(['date', 'id', 'pct', 'hour', 'number', 'amount'])

const weight = (t: string) => (GENERIC.has(t) ? 0.5 : 1)
const sum = (ts: readonly string[]) => ts.reduce((a, t) => a + weight(t), 0)

interface Phrase {
  text: string
  tokens: string[]
  seq: string
  sorted: string
  compact: string
  kind: 'label' | 'key' | 'synonym'
  /** Three characters or fewer ("bu", "cc", "id"): exact matches only. */
  short: boolean
}

interface HeaderInfo {
  raw: string
  index: number
  norm: string
  tokens: string[]
  set: Set<string>
  seq: string
  sorted: string
  compact: string
}

function phrase(text: string, kind: Phrase['kind']): Phrase | null {
  const tokens = headerTokens(text)
  if (!tokens.length) return null
  return {
    text,
    tokens,
    seq: tokens.join(' '),
    sorted: [...tokens].sort().join(' '),
    compact: tokens.join(''),
    kind,
    short: normalizeHeader(text).replace(/\s/g, '').length <= 3,
  }
}

const phraseCache = new Map<string, Phrase[]>()

function fieldPhrases(dataset: DatasetKey, field: FieldDef): Phrase[] {
  const cacheKey = `${dataset}.${field.key}`
  const hit = phraseCache.get(cacheKey)
  if (hit) return hit
  const list = [
    phrase(field.label, 'label'),
    phrase(field.key, 'key'),
    ...field.synonyms.map((s) => phrase(s, 'synonym')),
    ...(EXTRA_SYNONYMS[dataset]?.[field.key] ?? []).map((s) => phrase(s, 'synonym')),
  ].filter((p): p is Phrase => p != null)
  const seen = new Set<string>()
  const out: Phrase[] = []
  for (const p of list) {
    const id = `${p.kind}:${p.seq}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(p)
  }
  phraseCache.set(cacheKey, out)
  return out
}

function headerInfo(raw: string, index: number): HeaderInfo {
  const tokens = headerTokens(raw)
  return {
    raw,
    index,
    norm: normalizeHeader(raw),
    tokens,
    set: new Set(tokens),
    seq: tokens.join(' '),
    sorted: [...tokens].sort().join(' '),
    compact: tokens.join(''),
  }
}

interface NameMatch {
  score: number
  phrase: Phrase
  how: 'exact' | 'equal' | 'partial'
}

function matchPhrase(h: HeaderInfo, p: Phrase): NameMatch | null {
  if (!h.tokens.length) return null
  if (h.seq === p.seq) {
    const single = p.tokens.length === 1 && GENERIC.has(p.tokens[0])
    const score = p.kind === 'synonym' ? (single ? 0.94 : 0.98) : 1
    return { score, phrase: p, how: 'exact' }
  }
  if (h.compact === p.compact || h.sorted === p.sorted) return { score: 0.92, phrase: p, how: 'equal' }
  if (p.short) return null
  const overlap = p.tokens.filter((t) => h.set.has(t))
  // A partial match needs a shared content word ("salary"), or every non-generic word of the
  // phrase ("termination" for "termination type"). Sharing only "last" or "first" is not enough.
  const content = p.tokens.filter((t) => !GENERIC.has(t))
  const sharesCore = overlap.some((t) => !GENERIC.has(t) && !QUALIFIERS.has(t))
  const coversContent = content.length > 0 && content.every((t) => h.set.has(t))
  if (!sharesCore && !coversContent) return null
  const w = sum(overlap)
  const coverage = w / sum(p.tokens)
  const precision = w / sum(h.tokens)
  let score = coverage >= 1 ? 0.62 + 0.28 * precision : 0.3 + 0.45 * coverage * precision
  if (h.tokens.some((t) => QUALIFIERS.has(t) && !p.tokens.includes(t))) score *= 0.6
  if (p.tokens.some((t) => TYPE_MARKERS.has(t) && !h.set.has(t))) score *= 0.7
  return { score, phrase: p, how: 'partial' }
}

function bestName(dataset: DatasetKey, field: FieldDef, h: HeaderInfo): NameMatch | null {
  let best: NameMatch | null = null
  for (const p of fieldPhrases(dataset, field)) {
    const m = matchPhrase(h, p)
    if (m && (!best || m.score > best.score)) best = m
  }
  return best
}

/** Fields whose ID column may hold names instead (resolved against the roster later). */
const acceptsNames = (field: FieldDef) => /managerid$|reviewerid$/i.test(field.key)

/** Score change from the column's values, with a short note for the reason line. */
function shapeAdjust(
  dataset: DatasetKey,
  field: FieldDef,
  p: ColumnProfile,
): { delta: number; note: string | null } {
  if (p.n < 3) return { delta: 0, note: null }
  switch (field.type) {
    case 'date':
    case 'datetime':
      if (p.dateShare >= 0.8) return { delta: 0.05, note: 'values are dates' }
      if (p.dateShare < 0.3) return { delta: -0.4, note: "values don't look like dates" }
      return { delta: 0, note: null }
    case 'number':
    case 'money':
    case 'percent': {
      const isRating = dataset === 'reviews' && /rating/i.test(field.key)
      if (isRating && p.letterShare >= 0.5) return { delta: 0, note: null }
      if (p.numShare < 0.3) return { delta: -0.35, note: "values aren't numbers" }
      if (p.numShare < 0.8) return { delta: 0, note: null }
      const nums = p.values
        .map((v) => readNumber(v, true).value)
        .filter((n): n is number => n != null && Number.isFinite(n))
      const mid = median(nums.map(Math.abs)) ?? 0
      if (field.type === 'percent' && mid >= 1000) return { delta: -0.25, note: 'values look like amounts' }
      if (field.type === 'money' && nums.length && nums.every((n) => Math.abs(n) <= 1.5))
        return { delta: -0.25, note: 'values look like percentages' }
      return { delta: 0.04, note: 'values are numbers' }
    }
    case 'id':
      if (p.dateShare >= 0.8) return { delta: -0.4, note: 'values are dates' }
      if (p.idShare >= 0.7 || p.emailShare >= 0.8) return { delta: 0.03, note: 'values look like IDs' }
      if (p.wordyShare >= 0.6 && !acceptsNames(field))
        return { delta: -0.2, note: 'values look like names, not IDs' }
      return { delta: 0, note: null }
    case 'enum':
    case 'level':
    case 'boolean': {
      const hit = vocabularyHit(dataset, field, p)
      if (hit >= 0.6) return { delta: 0.06, note: 'values match the allowed list' }
      if (hit < 0.2) return { delta: -0.3, note: "values don't match the allowed list" }
      return { delta: 0, note: null }
    }
    case 'string':
      if (p.dateShare >= 0.8) return { delta: -0.3, note: 'values are dates' }
      if (p.emailShare >= 0.8 && /name|title/i.test(field.key))
        return { delta: -0.25, note: 'values are email addresses' }
      return { delta: 0, note: null }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function describe(m: NameMatch, note: string | null): string {
  const base =
    m.how === 'exact'
      ? m.phrase.kind === 'synonym'
        ? `matches the name "${m.phrase.text}"`
        : 'header matches the field name'
      : m.how === 'equal'
        ? `same words as "${m.phrase.text}"`
        : `close to "${m.phrase.text}"`
  return cap(note ? `${base}; ${note}` : base)
}

interface Candidate {
  fieldIndex: number
  headerIndex: number
  score: number
  reason: string
}

/** Score one (field, header) pair; null when it is not a plausible match. */
function scorePair(
  dataset: DatasetKey,
  field: FieldDef,
  h: HeaderInfo,
  profile: ColumnProfile | undefined,
): { score: number; reason: string } | null {
  const name = bestName(dataset, field, h)
  if (name) {
    const adj = profile ? shapeAdjust(dataset, field, profile) : { delta: 0, note: null }
    const score = Math.max(0, Math.min(1, name.score + adj.delta))
    return { score, reason: describe(name, adj.note) }
  }
  return null
}

/**
 * A column the header doesn't name but whose values clearly come from the field's list (a
 * "Disposition" column holding Hired/Rejected). Only for low-cardinality text columns.
 */
function contentOnly(
  dataset: DatasetKey,
  field: FieldDef,
  profile: ColumnProfile | undefined,
): { score: number; reason: string } | null {
  if (!profile || profile.n < 5 || profile.letterShare < 0.8 || profile.distinct > 20) return null
  if (field.type !== 'enum' && field.type !== 'level') return null
  const hit = vocabularyHit(dataset, field, profile)
  return hit >= 0.8 ? { score: 0.45 + 0.1 * hit, reason: 'Values match the allowed list' } : null
}

export function profileColumns(
  headers: readonly string[],
  rows: readonly Record<string, unknown>[],
): Map<string, ColumnProfile> {
  return new Map(headers.map((h) => [h, profileColumn(h, rows)]))
}

/** Auto-map with column profiles already computed (shared across datasets by `guessDataset`). */
export function autoMapProfiled(
  headers: readonly string[],
  profiles: ReadonlyMap<string, ColumnProfile>,
  def: DatasetDef,
  learned?: Record<string, string>,
): Mapping {
  const infos = headers.map(headerInfo)
  const fields = def.fields
  const mapping: Mapping = {}
  const usedHeaders = new Set<number>()
  const usedFields = new Set<number>()

  if (learned) {
    for (const h of infos) {
      const key = learned[h.norm]
      const fi = fields.findIndex((f) => f.key === key)
      if (fi < 0 || usedFields.has(fi) || usedHeaders.has(h.index)) continue
      mapping[fields[fi].key] = {
        header: h.raw,
        confidence: 'high',
        score: 1,
        reason: 'You chose this column before',
      }
      usedFields.add(fi)
      usedHeaders.add(h.index)
    }
  }

  const candidates: Candidate[] = []
  const named = new Set<number>()
  fields.forEach((field, fi) => {
    if (usedFields.has(fi)) return
    for (const h of infos) {
      if (usedHeaders.has(h.index)) continue
      const s = scorePair(def.key, field, h, profiles.get(h.raw))
      if (s && s.score >= MIN_SCORE) {
        candidates.push({ fieldIndex: fi, headerIndex: h.index, ...s })
        named.add(h.index)
      }
    }
  })
  fields.forEach((field, fi) => {
    if (usedFields.has(fi)) return
    for (const h of infos) {
      if (usedHeaders.has(h.index) || named.has(h.index)) continue
      const s = contentOnly(def.key, field, profiles.get(h.raw))
      if (s) candidates.push({ fieldIndex: fi, headerIndex: h.index, ...s })
    }
  })

  candidates.sort((a, b) => b.score - a.score || a.fieldIndex - b.fieldIndex || a.headerIndex - b.headerIndex)
  for (const c of candidates) {
    if (usedFields.has(c.fieldIndex) || usedHeaders.has(c.headerIndex)) continue
    const score = Math.round(c.score * 100) / 100
    mapping[fields[c.fieldIndex].key] = {
      header: infos[c.headerIndex].raw,
      confidence: confidenceOf(score),
      score,
      reason: c.reason,
    }
    usedFields.add(c.fieldIndex)
    usedHeaders.add(c.headerIndex)
  }

  for (const f of fields)
    mapping[f.key] ??= { header: null, confidence: 'low', score: 0, reason: 'No matching column' }
  return mapping
}

/**
 * Map a sheet's columns to a dataset's fields.
 *
 * @param headers     the sheet's headers
 * @param sampleRows  the sheet's rows (up to 50 values per column are sampled)
 * @param def         the dataset definition from `DATASETS`
 * @param learned     normalized header → field key picks the user made before; applied first
 */
export function autoMap(
  headers: readonly string[],
  sampleRows: readonly Record<string, unknown>[],
  def: DatasetDef,
  learned?: Record<string, string>,
): Mapping {
  return autoMapProfiled(headers, profileColumns(headers, sampleRows), def, learned)
}

/** Every plausible column for one field, best first, for the mapping dropdown. */
export function rankHeaders(
  headers: readonly string[],
  sampleRows: readonly Record<string, unknown>[],
  def: DatasetDef,
  fieldKey: string,
): HeaderCandidate[] {
  const field = def.fields.find((f) => f.key === fieldKey)
  if (!field) return []
  const out: HeaderCandidate[] = []
  headers.forEach((raw, i) => {
    const h = headerInfo(raw, i)
    const profile = profileColumn(raw, sampleRows)
    const s = scorePair(def.key, field, h, profile) ?? contentOnly(def.key, field, profile)
    if (s && s.score >= 0.3) {
      const score = Math.round(s.score * 100) / 100
      out.push({ header: raw, score, confidence: confidenceOf(score), reason: s.reason })
    }
  })
  return out.sort((a, b) => b.score - a.score)
}

/**
 * The mapping with one field set by the user. The column is released from any other field it
 * was mapped to, so one column never feeds two fields.
 */
export function withChoice(mapping: Mapping, fieldKey: string, header: string | null): Mapping {
  const next: Mapping = {}
  for (const [k, m] of Object.entries(mapping)) {
    next[k] =
      header != null && k !== fieldKey && m.header === header
        ? { header: null, confidence: 'low', score: 0, reason: 'No matching column' }
        : m
  }
  next[fieldKey] =
    header == null
      ? { header: null, confidence: 'low', score: 0, reason: 'Left unmapped by you' }
      : { header, confidence: 'high', score: 1, reason: 'Chosen by you' }
  return next
}
