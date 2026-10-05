/**
 * Which category values Ask may send (docs/ASK.md, Allowlist). Columns the spec treats as
 * categories (termination reason, rejection reason, survey reason, course, case subcategory ...)
 * are often free text in uploaded HR data, and free text can name someone or hold health details:
 * "Left to care for her mother after a cancer diagnosis". Such a value belongs to one person.
 *
 * So a category value goes to Claude only when it is on the field's official list (the built-in
 * vocabulary, or the user's official lists from Settings), or when at least the anonymity minimum
 * of people share it in the loaded data. Every other value is sent as one stand-in value with a
 * count. Org structure (business unit, department, location, country, level) goes as it is: it is
 * the filter vocabulary every view shows, and a person's name typed into it is caught by the name
 * scan in `privacy.ts`.
 */
import type { AnalyticsContext } from '@/data/context'
import { vocabOf } from '@/data/quality/vocab'
import type { DatasetKey } from '@/data/schema'
import { minGroupOf } from '@/metrics/privacy'
import type { Joins, QueryDataset, QueryField, Row } from './allowlist'

/** Stands in for values off the official list that fewer than `min` people share. */
export const NOT_OFFICIAL = (min: number): string => `Not on the official list (each under ${min} people)`
/** Stands in for rare values of a field with no official list. */
export const RARE_VALUES = (min: number): string => `Other values (each under ${min} people)`

/** Org structure: sent as it is. */
const STRUCTURE: ReadonlySet<string> = new Set([
  'businessUnit',
  'department',
  'location',
  'country',
  'level',
  'fromDepartment',
  'toDepartment',
  'fromLevel',
  'toLevel',
])

type Ctx = Pick<AnalyticsContext, 'all' | 'quality' | 'metrics'>

/** A field's official values (the user's official list when there is one), or undefined when it has none. */
export function officialValues(
  ctx: Pick<AnalyticsContext, 'quality'>,
  ref: string,
): ReadonlySet<string> | undefined {
  return ctx.quality.vocab?.refs.get(ref) ?? vocabOf(ref)
}

/** Does a field's value need checking before it is sent? Org structure and fields of datasets about no one do not. */
export const checksValues = (d: QueryDataset, f: QueryField): boolean =>
  f.kind === 'category' && !!d.person && !STRUCTURE.has(f.name) && !f.name.startsWith('org.')

const shared = new WeakMap<object, Map<string, ReadonlySet<string>>>()

/** Values of a field that at least the anonymity minimum of people share in the loaded data. */
export function sharedValues(ctx: Ctx, d: QueryDataset, f: QueryField, j: Joins): ReadonlySet<string> {
  const rows = ctx.all[d.key as DatasetKey] as unknown as Row[]
  const min = minGroupOf(ctx.metrics)
  let byField = shared.get(rows)
  if (!byField) {
    byField = new Map()
    shared.set(rows, byField)
  }
  const key = `${f.name}|${min}`
  let out = byField.get(key)
  if (!out) {
    const people = new Map<string, Set<string>>()
    rows.forEach((r, i) => {
      const v = f.get(r, j)
      if (typeof v !== 'string' || !v) return
      const who = d.person?.(r, j) ?? `row:${i}`
      const set = people.get(v)
      if (set) set.add(who)
      else people.set(v, new Set([who]))
    })
    out = new Set([...people].filter(([, s]) => s.size >= min).map(([v]) => v))
    byField.set(key, out)
  }
  return out
}

/**
 * The value of a category field as Ask sends it: the value itself when it is official, org
 * structure or shared by enough people; otherwise the stand-in. Identity for other fields.
 */
export function valueMapFor(ctx: Ctx, d: QueryDataset, f: QueryField, j: Joins): (v: unknown) => unknown {
  if (!checksValues(d, f)) return (v) => v
  const official = officialValues(ctx, `${d.key}.${f.name}`)
  const common = sharedValues(ctx, d, f, j)
  const min = minGroupOf(ctx.metrics)
  const standIn = official ? NOT_OFFICIAL(min) : RARE_VALUES(min)
  return (v) => (typeof v !== 'string' || !v || official?.has(v) || common.has(v) ? v : standIn)
}
