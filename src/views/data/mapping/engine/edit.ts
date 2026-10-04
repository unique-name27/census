/**
 * What the edit forms offer (departments with their business units, job families with their
 * functions, the values of a field) and what a change would do before it is made. Pure.
 */
import { type FieldRef, parseFieldRef } from '@/data/quality/fieldRef'
import {
  applyReferenceMappings,
  CATEGORIES,
  type CategoryDef,
  categoryOf,
  type NewReferenceMapping,
  type ReferenceMapping,
  type StructureReport,
  validateMapping,
} from '@/data/reference'
import { type DatasetKey, type Datasets, datasetDef, JOB_FUNCTIONS } from '@/data/schema'

export type EditKind = 'move-department' | 'move-family' | 'merge' | 'rename'

export const EDIT_LABEL: Record<EditKind, string> = {
  'move-department': 'Move a department',
  'move-family': 'Assign a job family',
  merge: 'Merge spellings',
  rename: 'Rename a value',
}

/** The change being drafted in the edit panel, as the form holds it. */
export interface Draft {
  kind: EditKind
  department: string
  /** Business unit or function to move from; '' moves every row. */
  from: string
  to: string
  jobFamily: string
  ref: FieldRef
  /** Values to merge, or the one value to rename. */
  values: string[]
  scope: 'category' | 'field'
}

export const EMPTY_DRAFT: Draft = {
  kind: 'move-department',
  department: '',
  from: '',
  to: '',
  jobFamily: '',
  ref: 'employees.department',
  values: [],
  scope: 'category',
}

/** The mapping a draft describes, as the store takes it. */
export function draftMapping(d: Draft): NewReferenceMapping {
  switch (d.kind) {
    case 'move-department':
      return { kind: d.kind, department: d.department, from: d.from || null, to: d.to.trim() }
    case 'move-family':
      return { kind: d.kind, jobFamily: d.jobFamily, from: d.from || null, to: d.to.trim() }
    case 'merge':
      return { kind: d.kind, ref: d.ref, from: [...d.values], to: d.to.trim(), scope: d.scope }
    case 'rename':
      return { kind: d.kind, ref: d.ref, from: d.values.slice(0, 1), to: d.to.trim(), scope: d.scope }
  }
}

