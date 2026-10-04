/**
 * The category lists: the values of each categorical field with their counts, the spellings
 * that were read as each value (by the importer or by your merges and renames) and the values
 * that are not recognized. Pure.
 */
import type { Column } from '@/charts/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import { parseFieldRef } from '@/data/quality/fieldRef'
import {
  type CategoryDef,
  categoryOf,
  type FieldInventory,
  type RawSpelling,
  type ReferenceMapping,
  targetRefs,
} from '@/data/reference'
import {
  caseCategoryByName,
  datasetDef,
  INVOLUNTARY_REASONS,
  LEVELS,
  type Level,
  levelTrack,
  siteByLocation,
  TRANSACTION_PROCESS,
  type TransactionType,
  VOLUNTARY_REASONS,
} from '@/data/schema'
import { closestValue } from './conflicts'

export interface ListGroup {
  id: string
  label: string
  /** Category ids, in display order. */
  categories: readonly string[]
}

/** How the category lists are grouped on the tab. */
export const LIST_GROUPS: readonly ListGroup[] = [
  {
    id: 'people',
    label: 'People',
    categories: ['level', 'location', 'country', 'employmentType', 'costCenter'],
  },
  {
    id: 'org',
    label: 'Org and jobs',
    categories: ['businessUnit', 'department', 'jobFunction', 'jobFamily', 'jobTitle'],
  },
  {
    id: 'exits',
    label: 'Exits and moves',
    categories: ['terminationType', 'terminationReason', 'changeType'],
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    categories: [
      'stage',
      'candidateStatus',
      'source',
      'rejectionReason',
      'reqStatus',
      'reqType',
      'reqPriority',
    ],
  },
  {
    id: 'services',
    label: 'HR ops',
    categories: [
      'caseCategory',
      'caseStatus',
      'caseChannel',
      'casePriority',
      'caseTier',
      'caseTeam',
      'transactionType',
    ],
  },
  {
    id: 'talent',
    label: 'Talent and pay',
    categories: [
      'potential',
      'readiness',
      'criticality',
      'riskOfLoss',
      'reviewCycle',
      'learningCategory',
      'course',
      'currency',
    ],
  },
]

export type ValueStatus = 'listed' | 'open' | 'unlisted' | 'import' | 'unused' | 'blank'

export const STATUS_TEXT: Record<ValueStatus, string> = {
  listed: 'In the list',
  open: '',
  unlisted: 'Not in the list',
  import: 'Not recognized, left blank',
  unused: 'Not used',
  blank: '',
}

export type ValueMatch = { by: 'value'; value: string } | { by: 'blank' } | { by: 'import'; value: string }

export interface ValueRow {
  value: string
  count: number
  /** Share of the filled rows; null for blanks and values left blank at import. */
  share: number | null
  /** Spellings read as this value: from the file, then from your changes. */
  spellings: string
  status: ValueStatus
  statusText: string
  /** Extra columns some categories carry (Atlas process, team, track …). */
  [extra: string]: unknown
  match: ValueMatch | null
}

/* ───────────── your merges and renames, as spellings ───────────── */

/**
 * For one field, every value your merges and renames replaced and the value it ends up as,
 * following later changes ("DV" → "Design verif." → "Design Verification").
 */
export function valueAliases(
  ref: FieldRef,
  mappings: readonly ReferenceMapping[],
  skipped: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const alias = new Map<string, string>()
  for (const m of mappings) {
    if (m.kind !== 'merge' && m.kind !== 'rename') continue
    if (skipped.has(m.id) || !targetRefs(m).includes(ref)) continue
    const from = new Set(m.from)
    for (const [k, v] of alias) if (from.has(v)) alias.set(k, m.to)
    for (const f of m.from) if (f !== m.to && !alias.has(f)) alias.set(f, m.to)
  }
  for (const [k, v] of alias) if (k === v) alias.delete(k)
  return alias
}

/** The importer's raw spellings, re-pointed at the values your changes turned them into. */
export function remapSpellings(
  spellings: Partial<Record<FieldRef, readonly RawSpelling[]>>,
  mappings: readonly ReferenceMapping[],
  skipped: ReadonlySet<string> = new Set(),
): Partial<Record<FieldRef, RawSpelling[]>> {
  const out: Partial<Record<FieldRef, RawSpelling[]>> = {}
  for (const [ref, list] of Object.entries(spellings) as [FieldRef, readonly RawSpelling[]][]) {
    const alias = valueAliases(ref, mappings, skipped)
    out[ref] = list.map((s) =>
      s.value != null && alias.has(s.value) ? { ...s, value: alias.get(s.value)! } : { ...s },
    )
  }
  return out
}

/* ───────────── rows ───────────── */

const terminationTypeOf = (v: string) =>
  (VOLUNTARY_REASONS as readonly string[]).includes(v)
    ? 'Voluntary'
    : (INVOLUNTARY_REASONS as readonly string[]).includes(v)
      ? 'Involuntary'
      : ''

/** Columns some categories carry beyond the value itself. */
export function extraColumns(categoryId: string): Column[] {
  switch (categoryId) {
    case 'caseCategory':
      return [
        { key: 'process', label: 'Atlas process' },
        { key: 'team', label: 'Team' },
      ]
    case 'transactionType':
      return [{ key: 'process', label: 'Atlas process' }]
    case 'terminationReason':
      return [{ key: 'type', label: 'Termination type' }]
    case 'level':
      return [{ key: 'track', label: 'Track' }]
    case 'location':
      return [
        { key: 'country', label: 'Country' },
        { key: 'region', label: 'Region' },
      ]
    default:
      return []
  }
}

