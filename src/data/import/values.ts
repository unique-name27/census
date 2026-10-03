/**
 * Distinct values of a mapped column with what the importer will turn them into: the data for
 * the Data room's "check the values" grid, where the user can correct an unrecognized stage or
 * status (saved as `ApplyOptions.valueMaps`).
 */
import type { DatasetDef } from '../schema'
import { coerceValue } from './normalize'
import { displayValue, isBlank, normText } from './text'
import type { ParsedSheet } from './types'

export interface ValueSummary {
  /** The value as it appears in the file (first spelling seen). */
  raw: string
  /** Normalized text: the key to use in `ApplyOptions.valueMaps[field]`. */
  key: string
  count: number
  /** What the importer reads it as, or null when it is not recognized. */
  value: string | null
  recognized: boolean
}

/** Up to `limit` distinct values of `header` for an enum, level or yes/no field, most frequent first. */
export function summarizeValues(
  sheet: ParsedSheet,
  header: string,
  def: DatasetDef,
  fieldKey: string,
  limit = 60,
): ValueSummary[] {
  const field = def.fields.find((f) => f.key === fieldKey)
  if (!field) return []
  const groups = new Map<string, { raw: string; count: number; sample: unknown }>()
  for (const r of sheet.rows) {
    const v = r[header]
    if (isBlank(v)) continue
    const key = normText(v)
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { raw: displayValue(v), count: 1, sample: v })
  }
  const settings = { dateOrder: 'MDY' as const, percentWhole: false }
  return [...groups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([key, g]) => {
      const c = coerceValue(def.key, field, g.sample, settings)
      const value = c.value == null ? null : String(c.value)
      return { raw: g.raw, key, count: g.count, value, recognized: value != null }
    })
}
