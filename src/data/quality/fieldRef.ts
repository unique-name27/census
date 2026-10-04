/**
 * Lineage references: `dataset.field`, e.g. 'employees.terminationDate'. KPIs, figures and
 * findings declare the fields they use so their tier can be worked out.
 */
import { DATASET_KEYS, DATASETS, type DatasetKey, type Datasets, type FieldDef } from '../schema'

/** `${dataset}.${field}`; check it at runtime with `isFieldRef`. */
export type FieldRef = `${DatasetKey}.${string}`

/** The exact set of valid references, derived from the record types (for code that wants tsc to check). */
export type KnownFieldRef = {
  [K in DatasetKey]: `${K}.${Extract<keyof Datasets[K][number], string>}`
}[DatasetKey]

const FIELDS = new Map<string, FieldDef>()
for (const d of DATASETS) for (const f of d.fields) FIELDS.set(`${d.key}.${f.key}`, f)

/** Every valid reference, in schema order. */
export const FIELD_REFS: readonly FieldRef[] = [...FIELDS.keys()] as FieldRef[]

/** True when `s` names a dataset and one of its schema fields. */
export function isFieldRef(s: unknown): s is FieldRef {
  return typeof s === 'string' && FIELDS.has(s)
}

/** Dataset and field of a reference, or null when either is not in the schema. */
export function parseFieldRef(ref: string): { dataset: DatasetKey; field: string } | null {
  if (!FIELDS.has(ref)) return null
  const dot = ref.indexOf('.')
  return { dataset: ref.slice(0, dot) as DatasetKey, field: ref.slice(dot + 1) }
}

/** The dataset part of a reference, even when the field is unknown; null when the dataset is unknown. */
export function datasetOfRef(ref: string): DatasetKey | null {
  const k = ref.slice(0, ref.indexOf('.'))
  return (DATASET_KEYS as readonly string[]).includes(k) ? (k as DatasetKey) : null
}

export const fieldRef = (dataset: DatasetKey, field: string): FieldRef => `${dataset}.${field}`

/** Schema definition of the referenced field, or undefined. */
export const fieldDefOf = (ref: string): FieldDef | undefined => FIELDS.get(ref)

/** The references in `refs` that are not in the schema (for lineage tests). */
export const invalidRefs = (refs: readonly string[]): string[] => refs.filter((r) => !FIELDS.has(r))