/** "3 Oct 2026, 14:05" in this browser's time zone. */
export function whenText(at: string): string {
  const t = new Date(at)
  if (!Number.isFinite(t.getTime())) return at
  const pad = (n: number) => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${t.getDate()} ${months[t.getMonth()]} ${t.getFullYear()}, ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export interface Placement {
  /** The business unit or function; null when blank. */
  under: string | null
  headcount: number
}

export interface EditOptions {
  departments: { value: string; under: Placement[] }[]
  units: string[]
  families: { value: string; under: Placement[] }[]
  functions: string[]
}

const byName = (a: string, b: string) => a.localeCompare(b)

function placements<T>(
  items: readonly T[],
  subject: (t: T) => string | null,
  under: (t: T) => string | null,
  headcount: (t: T) => number,
): { value: string; under: Placement[] }[] {
  const map = new Map<string, Map<string | null, number>>()
  for (const t of items) {
    const s = subject(t)
    if (!s) continue
    const m = map.get(s) ?? new Map()
    m.set(under(t), (m.get(under(t)) ?? 0) + headcount(t))
    map.set(s, m)
  }
  return [...map.entries()]
    .map(([value, m]) => ({
      value,
      under: [...m.entries()]
        .map(([u, h]) => ({ under: u, headcount: h }))
        .sort((a, b) => b.headcount - a.headcount),
    }))
    .sort((a, b) => byName(a.value, b.value))
}

/** Choices for the move forms: every department and job family in the data, where each sits now. */
export function editOptions(r: StructureReport, data: Datasets): EditOptions {
  const departments = placements(
    r.org,
    (e) => e.department,
    (e) => e.businessUnit,
    (e) => e.headcount,
  )
  // Requisition departments not in the roster can be moved too.
  for (const g of r.reqDepartmentsNotInRoster)
    if (!departments.some((d) => d.value === g.department))
      departments.push({ value: g.department, under: [{ under: g.businessUnit, headcount: 0 }] })
  departments.sort((a, b) => byName(a.value, b.value))
  const units = new Set<string>()
  for (const e of data.employees) if (e.businessUnit?.trim()) units.add(e.businessUnit)
  for (const q of data.requisitions) if (q.businessUnit?.trim()) units.add(q.businessUnit)
  const fns = new Set<string>(JOB_FUNCTIONS)
  for (const e of data.employees) if (e.jobFunction?.trim()) fns.add(e.jobFunction)
  return {
    departments,
    units: [...units].sort(byName),
    families: placements(
      r.functions,
      (e) => e.jobFamily,
      (e) => e.jobFunction,
      (e) => e.headcount,
    ),
    functions: [...fns],
  }
}

/** "Silicon Engineering (140), Systems & Software (3)" */
export function placementText(under: readonly Placement[], blank: string): string {
  return under.map((p) => `${p.under ?? blank} (${p.headcount.toLocaleString('en-US')})`).join(', ')
}

/** The categories you can merge or rename in, in the order of the category lists. */
export const EDITABLE_CATEGORIES: readonly CategoryDef[] = CATEGORIES

/** "Department: Employees, Requisitions and Job changes" when a rename reaches several datasets. */
export function scopeText(ref: string): string {
  const cat = categoryOf(ref)
  if (!cat) return ''
  const sets = [
    ...new Set(cat.refs.map((r) => parseFieldRef(r)?.dataset).filter((d): d is DatasetKey => !!d)),
  ].map((d) => datasetDef(d).label)
  return sets.length <= 1 ? sets.join('') : `${sets.slice(0, -1).join(', ')} and ${sets[sets.length - 1]}`
}

export interface Preview {
  error: string | null
  /** Rows that would change, over every dataset. */
  total: number
  byDataset: { dataset: DatasetKey; label: string; rows: number }[]
  /** Not applied because a value must come from a fixed list. */
  skipped: string | null
}

/** What a change would do to the data as it is now (after your earlier changes). */
export function previewChange(data: Datasets, m: NewReferenceMapping): Preview {
  const error = validateMapping(m)
  if (error) return { error, total: 0, byDataset: [], skipped: null }
  const full = {
    ...m,
    id: 'preview',
    at: '',
    by: null,
    scope: 'scope' in m ? (m.scope ?? 'category') : 'category',
  } as ReferenceMapping
  const applied = applyReferenceMappings(data, [full])
  // A row counts once per dataset even when two of its fields change.
  const per = new Map<DatasetKey, Set<number>>()
  for (const [ref, rows] of Object.entries(applied.rows)) {
    const p = parseFieldRef(ref)
    if (!p || !rows) continue
    const set = per.get(p.dataset) ?? new Set<number>()
    for (const i of rows) set.add(i)
    per.set(p.dataset, set)
  }
  const byDataset = [...per.entries()].map(([dataset, rows]) => ({
    dataset,
    label: datasetDef(dataset).label,
    rows: rows.size,
  }))
  return {
    error: null,
    total: byDataset.reduce((s, d) => s + d.rows, 0),
    byDataset,
    skipped: applied.skipped[0]?.reason ?? null,
  }
}

/** "Changes 150 rows: 140 in Employees and 10 in Requisitions." */
export function previewText(p: Preview): string {
  if (p.error) return p.error
  if (p.skipped) return p.skipped
  if (!p.total) return 'No rows would change.'
  const n = (x: number) => `${x.toLocaleString('en-US')} ${x === 1 ? 'row' : 'rows'}`
  if (p.byDataset.length === 1) return `Changes ${n(p.total)} in ${p.byDataset[0].label}.`
  const parts = p.byDataset.map((d) => `${d.rows.toLocaleString('en-US')} in ${d.label}`)
  return `Changes ${n(p.total)}: ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
}

/**
 * The rows one of your mappings changed, per dataset: the mappings before it applied first, so
 * only its own effect counts. Row indexes match the loaded data (mappings never reorder rows).
 */
export function rowsChangedBy(
  data: Datasets,
  mappings: readonly ReferenceMapping[],
  id: string,
): { dataset: DatasetKey; label: string; rows: number[] }[] {
  const k = mappings.findIndex((m) => m.id === id)
  if (k < 0) return []
  const before = k ? applyReferenceMappings(data, mappings.slice(0, k)).datasets : data
  const applied = applyReferenceMappings(before, [mappings[k]])
  const per = new Map<DatasetKey, Set<number>>()
  for (const [ref, rows] of Object.entries(applied.rows)) {
    const p = parseFieldRef(ref)
    if (!p || !rows) continue
    const set = per.get(p.dataset) ?? new Set<number>()
    for (const i of rows) set.add(i)
    per.set(p.dataset, set)
  }
  return [...per.entries()]
    .map(([dataset, rows]) => ({
      dataset,
      label: datasetDef(dataset).label,
      rows: [...rows].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.rows.length - a.rows.length)
}
