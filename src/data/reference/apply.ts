/**
 * Apply reference mappings to the loaded datasets. Pure: returns new datasets (the input itself
 * when nothing changes) and how many rows each mapping and each field changed.
 *
 * Mappings apply in the order they were made, so a rename followed by a move of the new name
 * works as written. A mapping that would put a value outside a fixed list (a level that is not
 * L1-E3, a stage that is not a stage) is skipped and reported.
 */
import type { FieldRef } from '../quality/fieldRef'
import { parseFieldRef } from '../quality/fieldRef'
import type { DatasetKey, Datasets } from '../schema'
import { categoryOf } from './categories'
import type { AppliedReference, NewReferenceMapping, ReferenceMapping } from './types'

type Row = Record<string, unknown>

/** Why a mapping can't be applied, or null when it is fine. */
export function validateMapping(m: ReferenceMapping | NewReferenceMapping): string | null {
  const blank = (s: unknown) => typeof s !== 'string' || !s.trim()
  switch (m.kind) {
    case 'move-department':
      if (blank(m.department)) return 'Choose a department.'
      if (blank(m.to)) return 'Choose a business unit.'
      if (m.from != null && m.from === m.to) return 'The department is already under that business unit.'
      return null
    case 'move-family':
      if (blank(m.jobFamily)) return 'Choose a job family.'
      if (blank(m.to)) return 'Choose a job function.'
      if (m.from != null && m.from === m.to) return 'The job family is already under that function.'
      return null
    case 'merge':
    case 'rename': {
      if (!parseFieldRef(m.ref)) return `${m.ref} is not a field Census knows.`
      const cat = categoryOf(m.ref)
      if (!cat) return 'Only categorical fields can be merged or renamed.'
      if (blank(m.to)) return 'Enter the value to use.'
      const from = (m.from ?? []).filter((v) => !blank(v))
      if (!from.length) return 'Choose at least one value to replace.'
      if (from.every((v) => v === m.to)) return 'Nothing would change.'
      if (cat.strict && cat.vocab && !cat.vocab.includes(m.to))
        return `${cat.label} must be one of ${cat.vocab.join(', ')}.`
      return null
    }
  }
}

/** The fields a mapping writes to, for counting changes. */
export function targetRefs(m: ReferenceMapping): FieldRef[] {
  switch (m.kind) {
    case 'move-department':
      return ['employees.businessUnit', 'requisitions.businessUnit']
    case 'move-family':
      return ['employees.jobFunction']
    default:
      return (m.scope ?? 'category') === 'field' ? [m.ref] : (categoryOf(m.ref)?.refs ?? [m.ref])
  }
}

class Working {
  readonly copies = new Map<DatasetKey, Row[]>()
  /** Rows already copied, per dataset. */
  private readonly owned = new Map<DatasetKey, Set<number>>()
  constructor(readonly input: Datasets) {}

  rows(key: DatasetKey): readonly Row[] {
    return this.copies.get(key) ?? (this.input[key] as unknown as Row[])
  }

  set(key: DatasetKey, i: number, field: string, value: unknown): void {
    let arr = this.copies.get(key)
    if (!arr) {
      arr = (this.input[key] as unknown as Row[]).slice()
      this.copies.set(key, arr)
    }
    let owned = this.owned.get(key)
    if (!owned) {
      owned = new Set()
      this.owned.set(key, owned)
    }
    if (!owned.has(i)) {
      arr[i] = { ...arr[i] }
      owned.add(i)
    }
    arr[i][field] = value
  }
}

/**
 * Apply one mapping; returns the number of rows it changed. A row counts once even when two of
 * its fields change (a job change's from and to department in one rename).
 */
function applyOne(w: Working, m: ReferenceMapping): number {
  const changed = new Map<DatasetKey, Set<number>>()
  const count = () => [...changed.values()].reduce((s, rows) => s + rows.size, 0)
  const write = (key: DatasetKey, field: string, test: (r: Row) => boolean, value: string) => {
    w.rows(key).forEach((r, i) => {
      if (r[field] === value || !test(r)) return
      w.set(key, i, field, value)
      let rows = changed.get(key)
      if (!rows) {
        rows = new Set()
        changed.set(key, rows)
      }
      rows.add(i)
    })
  }
  switch (m.kind) {
    case 'move-department': {
      const test = (r: Row) => r.department === m.department && (m.from == null || r.businessUnit === m.from)
      write('employees', 'businessUnit', test, m.to)
      write('requisitions', 'businessUnit', test, m.to)
      return count()
    }
    case 'move-family': {
      const test = (r: Row) =>
        r.jobFamily === m.jobFamily && (m.from == null || (r.jobFunction ?? null) === m.from)
      write('employees', 'jobFunction', test, m.to)
      return count()
    }
    default: {
      const from = new Set(m.from)
      for (const ref of targetRefs(m)) {
        const p = parseFieldRef(ref)
        if (!p) continue
        write(
          p.dataset,
          p.field,
          (r) => typeof r[p.field] === 'string' && from.has(r[p.field] as string),
          m.to,
        )
      }
      return count()
    }
  }
}

export function applyReferenceMappings(
  datasets: Datasets,
  mappings: readonly ReferenceMapping[],
): AppliedReference {
  const base: AppliedReference = {
    datasets,
    mappings,
    changes: {},
    rows: {},
    by: {},
    perMapping: {},
    skipped: [],
    total: 0,
  }
  if (!mappings.length) return base
  const w = new Working(datasets)
  const touched = new Map<FieldRef, string | null>()
  for (const m of mappings) {
    const err = validateMapping(m)
    if (err) {
      base.skipped.push({ id: m.id, reason: err })
      continue
    }
    base.perMapping[m.id] = applyOne(w, m)
    for (const ref of targetRefs(m)) touched.set(ref, m.by ?? null)
  }
  if (!w.copies.size) return base

  // Count rows whose final value differs from the input, so a rename and its reverse cancel out.
  const out = { ...datasets } as unknown as Record<DatasetKey, Row[]>
  for (const [key, arr] of w.copies) out[key] = arr
  for (const [ref, by] of touched) {
    const p = parseFieldRef(ref)
    if (!p) continue
    const after = w.copies.get(p.dataset)
    if (!after) continue
    const before = datasets[p.dataset] as unknown as Row[]
    const rows: number[] = []
    for (let i = 0; i < before.length; i++)
      if (after[i] !== before[i] && after[i][p.field] !== before[i][p.field]) rows.push(i)
    if (!rows.length) continue
    base.changes[ref] = rows.length
    base.rows[ref] = rows
    base.by[ref] = by
    base.total += rows.length
  }
  if (!base.total) return base
  return { ...base, datasets: out as unknown as Datasets }
}
