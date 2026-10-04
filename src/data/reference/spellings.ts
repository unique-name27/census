/**
 * The raw spellings of an uploaded sheet's categorical columns and what the importer read each
 * one as, for the category lists ("DV" and "Design verif." were both read as Design
 * Verification). Kept apart from the rest of the reference module because it runs the
 * importer's normalizers.
 */
import { coerceValue } from '../import/normalize'
import { displayValue, isBlank, normText } from '../import/text'
import type { ApplyOptions, ParsedSheet } from '../import/types'
import type { FieldRef } from '../quality/fieldRef'
import type { VersionMapping } from '../quality/types'
import { type DatasetKey, datasetDef } from '../schema'
import { categoryOf } from './categories'
import type { RawSpelling } from './infer'

/** Distinct raw values per categorical field of a stored sheet, most frequent first. */
export function rawSpellings(
  dataset: DatasetKey,
  sheet: ParsedSheet,
  mapping: VersionMapping,
  options?: ApplyOptions | null,
  limit = 200,
): Partial<Record<FieldRef, RawSpelling[]>> {
  const def = datasetDef(dataset)
  const out: Partial<Record<FieldRef, RawSpelling[]>> = {}
  const headers = new Set(sheet.headers)
  for (const field of def.fields) {
    const ref = `${dataset}.${field.key}` as FieldRef
    if (!categoryOf(ref)) continue
    const header = mapping[field.key]?.header
    if (!header || !headers.has(header)) continue
    const groups = new Map<string, { raw: string; count: number; sample: unknown }>()
    for (const r of sheet.rows) {
      const v = r[header]
      if (isBlank(v)) continue
      const raw = displayValue(v)
      const key = normText(v)
      const g = groups.get(key)
      if (g) g.count++
      else groups.set(key, { raw, count: 1, sample: v })
    }
    const settings = {
      dateOrder: 'MDY' as const,
      percentWhole: false,
      valueMap: options?.valueMaps?.[field.key],
    }
    out[ref] = [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((g) => {
        const c = coerceValue(dataset, field, g.sample, settings)
        return { raw: g.raw, value: c.value == null ? null : String(c.value), count: g.count }
      })
  }
  return out
}