function extraValues(categoryId: string, value: string): Record<string, string> {
  switch (categoryId) {
    case 'caseCategory': {
      const c = caseCategoryByName.get(value)
      return { process: c?.processId ?? '', team: c?.team ?? '' }
    }
    case 'transactionType':
      return { process: TRANSACTION_PROCESS[value as TransactionType] ?? '' }
    case 'terminationReason':
      return { type: terminationTypeOf(value) }
    case 'level':
      return { track: (LEVELS as readonly string[]).includes(value) ? levelTrack(value as Level) : '' }
    case 'location': {
      const s = siteByLocation.get(value)
      return { country: s?.country ?? '', region: s?.region ?? '' }
    }
    default:
      return {}
  }
}

/** One row per value of a field, then values left blank at import, then blanks. */
export function valueRows(
  inv: FieldInventory,
  mappings: readonly ReferenceMapping[] = [],
  skipped: ReadonlySet<string> = new Set(),
): ValueRow[] {
  const cat = inv.category
  const alias = valueAliases(inv.ref, mappings, skipped)
  const byMapping = new Map<string, string[]>()
  for (const [from, to] of alias) {
    const list = byMapping.get(to) ?? []
    list.push(from)
    byMapping.set(to, list)
  }
  const hasList = !!(inv.vocab ?? cat.vocab)
  const rows: ValueRow[] = inv.values.map((v) => {
    const spelled = [...v.spellings]
    for (const s of byMapping.get(v.value) ?? []) if (!spelled.includes(s)) spelled.push(`${s} (your change)`)
    const status: ValueStatus = !v.recognized
      ? 'unlisted'
      : v.count === 0
        ? 'unused'
        : hasList
          ? 'listed'
          : 'open'
    return {
      value: v.value,
      count: v.count,
      share: v.count ? v.share : 0,
      spellings: spelled.join(', '),
      status,
      statusText: STATUS_TEXT[status],
      ...extraValues(cat.id, v.value),
      match: v.count ? { by: 'value', value: v.value } : null,
    }
  })
  for (const u of inv.unrecognized) {
    if (u.source !== 'import') continue
    rows.push({
      value: u.value,
      count: u.count,
      share: null,
      spellings: '',
      status: 'import',
      statusText: STATUS_TEXT.import,
      ...extraValues(cat.id, u.value),
      match: { by: 'import', value: u.value },
    })
  }
  if (inv.blank)
    rows.push({
      value: '(Blank)',
      count: inv.blank,
      share: null,
      spellings: '',
      status: 'blank',
      statusText: STATUS_TEXT.blank,
      match: { by: 'blank' },
    })
  return rows
}

/** Counts for a figure's note: distinct values used, values not recognized, blanks. */
export function inventorySummary(inv: FieldInventory): {
  used: number
  unrecognized: number
  blank: number
  total: number
} {
  return {
    used: inv.values.filter((v) => v.count > 0).length,
    unrecognized: inv.unrecognized.reduce((s, u) => s + u.count, 0),
    blank: inv.blank,
    total: inv.total,
  }
}

/** "Employees" for a category with one field per dataset; "From department" when a dataset has two. */
export function fieldOptionLabel(ref: FieldRef, category: CategoryDef): string {
  const p = parseFieldRef(ref)
  if (!p) return ref
  const def = datasetDef(p.dataset)
  const sameDataset = category.refs.filter((r) => r.startsWith(`${p.dataset}.`)).length > 1
  if (!sameDataset) return def.label
  return def.fields.find((f) => f.key === p.field)?.label ?? p.field
}

/** "Employees: Department" */
export function fieldLabel(ref: FieldRef): string {
  const p = parseFieldRef(ref)
  if (!p) return ref
  const def = datasetDef(p.dataset)
  return `${def.label}: ${def.fields.find((f) => f.key === p.field)?.label ?? p.field}`
}

/** The categories of a group that exist, with their field inventories in the category's field order. */
export function groupInventories(
  group: ListGroup,
  inventories: readonly FieldInventory[],
): { category: CategoryDef; fields: FieldInventory[] }[] {
  return group.categories.flatMap((id) => {
    const fields = inventories.filter((i) => i.category.id === id)
    return fields.length ? [{ category: fields[0].category, fields }] : []
  })
}

/** Rows of a dataset matching one value-row's selection. `isFilledValue` matches the quality rules. */
export function matchRows(
  rows: readonly Record<string, unknown>[],
  field: string,
  match: ValueMatch,
  isFilledValue: (v: unknown) => boolean,
): number[] {
  const out: number[] = []
  rows.forEach((r, i) => {
    const v = r[field]
    if (
      match.by === 'blank'
        ? !isFilledValue(v)
        : match.by === 'value'
          ? isFilledValue(v) && String(v) === match.value
          : false
    )
      out.push(i)
  })
  return out
}

export interface UnlistedValue {
  ref: FieldRef
  category: CategoryDef
  value: string
  /** Rows holding the value. */
  count: number
  /** The known value it most likely means, or null. */
  suggestion: string | null
}

/**
 * Values in the data that are not in their field's known list, most rows first, each with the
 * known value it most likely means. A merge into a known value fixes them.
 */
export function unlistedValues(inventories: readonly FieldInventory[]): UnlistedValue[] {
  const out: UnlistedValue[] = []
  for (const inv of inventories) {
    const vocab = inv.vocab ?? inv.category.vocab
    if (!vocab) continue
    for (const v of inv.values) {
      if (v.recognized || v.count === 0) continue
      out.push({
        ref: inv.ref,
        category: inv.category,
        value: v.value,
        count: v.count,
        suggestion: closestValue(v.value, vocab),
      })
    }
  }
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Is the field categorical (so it can be merged or renamed)? */
export const isCategorical = (ref: string): boolean => !!categoryOf(ref)
