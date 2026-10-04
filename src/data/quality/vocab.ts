/**
 * Known vocabularies per field: a filled value outside its field's list is "not recognized" and
 * counts against the field's tier. Enum and level fields take their lists from the schema; a few
 * free-text fields that the views group by have a canonical list too (case categories, channels,
 * candidate sources, learning categories, exit reasons). Work sites are not checked: every
 * company has its own.
 *
 * Official lists (Settings > Official lists, `src/data/lists`) add to this: an official list hands
 * the quality index a `VocabOverlay`, whose values replace a field's list here (and give a list to
 * fields that have none, such as departments and work sites).
 */
import {
  CASE_CATEGORIES,
  CASE_CHANNELS,
  DATASETS,
  INVOLUNTARY_REASONS,
  LEARNING_CATEGORIES,
  LEVELS,
  SOURCES,
  VOLUNTARY_REASONS,
} from '../schema'
import type { FieldRef } from './fieldRef'

/** Free-text fields whose values should come from a known list. */
const TEXT_VOCAB: Partial<Record<FieldRef, readonly string[]>> = {
  'cases.category': CASE_CATEGORIES.map((c) => c.category),
  'cases.channel': CASE_CHANNELS,
  'candidates.source': SOURCES,
  'learning.category': LEARNING_CATEGORIES,
  'employees.terminationReason': [...VOLUNTARY_REASONS, ...INVOLUNTARY_REASONS],
}

function build(): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>()
  for (const d of DATASETS)
    for (const f of d.fields) {
      const ref = `${d.key}.${f.key}`
      if (f.type === 'level') out.set(ref, new Set(LEVELS))
      else if (f.type === 'enum' && f.values?.length) out.set(ref, new Set(f.values))
    }
  for (const [ref, values] of Object.entries(TEXT_VOCAB)) out.set(ref, new Set(values))
  return out
}

const VOCAB = build()

/**
 * The official lists in force, by field: a field named here is checked against these values
 * instead of its built-in list. Built once per state of the lists, so the quality index can be
 * reused while they stay the same.
 */
export interface VocabOverlay {
  /** Changes whenever the lists do (for memo keys and debugging). */
  readonly version: string
  readonly refs: ReadonlyMap<string, ReadonlySet<string>>
}

/** The allowed values of a field, or undefined when any value is fine. */
export const vocabOf = (ref: string): ReadonlySet<string> | undefined => VOCAB.get(ref)

/** The allowed values of a field in their canonical order, or null. */
export const vocabList = (ref: string): string[] | null => {
  const v = VOCAB.get(ref)
  return v ? [...v] : null
}

/**
 * A filled value the field's vocabulary does not know: the official list's when the overlay names
 * the field, otherwise the built-in one. Booleans and numbers are never checked.
 */
export function isUnrecognized(ref: string, value: unknown, overlay?: VocabOverlay | null): boolean {
  if (typeof value !== 'string') return false
  const v = overlay?.refs.get(ref) ?? VOCAB.get(ref)
  return !!v && !v.has(value)
}
